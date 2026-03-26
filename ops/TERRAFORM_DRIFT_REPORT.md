# TERRAFORM DRIFT REPORT — UnyKorn L1
**Generated:** 2026-03-18  
**Account:** 933629770808 (us-east-1)  
**State:** Local (`aws/terraform/terraform.tfstate`) — 82 resources  
**Run against:** `terraform.tfvars` (NOT `environments/devnet.tfvars`)

---

## Summary

| Status | Count |
|--------|-------|
| Match — declared = deployed | 74 |
| **Drift — declared but NOT deployed** | **4** |
| Drift — deployed but NOT declared | 0 |
| Configuration risk (not drift) | 3 |

---

## Drift Table

| Resource | Declared in Code | In State | Deployed in AWS | Drift | Severity | Recommended Fix |
|----------|-----------------|----------|-----------------|-------|----------|-----------------|
| `module.load_balancing.aws_lb.web` | YES (`aws_lb` application) | **NO** | **NO** | Missing — ALB never applied | **HIGH** | Run `terraform apply` targeting the load-balancing module after resolving certificate_arn |
| `module.load_balancing.aws_lb_listener.http_forward` | YES (count=1 when no cert) | **NO** | **NO** | Missing — no ALB means listener was never created | **HIGH** | Blocked on ALB creation |
| `module.dns.aws_route53_record.main` for `l1.unykorn.org` (apex) | YES | Partial — only NS/SOA + rpc alias | rpc.l1.unykorn.org → NLB only | Partial — no ALB alias record | **MEDIUM** | Create after ALB is deployed |
| `module.load_balancing.aws_lb_listener.https` | YES (count=1 when cert exists) | **NO** | **NO** | Intentional — `certificate_arn = ""` in tfvars | LOW | Provide ACM cert ARN and re-apply |
| `variable.hosted_zone_id` | Empty in both .tfvars | Zone was created anyway | Zone Z08184221LQW6HTHIC1D2 exists | tfvars shows `""` but zone exists — created by earlier manual or partial apply | **MEDIUM** | Set `hosted_zone_id = "Z08184221LQW6HTHIC1D2"` in terraform.tfvars immediately |
| `variable.certificate_arn` | Empty in both .tfvars | Never set | ACM cert not provisioned | Intentional placeholder — no cert exists | **MEDIUM** | Request ACM cert for `l1.unykorn.org` + `*.l1.unykorn.org` |
| `admin_cidr` in devnet.tfvars | `["0.0.0.0/0"]` | **DIFFERS** | Deployed as `["76.230.229.105/32"]` | DevNet.tfvars was NOT used for deployment; terraform.tfvars was | **SECURITY** | Lock `devnet.tfvars` to `["76.230.229.105/32"]` immediately |

---

## Resource-by-Resource Verification

### ✅ VPC
| Field | Declared | Deployed | Match |
|-------|----------|----------|-------|
| CIDR | 10.100.0.0/16 | 10.100.0.0/16 | ✅ |
| Name | unykorn-l1-devnet-vpc | unykorn-l1-devnet-vpc | ✅ |
| ID | N/A | vpc-03361b1183df4b689 | N/A |

### ✅ EC2 Instances (5/5 Running)
| Node | Declared Role | Deployed State | Instance Type | Private IP |
|------|--------------|----------------|---------------|------------|
| alpha | producer | running | c6a.xlarge | 10.100.10.124 |
| bravo | validator | running | c6a.xlarge | 10.100.10.222 |
| charlie | validator | running | c6a.xlarge | 10.100.11.172 |
| delta | oracle | c6a.large | running | 10.100.10.220 |
| echo | oracle | c6a.large | running | 10.100.11.10 |

All instances `launched: 2026-03-15`. Instance types match declarations. ✅

### ✅ ECR Repositories
| Repo | Declared | Deployed | Images Pushed |
|------|----------|----------|---------------|
| unykorn-l1/node | YES | YES | **0 — EMPTY** |
| unykorn-l1/dashboard | YES | YES | **0 — EMPTY** |

### ✅ NLB
| Field | Declared | Deployed |
|-------|----------|----------|
| Name | unykorn-l1-devnet-nlb | unykorn-l1-devnet-nlb |
| Type | network | network |
| Scheme | internet-facing | internet-facing |
| DNS | N/A | unykorn-l1-devnet-nlb-1f753b773aa1ebd5.elb.us-east-1.amazonaws.com |
| RPC Listener Port | 3001/TCP | 3001/TCP |
| Target | alpha (port 3001) | i-083a36c8ce027de55:3001 |
| Target Health | expected healthy | **UNHEALTHY** (no runtime) |

### ❌ ALB — NOT DEPLOYED
| Field | Declared | Deployed |
|-------|----------|----------|
| aws_lb.web (application) | YES | **NO** |
| http_forward listener | YES (count=1, no cert) | **NO** |
| dashboard target group | YES (attached to ALB) | Created but orphaned — no ALB |
| api target group | YES (attached to ALB) | Created but orphaned — no ALB |

**Root cause:** Partial apply. The NLB and its resources applied successfully. The ALB `aws_lb.web` appears to have failed or was not applied. Given the state shows all 3 TGs but no ALB, the apply likely completed the NLB path and errored on the ALB path.

**Recommendation:** Run `terraform plan` to confirm the ALB shows as a planned create. Then apply.

### ✅ Security Groups
| SG | Declared | Deployed | Key Rule |
|----|----------|----------|----------|
| chain-nodes | YES | YES (sg-09dbed63f0daa595d) | SSH→admin IP only ✅ |
| P2P ports | self=true in SG | Confirmed self-reference | Nodes in same SG peer OK ✅ |
| admin_cidr on SSH | 76.230.229.105/32 | 76.230.229.105/32 | ✅ (terraform.tfvars was used) |
| alb-public | YES | NOT CONFIRMED in tag query | Likely deployed but untagged |
| nlb-rpc | YES | NOT CONFIRMED in tag query | Likely deployed but untagged |

### ✅ Route53
| Record | Declared | Deployed |
|--------|----------|----------|
| Zone l1.unykorn.org | YES | YES (Z08184221LQW6HTHIC1D2) |
| rpc.l1.unykorn.org → NLB | YES | YES (A alias) |
| l1.unykorn.org → ALB | YES | **NO** (no ALB exists) |

### ❓ S3 Buckets
State shows `aws_s3_bucket` resources exist. Prompt states buckets are empty — consistent with no runtime ever running.

### ❓ Secrets Manager
State shows `aws_secretsmanager_secret` + `aws_secretsmanager_secret_version`. These exist but node keys may not be set to real values.

---

## Critical Action Items (Priority Order)

1. **Immediate:** Set `hosted_zone_id = "Z08184221LQW6HTHIC1D2"` in `terraform.tfvars`
2. **Immediate:** Change `admin_cidr = ["0.0.0.0/0"]` in `environments/devnet.tfvars` to `["76.230.229.105/32"]`
3. **Next:** Request ACM certificate for `*.l1.unykorn.org` in us-east-1
4. **Next:** Run `terraform plan -var-file=terraform.tfvars` to surface full drift including the missing ALB
5. **After plan review:** Apply the plan to create the missing ALB + listeners
6. **Parallel:** Build and push the node Docker image to ECR (see NODE_RUNTIME_DEPLOY_PLAN.md)

---

## tfvars Conflict Warning

Two tfvars files exist with conflicting `admin_cidr`:
- `terraform.tfvars` → `["76.230.229.105/32"]` ← **this was used for the active deploy**
- `environments/devnet.tfvars` → `["0.0.0.0/0"]` ← **insecure, must be fixed**

**Which tfvars to use going forward:** `terraform.tfvars` is the active file. `environments/devnet.tfvars` should be fixed to match and then `terraform.tfvars` should be removed in favour of `-var-file=environments/devnet.tfvars` to enforce explicit environment selection.
