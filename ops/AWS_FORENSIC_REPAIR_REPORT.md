# AWS FORENSIC REPAIR REPORT — UnyKorn L1
**Date:** 2026-03-18  
**Account:** 933629770808 | Region: us-east-1  
**Performed by:** Automated forensic pass (GitHub Copilot)

---

## VERIFIED

All facts below are sourced from direct AWS API calls or file inspection on 2026-03-18.

### Account & Authentication
- AWS account: `933629770808`
- Auth user: `arn:aws:iam::933629770808:user/DonkAi`
- Region: `us-east-1`

### EC2 Instances — All 5 Running
```
i-083a36c8ce027de55  alpha    producer   c6a.xlarge  10.100.10.124  running
i-0608a0ebab4d97d79  bravo    validator  c6a.xlarge  10.100.10.222  running
i-0d87f793231da3772  charlie  validator  c6a.xlarge  10.100.11.172  running
i-0e9a24f4902faaa06  delta    oracle     c6a.large   10.100.10.220  running
i-0d9493de789fc744a  echo     oracle     c6a.large   10.100.11.10   running
```
All launched 2026-03-15. Instances are in private subnets (10.100.10.x and 10.100.11.x).

### VPC
- ID: `vpc-03361b1183df4b689`
- CIDR: `10.100.0.0/16`
- Name: `unykorn-l1-devnet-vpc`

### ECR Repositories — BOTH EMPTY
- `unykorn-l1/node` → `933629770808.dkr.ecr.us-east-1.amazonaws.com/unykorn-l1/node` — **0 images**
- `unykorn-l1/dashboard` → `933629770808.dkr.ecr.us-east-1.amazonaws.com/unykorn-l1/dashboard` — **0 images**

### Load Balancers
| Name | Type | Scheme | DNS |
|------|------|--------|-----|
| unykorn-l1-devnet-nlb | network | internet-facing | unykorn-l1-devnet-nlb-1f753b773aa1ebd5.elb.us-east-1.amazonaws.com |
| ~~unykorn-l1-devnet-alb~~ | ~~application~~ | **DOES NOT EXIST** | — |

### Target Groups & Health
| TG Name | Protocol | Port | Health Status |
|---------|----------|------|---------------|
| unykorn-l1-devnet-rpc | TCP | 3001 | **UNHEALTHY** — Target.FailedHealthChecks |
| unykorn-l1-devnet-api | HTTP | 3001 | No ALB — orphaned |
| unykorn-l1-devnet-dashboard | HTTP | 3000 | No ALB — orphaned |

**RPC target:** `i-083a36c8ce027de55` (alpha) port 3001 — unhealthy because no process is listening (ECR is empty, Docker image never pushed, user_data bootstrap failed at `docker pull` step).

### Route53
- Hosted zone: `l1.unykorn.org` (ID: `Z08184221LQW6HTHIC1D2`)
- Records: NS, SOA, A alias (`rpc.l1.unykorn.org → NLB`)
- Missing: A alias for `l1.unykorn.org` → ALB (ALB doesn't exist)

### Security Groups
| SG Name | ID | Admin SSH CIDR | P2P |
|---------|----|----------------|-----|
| chain-nodes | sg-09dbed63f0daa595d | 76.230.229.105/32 (correct) | self-reference (intra-SG ok) |

### Terraform State
- File: `aws/terraform/terraform.tfstate` (local)
- Resources: 82
- S3 backend: COMMENTED OUT (local only)
- No locking (no DynamoDB)

---

## REPAIRED

No live AWS resources have been modified. The following LOCAL configuration files have issues that must be fixed before the next `terraform apply`.

### Fix 1 — hosted_zone_id is blank in terraform.tfvars
**Problem:** `hosted_zone_id = ""` in `terraform.tfvars` but the zone `Z08184221LQW6HTHIC1D2` was already created.  
**Risk:** `terraform plan` will attempt to re-create the zone and its records, potentially causing conflicts.  
**Fix required in `terraform.tfvars`:**
```hcl
hosted_zone_id = "Z08184221LQW6HTHIC1D2"
```

### Fix 2 — admin_cidr = 0.0.0.0/0 in environments/devnet.tfvars
**Problem:** `environments/devnet.tfvars` contains `admin_cidr = ["0.0.0.0/0"]`.  
**Risk:** If this file is used in a future apply, it will open SSH to the world.  
**Fix required in `environments/devnet.tfvars`:**
```hcl
admin_cidr = ["76.230.229.105/32"]
```

---

## NETWORKING — Surface Analysis

| Surface | Intended Exposure | Actual Exposure | Correct? | Fix |
|---------|------------------|-----------------|----------|-----|
| RPC (port 3001) | Public via NLB + rpc.l1.unykorn.org | NLB active, DNS resolves, but target unhealthy | Architecture correct, runtime missing | Push ECR image, start runtime |
| Dashboard (port 3000) | Public via ALB | ALB DOES NOT EXIST | No — architecture broken | Deploy ALB via terraform apply |
| API (port 3001 HTTP) | Via ALB path /api | ALB DOES NOT EXIST | No — architecture broken | Deploy ALB |
| P2P ports (30301–30305) | Internal — node-to-node only | SG self-reference only — no external P2P | Correct for private network | External P2P not possible from private subnets (NAT required for outbound) |
| SSH port 22 | Admin IP only | 76.230.229.105/32 only | ✅ Correct | None |
| Prometheus 9090 | Internal VPC only | VPC CIDR only | ✅ Correct | None |

**NLB RPC Health Check:**  
Protocol: TCP  
Port: 3001  
Interval: 10s  
Thresholds: healthy=2, unhealthy=2  
**Current status: UNHEALTHY** — no process listening on port 3001 because no Docker image has ever been pushed to ECR.

**Why TCP health check is correct:** The chain is a custom Rust binary, not an HTTP service. TCP health check validates a listening socket without requiring HTTP. This is the right choice for an NLB → node RPC setup.

---

## BLOCKED

| Item | Why Blocked | Evidence Required |
|------|------------|-------------------|
| `terraform validate` and `terraform plan` | Terraform CLI not found on this machine (not in PATH) | Run from a machine with TF 1.7+ installed or use the AWS instructions runner |
| Rust chain source code location | This repo contains infra only — no `Cargo.toml` or chain source found | The Dockerfile.node expects the chain source to be COPY'd in at build time. Chain source must be a separate repo |
| Node key secret values | `aws_secretsmanager_secret_version` exists in state but values unknown | Run `aws secretsmanager get-secret-value --secret-id unykorn/l1/node-keys` to inspect |
| ECR image push | Cannot push until Rust chain repo is available for build | Chain source repo required |
| ALB deployment | Pending `terraform apply` | Requires clean plan first |

---

## RISK

| Risk | Severity | If Deployed Now |
|------|----------|-----------------|
| ECR empty — user_data bootstrap failed silently | CRITICAL | All 5 nodes started but ran `docker pull` against empty ECR and failed. Nodes are running but doing nothing. |
| No runtime on any node | CRITICAL | RPC is dead. NLB target is unhealthy. rpc.l1.unykorn.org returns no response. |
| ALB missing | HIGH | Dashboard has no public endpoint. Target groups for api/dashboard are orphaned. |
| Local Terraform state | HIGH | No state locking. Concurrent applies will corrupt state. |
| hosted_zone_id = "" in tfvars | MEDIUM | Next apply may try to create a new zone or fail on duplicate. |
| admin_cidr 0.0.0.0/0 in devnet.tfvars | SECURITY | If wrong file is used for an apply, SSH will be opened to the world. |
| Rust chain source not in this repo | HIGH | Cannot build image without the chain code. |
| node.toml config requires correct peer addresses | MEDIUM | The bootstrap script uses placeholder `__PEER_*__` values — actual IP addresses must be injected. |

---

## NEXT

**Single best next action:**  
Locate and clone the Rust chain source repository, then build the Docker image and push it to ECR. This unblocks RPC health, which unblocks NLB health, which unblocks the only currently-live public endpoint (`rpc.l1.unykorn.org`).

See `NODE_RUNTIME_DEPLOY_PLAN.md` for exact commands.
