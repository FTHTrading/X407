# NODE RUNTIME DEPLOY PLAN — UnyKorn L1
**Date:** 2026-03-19 (updated)  
**Status:** ✅ DEPLOYED — 5/5 nodes running, NLB 5/5 healthy

---

## Section 1 — Chain Runtime Facts (Verified from Code)

### Binary
- Package name: `unykorn-node` (Cargo workspace member)
- **Binary name: `unykorn`** (from `[[bin]] name = "unykorn"` in `crates/node/Cargo.toml`)
- Launch command: `unykorn --config /app/devnet/node-1-docker.toml`
- Runtime user: `unykorn` (UID 1000, non-root)
- Chain source: `C:\Users\Kevan\OneDrive - FTH Trading\02-UnyKorn\unykorn-l1`

### Config File — TOML Schema (from `devnet/node-1-docker.toml`)
Each node has a built-in config baked into the Docker image at `/app/devnet/node-N-docker.toml`.
The actual TOML schema (verified from chain source) is:
```toml
runtime_version = 1
node_key_seed   = "seed-alpha-001"
node_name       = "alpha"

[network]
chain_id     = 7331
network_id   = 1
listen_addr  = "/ip4/0.0.0.0/tcp/30301"
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
port            = 3001
enable_cors     = true
max_connections = 100

[storage]
data_dir       = "/app/data"
state_backend  = "rocksdb"
cache_size_mb  = 64

[features]
ai_policy           = false
module_trade_finance = true
# ... (all module flags)

[modules]
enable_registry = true
max_concurrent  = 8
```

> **NOTE:** The old schema with `[node]`, `[identity]`, `[metrics]` sections was INCORRECT.
> The actual schema uses top-level `runtime_version`, `node_key_seed`, `node_name`
> plus sections `[network]`, `[consensus]`, `[rpc]`, `[storage]`, `[features]`, `[modules]`.

### Ports Required (per node)
| Port | Protocol | Purpose | Exposure |
|------|----------|---------|---------|
| 3001–3005 | TCP | JSON-RPC | Internal VPC (via NLB for alpha/3001) |
| 30301–30305 | TCP | P2P | Internal SG self-reference |
| 9090 | TCP | Prometheus metrics | Internal VPC |

### Data Directories
| Path (in container) | Host mount | Purpose |
|---------------------|------------|--------|
| `/app/data` | `/app/data` | RocksDB state, blocks, chain data |
| `/app/logs` | `/app/logs` | Node logs |

> **CRITICAL:** Host dirs must be `chown 1000:1000` before starting the container.
> The container runs as UID 1000 (`unykorn` user). Root-owned bind mounts cause
> `PermissionDenied` on RocksDB directory creation.

### Node-to-Config Mapping (DEPLOYED)
| Node | Config file | RPC Port | P2P Port | Instance | Private IP | NLB Health |
|------|------------|----------|----------|---------|-----------|------------|
| alpha | `node-1-docker.toml` | 3001 | 30301 | `i-083a36c8ce027de55` | 10.100.10.124 | ✅ healthy |
| bravo | `node-2-docker.toml` | 3002 | 30302 | `i-0608a0ebab4d97d79` | 10.100.10.222 | ✅ healthy |
| charlie | `node-3-docker.toml` | 3003 | 30303 | `i-0d87f793231da3772` | 10.100.11.172 | ✅ healthy |
| delta | `node-4-docker.toml` | 3004 | 30304 | `i-0e9a24f4902faaa06` | 10.100.10.220 | ✅ healthy |
| echo | `node-5-docker.toml` | 3005 | 30305 | `i-0d9493de789fc744a` | 10.100.11.10 | ✅ healthy |

---

## Section 2 — Build Pipeline (✅ RESOLVED)

### Chain Source Location
The chain source is at: `C:\Users\Kevan\OneDrive - FTH Trading\02-UnyKorn\unykorn-l1`

This repo contains `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml` (1.93.0), `crates/`, `system-modules/`, and `devnet/*.toml`.

### Build Architecture
The Dockerfile at `aws/docker/Dockerfile.node` uses the `unykorn-l1` repo as build context (NOT `unyKorn-master`):
```dockerfile
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY crates/ crates/
COPY system-modules/ system-modules/
RUN cargo build --release -p unykorn-node --features "compliance-quorum,mod-trade-finance"
RUN strip target/release/unykorn || true
```

Devnet configs are also baked into the image:
```dockerfile
COPY --chown=unykorn:unykorn devnet/*.toml /app/devnet/
```

---

## Section 3 — Exact Build Command (verified working)

```powershell
$CHAIN_SRC     = "C:\Users\Kevan\OneDrive - FTH Trading\02-UnyKorn\unykorn-l1"
$DOCKERFILE    = "C:\Users\Kevan\OneDrive - FTH Trading\02-UnyKorn\unyKorn-master\aws\docker\Dockerfile.node"
$ECR_REGISTRY  = "933629770808.dkr.ecr.us-east-1.amazonaws.com"
$ECR_REPO      = "unykorn-l1/node"
$IMAGE_TAG     = "latest"
$FULL_IMAGE    = "$ECR_REGISTRY/${ECR_REPO}:$IMAGE_TAG"

# Build — context is chain source, Dockerfile is from unyKorn-master
docker build --pull `
    -t "unykorn-node:latest" `
    -t $FULL_IMAGE `
    -f $DOCKERFILE `
    $CHAIN_SRC
```

**Rust build flags:**
```dockerfile
cargo build --release -p unykorn-node --features "compliance-quorum,mod-trade-finance"
```
Produces: `target/release/unykorn` (binary name differs from package name)

**Actual build time:** ~6 minutes 35 seconds (~160 crates compiled).

**Image digest (current):** `sha256:973d5d105fc1b6e0bb225eab6fc168d78d717382f9bf624ffaf53a7a165334fa`

---

## Section 4 — Docker Image Layout

```
Stage 1 (builder):
  FROM rust:1.85-bookworm
  → apt-get: clang, libclang-dev, llvm-dev, cmake, pkg-config, libssl-dev
  → cargo build --release -p unykorn-node --features "compliance-quorum,mod-trade-finance"
  → strip target/release/unykorn
  → binary: /build/target/release/unykorn

Stage 2 (runtime):
  FROM debian:bookworm-slim
  → apt-get: ca-certificates, libssl3, curl, jq
  → non-root user: unykorn (UID 1000)
  → /usr/local/bin/unykorn          (binary, copied from builder)
  → /app/devnet/node-*-docker.toml  (built-in configs, 5 files)
  → /app/data                       (bind mount point for RocksDB)
  → /app/logs                       (bind mount point for logs)
  → ENTRYPOINT ["unykorn"]
  → CMD ["--config", "/app/devnet/node-1-docker.toml"]
  → HEALTHCHECK: curl -sf http://localhost:3001/health
```

---

## Section 5 — Environment Variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `RUST_LOG` | YES | `info,unykorn=debug` | Set via `-e` in docker run |
| `NODE_NAME` | For bootstrap script only | — | Used to select config file; not needed if passing `--config` directly |

> **Note:** `NODE_ROLE`, `RPC_PORT`, `P2P_PORT` are NOT separate env vars.
> All node configuration is in the TOML config file. The `--config` flag points
> to the correct file for each node (e.g., `node-2-docker.toml` for bravo).

---

## Section 6 — ECR Push

```powershell
# Authenticate Docker to ECR
aws ecr get-login-password --region us-east-1 | `
    docker login --username AWS --password-stdin `
    933629770808.dkr.ecr.us-east-1.amazonaws.com

# Push the image
docker push 933629770808.dkr.ecr.us-east-1.amazonaws.com/unykorn-l1/node:latest
```

**Verify push:**
```powershell
aws ecr list-images --region us-east-1 --repository-name "unykorn-l1/node"
```
Expected output: at least one `imageTag: latest` entry.

---

## Section 7 — Node Bootstrap (EC2) — ✅ COMPLETED

All 5 nodes were bootstrapped via SSM RunCommand (not interactive sessions).
SSM parameter files are stored at `ops/scripts/_ssm-bootstrap-{name}.json`.

### Actual bootstrap command (example: alpha)

```bash
#!/bin/bash
set -euo pipefail
export ECR_REGISTRY=933629770808.dkr.ecr.us-east-1.amazonaws.com
export ECR_REPO=unykorn-l1/node
export IMAGE_TAG=latest
export REGION=$(curl -sf http://169.254.169.254/latest/meta-data/placement/region || echo us-east-1)
export CONTAINER_NAME=unykorn-alpha
export FULL_IMAGE=${ECR_REGISTRY}/${ECR_REPO}:${IMAGE_TAG}

# ECR login
aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}

# Pull image
docker pull ${FULL_IMAGE}

# Stop existing (idempotent)
docker stop ${CONTAINER_NAME} 2>/dev/null || true
docker rm ${CONTAINER_NAME} 2>/dev/null || true

# Create host dirs — MUST be owned by UID 1000 (container user)
mkdir -p /app/data /app/logs
chown 1000:1000 /app/data /app/logs

# Run node with built-in devnet config
docker run -d \
  --name ${CONTAINER_NAME} \
  --restart unless-stopped \
  --network host \
  -v /app/data:/app/data \
  -v /app/logs:/app/logs \
  -e RUST_LOG=info,unykorn=debug \
  ${FULL_IMAGE} \
  --config /app/devnet/node-1-docker.toml
```

### Re-deploying via SSM RunCommand from local machine

```powershell
# Send bootstrap to a specific node
aws ssm send-command --region us-east-1 `
  --instance-ids "i-083a36c8ce027de55" `
  --document-name "AWS-RunShellScript" `
  --parameters "file://ops/scripts/_ssm-bootstrap-alpha.json" `
  --timeout-seconds 120
```

### Verify Runtime is Listening

```bash
# From inside the EC2 instance (via SSM)
curl -sf http://localhost:3001/health   # returns "OK"
ss -tlnp | grep 3001
docker logs unykorn-alpha --tail 20
```

### Lessons Learned During Bootstrap
1. **Permission denied on RocksDB** — Host dirs `/app/data` and `/app/logs` must be `chown 1000:1000` before `docker run`. The container runs as non-root UID 1000.
2. **Container name conflict** — If a previous container crashed, `docker rm -f` is needed before re-running. The SSM scripts now handle this with `docker stop/rm || true`.
3. **SSM JSON encoding** — PowerShell heredocs add BOM; use `file://` with JSON parameter files instead.

---

## Section 8 — Health Check Verification (✅ ALL HEALTHY)

The NLB RPC target group (`unykorn-l1-devnet-rpc`) uses TCP health checks on each target's traffic port.

**Current NLB target health (verified 2026-03-19):**
| Target | Port | Health |
|--------|------|--------|
| `i-083a36c8ce027de55` (alpha) | 3001 | ✅ healthy |
| `i-0608a0ebab4d97d79` (bravo) | 3002 | ✅ healthy |
| `i-0d87f793231da3772` (charlie) | 3003 | ✅ healthy |
| `i-0e9a24f4902faaa06` (delta) | 3004 | ✅ healthy |
| `i-0d9493de789fc744a` (echo) | 3005 | ✅ healthy |

**Verify from local machine:**
```powershell
aws elbv2 describe-target-health --region us-east-1 `
  --target-group-arn "arn:aws:elasticloadbalancing:us-east-1:933629770808:targetgroup/unykorn-l1-devnet-rpc/6396ab7c89a6933d" `
  --query "TargetHealthDescriptions[].{Id:Target.Id,Port:Target.Port,State:TargetHealth.State}" `
  --output table
```

**Verify RPC via SSM on any node:**
```bash
curl -sf http://localhost:3001/health   # returns "OK"
```

---

## Section 9 — Startup Order

For initial deployment, alpha was started first as canary. For subsequent restarts, order is less critical since all nodes use `--restart unless-stopped` and `boot_nodes = []` (no static peers in devnet config — peer discovery is dynamic).

Recommended restart order if doing a full cluster restart:
1. **alpha** — start first, verify port 3001 listening
2. **bravo + charlie** — can start simultaneously
3. **delta + echo** — can start simultaneously

Peer discovery within the VPC occurs via the P2P ports (30301–30305) through the self-referencing security group rule.

---

## Section 10 — Log Paths

| Log | Path | Access |
|-----|------|--------|
| Node stdout/stderr | Docker container logs | `docker logs unykorn-alpha --tail 100` |
| Node data | `/app/data` on host | RocksDB state (bind-mounted into container) |
| Node logs | `/app/logs` on host | Bind-mounted into container |
| Docker daemon | `/var/log/docker` | Local only |

**Check logs via SSM RunCommand:**
```bash
# Tail last 50 lines from any node
docker logs unykorn-alpha --tail 50
```

**Check block height:**
Logs show block production: `[alpha] ⛏️  Block #N — 0 txs, fees=0, proposer=[...]`

**Runtime info visible in logs:**
- Chain ID: 7331
- Runtime version: 3
- Modules loaded: 1 (TradeFinance)
- Trade finance: UCP 600 compliant LC infrastructure
- Mempool: enabled
- Staking engine: active
- Block interval: 3000ms
