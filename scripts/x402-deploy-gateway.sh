#!/usr/bin/env bash
# ===========================================================================
# FTH x402 — Unified Deploy Script
# ===========================================================================
# Usage:
#   ./scripts/x402-deploy-gateway.sh                      → deploy gateway to production
#   ./scripts/x402-deploy-gateway.sh staging               → deploy gateway to staging
#   ./scripts/x402-deploy-gateway.sh production            → deploy gateway to production
#   ./scripts/x402-deploy-gateway.sh site                  → deploy x402.unykorn.org + explorer.unykorn.org
#   ./scripts/x402-deploy-gateway.sh dns                   → ensure DNS + custom domains
#   ./scripts/x402-deploy-gateway.sh setup                 → full infra setup (DNS + site deploy)
#   ./scripts/x402-deploy-gateway.sh all                   → deploy everything
#
# Auth:
#   Uses CLOUDFLARE_API_TOKEN env var. Falls back to .env.deploy if present.
#   Token must have: Workers Scripts:Edit, Pages:Edit, DNS:Edit
#
# Secrets / env (set once per env):
#   wrangler secret put OPENMETER_ENDPOINT --env <env>
#   wrangler secret put OPENMETER_API_KEY  --env <env>
# Gateway vars in wrangler.toml:
#   UNYKORN_TREASURY_ADDRESS
# Facilitator env:
#   UNYKORN_RPC_URL
#   UNYKORN_CHAIN_ID
#   UNYKORN_EXPLORER_URL
#   UNYKORN_CONFIRMATIONS
# ===========================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
GATEWAY_DIR="$ROOT_DIR/packages/fth-x402-gateway"
SITE_DIR="$ROOT_DIR/packages/fth-x402-site"
ENV="${1:-production}"

# ── Cloudflare infrastructure IDs ──
CF_ZONE_ID="8aa6916f4c1c7e8e42130455dfd5c029"        # unykorn.org
CF_ACCOUNT_ID="07bcc4a189ef176261b818409c95891f"
CF_PAGES_PROJECT="x402-site"
CF_SITE_DOMAIN="x402.unykorn.org"
CF_EXPLORER_DOMAIN="explorer.unykorn.org"
CF_PAGES_SUBDOMAIN="x402-site-a5m.pages.dev"
CF_API="https://api.cloudflare.com/client/v4"
CF_CUSTOM_DOMAINS=("$CF_SITE_DOMAIN" "$CF_EXPLORER_DOMAIN")

# ── Load token from .env.deploy if not set ──
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  ENV_FILE="$ROOT_DIR/.env.deploy"
  if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    echo "  ✓ Loaded token from .env.deploy"
  fi
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN is not set."
  echo "  export CLOUDFLARE_API_TOKEN=cfut_... OR create .env.deploy"
  exit 1
fi
export CLOUDFLARE_API_TOKEN

# ── Verify token ──
verify_token() {
  echo "→ Verifying Cloudflare API token..."
  VERIFY=$(curl -s "https://api.cloudflare.com/client/v4/user/tokens/verify" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" 2>/dev/null)
  if echo "$VERIFY" | grep -q '"active"'; then
    echo "  ✓ Token verified (active)"
  else
    echo "  ✗ Token verification failed"
    echo "  $VERIFY"
    exit 1
  fi
  echo ""
}

# ── Ensure DNS CNAME exists ──
ensure_dns_record() {
  local DOMAIN="$1"
  local RECORD_NAME="${DOMAIN%%.unykorn.org}"

  echo "→ Checking DNS record for $DOMAIN..."
  EXISTING=$(curl -s "$CF_API/zones/$CF_ZONE_ID/dns_records?name=$DOMAIN" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" 2>/dev/null)
  COUNT=$(echo "$EXISTING" | grep -o '"count":[0-9]*' | head -1 | grep -o '[0-9]*')

  if [[ "${COUNT:-0}" -gt 0 ]]; then
    echo "  ✓ CNAME already exists"
  else
    echo "  → Creating CNAME $DOMAIN → $CF_PAGES_SUBDOMAIN..."
    RESULT=$(curl -s -X POST "$CF_API/zones/$CF_ZONE_ID/dns_records" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "{\"type\":\"CNAME\",\"name\":\"$RECORD_NAME\",\"content\":\"$CF_PAGES_SUBDOMAIN\",\"proxied\":true,\"ttl\":1}" 2>/dev/null)
    if echo "$RESULT" | grep -q '"success":true'; then
      echo "  ✓ DNS CNAME created"
    else
      echo "  ✗ DNS creation failed"
      echo "  $RESULT"
      exit 1
    fi
  fi
  echo ""
}

# ── Ensure Pages custom domain ──
ensure_custom_domain() {
  local DOMAIN="$1"

  echo "→ Checking Pages custom domain for $DOMAIN..."
  DOMAINS=$(curl -s "$CF_API/accounts/$CF_ACCOUNT_ID/pages/projects/$CF_PAGES_PROJECT/domains" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" 2>/dev/null)

  if echo "$DOMAINS" | grep -q "$DOMAIN"; then
    echo "  ✓ Custom domain already configured"
  else
    echo "  → Adding $DOMAIN to Pages project..."
    RESULT=$(curl -s -X POST "$CF_API/accounts/$CF_ACCOUNT_ID/pages/projects/$CF_PAGES_PROJECT/domains" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "{\"name\":\"$DOMAIN\"}" 2>/dev/null)
    if echo "$RESULT" | grep -q '"success":true'; then
      echo "  ✓ Custom domain added (SSL provisioning in progress)"
    else
      echo "  ⚠ Domain add response: $(echo "$RESULT" | head -c 200)"
    fi
  fi
  echo ""
}

# ── Purge Cloudflare cache (best effort) ──
purge_cache() {
  echo "→ Purging Cloudflare cache for UnyKorn site domains..."
  RESULT=$(curl -s -X POST "$CF_API/zones/$CF_ZONE_ID/purge_cache" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}' 2>/dev/null || true)

  if echo "$RESULT" | grep -q '"success":true'; then
    echo "  ✓ Cache purged"
  else
    echo "  ⚠ Cache purge skipped or failed"
    echo "  $(echo "$RESULT" | head -c 200)"
  fi
  echo ""
}

# ── Deploy Gateway (Workers) ──
deploy_gateway() {
  local TARGET_ENV="${1:-production}"

  echo "╔═══════════════════════════════════════════════════════╗"
  echo "║  FTH x402 Gateway — Deploy ($TARGET_ENV)              ║"
  echo "╚═══════════════════════════════════════════════════════╝"
  echo ""

  if [[ "$TARGET_ENV" != "staging" && "$TARGET_ENV" != "production" ]]; then
    echo "ERROR: Unknown environment '$TARGET_ENV'. Use 'staging' or 'production'."
    exit 1
  fi

  # Type-check
  echo "→ Type-checking gateway..."
  cd "$GATEWAY_DIR"
  npx tsc --noEmit
  echo "  ✓ Types clean"
  echo ""

  # Deploy
  echo "→ Deploying to Cloudflare Workers ($TARGET_ENV)..."
  npx wrangler deploy --env "$TARGET_ENV"
  echo ""

  # Health check
  local GATEWAY_URL
  if [[ "$TARGET_ENV" == "production" ]]; then
    GATEWAY_URL="https://api.fth.trading"
  else
    GATEWAY_URL="https://staging-api.fth.trading"
  fi

  echo "→ Health check: $GATEWAY_URL/health"
  sleep 3

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/health" 2>/dev/null || echo "000")
  if [[ "$HTTP_CODE" == "200" ]]; then
    echo "  ✓ Gateway is live ($HTTP_CODE)"
  else
    echo "  ⚠ Health check returned $HTTP_CODE (may need DNS propagation)"
  fi

  echo ""
  echo "Gateway deploy complete."
  echo "  Worker: fth-x402-gateway$([ "$TARGET_ENV" != "production" ] && echo "-$TARGET_ENV")"
  echo "  URL:    $GATEWAY_URL"
  echo ""
  echo "Verify paid route:"
  echo "  curl -i $GATEWAY_URL/api/v1/agent/pay-api/demo"
  echo "  → expect HTTP 402 with X-PAYMENT-REQUIRED header"
  echo ""
}

# ── Deploy Site (Pages) ──
deploy_site() {
  echo "╔═══════════════════════════════════════════════════════╗"
  echo "║  FTH x402 Site — Deploy to x402.unykorn.org           ║"
  echo "╚═══════════════════════════════════════════════════════╝"
  echo ""

  cd "$SITE_DIR"

  echo "→ Deploying to Cloudflare Pages..."
  npx wrangler pages deploy public \
    --project-name x402-site \
    --branch main \
    --commit-dirty=true
  echo ""

  echo "→ Verifying deployment..."
  sleep 3
  SITE_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://x402-site-a5m.pages.dev/" 2>/dev/null || echo "000")
  if [[ "$SITE_CODE" == "200" ]]; then
    echo "  ✓ Site is live ($SITE_CODE)"
  else
    echo "  ⚠ Site returned $SITE_CODE (propagation may be in progress)"
  fi

  echo ""
  # Ensure DNS + custom domains are wired
  for DOMAIN in "${CF_CUSTOM_DOMAINS[@]}"; do
    ensure_dns_record "$DOMAIN"
    ensure_custom_domain "$DOMAIN"
  done
  purge_cache

  echo "→ Verifying custom domains..."
  sleep 3
  for DOMAIN in "${CF_CUSTOM_DOMAINS[@]}"; do
    CUSTOM_SITE_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/?v=$(date +%s)" 2>/dev/null || echo "000")
    if [[ "$CUSTOM_SITE_CODE" == "200" ]]; then
      echo "  ✓ $DOMAIN is serving ($CUSTOM_SITE_CODE)"
    else
      echo "  ⚠ $DOMAIN returned $CUSTOM_SITE_CODE (propagation may still be in progress)"
    fi
  done
  echo ""

  echo "Site deploy complete."
  echo "  Pages project: $CF_PAGES_PROJECT"
  echo "  URL:           https://$CF_PAGES_SUBDOMAIN"
  echo "  Site domain:   https://$CF_SITE_DOMAIN"
  echo "  Explorer host: https://$CF_EXPLORER_DOMAIN"
  echo ""
}

# ── Main dispatch ──
verify_token

case "$ENV" in
  staging)
    deploy_gateway "staging"
    ;;
  production)
    deploy_gateway "production"
    ;;
  site)
    deploy_site
    ;;
  dns)
    for DOMAIN in "${CF_CUSTOM_DOMAINS[@]}"; do
      ensure_dns_record "$DOMAIN"
      ensure_custom_domain "$DOMAIN"
    done
    ;;
  setup)
    echo "╔═══════════════════════════════════════════════════════╗"
    echo "║  FTH x402 — Full Infrastructure Setup                  ║"
    echo "╚═══════════════════════════════════════════════════════╝"
    echo ""
    for DOMAIN in "${CF_CUSTOM_DOMAINS[@]}"; do
      ensure_dns_record "$DOMAIN"
      ensure_custom_domain "$DOMAIN"
    done
    deploy_site
    echo "Setup complete. Site live at https://$CF_SITE_DOMAIN"
    echo "Explorer live at https://$CF_EXPLORER_DOMAIN"
    ;;
  all)
    deploy_gateway "production"
    deploy_site
    echo "═══════════════════════════════════════"
    echo "  ALL DEPLOYMENTS COMPLETE"
    echo "═══════════════════════════════════════"
    ;;
  *)
    echo "ERROR: Unknown target '$ENV'."
    echo "  Use: staging | production | site | dns | setup | all"
    exit 1
    ;;
esac
