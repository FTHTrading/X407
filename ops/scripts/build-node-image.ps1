#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Builds the UnyKorn L1 node Docker image from the Rust chain source.

.DESCRIPTION
  Locates the Rust chain source, copies the Dockerfile into it,
  and builds the multi-stage Docker image. Does NOT push — use push-ecr.ps1 separately.

.PARAMETER ChainSrcDir
  Path to the root of the UnyKorn Rust chain source repo (where Cargo.toml lives).

.PARAMETER ImageTag
  Docker image tag. Defaults to "latest". For CI use a git SHA.

.PARAMETER NoPull
  Skip pulling the base rust:1.85-bookworm image (use cached).

.EXAMPLE
  .\build-node-image.ps1 -ChainSrcDir "C:\repos\UnyKorn-L-1"
  .\build-node-image.ps1 -ChainSrcDir "C:\repos\UnyKorn-L-1" -ImageTag "abc1234"
#>

param(
    # Chain source repo root (contains Cargo.toml, crates/, system-modules/, devnet/)
    # Confirmed location: unykorn-l1 sibling directory
    [string]$ChainSrcDir = "C:\Users\Kevan\OneDrive - FTH Trading\02-UnyKorn\unykorn-l1",

    [string]$ImageTag = "latest",
    [switch]$NoPull
)

$ErrorActionPreference = "Stop"

$ECR_REGISTRY  = "933629770808.dkr.ecr.us-east-1.amazonaws.com"
$ECR_REPO      = "unykorn-l1/node"
$FULL_IMAGE    = "${ECR_REGISTRY}/${ECR_REPO}:${ImageTag}"
$LOCAL_TAG     = "unykorn-node:${ImageTag}"

$SCRIPT_ROOT   = Split-Path -Parent $MyInvocation.MyCommand.Path
$REPO_ROOT     = Resolve-Path (Join-Path $SCRIPT_ROOT "..\..") 
$DOCKERFILE    = Join-Path $REPO_ROOT "aws\docker\Dockerfile.node"

Write-Host "============================================================"
Write-Host "  UnyKorn L1 — Node Image Build"
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "============================================================"
Write-Host ""

# ── Validate chain source ────────────────────────────────────
Write-Host "[1/5] Validating chain source directory..."
if (-not (Test-Path $ChainSrcDir)) {
    Write-Error "ChainSrcDir not found: $ChainSrcDir"
    exit 1
}

$cargoToml = Join-Path $ChainSrcDir "Cargo.toml"
if (-not (Test-Path $cargoToml)) {
    Write-Error "No Cargo.toml found in $ChainSrcDir — is this the correct chain source root?"
    exit 1
}
Write-Host "  Found Cargo.toml at $cargoToml"

# ── Validate Dockerfile ──────────────────────────────────────
Write-Host "[2/5] Validating Dockerfile..."
if (-not (Test-Path $DOCKERFILE)) {
    Write-Error "Dockerfile.node not found at: $DOCKERFILE"
    exit 1
}
Write-Host "  Found Dockerfile at $DOCKERFILE"

# ── Copy Dockerfile into chain source ───────────────────────
Write-Host "[3/5] Copying Dockerfile to chain source directory..."
$destDockerfile = Join-Path $ChainSrcDir "Dockerfile"
Copy-Item $DOCKERFILE $destDockerfile -Force
Write-Host "  Copied to $destDockerfile"

# ── Docker check ─────────────────────────────────────────────
Write-Host "[4/5] Checking Docker daemon..."
try {
    docker version --format "{{.Server.Version}}" | Out-Null
    Write-Host "  Docker is running"
} catch {
    Write-Error "Docker is not running. Start Docker Desktop or the Docker daemon."
    exit 1
}

# ── Build ───────────────────────────────────────────────────
Write-Host ""
Write-Host "[5/5] Building image..."
Write-Host "  Source: $ChainSrcDir"
Write-Host "  Image:  $FULL_IMAGE"
Write-Host "  Tag:    $LOCAL_TAG"
Write-Host ""
Write-Host "  NOTE: Rust compilation takes 15-45 minutes on first build."
Write-Host "  Subsequent builds use Docker layer cache (much faster)."
Write-Host ""

$buildArgs = @(
    "build",
    "-t", $LOCAL_TAG,
    "-t", $FULL_IMAGE,
    "-f", $destDockerfile
)

if (-not $NoPull) {
    $buildArgs += "--pull"
}

$buildArgs += $ChainSrcDir

$startTime = Get-Date
& docker @buildArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Error "Docker build FAILED with exit code $LASTEXITCODE"
    Write-Host ""
    Write-Host "Common failure reasons:"
    Write-Host "  1. Missing clang/llvm on builder — add apt-get install clang libclang-dev llvm-dev to Dockerfile"
    Write-Host "     → The fixed Dockerfile.node already includes these deps"
    Write-Host "  2. Binary output: target/release/unykorn  (package=unykorn-node, binary=unykorn)"
    Write-Host "     → Dockerfile.node COPY line: /build/target/release/unykorn (not unykorn-node)"
    Write-Host "  3. Missing source directories (crates/ or system-modules/)"
    Write-Host "     → Verify ChainSrcDir is the root of unykorn-l1 repo"
    Write-Host "  4. Rust compilation error"
    Write-Host "     → Run 'cargo build --release -p unykorn-node --features compliance-quorum,mod-trade-finance' locally in ChainSrcDir first"
    exit 1
}

$duration = (Get-Date) - $startTime
Write-Host ""
Write-Host "============================================================"
Write-Host "  BUILD SUCCEEDED"
Write-Host "  Duration:    $([math]::Round($duration.TotalMinutes, 1)) minutes"
Write-Host "  Local tag:   $LOCAL_TAG"
Write-Host "  ECR tag:     $FULL_IMAGE"
Write-Host "============================================================"
Write-Host ""
Write-Host "Next step: run ops\scripts\push-ecr.ps1 -ImageTag $ImageTag"
