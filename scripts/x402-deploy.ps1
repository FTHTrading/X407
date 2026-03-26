# ===========================================================================
# FTH x402 — Deploy Script (PowerShell / Windows)
# ===========================================================================
# Usage:
#   .\scripts\x402-deploy.ps1                    → deploy gateway to production
#   .\scripts\x402-deploy.ps1 -Target staging    → deploy gateway to staging
#   .\scripts\x402-deploy.ps1 -Target site       → deploy x402.unykorn.org site
#   .\scripts\x402-deploy.ps1 -Target dns        → ensure DNS + custom domain
#   .\scripts\x402-deploy.ps1 -Target setup      → full infra setup (DNS + site deploy)
#   .\scripts\x402-deploy.ps1 -Target all        → deploy everything
# ===========================================================================

param(
    [ValidateSet("staging", "production", "site", "dns", "setup", "all")]
    [string]$Target = "production"
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$GATEWAY_DIR = Join-Path $ROOT "packages\fth-x402-gateway"
$SITE_DIR    = Join-Path $ROOT "packages\fth-x402-site"

# ── Cloudflare infrastructure IDs ──
$CF_ZONE_ID         = "8aa6916f4c1c7e8e42130455dfd5c029"        # unykorn.org
$CF_ACCOUNT_ID      = "07bcc4a189ef176261b818409c95891f"
$CF_PAGES_PROJECT   = "x402-site"
$CF_CUSTOM_DOMAIN   = "x402.unykorn.org"
$CF_PAGES_SUBDOMAIN = "x402-site-a5m.pages.dev"
$CF_API             = "https://api.cloudflare.com/client/v4"

# ── Load token ──
if (-not $env:CLOUDFLARE_API_TOKEN) {
    $envFile = Join-Path $ROOT ".env.deploy"
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^\s*([^#][^=]+)=(.+)$') {
                [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), "Process")
            }
        }
        Write-Host "  [OK] Loaded token from .env.deploy" -ForegroundColor Green
    }
}

if (-not $env:CLOUDFLARE_API_TOKEN) {
    Write-Host "ERROR: CLOUDFLARE_API_TOKEN is not set." -ForegroundColor Red
    Write-Host '  $env:CLOUDFLARE_API_TOKEN = "cfut_..."  OR  create .env.deploy'
    exit 1
}

# ── Verify token ──
function Test-CloudflareToken {
    Write-Host "=> Verifying Cloudflare API token..."
    try {
        $resp = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/user/tokens/verify" `
            -Headers @{ "Authorization" = "Bearer $env:CLOUDFLARE_API_TOKEN" } -TimeoutSec 10
        if ($resp.result.status -eq "active") {
            Write-Host "  [OK] Token verified (active)" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] Token status: $($resp.result.status)" -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "  [FAIL] Token verification failed: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
    Write-Host ""
}

# ── Ensure DNS CNAME exists ──
function Ensure-Dns {
    $cfHeaders = @{ "Authorization" = "Bearer $env:CLOUDFLARE_API_TOKEN"; "Content-Type" = "application/json" }
    Write-Host "=> Checking DNS record for $CF_CUSTOM_DOMAIN..."
    $existing = Invoke-RestMethod -Uri "$CF_API/zones/$CF_ZONE_ID/dns_records?name=$CF_CUSTOM_DOMAIN" -Headers $cfHeaders
    if ($existing.result.Count -gt 0) {
        Write-Host "  [OK] CNAME already exists (ID: $($existing.result[0].id))" -ForegroundColor Green
    } else {
        Write-Host "  Creating CNAME $CF_CUSTOM_DOMAIN -> $CF_PAGES_SUBDOMAIN..."
        $body = @{ type = "CNAME"; name = "x402"; content = $CF_PAGES_SUBDOMAIN; proxied = $true; ttl = 1 } | ConvertTo-Json
        $resp = Invoke-RestMethod -Uri "$CF_API/zones/$CF_ZONE_ID/dns_records" -Method Post -Headers $cfHeaders -Body $body
        if ($resp.success) {
            Write-Host "  [OK] DNS CNAME created" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] DNS creation failed: $($resp.errors | ConvertTo-Json)" -ForegroundColor Red
            exit 1
        }
    }
    Write-Host ""
}

# ── Ensure Pages custom domain ──
function Ensure-CustomDomain {
    $cfHeaders = @{ "Authorization" = "Bearer $env:CLOUDFLARE_API_TOKEN"; "Content-Type" = "application/json" }
    Write-Host "=> Checking Pages custom domain..."
    $domains = Invoke-RestMethod -Uri "$CF_API/accounts/$CF_ACCOUNT_ID/pages/projects/$CF_PAGES_PROJECT/domains" -Headers $cfHeaders
    $found = $domains.result | Where-Object { $_.name -eq $CF_CUSTOM_DOMAIN }
    if ($found) {
        Write-Host "  [OK] Custom domain already configured (status: $($found.status))" -ForegroundColor Green
    } else {
        Write-Host "  Adding $CF_CUSTOM_DOMAIN to Pages project..."
        $body = @{ name = $CF_CUSTOM_DOMAIN } | ConvertTo-Json
        $resp = Invoke-RestMethod -Uri "$CF_API/accounts/$CF_ACCOUNT_ID/pages/projects/$CF_PAGES_PROJECT/domains" -Method Post -Headers $cfHeaders -Body $body
        if ($resp.success) {
            Write-Host "  [OK] Custom domain added (SSL provisioning in progress)" -ForegroundColor Green
        } else {
            Write-Host "  [WARN] Domain add: $($resp.errors | ConvertTo-Json)" -ForegroundColor Yellow
        }
    }
    Write-Host ""
}

# ── Deploy Gateway ──
function Deploy-Gateway {
    param([string]$Env)

    Write-Host "+-------------------------------------------------------+" -ForegroundColor Cyan
    Write-Host "|  FTH x402 Gateway -- Deploy ($Env)                     |" -ForegroundColor Cyan
    Write-Host "+-------------------------------------------------------+" -ForegroundColor Cyan
    Write-Host ""

    Push-Location $GATEWAY_DIR

    # Type-check
    Write-Host "=> Type-checking gateway..."
    npx tsc --noEmit
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Type-check failed" }
    Write-Host "  [OK] Types clean" -ForegroundColor Green
    Write-Host ""

    # Deploy
    Write-Host "=> Deploying to Cloudflare Workers ($Env)..."
    npx wrangler deploy --env $Env
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Wrangler deploy failed" }
    Write-Host ""

    Pop-Location

    # Health check
    $url = if ($Env -eq "production") { "https://api.fth.trading" } else { "https://staging-api.fth.trading" }
    Write-Host "=> Health check: $url/health"
    Start-Sleep -Seconds 3
    try {
        $health = Invoke-RestMethod -Uri "$url/health" -TimeoutSec 5
        Write-Host "  [OK] Gateway is live (status: $($health.status))" -ForegroundColor Green
    } catch {
        Write-Host "  [WARN] Health check failed (may need DNS propagation)" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "Gateway deploy complete." -ForegroundColor Green
    Write-Host "  URL: $url"
    Write-Host "  Verify: curl -i $url/api/v1/genesis/repro-pack/alpha"
    Write-Host ""
}

# ── Deploy Site ──
function Deploy-Site {
    Write-Host "+-------------------------------------------------------+" -ForegroundColor Cyan
    Write-Host "|  FTH x402 Site -- Deploy to x402.unykorn.org           |" -ForegroundColor Cyan
    Write-Host "+-------------------------------------------------------+" -ForegroundColor Cyan
    Write-Host ""

    Push-Location $SITE_DIR

    Write-Host "=> Deploying to Cloudflare Pages..."
    npx wrangler pages deploy public --project-name x402-site --branch main --commit-dirty=true
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Pages deploy failed" }
    Write-Host ""

    Pop-Location

    Write-Host "=> Verifying deployment..."
    Start-Sleep -Seconds 3
    try {
        $null = Invoke-WebRequest -Uri "https://x402-site-a5m.pages.dev/" -TimeoutSec 5 -UseBasicParsing
        Write-Host "  [OK] Site is live" -ForegroundColor Green
    } catch {
        Write-Host "  [WARN] Site may still be propagating" -ForegroundColor Yellow
    }

    # Ensure DNS + custom domain are wired
    Ensure-Dns
    Ensure-CustomDomain

    Write-Host ""
    Write-Host "Site deploy complete." -ForegroundColor Green
    Write-Host "  Pages:  https://$CF_PAGES_SUBDOMAIN"
    Write-Host "  Custom: https://$CF_CUSTOM_DOMAIN"
    Write-Host ""
}

# ── Main ──
Test-CloudflareToken

switch ($Target) {
    "staging"    { Deploy-Gateway -Env "staging" }
    "production" { Deploy-Gateway -Env "production" }
    "site"       { Deploy-Site }
    "dns"        {
        Ensure-Dns
        Ensure-CustomDomain
    }
    "setup"      {
        Write-Host "+-------------------------------------------------------+" -ForegroundColor Cyan
        Write-Host "|  FTH x402 -- Full Infrastructure Setup                  |" -ForegroundColor Cyan
        Write-Host "+-------------------------------------------------------+" -ForegroundColor Cyan
        Write-Host ""
        Ensure-Dns
        Ensure-CustomDomain
        Deploy-Site
        Write-Host "Setup complete. Site live at https://$CF_CUSTOM_DOMAIN" -ForegroundColor Green
    }
    "all"        {
        Deploy-Gateway -Env "production"
        Deploy-Site
        Write-Host "=======================================" -ForegroundColor Green
        Write-Host "  ALL DEPLOYMENTS COMPLETE" -ForegroundColor Green
        Write-Host "=======================================" -ForegroundColor Green
    }
}
