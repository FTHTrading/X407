# DEPLOYED STATE CANON — UnyKorn L1 Devnet
**Frozen:** 2026-03-19  
**Status:** LIVE — 5/5 nodes running, 5/5 NLB targets healthy

> This is the single source of truth for the deployed devnet state.
> Any future `terraform apply`, image rebuild, or node restart
> must be checked against this document first.

---

## 1. Artifact Provenance

| Artifact | Value |
|----------|-------|
| **Ops repo** | `unyKorn-master` |
| **Ops commit** | `9bf7c3ff0855d01dd53128aa500dd98d94e99418` (`feat(contracts): treasury dashboard, stablecoin tracking, pool deepening`) |
| **Chain source repo** | `unykorn-l1` |
| **Chain commit** | `c191d9ee405ce024b13b748e309e840b0a87d3df` (`Institutional README buildout: system flow graph, economic flow diagram, expanded parameters`) |
| **Chain branch** | `l1-stability-baseline` |
| **Rust toolchain** | 1.93.0 (from `rust-toolchain.toml`) |
| **Cargo package** | `unykorn-node` |
| **Binary name** | `unykorn` |
| **Build features** | `compliance-quorum,mod-trade-finance` |
| **Build command** | `cargo build --release -p unykorn-node --features "compliance-quorum,mod-trade-finance"` |
| **Docker image ID** | `973d5d105fc1` |
| **Docker image digest** | `sha256:973d5d105fc1b6e0bb225eab6fc168d78d717382f9bf624ffaf53a7a165334fa` |
| **Image size** | 154 MB |
| **ECR URI** | `933629770808.dkr.ecr.us-east-1.amazonaws.com/unykorn-l1/node:latest` |
| **ECR tag strategy** | `:latest` only (no immutable tags yet — see drift notes) |
| **Dockerfile** | `aws/docker/Dockerfile.node` (in ops repo) |
| **Build context** | `unykorn-l1` repo root |
| **Build time** | ~6m35s (~160 crates) |
| **Build date** | 2026-03-18 22:27:37 EDT |

---

## 2. Deployed Nodes

| Node | Instance ID | Private IP | Subnet | Container | Config | RPC Port | P2P Port | NLB Health |
|------|-------------|-----------|--------|-----------|--------|----------|----------|------------|
| alpha | `i-083a36c8ce027de55` | 10.100.10.124 | us-east-1a | `unykorn-alpha` | `node-1-docker.toml` | 3001 | 30301 | ✅ healthy |
| bravo | `i-0608a0ebab4d97d79` | 10.100.10.222 | us-east-1a | `unykorn-bravo` | `node-2-docker.toml` | 3002 | 30302 | ✅ healthy |
| charlie | `i-0d87f793231da3772` | 10.100.11.172 | us-east-1b | `unykorn-charlie` | `node-3-docker.toml` | 3003 | 30303 | ✅ healthy |
| delta | `i-0e9a24f4902faaa06` | 10.100.10.220 | us-east-1a | `unykorn-delta` | `node-4-docker.toml` | 3004 | 30304 | ✅ healthy |
| echo | `i-0d9493de789fc744a` | 10.100.11.10 | us-east-1b | `unykorn-echo` | `node-5-docker.toml` | 3005 | 30305 | ✅ healthy |

### Chain Parameters

| Parameter | Value |
|-----------|-------|
| Chain ID | 7331 |
| Runtime version | 3 |
| Block time | 3000ms |
| Max block size | 5,000,000 |
| Max tx per block | 1,000 |
| Block gas limit | 30,000,000 |
| Validator count | 5 |
| State backend | RocksDB |
| Modules loaded | TradeFinance (UCP 600 compliant) |
| Mempool | enabled |
| Staking engine | active |

---

## 3. Network Infrastructure

| Resource | Value |
|----------|-------|
| **VPC** | `vpc-03361b1183df4b689` / `10.100.0.0/16` |
| **NLB** | `unykorn-l1-devnet-nlb-1f753b773aa1ebd5.elb.us-east-1.amazonaws.com` |
| **NLB TG ARN** | `arn:aws:elasticloadbalancing:us-east-1:933629770808:targetgroup/unykorn-l1-devnet-rpc/6396ab7c89a6933d` |
| **NLB TG health check** | TCP on `traffic-port` (10s interval, 2 checks) |
| **Route53 zone** | `Z08184221LQW6HTHIC1D2` (`l1.unykorn.org`) |
| **RPC DNS** | `rpc.l1.unykorn.org` → NLB alias |
| **SG — SSH** | `sg-09dbed63f0daa595d` → `76.230.229.105/32` only |
| **SG — RPC** | VPC CIDR `10.100.0.0/16` only |
| **SG — P2P** | `self = true` (nodes peer only with each other) |
| **ECR — node** | `unykorn-l1/node` (1 image) |
| **ECR — dashboard** | `unykorn-l1/dashboard` (empty) |
| **AWS account** | `933629770808` |
| **Region** | `us-east-1` |
| **IAM user** | `DonkAi` |
| **IAM instance role** | ECR pull + Secrets Manager + SSM |

---

## 4. Known Drift from Terraform

These items exist in live state but are NOT in Terraform. Running `terraform apply`
without addressing them will cause damage.

| # | Drift Item | Risk |
|---|-----------|------|
| 1 | **NLB targets bravo-echo were manually registered** via `aws elbv2 register-targets`. Terraform only knows about alpha. | Next `terraform apply` could deregister 4 targets |
| 2 | **Docker containers running on EC2** were started via SSM, not user_data or Terraform. | Terraform has no awareness of running containers |
| 3 | **Host directories `/app/data` and `/app/logs`** created manually. | Not in AMI or user_data |
| 4 | **`chown 1000:1000`** on host dirs is manual. | Not encoded in any Terraform resource |
| 5 | **ECR tag is `:latest`** only — no immutable digests pinned. | New push overwrites running image tag |

### Mitigation plan

Before any `terraform apply`:
1. Update Terraform compute/LB modules to register all 5 targets explicitly
2. Add container bootstrap to user_data script (or use ECS/docker-compose)
3. Pin ECR image by SHA digest, not just `:latest` tag
4. Move to Terraform remote state (S3 + DynamoDB) before multi-operator use

---

## 5. Container Runtime Invariants

These are hard-won operational rules. Violating any of them breaks deployment.

```
RULE 1: Host dirs MUST be chown 1000:1000
        mkdir -p /app/data /app/logs
        chown 1000:1000 /app/data /app/logs

RULE 2: Stale containers MUST be cleaned before restart
        docker stop unykorn-{name} 2>/dev/null || true
        docker rm unykorn-{name} 2>/dev/null || true

RULE 3: SSM JSON parameters MUST be UTF-8 without BOM
        PowerShell create_file adds BOM — strip with:
        [System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding $false))

RULE 4: Each node uses its own config file
        alpha → --config /app/devnet/node-1-docker.toml
        bravo → --config /app/devnet/node-2-docker.toml
        charlie → --config /app/devnet/node-3-docker.toml
        delta → --config /app/devnet/node-4-docker.toml
        echo → --config /app/devnet/node-5-docker.toml

RULE 5: Network mode is --network host
        RPC and P2P ports bind directly to host.
        No port mapping needed. No bridge networking.

RULE 6: Containers use --restart unless-stopped
        Survives EC2 reboot if Docker daemon restarts.
```

---

## 6. File Manifest

### SSM Bootstrap Parameters (ops/scripts/)

| File | Target | Config | Port |
|------|--------|--------|------|
| `_ssm-bootstrap-alpha.json` | `i-083a36c8ce027de55` | `node-1-docker.toml` | 3001 |
| `_ssm-bootstrap-bravo.json` | `i-0608a0ebab4d97d79` | `node-2-docker.toml` | 3002 |
| `_ssm-bootstrap-charlie.json` | `i-0d87f793231da3772` | `node-3-docker.toml` | 3003 |
| `_ssm-bootstrap-delta.json` | `i-0e9a24f4902faaa06` | `node-4-docker.toml` | 3004 |
| `_ssm-bootstrap-echo.json` | `i-0d9493de789fc744a` | `node-5-docker.toml` | 3005 |
| `_ssm-fix-charlie.json` | `i-0d87f793231da3772` | `node-3-docker.toml` | 3003 |

### Ops Reports (ops/)

| File | Purpose |
|------|---------|
| `DEPLOYED_STATE_CANON.md` | This file — single source of truth |
| `STATUS_SUMMARY.md` | High-level status + repair log |
| `NODE_RUNTIME_DEPLOY_PLAN.md` | Operator runbook (updated to reflect reality) |
| `TERRAFORM_DRIFT_REPORT.md` | Terraform state vs live delta |
| `AWS_FORENSIC_REPAIR_REPORT.md` | Live API evidence, root causes |
| `ROLLBACK_AND_PRESERVE_PLAN.md` | Cost preservation + revert steps |
| `DEPLOYMENT_READINESS_CHECKLIST.md` | Gate checklist (all gates passed) |

### CI/CD

| File | Purpose |
|------|---------|
| `.github/workflows/build-and-push-node.yml` | On-push: Rust build → ECR push |

### Docker

| File | Purpose |
|------|---------|
| `aws/docker/Dockerfile.node` | Multi-stage Rust build + runtime |

---

## 7. Verification Commands

```powershell
# Check all NLB targets
aws elbv2 describe-target-health --region us-east-1 `
  --target-group-arn "arn:aws:elasticloadbalancing:us-east-1:933629770808:targetgroup/unykorn-l1-devnet-rpc/6396ab7c89a6933d" `
  --query "TargetHealthDescriptions[].{Id:Target.Id,Port:Target.Port,State:TargetHealth.State}" `
  --output table

# Health check via SSM on alpha
aws ssm send-command --region us-east-1 `
  --instance-ids "i-083a36c8ce027de55" `
  --document-name "AWS-RunShellScript" `
  --parameters '{"commands":["curl -sf http://localhost:3001/health"]}' `
  --output-s3-bucket-name "" `
  --query "Command.CommandId" --output text

# Check ECR image
aws ecr describe-images --region us-east-1 `
  --repository-name "unykorn-l1/node" `
  --query "imageDetails[*].{Tags:imageTags,Pushed:imagePushedAt,Digest:imageDigest}" `
  --output table

# Check container on any node via SSM
aws ssm send-command --region us-east-1 `
  --instance-ids "i-083a36c8ce027de55" `
  --document-name "AWS-RunShellScript" `
  --parameters '{"commands":["docker ps --filter name=unykorn","docker logs unykorn-alpha --tail 10"]}'
```
