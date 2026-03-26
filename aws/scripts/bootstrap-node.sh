#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# UnyKorn L1 — Per-Node Bootstrap
# Called by EC2 user data or manually via SSM
# Usage: ./bootstrap-node.sh <node_name> <ecr_url>
# ─────────────────────────────────────────────────────────────
set -euo pipefail

NODE_NAME="${1:?Usage: bootstrap-node.sh <node_name> <ecr_url>}"
ECR_URL="${2:?Usage: bootstrap-node.sh <node_name> <ecr_url>}"

REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region)

echo "[bootstrap] Node: $NODE_NAME | Region: $REGION"

# ── Install Docker if needed ──────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "[bootstrap] Installing Docker..."
  yum update -y
  yum install -y docker jq
  systemctl enable docker
  systemctl start docker
  usermod -aG docker ec2-user
fi

# ── Install CloudWatch agent ──────────────────────────────
if ! command -v amazon-cloudwatch-agent-ctl &>/dev/null; then
  echo "[bootstrap] Installing CloudWatch agent..."
  yum install -y amazon-cloudwatch-agent
fi

# ── Prepare directories ──────────────────────────────────
mkdir -p /data/unykorn/{blocks,state,meta}
mkdir -p /var/log/unykorn
chown -R ec2-user:ec2-user /data/unykorn /var/log/unykorn

# ── ECR login ─────────────────────────────────────────────
echo "[bootstrap] Logging into ECR..."
aws ecr get-login-password --region "$REGION" | \
  docker login --username AWS --password-stdin "$ECR_URL"

# ── Pull image ────────────────────────────────────────────
echo "[bootstrap] Pulling node image..."
docker pull "${ECR_URL}:latest"

# ── Fetch node key ────────────────────────────────────────
echo "[bootstrap] Fetching node key from Secrets Manager..."
NODE_KEY=$(aws secretsmanager get-secret-value \
  --secret-id unykorn/l1/node-keys \
  --region "$REGION" \
  --query 'SecretString' --output text | jq -r ".${NODE_NAME}")

if [ "$NODE_KEY" = "REPLACE_WITH_REAL_SEED" ] || [ -z "$NODE_KEY" ]; then
  echo "[bootstrap] WARNING: Node key is placeholder. Generating temporary key..."
  NODE_KEY=$(openssl rand -hex 32)
  echo "[bootstrap] Temporary key generated. Update Secrets Manager for production."
fi

# ── Determine ports from node name ────────────────────────
declare -A RPC_PORTS=( [alpha]=3001 [bravo]=3002 [charlie]=3003 [delta]=3004 [echo]=3005 )
declare -A P2P_PORTS=( [alpha]=30301 [bravo]=30302 [charlie]=30303 [delta]=30304 [echo]=30305 )
declare -A ROLES=( [alpha]="producer" [bravo]="validator" [charlie]="validator" [delta]="oracle" [echo]="oracle" )

RPC_PORT="${RPC_PORTS[$NODE_NAME]}"
P2P_PORT="${P2P_PORTS[$NODE_NAME]}"
NODE_ROLE="${ROLES[$NODE_NAME]}"

# ── Write node config ────────────────────────────────────
cat > /data/unykorn/node.toml <<EOF
[node]
name = "$NODE_NAME"
role = "$NODE_ROLE"
chain_id = 7331
data_dir = "/data/unykorn"

[network]
listen_port = $P2P_PORT
rpc_port = $RPC_PORT
rpc_bind = "0.0.0.0"

[identity]
node_key_seed = "$NODE_KEY"

[consensus]
block_time_ms = 3000

[metrics]
prometheus_port = 9090
EOF

# ── Stop old container if running ─────────────────────────
docker stop "unykorn-${NODE_NAME}" 2>/dev/null || true
docker rm "unykorn-${NODE_NAME}" 2>/dev/null || true

# ── Run node ──────────────────────────────────────────────
echo "[bootstrap] Starting node $NODE_NAME..."
docker run -d \
  --name "unykorn-${NODE_NAME}" \
  --restart unless-stopped \
  --network host \
  -v /data/unykorn:/data/unykorn \
  -v /var/log/unykorn:/var/log/unykorn \
  -e NODE_NAME="$NODE_NAME" \
  -e NODE_ROLE="$NODE_ROLE" \
  -e RUST_LOG=info \
  "${ECR_URL}:latest" \
  --config /data/unykorn/node.toml

echo "[bootstrap] Node $NODE_NAME started successfully"

# ── Health check ──────────────────────────────────────────
sleep 5
if docker ps --filter "name=unykorn-${NODE_NAME}" --format "{{.Status}}" | grep -q "Up"; then
  echo "[bootstrap] ✓ Container is running"
else
  echo "[bootstrap] ✗ Container failed to start"
  docker logs "unykorn-${NODE_NAME}" --tail 20
  exit 1
fi
