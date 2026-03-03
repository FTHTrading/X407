#!/usr/bin/env bash
# inventory.sh  –  unyKorn-master  Mac/Linux disk discovery + inventory runner
#
# Usage:
#   chmod +x scripts/inventory.sh
#   ./scripts/inventory.sh [search-root]
#
# If search-root is omitted, the PARENT of this repo's root is used.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SEARCH_ROOT="${1:-$(dirname "$REPO_ROOT")}"

echo ""
echo "=== unyKorn Master Stack — Disk Discovery ==="
echo "Search root : $SEARCH_ROOT"
echo "Started     : $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ── 1) Project roots ──────────────────────────────────────────────────────────
echo "--- Project roots (hardhat / vite / foundry) ---"
find "$SEARCH_ROOT" -maxdepth 8 -type f \
  \( -name "hardhat.config.js" \
  -o -name "hardhat.config.ts" \
  -o -name "vite.config.js" \
  -o -name "vite.config.ts" \
  -o -name "foundry.toml" \) \
  ! -path "*/node_modules/*" \
  ! -path "*/.git/*" \
  2>/dev/null | xargs -I{} dirname {} | sort -u | while read -r d; do
    echo "  $d"
  done

# ── 2) Key scripts & registries ───────────────────────────────────────────────
echo ""
echo "--- Key scripts & registries ---"
find "$SEARCH_ROOT" -maxdepth 8 -type f 2>/dev/null \
  | grep -iE "deploy|verify|checkbalance|routescan|registry|genesis|ipfs|inventory" \
  | grep -vE "node_modules|\.git|dist|build|out|\.next" \
  | sort | while read -r f; do
    echo "  $f"
  done

# ── 3) .env files (locations only) ───────────────────────────────────────────
echo ""
echo "--- .env files (locations only — do NOT commit) ---"
find "$SEARCH_ROOT" -maxdepth 8 -type f -name ".env*" 2>/dev/null \
  | grep -vE "node_modules|\.git" \
  | sort | while read -r f; do
    echo "  $f"
  done

# ── 4) Run Node inventory scanner ────────────────────────────────────────────
echo ""
echo "--- Running Node inventory scanner ---"
SCANNER="$REPO_ROOT/scripts/inventory.mjs"
if [ -f "$SCANNER" ]; then
  cd "$REPO_ROOT"
  node "$SCANNER"
else
  echo "  inventory.mjs not found at $SCANNER – skipping."
fi

echo ""
echo "Discovery complete."
echo ""
