# UnyKorn L1 — Infrastructure Status Summary

**Assessment date:** 2026-03-19 (updated)  
**AWS Account:** 933629770808 | **Region:** us-east-1  
**Auth identity:** `arn:aws:iam::933629770808:user/DonkAi`  
**Terraform state:** Local (`aws/terraform/terraform.tfstate`), 82 resources

---

## VERDICT: ✅ DEVNET LIVE — 5/5 NODES RUNNING, NLB HEALTHY

All 5 validator nodes deployed successfully. Docker images built from `unykorn-l1` chain source,
pushed to ECR, and bootstrapped via SSM on all EC2 instances. NLB RPC target group shows 5/5 healthy.
Block production active on all nodes.

---

## Section 1 — DEPLOYED AND VERIFIED

| Item | Detail |
|------|--------|
| Docker image built | `unykorn-node:latest` — 160 crates compiled, binary `unykorn`, features: `compliance-quorum,mod-trade-finance` |
| ECR image live | `933629770808.dkr.ecr.us-east-1.amazonaws.com/unykorn-l1/node:latest` — digest `sha256:973d5d10...` |
| alpha running | `i-083a36c8ce027de55` / `10.100.10.124` — port 3001, container `unykorn-alpha`, config `node-1-docker.toml` |
| bravo running | `i-0608a0ebab4d97d79` / `10.100.10.222` — port 3002, container `unykorn-bravo`, config `node-2-docker.toml` |
| charlie running | `i-0d87f793231da3772` / `10.100.11.172` — port 3003, container `unykorn-charlie`, config `node-3-docker.toml` |
| delta running | `i-0e9a24f4902faaa06` / `10.100.10.220` — port 3004, container `unykorn-delta`, config `node-4-docker.toml` |
| echo running | `i-0d9493de789fc744a` / `10.100.11.10` — port 3005, container `unykorn-echo`, config `node-5-docker.toml` |
| NLB RPC targets | **5/5 healthy** — alpha:3001, bravo:3002, charlie:3003, delta:3004, echo:3005 |
| Block production | Active on all nodes, 3s block interval, trade-finance module loaded |
| RPC health | `curl localhost:3001/health` → `OK` |
| Chain details | Chain ID: 7331, Runtime v3, Mempool enabled, Staking engine active |

---

## Section 2 — PREVIOUSLY VERIFIED GOOD

| Item | Detail |
|------|--------|
| VPC | `vpc-03361b1183df4b689`, CIDR `10.100.0.0/16` ✅ |
| Security Group — SSH | `sg-09dbed63f0daa595d` restricted to `76.230.229.105/32` ✅ |
| Security Group — RPC | Open to VPC CIDR only (`10.100.0.0/16`) ✅ |
| Security Group — P2P | `self = true` (nodes peer only with each other) ✅ |
| NLB | `unykorn-l1-devnet-nlb-1f753b773aa1ebd5.elb.us-east-1.amazonaws.com` |
| Route53 zone | `Z08184221LQW6HTHIC1D2` (`l1.unykorn.org`) |
| Route53 RPC record | `rpc.l1.unykorn.org` → NLB alias ✅ |
| ECR repos | `unykorn-l1/node` (images live), `unykorn-l1/dashboard` (empty) |
| IAM instance profile | ECR pull + Secrets Manager + SSM ✅ |
| terraform.tfvars | `hosted_zone_id` fixed, `admin_cidr` = `76.230.229.105/32` ✅ |
| devnet.tfvars | `admin_cidr` fixed from `0.0.0.0/0` to `76.230.229.105/32` ✅ |

---

## Section 2 — REPAIRED IN THIS SESSION

| Item | Fix Applied | File |
|------|------------|------|
| `admin_cidr` = `0.0.0.0/0` in devnet.tfvars | Changed to `["76.230.229.105/32"]` | `aws/terraform/environments/devnet.tfvars` |
| `hosted_zone_id = ""` in terraform.tfvars | Set to `"Z08184221LQW6HTHIC1D2"` | `aws/terraform/terraform.tfvars` |
| No ops scripts existed | Created 5 operational scripts in `ops/scripts/` | `ops/scripts/*.ps1`, `*.sh` |
| No deployment documentation | Created 5 reference documents in `ops/` | `ops/*.md` |
| No CI/CD pipeline | Created GitHub Actions workflow | `.github/workflows/build-and-push-node.yml` |
| No env var template | Created reference file | `env/.env.aws.example` |

---

## Section 3 — REMAINING ITEMS (non-blocking for devnet)

### HIGH — Needed for full stack

| # | Issue | Fix |
|---|-------|-----|
| 1 | **ALB (`aws_lb.web`) never deployed** — `api` and `dashboard` TGs orphaned | Set `certificate_arn` in tfvars → `terraform apply` |
| 2 | **ACM certificate not provisioned** — `certificate_arn = ""` | Request cert: `aws acm request-certificate --domain-name "*.l1.unykorn.org"`, validate DNS |
| 3 | **Dashboard image not built** — `unykorn-l1/dashboard` ECR repo empty | Build dashboard source, push to ECR |

### MEDIUM — Should fix before production

| # | Issue | Fix |
|---|-------|-----|
| 4 | Terraform remote state not enabled — S3 backend commented out | Provision S3+DynamoDB, uncomment backend, `terraform init -migrate-state` |
| 5 | Secrets Manager node keys may be placeholders | Verify with `aws secretsmanager get-secret-value --secret-id unykorn/l1/node-keys` |
| 6 | `app.l1.unykorn.org` DNS does not exist — ALB not deployed | Resolved by fixing item 1 |

---

## Section 4 — COMPLETED DEPLOYMENT ACTIONS

```
✅ Step 1 — Chain source located at unykorn-l1 repo
     Binary: 'unykorn' (package: unykorn-node)
     Build features: compliance-quorum, mod-trade-finance

✅ Step 2 — Docker image built (6m35s, ~160 crates)
     Image: unykorn-node:latest
     Digest: sha256:973d5d105fc1b6e0bb225eab6fc168d78d717382f9bf624ffaf53a7a165334fa

✅ Step 3 — ECR push succeeded
     933629770808.dkr.ecr.us-east-1.amazonaws.com/unykorn-l1/node:latest

✅ Step 4 — Alpha bootstrapped via SSM
     Container: unykorn-alpha, Port 3001, producing blocks

✅ Step 5 — All 4 remaining nodes bootstrapped via SSM
     bravo:3002, charlie:3003, delta:3004, echo:3005

✅ Step 6 — NLB targets registered and healthy (5/5)

⬜ Step 7 — Apply ALB (requires certificate_arn)
⬜ Step 8 — Enable remote Terraform state
```

---

## Section 5 — REMAINING NEXT ACTIONS

```
Step 1 — Provision ACM certificate
  → aws acm request-certificate --domain-name "*.l1.unykorn.org" --validation-method DNS
  → Add validation CNAME to Route53
  → Set certificate_arn in terraform.tfvars

Step 2 — Deploy ALB via Terraform
  → terraform apply -var-file=terraform.tfvars
  → This creates the ALB + dashboard/api targets

Step 3 — Build and push dashboard image
  → Locate dashboard source, build, push to ECR

Step 4 — Enable remote Terraform state
  → Uncomment S3 backend in aws/terraform/main.tf
  → terraform init -migrate-state
```

---

## Artifacts Delivered in This Session

| Artifact | Path | Purpose |
|----------|------|---------|
| Terraform Drift Report | `ops/TERRAFORM_DRIFT_REPORT.md` | 7 drift items, severity, exact fixes |
| AWS Forensic Report | `ops/AWS_FORENSIC_REPAIR_REPORT.md` | Live API evidence, root causes |
| Node Deploy Plan | `ops/NODE_RUNTIME_DEPLOY_PLAN.md` | First-boot sequence per node |
| Rollback Plan | `ops/ROLLBACK_AND_PRESERVE_PLAN.md` | Cost preservation + revert steps |
| Readiness Checklist | `ops/DEPLOYMENT_READINESS_CHECKLIST.md` | 8-group gate checklist |
| AWS Verify Script | `ops/scripts/verify-aws.ps1` | 8-section live health check |
| Docker Build Script | `ops/scripts/build-node-image.ps1` | Rust build + docker build |
| ECR Push Script | `ops/scripts/push-ecr.ps1` | Auth + push + post-push verify |
| Health Check Script | `ops/scripts/check-target-health.ps1` | NLB TG health with polling |
| Bootstrap Script | `ops/scripts/bootstrap-node-runtime.sh` | EC2 node runtime start (bash) |
| GitHub Actions CI | `.github/workflows/build-and-push-node.yml` | On-push Rust build → ECR push |
| Env template | `env/.env.aws.example` | All required env vars documented |
