#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Authenticates to ECR and pushes the UnyKorn node image.

.DESCRIPTION
  Logs Docker into ECR, pushes the locally-built node image,
  then verifies the push succeeded by listing ECR images.

.PARAMETER ImageTag
  Tag to push. Defaults to "latest". Must match what build-node-image.ps1 built.

.PARAMETER Region
  AWS region for ECR. Default: us-east-1

.PARAMETER Repo
  ECR repository name. Default: unykorn-l1/node

.EXAMPLE
  .\push-ecr.ps1
  .\push-ecr.ps1 -ImageTag "abc1234"
#>

param(
    [string]$ImageTag = "latest",
    [string]$Region   = "us-east-1",
    [string]$Repo     = "unykorn-l1/node"
)

$ErrorActionPreference = "Stop"

$ECR_REGISTRY = "933629770808.dkr.ecr.us-east-1.amazonaws.com"
$FULL_IMAGE   = "${ECR_REGISTRY}/${Repo}:${ImageTag}"

Write-Host "============================================================"
Write-Host "  UnyKorn L1 — ECR Push"
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "============================================================"
Write-Host ""

# ── 1. Pre-flight: verify image exists locally ───────────────
Write-Host "[1/4] Checking local image exists..."
$localImages = docker images $FULL_IMAGE --format "{{.Repository}}:{{.Tag}}" 2>&1
if (-not $localImages -or $localImages -notmatch $ImageTag) {
    Write-Error "Image $FULL_IMAGE not found locally. Run build-node-image.ps1 first."
    exit 1
}
Write-Host "  Found: $FULL_IMAGE"

# ── 2. AWS auth check ────────────────────────────────────────
Write-Host "[2/4] Verifying AWS credentials..."
try {
    $id = aws sts get-caller-identity --output json | ConvertFrom-Json
    Write-Host "  Account: $($id.Account) User: $($id.Arn)"
} catch {
    Write-Error "AWS credentials not valid. Run 'aws configure' or set env vars."
    exit 1
}

# ── 3. ECR login ─────────────────────────────────────────────
Write-Host "[3/4] Authenticating Docker to ECR..."
aws ecr get-login-password --region $Region | `
    docker login --username AWS --password-stdin $ECR_REGISTRY

if ($LASTEXITCODE -ne 0) {
    Write-Error "ECR authentication failed. Check IAM permissions."
    exit 1
}
Write-Host "  ECR login successful"

# ── 4. Push image ────────────────────────────────────────────
Write-Host ""
Write-Host "[4/4] Pushing image to ECR..."
Write-Host "  Target: $FULL_IMAGE"
Write-Host ""

$startTime = Get-Date
docker push $FULL_IMAGE

if ($LASTEXITCODE -ne 0) {
    Write-Error "docker push FAILED with exit code $LASTEXITCODE"
    exit 1
}

$duration = (Get-Date) - $startTime

# ── 5. Verify the push ───────────────────────────────────────
Write-Host ""
Write-Host "Verifying push..."
$pushed = aws ecr list-images --region $Region --repository-name $Repo `
    --query "imageIds[?imageTag=='$ImageTag']" --output json | ConvertFrom-Json

if ($pushed.Count -gt 0) {
    $digest = $pushed[0].imageDigest
    Write-Host ""
    Write-Host "============================================================"
    Write-Host "  PUSH VERIFIED"
    Write-Host "  Duration:   $([math]::Round($duration.TotalSeconds, 0))s"
    Write-Host "  Image:      $FULL_IMAGE"
    Write-Host "  Digest:     $digest"
    Write-Host "============================================================"
    Write-Host ""
    Write-Host "ECR image is live. Next step:"
    Write-Host "  Run ops\scripts\bootstrap-node-runtime.sh on each EC2 node via SSM"
    Write-Host "  OR trigger a rolling restart if nodes are already running."
} else {
    Write-Error "Push appeared to succeed but image not found in ECR. Check ECR console."
    exit 1
}
