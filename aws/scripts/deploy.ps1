# ─────────────────────────────────────────────────────────────
# UnyKorn L1 — Full AWS Deploy Orchestrator (PowerShell)
# Usage: .\deploy.ps1 [-Environment devnet|staging] [-SkipDocker] [-AutoApprove]
# ─────────────────────────────────────────────────────────────
[CmdletBinding()]
param(
    [ValidateSet("devnet","staging")]
    [string]$Environment = "devnet",

    [switch]$SkipDocker,
    [switch]$AutoApprove
)

$ErrorActionPreference = "Stop"
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir    = Split-Path -Parent $ScriptDir
$TfDir      = Join-Path $RootDir "terraform"
$DockerDir  = Join-Path $RootDir "docker"
$TfVars     = Join-Path (Join-Path $TfDir "environments") "$Environment.tfvars"
$RepoRoot   = Split-Path -Parent $RootDir  # unyKorn-master

# ─── Helpers ──────────────────────────────────────────────
function Log  { param([string]$Msg) Write-Host "[deploy] $Msg" -ForegroundColor Cyan }
function Ok   { param([string]$Msg) Write-Host "[  ok  ] $Msg" -ForegroundColor Green }
function Warn { param([string]$Msg) Write-Host "[ warn ] $Msg" -ForegroundColor Yellow }
function Err  { param([string]$Msg) Write-Host "[error ] $Msg" -ForegroundColor Red; exit 1 }

# ─── Pre-flight ───────────────────────────────────────────
function Invoke-Preflight {
    Log "Running pre-flight checks..."

    $required = @("terraform","aws","docker","jq")
    foreach ($cmd in $required) {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
            Err "$cmd is not installed. Run: .\setup-tools.ps1"
        }
    }
    Ok "All tools present"

    if (-not (Test-Path $TfVars)) {
        Err "Environment file not found: $TfVars"
    }
    Ok "Environment: $Environment"

    # AWS credentials
    try {
        $identity = aws sts get-caller-identity 2>$null | ConvertFrom-Json
        $script:AccountId = $identity.Account
    } catch {
        Err "AWS credentials not configured. Run 'aws configure' first."
    }

    # Parse region from tfvars
    $regionLine = Get-Content $TfVars | Where-Object { $_ -match 'aws_region\s*=\s*"([^"]+)"' }
    if ($regionLine -match '"([^"]+)"') {
        $script:Region = $Matches[1]
    } else {
        $script:Region = "us-east-1"
    }
    Ok "AWS Account: $($script:AccountId) | Region: $($script:Region)"
}

# ─── Step 1: Terraform Init ──────────────────────────────
function Invoke-TfInit {
    Log "Step 1: Terraform init..."
    Push-Location $TfDir
    try {
        terraform init -upgrade
        if ($LASTEXITCODE -ne 0) { Err "terraform init failed" }
        Ok "Terraform initialized"
    } finally { Pop-Location }
}

# ─── Step 2: Terraform Plan ──────────────────────────────
function Invoke-TfPlan {
    Log "Step 2: Terraform plan..."
    Push-Location $TfDir
    try {
        terraform plan -var-file="$TfVars" -out=tfplan
        if ($LASTEXITCODE -ne 0) { Err "terraform plan failed" }
        Ok "Plan saved to tfplan"
    } finally { Pop-Location }
}

# ─── Step 3: Terraform Apply ─────────────────────────────
function Invoke-TfApply {
    Log "Step 3: Terraform apply..."
    Push-Location $TfDir
    try {
        if (-not $AutoApprove) {
            $confirm = Read-Host "Apply this plan? (yes/no)"
            if ($confirm -ne "yes") {
                Warn "Aborted."
                exit 0
            }
        }
        terraform apply tfplan
        if ($LASTEXITCODE -ne 0) { Err "terraform apply failed" }
        Ok "Infrastructure deployed"
    } finally { Pop-Location }
}

# ─── Step 4: Build + Push Docker Images ──────────────────
function Invoke-DockerBuildPush {
    if ($SkipDocker) {
        Warn "Skipping Docker build (--SkipDocker flag)"
        return
    }

    Log "Step 4: Building Docker images..."
    Push-Location $TfDir
    try {
        $nodeEcr = terraform output -raw ecr_node_repo_url 2>$null
    } catch {
        $nodeEcr = ""
    }
    Pop-Location

    if (-not $nodeEcr) {
        Warn "ECR URL not available yet. Run terraform apply first."
        return
    }

    # ECR login
    Log "Logging into ECR..."
    $password = aws ecr get-login-password --region $script:Region
    $password | docker login --username AWS --password-stdin "$($script:AccountId).dkr.ecr.$($script:Region).amazonaws.com"
    if ($LASTEXITCODE -ne 0) { Err "ECR login failed" }
    Ok "ECR login successful"

    # Build node image (context = repo root where UnyKorn-L-1 source lives)
    Log "Building L1 node image..."
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    docker build -f "$DockerDir\Dockerfile.node" -t "unykorn-node:latest" $RepoRoot
    docker tag "unykorn-node:latest" "${nodeEcr}:latest"
    docker tag "unykorn-node:latest" "${nodeEcr}:${timestamp}"
    docker push "${nodeEcr}:latest"
    if ($LASTEXITCODE -ne 0) { Err "Node image push failed" }
    Ok "Node image pushed to ECR"

    # Build dashboard image
    Push-Location $TfDir
    try {
        $dashEcr = terraform output -raw ecr_dashboard_repo_url 2>$null
    } catch {
        $dashEcr = ""
    }
    Pop-Location

    if ($dashEcr) {
        Log "Building dashboard image..."
        $walletDir = Join-Path (Join-Path $RepoRoot "packages") "unyKorn-wallet"
        docker build -f "$DockerDir\Dockerfile.dashboard" -t "unykorn-dashboard:latest" $walletDir
        docker tag "unykorn-dashboard:latest" "${dashEcr}:latest"
        docker push "${dashEcr}:latest"
        if ($LASTEXITCODE -ne 0) { Warn "Dashboard image push failed" }
        else { Ok "Dashboard image pushed to ECR" }
    }
}

# ─── Step 5: Check Secrets ────────────────────────────────
function Invoke-SeedSecrets {
    Log "Step 5: Checking secrets..."

    try {
        $nodeKeys = aws secretsmanager get-secret-value `
            --secret-id "unykorn/l1/node-keys" `
            --region $script:Region `
            --query "SecretString" --output text 2>$null
    } catch {
        $nodeKeys = ""
    }

    if ($nodeKeys -match "REPLACE_WITH_REAL_SEED") {
        Warn "Node key seeds are still placeholder values!"
        Warn "Update via:"
        Warn "  aws secretsmanager update-secret --secret-id unykorn/l1/node-keys --secret-string '<json>'"
    } elseif ($nodeKeys) {
        Ok "Node keys appear to be set"
    } else {
        Warn "Could not read node-keys secret (may not exist yet)"
    }
}

# ─── Step 6: Verify Deployment ───────────────────────────
function Invoke-Verify {
    Log "Step 6: Verifying deployment..."
    Push-Location $TfDir
    try {
        $albDns = terraform output -raw alb_dns_name 2>$null
        $nlbDns = terraform output -raw nlb_dns_name 2>$null
    } catch {
        $albDns = ""; $nlbDns = ""
    }

    # ALB health check
    if ($albDns) {
        try {
            $resp = Invoke-WebRequest -Uri "http://$albDns" -TimeoutSec 10 -UseBasicParsing -ErrorAction SilentlyContinue
            Ok "ALB responding: HTTP $($resp.StatusCode)"
        } catch {
            Warn "ALB returned error (may still be starting)"
        }
    }

    # RPC check
    if ($nlbDns) {
        try {
            $body = '{"jsonrpc":"2.0","method":"unykorn_getValidatorList","params":[],"id":1}'
            $resp = Invoke-RestMethod -Uri "http://${nlbDns}:3001" `
                -Method POST -Body $body -ContentType "application/json" -TimeoutSec 10
            if ($resp.result) { Ok "RPC responding" }
            else { Warn "RPC not responding yet (nodes may still be starting)" }
        } catch {
            Warn "RPC not responding yet (nodes may still be starting)"
        }
    }

    # Node status
    Log "Node instance status:"
    try {
        $nodeIds = terraform output -json node_instance_ids 2>$null | ConvertFrom-Json
        $nodes = @("alpha","bravo","charlie","delta","echo")
        foreach ($node in $nodes) {
            $instanceId = $nodeIds.$node
            if ($instanceId) {
                $status = aws ec2 describe-instance-status `
                    --instance-ids $instanceId `
                    --query "InstanceStatuses[0].InstanceState.Name" `
                    --output text 2>$null
                if (-not $status) { $status = "pending" }
                Write-Host "  $node ($instanceId): $status"
            }
        }
    } catch {
        Warn "Could not fetch node status (instances may still be launching)"
    }
    Pop-Location

    # Summary
    Write-Host ""
    Ok "Deployment verification complete"
    Write-Host ""
    if (-not $albDns) { $albDns = "pending" }
    if (-not $nlbDns) { $nlbDns = "pending" }
    try {
        Push-Location $TfDir
        $grafana = terraform output -raw grafana_endpoint 2>$null
        Pop-Location
    } catch { $grafana = "pending" }
    if (-not $grafana) { $grafana = "pending" }

    Log "==================================================="
    Log "  Dashboard:  http://$albDns"
    Log "  RPC:        http://${nlbDns}:3001"
    Log "  Grafana:    $grafana"
    Log "  CloudWatch: https://$($script:Region).console.aws.amazon.com/cloudwatch/home?region=$($script:Region)#dashboards:name=unykorn-l1-$Environment"
    Log "==================================================="
}

# ─── Main ─────────────────────────────────────────────────
Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  UnyKorn L1 -- AWS Deploy ($Environment)" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

Invoke-Preflight
Invoke-TfInit
Invoke-TfPlan
Invoke-TfApply
Invoke-DockerBuildPush
Invoke-SeedSecrets
Invoke-Verify
