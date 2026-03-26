#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# UnyKorn L1 — Full AWS Deploy Orchestrator
# Usage: ./deploy.sh [devnet|staging]
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TF_DIR="$ROOT_DIR/terraform"
DOCKER_DIR="$ROOT_DIR/docker"

ENV="${1:-devnet}"
TFVARS="$TF_DIR/environments/${ENV}.tfvars"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[deploy]${NC} $1"; }
ok()   { echo -e "${GREEN}[  ok  ]${NC} $1"; }
warn() { echo -e "${YELLOW}[ warn ]${NC} $1"; }
err()  { echo -e "${RED}[error ]${NC} $1" >&2; }

# ─── Pre-flight checks ────────────────────────────────────
preflight() {
  log "Running pre-flight checks..."

  for cmd in terraform aws docker jq; do
    if ! command -v "$cmd" &>/dev/null; then
      err "$cmd is not installed"
      exit 1
    fi
  done
  ok "All tools present"

  if [ ! -f "$TFVARS" ]; then
    err "Environment file not found: $TFVARS"
    exit 1
  fi
  ok "Environment: $ENV"

  # Verify AWS credentials
  if ! aws sts get-caller-identity &>/dev/null; then
    err "AWS credentials not configured. Run 'aws configure' first."
    exit 1
  fi
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
  REGION=$(grep -oP 'aws_region\s*=\s*"\K[^"]+' "$TFVARS" || echo "us-east-1")
  ok "AWS Account: $ACCOUNT_ID | Region: $REGION"
}

# ─── Step 1: Terraform Init + Plan ────────────────────────
tf_init() {
  log "Step 1: Terraform init..."
  cd "$TF_DIR"
  terraform init -upgrade
  ok "Terraform initialized"
}

tf_plan() {
  log "Step 2: Terraform plan..."
  cd "$TF_DIR"
  terraform plan -var-file="$TFVARS" -out=tfplan
  ok "Plan saved to tfplan"
}

# ─── Step 2: Terraform Apply ──────────────────────────────
tf_apply() {
  log "Step 3: Terraform apply..."
  cd "$TF_DIR"

  read -p "Apply this plan? (yes/no): " confirm
  if [ "$confirm" != "yes" ]; then
    warn "Aborted."
    exit 0
  fi

  terraform apply tfplan
  ok "Infrastructure deployed"
}

# ─── Step 3: Build + Push Docker Images ───────────────────
docker_build_push() {
  log "Step 4: Building Docker images..."
  cd "$ROOT_DIR/.."

  # Get ECR URLs from Terraform output
  cd "$TF_DIR"
  NODE_ECR=$(terraform output -raw ecr_node_repo_url 2>/dev/null || echo "")

  if [ -z "$NODE_ECR" ]; then
    warn "ECR URL not available yet. Run terraform apply first."
    return
  fi

  REGION=$(grep -oP 'aws_region\s*=\s*"\K[^"]+' "$TFVARS" || echo "us-east-1")
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

  # ECR login
  log "Logging into ECR..."
  aws ecr get-login-password --region "$REGION" | \
    docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
  ok "ECR login successful"

  # Build node image
  log "Building L1 node image..."
  docker build -f "$DOCKER_DIR/Dockerfile.node" -t unykorn-node:latest "$ROOT_DIR/../.."
  docker tag unykorn-node:latest "${NODE_ECR}:latest"
  docker tag unykorn-node:latest "${NODE_ECR}:$(date +%Y%m%d-%H%M%S)"
  docker push "${NODE_ECR}:latest"
  ok "Node image pushed to ECR"

  # Build dashboard image
  DASH_ECR=$(terraform output -raw ecr_dashboard_repo_url 2>/dev/null || echo "")
  if [ -n "$DASH_ECR" ]; then
    log "Building dashboard image..."
    docker build -f "$DOCKER_DIR/Dockerfile.dashboard" -t unykorn-dashboard:latest "$ROOT_DIR/../../packages/unyKorn-wallet"
    docker tag unykorn-dashboard:latest "${DASH_ECR}:latest"
    docker push "${DASH_ECR}:latest"
    ok "Dashboard image pushed to ECR"
  fi
}

# ─── Step 4: Seed Secrets ─────────────────────────────────
seed_secrets() {
  log "Step 5: Checking secrets..."

  REGION=$(grep -oP 'aws_region\s*=\s*"\K[^"]+' "$TFVARS" || echo "us-east-1")

  # Check if node keys need real values
  NODE_KEYS=$(aws secretsmanager get-secret-value \
    --secret-id unykorn/l1/node-keys \
    --region "$REGION" \
    --query SecretString --output text 2>/dev/null || echo "")

  if echo "$NODE_KEYS" | grep -q "REPLACE_WITH_REAL_SEED"; then
    warn "Node key seeds are still placeholder values!"
    warn "Update via: aws secretsmanager update-secret --secret-id unykorn/l1/node-keys --secret-string '<json>'"
  else
    ok "Node keys appear to be set"
  fi
}

# ─── Step 5: Verify Deployment ────────────────────────────
verify() {
  log "Step 6: Verifying deployment..."
  cd "$TF_DIR"

  # Check ALB health
  ALB_DNS=$(terraform output -raw alb_dns_name 2>/dev/null || echo "")
  if [ -n "$ALB_DNS" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://${ALB_DNS}" --max-time 10 || echo "000")
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ]; then
      ok "ALB responding: HTTP $HTTP_CODE"
    else
      warn "ALB returned HTTP $HTTP_CODE (may still be starting)"
    fi
  fi

  # Check NLB/RPC
  NLB_DNS=$(terraform output -raw nlb_dns_name 2>/dev/null || echo "")
  if [ -n "$NLB_DNS" ]; then
    RPC_RESP=$(curl -s -X POST "http://${NLB_DNS}:3001" \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"unykorn_getValidatorList","params":[],"id":1}' \
      --max-time 10 || echo "")

    if echo "$RPC_RESP" | jq -e '.result' &>/dev/null; then
      ok "RPC responding"
    else
      warn "RPC not responding yet (nodes may still be starting)"
    fi
  fi

  # Node status
  log "Node instance status:"
  for node in alpha bravo charlie delta echo; do
    INSTANCE_ID=$(terraform output -json node_instance_ids 2>/dev/null | jq -r ".${node}" || echo "")
    if [ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ]; then
      STATUS=$(aws ec2 describe-instance-status \
        --instance-ids "$INSTANCE_ID" \
        --query "InstanceStatuses[0].InstanceState.Name" \
        --output text 2>/dev/null || echo "unknown")
      echo "  $node ($INSTANCE_ID): $STATUS"
    fi
  done

  echo ""
  ok "Deployment verification complete"
  echo ""
  log "═══════════════════════════════════════════════════"
  log "  Dashboard:  http://${ALB_DNS:-pending}"
  log "  RPC:        http://${NLB_DNS:-pending}:3001"
  log "  Grafana:    $(terraform output -raw grafana_endpoint 2>/dev/null || echo 'pending')"
  log "  CloudWatch: https://${REGION:-us-east-1}.console.aws.amazon.com/cloudwatch/home?region=${REGION:-us-east-1}#dashboards:name=unykorn-l1-${ENV}"
  log "═══════════════════════════════════════════════════"
}

# ─── Main ─────────────────────────────────────────────────
main() {
  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "  UnyKorn L1 — AWS Deploy ($ENV)"
  echo "═══════════════════════════════════════════════════"
  echo ""

  preflight
  tf_init
  tf_plan
  tf_apply
  docker_build_push
  seed_secrets
  verify
}

main
