# ─────────────────────────────────────────────────────────────
# UnyKorn L1 — Clean Teardown (PowerShell)
# Usage: .\teardown.ps1 [-Environment devnet|staging] [-Force]
# ─────────────────────────────────────────────────────────────
[CmdletBinding()]
param(
    [ValidateSet("devnet","staging")]
    [string]$Environment = "devnet",

    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir   = Split-Path -Parent $ScriptDir
$TfDir     = Join-Path $RootDir "terraform"
$TfVars    = Join-Path (Join-Path $TfDir "environments") "$Environment.tfvars"

Write-Host ""
Write-Host "===================================================" -ForegroundColor Red
Write-Host "  UnyKorn L1 -- TEARDOWN ($Environment)" -ForegroundColor Red
Write-Host "===================================================" -ForegroundColor Red
Write-Host ""
Write-Host "This will DESTROY all AWS resources for '$Environment'." -ForegroundColor Yellow
Write-Host "EBS volumes with delete_on_termination=false will persist." -ForegroundColor Yellow
Write-Host ""

if (-not $Force) {
    $confirm = Read-Host "Type 'destroy-$Environment' to confirm"
    if ($confirm -ne "destroy-$Environment") {
        Write-Host "Aborted." -ForegroundColor Yellow
        exit 0
    }
}

# Parse region
$regionLine = Get-Content $TfVars | Where-Object { $_ -match 'aws_region\s*=\s*"([^"]+)"' }
if ($regionLine -match '"([^"]+)"') { $Region = $Matches[1] } else { $Region = "us-east-1" }

Push-Location $TfDir
try {
    Write-Host "[teardown] Running terraform destroy..." -ForegroundColor Cyan
    terraform destroy -var-file="$TfVars" -auto-approve
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[error] terraform destroy failed" -ForegroundColor Red
        exit 1
    }
} finally { Pop-Location }

Write-Host ""
Write-Host "[teardown] Infrastructure destroyed." -ForegroundColor Green
Write-Host ""

# Check for orphaned resources
Write-Host "[teardown] Checking for leftover resources..." -ForegroundColor Cyan

Write-Host "  EBS volumes:"
try {
    aws ec2 describe-volumes `
        --region $Region `
        --filters "Name=tag:Project,Values=UnyKorn-L1" `
        --query "Volumes[].{ID:VolumeId,State:State,Size:Size}" `
        --output table 2>$null
} catch {
    Write-Host "  (none found)"
}

Write-Host "  ECR images:"
try {
    aws ecr list-images `
        --repository-name "unykorn-l1/node" `
        --region $Region `
        --query "imageIds[].imageTag" `
        --output text 2>$null
} catch {
    Write-Host "  (none found)"
}

Write-Host ""
Write-Host "[teardown] Done. Verify in AWS Console." -ForegroundColor Green
