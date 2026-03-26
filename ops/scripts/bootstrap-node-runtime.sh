#!/usr/bin/env bash
# ===========================================================
# bootstrap-node-runtime.sh
# UnyKorn L1 — Node Bootstrap Script
#
# Run this on each EC2 node via SSM Session Manager.
# Idempotent — safe to re-run if the node is already running.
#
# Usage (via SSM):
#   aws ssm start-session --target i-083a36c8ce027de55 --region us-east-1
#   Then paste or send as SSM RunDocument
#
# Required env vars (set before running or export them):
#   NODE_NAME   — alpha | bravo | charlie | delta | echo
#   NODE_ROLE   — producer | validator | oracle
#   RPC_PORT    — 3001 | 3002 | 3003 | 3004 | 3005
#   P2P_PORT    — 30301 | 30302 | 30303 | 30304 | 30305
# ===========================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────
ECR_REGISTRY="933629770808.dkr.ecr.us-east-1.amazonaws.com"
ECR_REPO="unykorn-l1/node"
IMAGE_TAG="${IMAGE_TAG:-latest}"
FULL_IMAGE="${ECR_REGISTRY}/${ECR_REPO}:${IMAGE_TAG}"

SECRET_ID="unykorn/l1/node-keys"
DATA_DIR="/data/unykorn"
LOG_DIR="/var/log/unykorn"
CONFIG_FILE="${DATA_DIR}/node.toml"
CONTAINER_NAME="unykorn-${NODE_NAME:-UNKNOWN}"

# ── Node name → config file mapping ─────────────────────────
# The Docker image bundles /app/devnet/node-N-docker.toml for each node.
# These are the configs from the unykorn-l1 chain source repo.
declare -A NODE_CONFIG_MAP=(
    [alpha]="/app/devnet/node-1-docker.toml"
    [bravo]="/app/devnet/node-2-docker.toml"
    [charlie]="/app/devnet/node-3-docker.toml"
    [delta]="/app/devnet/node-4-docker.toml"
    [echo]="/app/devnet/node-5-docker.toml"
)

# ── Validate required vars ───────────────────────────────────
echo "[bootstrap] Checking required variables..."
if [ -z "${NODE_NAME:-}" ]; then
    echo "ERROR: NODE_NAME is not set."
    echo "  Valid values: alpha | bravo | charlie | delta | echo"
    echo "  Example: export NODE_NAME=alpha"
    exit 1
fi

# Resolve config file from node name
NODE_CONFIG="${NODE_CONFIG_MAP[$NODE_NAME]:-}"
if [ -z "${NODE_CONFIG}" ]; then
    echo "ERROR: NODE_NAME '${NODE_NAME}' is not recognized."
    echo "  Valid values: alpha | bravo | charlie | delta | echo"
    exit 1
fi

echo "[bootstrap] Node: ${NODE_NAME} | Config: ${NODE_CONFIG}"

# ── Detect AWS region from IMDS ──────────────────────────────
echo "[bootstrap] Detecting AWS region..."
REGION=$(curl -sf http://169.254.169.254/latest/meta-data/placement/region || echo "us-east-1")
INSTANCE_ID=$(curl -sf http://169.254.169.254/latest/meta-data/instance-id || echo "unknown")
echo "[bootstrap] Region: ${REGION} | Instance: ${INSTANCE_ID}"

# ── Create directories ───────────────────────────────────────
echo "[bootstrap] Creating data and log directories..."
mkdir -p "${DATA_DIR}" "${LOG_DIR}"
# Container runs as UID 1000 (unykorn user) — host dirs must be writable
chown -R 1000:1000 "${DATA_DIR}" "${LOG_DIR}" 2>/dev/null || true

# ── Resolve RPC port for health checks (from config map) ─────
# alpha=3001, bravo=3002, charlie=3003, delta=3004, echo=3005
declare -A NODE_RPC_MAP=([alpha]=3001 [bravo]=3002 [charlie]=3003 [delta]=3004 [echo]=3005)
RPC_PORT="${NODE_RPC_MAP[$NODE_NAME]}"
echo "[bootstrap] RPC port: ${RPC_PORT}"

# ── ECR Login ────────────────────────────────────────────────
echo "[bootstrap] Authenticating to ECR..."
aws ecr get-login-password --region "${REGION}" | \
    docker login --username AWS --password-stdin "${ECR_REGISTRY}"

# ── Pull image ───────────────────────────────────────────────
echo "[bootstrap] Pulling image: ${FULL_IMAGE}..."
docker pull "${FULL_IMAGE}"

# ── Fetch node key from Secrets Manager (optional override) ──
# The image already has default devnet keys in the built-in config files.
# This step fetches a production key to override only if present in Secrets Manager.
echo "[bootstrap] Checking Secrets Manager for node key override..."
NODE_KEY=""
if aws secretsmanager describe-secret --secret-id "${SECRET_ID}" --region "${REGION}" &>/dev/null; then
    NODE_KEY=$(aws secretsmanager get-secret-value \
        --secret-id "${SECRET_ID}" \
        --region "${REGION}" \
        --query 'SecretString' \
        --output text 2>/dev/null | jq -r ".${NODE_NAME}" 2>/dev/null || true)
fi

if [ -n "${NODE_KEY}" ] && [ "${NODE_KEY}" != "null" ]; then
    echo "[bootstrap] Production node key found — writing override config..."
    # Determine P2P port from node name
    declare -A NODE_P2P_MAP=([alpha]=30301 [bravo]=30302 [charlie]=30303 [delta]=30304 [echo]=30305)
    P2P_PORT="${NODE_P2P_MAP[$NODE_NAME]}"

    # Write a full config in the actual UnyKorn TOML schema
    mkdir -p "${DATA_DIR}"
    cat > "${CONFIG_FILE}" <<TOML
runtime_version = 1
node_key_seed   = "${NODE_KEY}"
node_name       = "${NODE_NAME}"

[network]
chain_id     = 7331
network_id   = 1
listen_addr  = "/ip4/0.0.0.0/tcp/${P2P_PORT}"
boot_nodes   = []
max_peers    = 10

[consensus]
block_time_ms       = 3000
max_block_size      = 5000000
max_tx_per_block    = 1000
block_gas_limit     = 30000000
min_validator_stake = "1000000000000000000000000"
validator_count     = 5

[rpc]
port            = ${RPC_PORT}
enable_cors     = true
max_connections = 100

[storage]
data_dir       = "/app/data"
state_backend  = "rocksdb"
cache_size_mb  = 64

[features]
ai_policy           = false
ai_fees             = false
module_treasury     = false
module_identity     = false
module_vaults       = false
module_rwa          = false
module_governance   = false
module_energy       = false
module_carbon       = false
module_compliance   = false
module_notary       = false
module_ip_registrar = false
module_credit_ledger = false
module_validators   = false
module_tld_registry = false
module_affiliate    = false
module_openai       = false
module_trade_finance = true

[modules]
enable_registry = true
max_concurrent  = 8
TOML
    chmod 600 "${CONFIG_FILE}"
    # Use the override config, not the built-in devnet one
    NODE_CONFIG="${CONFIG_FILE}"
    echo "[bootstrap] Override config written: ${CONFIG_FILE}"
else
    echo "[bootstrap] No production key found — using built-in devnet config: ${NODE_CONFIG}"
fi

# ── Stop existing container (idempotent) ─────────────────────
if docker ps -q --filter "name=${CONTAINER_NAME}" | grep -q .; then
    echo "[bootstrap] Stopping existing container ${CONTAINER_NAME}..."
    docker stop "${CONTAINER_NAME}" || true
    docker rm "${CONTAINER_NAME}" || true
elif docker ps -aq --filter "name=${CONTAINER_NAME}" | grep -q .; then
    echo "[bootstrap] Removing stopped container ${CONTAINER_NAME}..."
    docker rm "${CONTAINER_NAME}" || true
fi

# ── Run node ─────────────────────────────────────────────────
# Binary: 'unykorn' (ENTRYPOINT in image). Config mounted via volume if override.
echo "[bootstrap] Starting ${CONTAINER_NAME} with config: ${NODE_CONFIG}..."
DOCKER_ARGS=(
    -d
    --name "${CONTAINER_NAME}"
    --restart unless-stopped
    --network host
    -v "${DATA_DIR}:/app/data"
    -v "${LOG_DIR}:/app/logs"
    -e RUST_LOG=info,unykorn=debug
)

# If we wrote an override config, mount it into the container
if [ "${NODE_CONFIG}" = "${CONFIG_FILE}" ]; then
    DOCKER_ARGS+=(-v "${CONFIG_FILE}:${CONFIG_FILE}:ro")
fi

docker run \
    "${DOCKER_ARGS[@]}" \
    "${FULL_IMAGE}" \
    --config "${NODE_CONFIG}"

# ── Verify container started ─────────────────────────────────
sleep 3
if docker ps -q --filter "name=${CONTAINER_NAME}" | grep -q .; then
    echo "[bootstrap] Container ${CONTAINER_NAME} is running."
    docker ps --filter "name=${CONTAINER_NAME}" --format "  ID: {{.ID}}  Status: {{.Status}}"
else
    echo "[ERROR] Container did not start. Checking logs..."
    docker logs "${CONTAINER_NAME}" 2>&1 | tail -30
    exit 1
fi

# ── Check port is listening ──────────────────────────────────
echo "[bootstrap] Waiting for port ${RPC_PORT} to be available..."
for i in $(seq 1 12); do
    if ss -tlnp 2>/dev/null | grep -q ":${RPC_PORT}"; then
        echo "[bootstrap] Port ${RPC_PORT} is listening. Node is ready."
        break
    fi
    if [ $i -eq 12 ]; then
        echo "[WARN] Port ${RPC_PORT} not yet listening after 60s. Check logs:"
        echo "  docker logs ${CONTAINER_NAME}"
    fi
    sleep 5
done

# ── Status summary ───────────────────────────────────────────
echo ""
echo "========================================================"
echo "  Bootstrap complete: ${NODE_NAME}"
echo "  Container:  ${CONTAINER_NAME}"
echo "  Image:      ${FULL_IMAGE}"
echo "  Config:     ${NODE_CONFIG}"
echo "  RPC port:   ${RPC_PORT}"
echo ""
echo "  Log commands:"
echo "    docker logs ${CONTAINER_NAME} -f"
echo "    tail -f ${LOG_DIR}/*.log"
echo "========================================================"
