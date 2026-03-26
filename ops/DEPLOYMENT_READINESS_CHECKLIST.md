# UnyKorn L1 — Deployment Readiness Checklist

Generated: 2026-03-15 (post-forensic)  
Environment: devnet / us-east-1  
Account: 933629770808

Use this checklist before every deployment cycle. Do not advance to the next group until all items in the current group are checked.

---

## Group 1 — Infrastructure Baseline

- [ ] `terraform plan` returns 0 errors with `aws/terraform/terraform.tfvars`
- [ ] `terraform plan` shows **no unexpected destroy actions** on existing resources (EC2, SGs, VPC)
- [ ] `terraform.tfvars` has `hosted_zone_id = "Z08184221LQW6HTHIC1D2"` (not empty)
- [ ] `terraform.tfvars` has `admin_cidr = ["76.230.229.105/32"]` (not 0.0.0.0/0)
- [ ] `environments/devnet.tfvars` `admin_cidr` is **not** `0.0.0.0/0`
- [ ] All 5 EC2 instances running: alpha | bravo | charlie | delta | echo
- [ ] Security group `sg-09dbed63f0daa595d` — SSH open only to admin CIDR
- [ ] Security group RPC rules allow VPC CIDR (`10.100.0.0/16`) only — not public internet
- [ ] NLB exists: `unykorn-l1-devnet-nlb-*`
- [ ] ALB exists: `unykorn-l1-devnet-alb-*` *(currently MISSING — terraform apply required)*
- [ ] VPC CIDR `10.100.0.0/16` verified in AWS console / CLI

---

## Group 2 — ECR & Docker Image

- [ ] Chain source repo is checked out and accessible (separate from this repo)
- [ ] `cargo build --release --bin unykorn-node` compiles successfully
- [ ] `target/release/unykorn-node --version` prints a version string
- [ ] `aws/docker/Dockerfile.node` builds without errors from chain source root:
  ```
  docker build -f aws/docker/Dockerfile.node -t unykorn-node:test .
  ```
- [ ] Docker image size is reasonable (< 1 GB — check `docker images`)
- [ ] `docker run --rm unykorn-node:test --help` prints usage
- [ ] Image pushed to ECR: `933629770808.dkr.ecr.us-east-1.amazonaws.com/unykorn-l1/node:latest`
- [ ] `aws ecr list-images --repository-name unykorn-l1/node` returns at least 1 image
- [ ] Dashboard image pushed to ECR: `unykorn-l1/dashboard:latest`

---

## Group 3 — Node Bootstrap (alpha first)

- [ ] SSM Session Manager connection works to `i-083a36c8ce027de55` (alpha)
- [ ] `ops/scripts/bootstrap-node-runtime.sh` executed with correct env vars:
  ```bash
  export NODE_NAME=alpha NODE_ROLE=producer RPC_PORT=3001 P2P_PORT=30301
  sudo -E bash /ops/bootstrap-node-runtime.sh
  ```
- [ ] Container `unykorn-alpha` shows as `Up` in `docker ps`
- [ ] Port `3001` is listening: `ss -tlnp | grep 3001`
- [ ] Container logs show no FATAL/PANIC errors: `docker logs unykorn-alpha`
- [ ] `/data/unykorn/node.toml` exists and has correct values

---

## Group 4 — RPC Health

- [ ] NLB RPC target group `unykorn-rpc-tg` shows alpha as **healthy**
  ```
  aws elbv2 describe-target-health --target-group-arn <arn>
  ```
- [ ] RPC reachable through NLB:
  ```
  curl http://rpc.l1.unykorn.org/health
  ```
- [ ] `ops/scripts/check-target-health.ps1` reports all 5 targets as healthy *(after all nodes bootstrapped)*
- [ ] P2P peers are finding each other (check logs for "peer connected" or similar)

---

## Group 5 — Observability

- [ ] CloudWatch log group `/unykorn/l1/nodes` exists in us-east-1
- [ ] CloudWatch agent running on at least one node: `systemctl status amazon-cloudwatch-agent`
- [ ] Logs appearing in CloudWatch within 5 minutes of node start
- [ ] Prometheus endpoint responding: `curl http://<instance-ip>:9090/metrics`
- [ ] No OOM killer entries: `journalctl -k | grep -i oom` returns nothing

---

## Group 6 — Security Hardening

- [ ] No security group allows `0.0.0.0/0` on port 22
- [ ] No security group allows `0.0.0.0/0` on RPC ports (3001-3005)
- [ ] KMS key exists and is not pending deletion
- [ ] S3 bucket for state/storage exists with encryption enabled
- [ ] IAM instance profile attached to all 5 EC2 nodes has least-privilege policies
- [ ] Secrets Manager `unykorn/l1/node-keys` secret exists and has actual key values (not placeholders)
- [ ] `environments/devnet.tfvars` admin_cidr is **not** `0.0.0.0/0`
- [ ] Terraform remote state backend (S3 + DynamoDB lock) enabled in `main.tf` — *(currently DISABLED)*

---

## Group 7 — DNS & TLS

- [ ] Route53 zone `l1.unykorn.org` (Z08184221LQW6HTHIC1D2) is active
- [ ] `rpc.l1.unykorn.org` resolves to NLB: `nslookup rpc.l1.unykorn.org`
- [ ] `app.l1.unykorn.org` resolves to ALB *(pending ALB deployment)*
- [ ] ACM certificate issued for `*.l1.unykorn.org` *(pending — required for ALB HTTPS listener)*
- [ ] `certificate_arn` set in `terraform.tfvars`

---

## Group 8 — Rollout Completion

- [ ] All 5 nodes bootstrapped (alpha → bravo → charlie → delta → echo)
- [ ] All 5 targets healthy in NLB RPC target group
- [ ] Block production observed in alpha node logs
- [ ] Validator nodes (bravo/charlie) show consensus activity
- [ ] Oracle nodes (delta/echo) show oracle data submission activity
- [ ] Dashboard container running and returning HTTP 200 on `/health`
- [ ] No critical errors in CloudWatch logs in last 15 minutes
- [ ] Rollback procedure documented and tested (see `ROLLBACK_AND_PRESERVE_PLAN.md`)

---

## Blockers as of Last Assessment

| # | Blocker | Severity | Owner |
|---|---------|----------|-------|
| 1 | ECR repos empty — no images pushed | CRITICAL | Build engineer |
| 2 | ALB (`aws_lb.web`) not deployed — dashboard TG orphaned | HIGH | Terraform apply |
| 3 | Chain source repo location unknown — build can't start | CRITICAL | Team |
| 4 | `hosted_zone_id` blank in `terraform.tfvars` | MEDIUM | Terraform |
| 5 | `certificate_arn` not provisioned | MEDIUM | ACM |
| 6 | Secrets Manager node keys may be placeholders | HIGH | Key manager |
| 7 | Terraform state is local only — no locking | MEDIUM | DevOps |

---

*For repair details and root-cause analysis, see:*
- [`AWS_FORENSIC_REPAIR_REPORT.md`](AWS_FORENSIC_REPAIR_REPORT.md)
- [`TERRAFORM_DRIFT_REPORT.md`](TERRAFORM_DRIFT_REPORT.md)
- [`NODE_RUNTIME_DEPLOY_PLAN.md`](NODE_RUNTIME_DEPLOY_PLAN.md)
