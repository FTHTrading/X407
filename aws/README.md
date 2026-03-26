# UnyKorn L1 — AWS Build Sheet

> **Environment:** Institutional Proof / Design-Partner Devnet
> **Date:** 2026-03-15
> **Status:** Phase 1 — Initial AWS Deployment

---

## Account Structure

| Account        | Purpose                              | AWS Account Alias         |
|----------------|--------------------------------------|---------------------------|
| **Management** | SSO, billing, org-level policies     | `unykorn-mgmt`            |
| **Network**    | Shared VPC, Transit GW, DNS          | `unykorn-network`         |
| **Devnet**     | L1 chain nodes, RPC, demo            | `unykorn-devnet`          |
| **Web**        | Dashboard, landing, explorer         | `unykorn-web`             |
| **Security**   | KMS, audit logs, GuardDuty           | `unykorn-security`        |

> For Phase 1 you can run everything in **one account** (`unykorn-devnet`).
> Split into multi-account via AWS Organizations in Phase 2.

---

## VPC Layout

```
Region: us-east-1 (or us-west-2)

VPC: 10.100.0.0/16  (unykorn-l1-vpc)
├── Public Subnets
│   ├── 10.100.1.0/24   (us-east-1a)  ← ALB, NAT GW, bastion
│   └── 10.100.2.0/24   (us-east-1b)  ← ALB (multi-AZ)
├── Private Subnets (Chain Nodes)
│   ├── 10.100.10.0/24  (us-east-1a)  ← alpha, bravo, delta
│   └── 10.100.11.0/24  (us-east-1b)  ← charlie, echo
├── Private Subnets (Services)
│   ├── 10.100.20.0/24  (us-east-1a)  ← dashboard, explorer
│   └── 10.100.21.0/24  (us-east-1b)  ← monitoring, workers
└── Isolated Subnets (Data)
    ├── 10.100.30.0/24  (us-east-1a)  ← reserved for RDS/state
    └── 10.100.31.0/24  (us-east-1b)  ← reserved
```

---

## Instance Sizing

### L1 Chain Nodes (EC2)

| Node     | Role       | Instance    | vCPU | RAM   | Storage         | Subnet   |
|----------|------------|-------------|------|-------|-----------------|----------|
| alpha    | Producer   | c6a.xlarge  | 4    | 8 GB  | 200 GB gp3 EBS  | private-a|
| bravo    | Validator  | c6a.xlarge  | 4    | 8 GB  | 200 GB gp3 EBS  | private-a|
| charlie  | Validator  | c6a.xlarge  | 4    | 8 GB  | 200 GB gp3 EBS  | private-b|
| delta    | Oracle     | c6a.large   | 2    | 4 GB  | 100 GB gp3 EBS  | private-a|
| echo     | Oracle     | c6a.large   | 2    | 4 GB  | 100 GB gp3 EBS  | private-b|

> c6a (AMD EPYC) is cost-efficient for Rust workloads. Switch to c7g (Graviton3) if building ARM.

### Support Services

| Service      | Instance     | vCPU | RAM   | Notes                    |
|--------------|-------------|------|-------|--------------------------|
| RPC Gateway  | t3.medium   | 2    | 4 GB  | Public-facing JSON-RPC   |
| Dashboard    | t3.small    | 2    | 2 GB  | Vite/React static + API  |
| Monitoring   | t3.medium   | 2    | 4 GB  | Prometheus/Grafana (or managed) |

---

## Security Groups

| SG Name              | Inbound                                  | Source            |
|----------------------|------------------------------------------|-------------------|
| `sg-alb-public`      | 443/tcp, 80/tcp                          | 0.0.0.0/0         |
| `sg-nlb-rpc`         | 3001/tcp (RPC)                           | 0.0.0.0/0 or CIDR |
| `sg-chain-nodes`     | 30301-30305/tcp (P2P)                    | sg-chain-nodes    |
|                      | 3001-3005/tcp (RPC)                      | sg-nlb-rpc, sg-services |
| `sg-services`        | 3000/tcp (dashboard), 9090/tcp (prom)    | sg-alb-public     |
| `sg-bastion`         | 22/tcp (SSH)                             | Your IP only      |

All SGs: outbound 0.0.0.0/0 (or restrict to VPC + NAT for chain nodes).

---

## DNS Map

| Record                       | Type  | Target               | Notes              |
|------------------------------|-------|----------------------|---------------------|
| `l1.unykorn.org`             | A/CNAME | ALB                | Landing/dashboard   |
| `rpc.l1.unykorn.org`         | A     | NLB                  | JSON-RPC endpoint   |
| `grafana.l1.unykorn.org`     | CNAME | Managed Grafana      | Observability       |
| `demo.l1.unykorn.org`        | CNAME | ALB                  | Demo console        |
| `api.l1.unykorn.org`         | CNAME | ALB                  | REST API            |

---

## S3 Buckets

| Bucket                        | Purpose                        | Versioning | Lifecycle       |
|-------------------------------|--------------------------------|------------|-----------------|
| `unykorn-l1-artifacts`        | Docker images, build outputs   | Yes        | 90-day archive  |
| `unykorn-l1-snapshots`        | Chain state snapshots           | Yes        | 30-day IA tier  |
| `unykorn-l1-audit-logs`       | CloudTrail, access logs         | Yes        | 365-day retain  |
| `unykorn-l1-reports`          | Proof packs, registry exports   | Yes        | Keep forever    |
| `unykorn-l1-web-assets`       | Static site assets (optional)   | No         | —               |

---

## Secrets Manager Entries

| Secret Name                    | Contents                               |
|--------------------------------|----------------------------------------|
| `unykorn/l1/node-keys`        | Ed25519 seed per node (alpha–echo)     |
| `unykorn/l1/validator-stakes`  | Staking keys (when applicable)        |
| `unykorn/l1/rpc-api-key`      | API key for gated RPC access          |
| `unykorn/l1/grafana-admin`    | Grafana admin credentials             |
| `unykorn/evm/deployer-keys`   | Contract deployer private keys        |
| `unykorn/api/opensea`         | OpenSea API key                       |
| `unykorn/api/walletconnect`   | WalletConnect project ID              |

---

## Deployment Order

```
Phase 1 — Ship It
═══════════════════════════════════════════
 1. terraform init + apply  (VPC, subnets, gateways)
 2. terraform apply         (security groups)
 3. docker build + push to ECR
 4. terraform apply         (EC2 nodes + EBS)
 5. terraform apply         (ALB + NLB + target groups)
 6. terraform apply         (Route 53 records)
 7. terraform apply         (S3 buckets)
 8. terraform apply         (Secrets Manager)
 9. terraform apply         (CloudWatch + AMP + Grafana)
10. terraform apply         (WAF rules)
11. Run deploy.sh to bootstrap nodes
12. Verify: health checks, RPC, dashboard

Phase 2 — Harden
═══════════════════════════════════════════
13. Enable GuardDuty + Security Hub
14. Add AWS Config rules
15. Add backup/restore playbooks
16. Add blue/green deploy flow
17. Split staging vs demo environments

Phase 3 — Pre-Production
═══════════════════════════════════════════
18. HSM key ceremony (CloudHSM or external)
19. Validator org separation
20. External audit prep
21. DR drills
22. Production runbooks
```

---

## Cost Estimate (Phase 1 — Monthly)

| Resource           | Qty | Type         | Est. $/month |
|--------------------|-----|-------------|-------------|
| EC2 (chain nodes)  | 3   | c6a.xlarge  | $330        |
| EC2 (oracles)      | 2   | c6a.large   | $130        |
| EC2 (services)     | 2   | t3.medium   | $60         |
| EBS (gp3)          | 1TB | gp3         | $80         |
| ALB                | 1   | —           | $25         |
| NLB                | 1   | —           | $25         |
| NAT Gateway        | 1   | —           | $35         |
| S3                 | —   | minimal     | $5          |
| ECR                | —   | minimal     | $5          |
| CloudWatch         | —   | logs/metrics| $20         |
| AMP + Grafana      | —   | managed     | $30         |
| Route 53           | 1   | hosted zone | $1          |
| WAF                | 1   | web ACL     | $10         |
| Secrets Manager    | 7   | secrets     | $3          |
| **Total**          |     |             | **~$759**   |

> Reserved Instances or Savings Plans can reduce EC2 by 30-40%.

---

## File Index

```
aws/
├── README.md                    ← This file
├── terraform/
│   ├── main.tf                  ← Root module
│   ├── variables.tf             ← Input variables
│   ├── outputs.tf               ← Output values
│   ├── terraform.tfvars.example ← Safe defaults
│   ├── modules/
│   │   ├── vpc/                 ← VPC, subnets, NAT, IGW
│   │   ├── security/            ← Security groups, KMS, WAF
│   │   ├── compute/             ← EC2 nodes, EBS, launch templates
│   │   ├── load-balancing/      ← ALB, NLB, target groups
│   │   ├── storage/             ← S3, ECR
│   │   ├── dns/                 ← Route 53
│   │   ├── observability/       ← CloudWatch, AMP, Grafana
│   │   └── secrets/             ← Secrets Manager
│   └── environments/
│       ├── devnet.tfvars
│       └── staging.tfvars
├── docker/
│   ├── Dockerfile.node          ← L1 node image
│   └── Dockerfile.dashboard     ← Wallet/dashboard image
├── scripts/
│   ├── deploy.sh                ← Full deploy orchestrator
│   ├── bootstrap-node.sh        ← Per-node bootstrap
│   └── teardown.sh              ← Clean destroy
├── packer/
│   └── node-ami.pkr.hcl         ← Pre-baked AMI (optional)
└── docs/
    └── RUNBOOK.md               ← Operational runbook
```
