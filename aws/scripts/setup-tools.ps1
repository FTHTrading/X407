# ─────────────────────────────────────────────────────────────
# UnyKorn L1 — Windows Tool Installer
# Installs: Terraform, AWS CLI, jq (Docker assumed present)
# Usage: .\setup-tools.ps1
# ─────────────────────────────────────────────────────────────
#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  UnyKorn L1 -- Tool Setup (Windows)" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

function Test-Tool {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

# ── Terraform ──────────────────────────────────────────────
if (Test-Tool "terraform") {
    $v = (terraform version -json 2>$null | ConvertFrom-Json).terraform_version
    Write-Host "[ok] Terraform $v already installed" -ForegroundColor Green
} else {
    Write-Host "[install] Installing Terraform via winget..." -ForegroundColor Yellow
    winget install --id Hashicorp.Terraform --accept-source-agreements --accept-package-agreements
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    if (Test-Tool "terraform") {
        Write-Host "[ok] Terraform installed" -ForegroundColor Green
    } else {
        Write-Host "[warn] Terraform installed but not in PATH. Restart your terminal." -ForegroundColor Yellow
    }
}

# ── AWS CLI ────────────────────────────────────────────────
if (Test-Tool "aws") {
    $v = (aws --version 2>&1) -replace "aws-cli/(\S+).*",'$1'
    Write-Host "[ok] AWS CLI $v already installed" -ForegroundColor Green
} else {
    Write-Host "[install] Installing AWS CLI v2 via winget..." -ForegroundColor Yellow
    winget install --id Amazon.AWSCLI --accept-source-agreements --accept-package-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    if (Test-Tool "aws") {
        Write-Host "[ok] AWS CLI installed" -ForegroundColor Green
    } else {
        Write-Host "[warn] AWS CLI installed but not in PATH. Restart your terminal." -ForegroundColor Yellow
    }
}

# ── jq ─────────────────────────────────────────────────────
if (Test-Tool "jq") {
    Write-Host "[ok] jq already installed" -ForegroundColor Green
} else {
    Write-Host "[install] Installing jq via winget..." -ForegroundColor Yellow
    winget install --id jqlang.jq --accept-source-agreements --accept-package-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    if (Test-Tool "jq") {
        Write-Host "[ok] jq installed" -ForegroundColor Green
    } else {
        Write-Host "[warn] jq installed but not in PATH. Restart your terminal." -ForegroundColor Yellow
    }
}

# ── Docker ─────────────────────────────────────────────────
if (Test-Tool "docker") {
    $v = (docker version --format '{{.Client.Version}}' 2>$null)
    Write-Host "[ok] Docker $v already installed" -ForegroundColor Green
} else {
    Write-Host "[error] Docker Desktop is not installed." -ForegroundColor Red
    Write-Host "        Install from https://www.docker.com/products/docker-desktop/" -ForegroundColor Red
}

# ── Summary ────────────────────────────────────────────────
Write-Host ""
Write-Host "--- Status -----------------------------------------" -ForegroundColor Cyan
$tools = @("terraform", "aws", "docker", "jq")
$allGood = $true
foreach ($t in $tools) {
    if (Test-Tool $t) {
        Write-Host "  [+] $t" -ForegroundColor Green
    } else {
        Write-Host "  [-] $t  (missing — restart terminal or install manually)" -ForegroundColor Red
        $allGood = $false
    }
}
Write-Host ""
if ($allGood) {
    Write-Host "All tools ready. Next: run deploy.ps1" -ForegroundColor Green
} else {
    Write-Host "Some tools missing. Restart your terminal, then re-run this script." -ForegroundColor Yellow
}

# ── AWS configure check ───────────────────────────────────
if (Test-Tool "aws") {
    Write-Host ""
    try {
        $identity = aws sts get-caller-identity 2>$null | ConvertFrom-Json
        Write-Host "[ok] AWS credentials configured — Account: $($identity.Account)" -ForegroundColor Green
    } catch {
        Write-Host "[action needed] Run 'aws configure' to set your AWS credentials" -ForegroundColor Yellow
        Write-Host "  You'll need: Access Key ID, Secret Access Key, Region (us-east-1)" -ForegroundColor Yellow
    }
}
