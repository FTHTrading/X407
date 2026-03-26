#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# UnyKorn L1 — Clean Teardown
# Usage: ./teardown.sh [devnet|staging]
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TF_DIR="$ROOT_DIR/terraform"

ENV="${1:-devnet}"
TFVARS="$TF_DIR/environments/${ENV}.tfvars"

RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${RED}═══════════════════════════════════════════════════${NC}"
echo -e "${RED}  UnyKorn L1 — TEARDOWN ($ENV)${NC}"
echo -e "${RED}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}This will DESTROY all AWS resources for '$ENV'.${NC}"
echo -e "${YELLOW}EBS volumes with delete_on_termination=false will persist.${NC}"
echo ""
read -p "Type 'destroy-${ENV}' to confirm: " confirm

if [ "$confirm" != "destroy-${ENV}" ]; then
  echo "Aborted."
  exit 0
fi

cd "$TF_DIR"

echo "[teardown] Running terraform destroy..."
terraform destroy -var-file="$TFVARS" -auto-approve

echo ""
echo "[teardown] Infrastructure destroyed."
echo "[teardown] Note: Check for orphaned EBS volumes, ECR images, and S3 objects."
echo ""

# List any remaining resources
echo "[teardown] Checking for leftover resources..."
REGION=$(grep -oP 'aws_region\s*=\s*"\K[^"]+' "$TFVARS" || echo "us-east-1")

echo "  EBS volumes:"
aws ec2 describe-volumes \
  --region "$REGION" \
  --filters "Name=tag:Project,Values=UnyKorn-L1" \
  --query "Volumes[].{ID:VolumeId,State:State,Size:Size}" \
  --output table 2>/dev/null || echo "  (none found)"

echo "  ECR images:"
aws ecr list-images \
  --repository-name "unykorn-l1/node" \
  --region "$REGION" \
  --query "imageIds[].imageTag" \
  --output text 2>/dev/null || echo "  (none found)"

echo ""
echo "[teardown] Done. Verify in AWS Console."
