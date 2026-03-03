<#
.SYNOPSIS
  unyKorn-master  –  Windows disk discovery + inventory runner

.DESCRIPTION
  1) Finds Hardhat / Vite / Foundry projects under a search root.
  2) Finds deploy/verify/registry/ipfs scripts anywhere nearby.
  3) Runs the Node inventory scanner.

.PARAMETER SearchRoot
  Root folder to scan.  Defaults to the folder two levels above this script
  (i.e. the parent that likely contains your repos).

.EXAMPLE
  .\scripts\inventory.ps1
  .\scripts\inventory.ps1 -SearchRoot C:\dev
#>
param(
  [string]$SearchRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
)

$ErrorActionPreference = "SilentlyContinue"

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host "`n=== unyKorn Master Stack — Disk Discovery ===" -ForegroundColor Cyan
Write-Host "Search root : $SearchRoot" -ForegroundColor DarkCyan
Write-Host "Started     : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n"

# ── 1) Locate Hardhat / Vite / Foundry project roots ─────────────────────────
Write-Host "--- Project roots (hardhat / vite / foundry) ---" -ForegroundColor Yellow

$projectRoots = Get-ChildItem -Path $SearchRoot -Recurse -Directory |
  Where-Object {
    (Test-Path (Join-Path $_.FullName "hardhat.config.js"))   -or
    (Test-Path (Join-Path $_.FullName "hardhat.config.ts"))   -or
    (Test-Path (Join-Path $_.FullName "vite.config.ts"))      -or
    (Test-Path (Join-Path $_.FullName "vite.config.js"))      -or
    (Test-Path (Join-Path $_.FullName "foundry.toml"))
  } |
  Select-Object FullName

if ($projectRoots) {
  $projectRoots | ForEach-Object { Write-Host "  $($_.FullName)" }
} else {
  Write-Host "  (none found – check SearchRoot)" -ForegroundColor DarkYellow
}

# ── 2) Locate scripts of interest ────────────────────────────────────────────
Write-Host "`n--- Key scripts & registries ---" -ForegroundColor Yellow

Get-ChildItem -Path $SearchRoot -Recurse -File |
  Where-Object {
    $_.Name -match "deploy|verify|checkBalance|Routescan|registry|genesis|ipfs|inventory"
  } |
  Where-Object {
    $_.DirectoryName -notmatch "node_modules|\.git|dist|build|out|\.next"
  } |
  Select-Object FullName |
  ForEach-Object { Write-Host "  $($_.FullName)" }

# ── 3) Locate .env files (do NOT echo contents) ───────────────────────────────
Write-Host "`n--- .env files found (locations only — do NOT commit these) ---" -ForegroundColor Red

Get-ChildItem -Path $SearchRoot -Recurse -File -Filter ".env*" |
  Where-Object { $_.DirectoryName -notmatch "node_modules|\.git" } |
  Select-Object FullName |
  ForEach-Object { Write-Host "  $($_.FullName)" }

# ── 4) Run Node inventory scanner ────────────────────────────────────────────
Write-Host "`n--- Running Node inventory scanner ---" -ForegroundColor Yellow

$repoRoot   = $PSScriptRoot | Split-Path -Parent   # unyKorn-master/
$scriptPath = Join-Path $repoRoot "scripts\inventory.mjs"

if (Test-Path $scriptPath) {
  Push-Location $repoRoot
  node $scriptPath
  Pop-Location
} else {
  Write-Host "  inventory.mjs not found at $scriptPath – skipping."
}

Write-Host "`nDiscovery complete.`n" -ForegroundColor Green
