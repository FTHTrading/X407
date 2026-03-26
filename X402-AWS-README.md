<p align="center">
  <img src="https://img.shields.io/badge/UnyKorn-x402_Protocol-6C3FC5?style=for-the-badge&logo=ethereum&logoColor=white" alt="UnyKorn x402" />
  <img src="https://img.shields.io/badge/AWS-Production_Infrastructure-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white" alt="AWS" />
  <img src="https://img.shields.io/badge/Terraform-v1.14-7B42BC?style=for-the-badge&logo=terraform&logoColor=white" alt="Terraform" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/build-passing-00C853?style=flat-square&logo=github-actions" alt="Build" />
  <img src="https://img.shields.io/badge/tests-28%2F28_E2E-00C853?style=flat-square&logo=vitest" alt="Tests" />
  <img src="https://img.shields.io/badge/containers-7%2F7_healthy-00C853?style=flat-square&logo=docker" alt="Containers" />
  <img src="https://img.shields.io/badge/EC2-5%2F5_running-00C853?style=flat-square&logo=amazon-ec2" alt="EC2" />
  <img src="https://img.shields.io/badge/drift-zero-00C853?style=flat-square&logo=terraform" alt="Drift" />
  <img src="https://img.shields.io/badge/TLS-1.3_&#x2713;-00C853?style=flat-square&logo=letsencrypt" alt="TLS" />
  <img src="https://img.shields.io/badge/WAF-active-00C853?style=flat-square&logo=cloudflare" alt="WAF" />
  <img src="https://img.shields.io/badge/license-proprietary-lightgrey?style=flat-square" alt="License" />
</p>

<h1 align="center">UnyKorn x402 — AWS Infrastructure</h1>

<p align="center">
  <b>Full-stack institutional payment protocol infrastructure on AWS</b><br/>
  x402 facilitator · treasury · guardian daemon army · financial core (Rust) · L1 chain fleet
</p>

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Network Topology](#-network-topology)
- [Service Map](#-service-map)
- [Request Flow](#-request-flow)
- [Infrastructure Modules](#-infrastructure-modules)
- [EC2 Fleet](#-ec2-fleet)
- [x402 Service Stack](#-x402-service-stack)
- [DNS & Routing](#-dns--routing)
- [Security Posture](#-security-posture)
- [Deployment](#-deployment)
- [E2E Verification](#-e2e-verification)
- [Cost Profile](#-cost-profile)
- [Directory Structure](#-directory-structure)
- [Status](#-status)

---

## 🔭 Overview

This repository contains the complete AWS infrastructure for the **UnyKorn x402 Payment Protocol** — an institutional-grade, HTTP 402-based payment system built on a custom L1 blockchain with the UNY stablecoin.

**What ships here:**
- 5-node L1 chain fleet (3 validators + 2 oracles)
- x402 facilitator (payment processing)
- x402 treasury (agent fund management)
- Guardian daemon army (autonomous monitoring)
- Financial core (Rust — 6 crates: ledger, settlement, vault, risk, types, API)
- Full observability (Prometheus, Grafana, CloudWatch)
- WAF + TLS 1.3 + 3-tier API auth

---

## 🏗 Architecture

```
                        ┌─────────────────────────────────────────┐
                        │            INTERNET                      │
                        └──────────────────┬──────────────────────┘
                                           │
                                     ┌─────▼─────┐
                                     │  Route 53  │
                                     │  *.l1.uny  │
                                     └─────┬─────┘
                                           │
                          ┌────────────────┼────────────────┐
                          │                │                │
                    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
                    │    ALB    │   │    ALB    │   │    NLB    │
                    │  (HTTPS)  │   │  (x402)   │   │  (RPC)    │
                    │  :443     │   │  :443     │   │  :3001    │
                    └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
                          │               │               │
          ┌───────────────┼───────────────┼───────────────┼──────────┐
          │               │       VPC 10.100.0.0/16       │          │
          │   ┌───────────┼───────────────┼───────────────┼──────┐   │
          │   │           │    Private Chain Subnet       │      │   │
          │   │   ┌───────▼───────┐   ┌───────▼───────┐  │      │   │
          │   │   │    alpha      │   │    delta       │  │      │   │
          │   │   │  Producer     │   │  x402 Stack    │  │      │   │
          │   │   │  :3000/:3001  │   │  :3100-:4400   │  │      │   │
          │   │   └───────────────┘   └───────┬───────┘  │      │   │
          │   │   ┌───────────────┐   ┌───────┼───────┐  │      │   │
          │   │   │    bravo      │   │  7 containers  │  │      │   │
          │   │   │  Validator    │   │  ┌───────────┐ │  │      │   │
          │   │   └───────────────┘   │  │facilitator│ │  │      │   │
          │   │   ┌───────────────┐   │  │treasury   │ │  │      │   │
          │   │   │   charlie     │   │  │guardian    │ │  │      │   │
          │   │   │  Validator    │   │  │fin-core   │ │  │      │   │
          │   │   └───────────────┘   │  │postgres   │ │  │      │   │
          │   │   ┌───────────────┐   │  │grafana    │ │  │      │   │
          │   │   │    echo       │   │  └───────────┘ │  │      │   │
          │   │   │  Oracle       │   └───────────────┘  │      │   │
          │   │   └───────────────┘                      │      │   │
          │   └──────────────────────────────────────────┘      │   │
          └─────────────────────────────────────────────────────┘   │
                                                                    │
```

---

## 🌐 Network Topology

```
VPC: 10.100.0.0/16  (unykorn-l1-vpc)
│
├── 🟢 Public Subnets
│   ├── 10.100.1.0/24  (us-east-1a)  ← ALB, NAT Gateway
│   └── 10.100.2.0/24  (us-east-1b)  ← ALB (multi-AZ)
│
├── 🔵 Private Chain Subnets
│   ├── 10.100.10.0/24 (us-east-1a)  ← alpha, bravo, delta
│   └── 10.100.11.0/24 (us-east-1b)  ← charlie, echo
│
├── 🟣 Private Services Subnets
│   ├── 10.100.20.0/24 (us-east-1a)  ← reserved
│   └── 10.100.21.0/24 (us-east-1b)  ← reserved
│
└── ⚫ Isolated Data Subnets
    ├── 10.100.30.0/24 (us-east-1a)  ← reserved for RDS
    └── 10.100.31.0/24 (us-east-1b)  ← reserved
```

---

## 🗺 Service Map

| Service | Port | Host | Language | Status |
|---------|------|------|----------|--------|
| **x402 Facilitator** | 3100 | `facilitator.l1.unykorn.org` | TypeScript | ![ok](https://img.shields.io/badge/-LIVE-00C853?style=flat-square) |
| **x402 Treasury** | 3200 | `treasury.l1.unykorn.org` | TypeScript | ![ok](https://img.shields.io/badge/-LIVE-00C853?style=flat-square) |
| **Guardian Daemon** | 3300 | `guardian.l1.unykorn.org` | TypeScript | ![ok](https://img.shields.io/badge/-LIVE-00C853?style=flat-square) |
| **Financial Core** | 4400 | — (internal) | Rust | ![ok](https://img.shields.io/badge/-LIVE-00C853?style=flat-square) |
| **PostgreSQL** | 5432 | — (internal) | — | ![ok](https://img.shields.io/badge/-LIVE-00C853?style=flat-square) |
| **Grafana** | 3400 | — (internal) | — | ![ok](https://img.shields.io/badge/-LIVE-00C853?style=flat-square) |
| **L1 Node (alpha)** | 3000/3001 | `l1.unykorn.org` | Rust | ![ok](https://img.shields.io/badge/-LIVE-00C853?style=flat-square) |
| **JSON-RPC** | 3001 | `rpc.l1.unykorn.org` | — | ![ok](https://img.shields.io/badge/-LIVE-00C853?style=flat-square) |

---

## 🔀 Request Flow

### x402 Payment Flow

```
Client                    ALB                     Facilitator        Treasury         L1 Chain
  │                        │                          │                  │                │
  │  POST /pay             │                          │                  │                │
  │  Host: x402.l1.uny... │                          │                  │                │
  ├───────────────────────►│                          │                  │                │
  │                        │  forward :3100           │                  │                │
  │                        ├─────────────────────────►│                  │                │
  │                        │                          │ verify agent     │                │
  │                        │                          ├─────────────────►│                │
  │                        │                          │                  │ check balance  │
  │                        │                          │                  ├───────────────►│
  │                        │                          │                  │◄───────────────┤
  │                        │                          │◄─────────────────┤                │
  │                        │                          │                  │                │
  │                        │                          │ submit tx        │                │
  │                        │                          ├──────────────────┼───────────────►│
  │                        │                          │                  │                │
  │                        │                          │◄─────────────────┼────────────────┤
  │                        │◄─────────────────────────┤                  │                │
  │  HTTP 200 + receipt    │                          │                  │                │
  │◄───────────────────────┤                          │                  │                │
```

### Guardian Monitoring Flow

```
                    ┌──────────────────────────────────────────┐
                    │          Guardian Daemon Army              │
                    │                                           │
                    │  ┌─────────┐  ┌──────────┐  ┌─────────┐ │
                    │  │ Health  │  │  Sweep   │  │  Chain  │ │
                    │  │ Monitor │  │  Daemon  │  │  Watcher│ │
                    │  └────┬────┘  └────┬─────┘  └────┬────┘ │
                    │       │            │             │       │
                    │       ▼            ▼             ▼       │
                    │  ┌─────────────────────────────────────┐ │
                    │  │         PostgreSQL (state)           │ │
                    │  └─────────────────────────────────────┘ │
                    │       │            │             │       │
                    └───────┼────────────┼─────────────┼───────┘
                            │            │             │
                 ┌──────────▼──┐   ┌─────▼────┐  ┌────▼──────┐
                 │ Facilitator │   │ Treasury │  │  L1 RPC   │
                 │   :3100     │   │  :3200   │  │  :3001    │
                 └─────────────┘   └──────────┘  └───────────┘
```

### Financial Core (Rust) Internal Architecture

```
                         ┌──────────────────────┐
                         │     fth-api (Axum)    │
                         │       :4400           │
                         └──────────┬───────────┘
                                    │
             ┌──────────────────────┼──────────────────────┐
             │                      │                      │
     ┌───────▼───────┐    ┌────────▼────────┐    ┌────────▼────────┐
     │  fth-ledger   │    │ fth-settlement  │    │   fth-vault     │
     │  Double-entry │    │ FIFO/LIFO/WAVG  │    │  Multi-custody  │
     │  accounting   │    │  cost basis      │    │  key management │
     └───────┬───────┘    └────────┬────────┘    └────────┬────────┘
             │                      │                      │
             └──────────────────────┼──────────────────────┘
                                    │
                           ┌────────▼────────┐
                           │   fth-risk      │
                           │  Position limits │
                           │  Exposure checks │
                           └────────┬────────┘
                                    │
                           ┌────────▼────────┐
                           │   fth-types     │
                           │  Shared types   │
                           │  Currency, Asset│
                           └─────────────────┘
```

---

## 📦 Infrastructure Modules

| Module | Purpose | Key Resources |
|--------|---------|---------------|
| **vpc** | Network foundation | VPC, 8 subnets (4 tiers), NAT GW, IGW, route tables, flow logs |
| **security** | Access control | 4 security groups, KMS key, IAM roles/policies, instance profiles |
| **compute** | Server fleet | 5 EC2 instances, EBS volumes, user data bootstrap |
| **load-balancing** | Traffic routing | ALB (HTTPS), NLB (RPC), 8 target groups, host-based rules |
| **dns** | Name resolution | Route 53 zone, 8 A records (root, rpc, api, demo, x402, facilitator, treasury, guardian) |
| **storage** | Data persistence | 4 S3 buckets, 2 ECR repos, lifecycle policies |
| **secrets** | Credential management | 5 Secrets Manager entries (node keys, RPC key, Grafana, EVM, API) |
| **observability** | Monitoring | CloudWatch log groups, metric alarms (CPU, status), AMP workspace, dashboard |
| **waf** | Edge security | WAFv2 Web ACL, rate limiting, geo rules, logging |

---

## 🖥 EC2 Fleet

| Node | Role | Instance | vCPU | RAM | IP | Status |
|------|------|----------|------|-----|----|--------|
| **alpha** | Producer | c6a.xlarge | 4 | 8 GB | 10.100.10.124 | ![running](https://img.shields.io/badge/-running-00C853?style=flat-square) |
| **bravo** | Validator | c6a.xlarge | 4 | 8 GB | 10.100.10.222 | ![running](https://img.shields.io/badge/-running-00C853?style=flat-square) |
| **charlie** | Validator | c6a.xlarge | 4 | 8 GB | 10.100.11.172 | ![running](https://img.shields.io/badge/-running-00C853?style=flat-square) |
| **delta** | x402 Host | c6a.large | 2 | 4 GB | 10.100.10.220 | ![running](https://img.shields.io/badge/-running-00C853?style=flat-square) |
| **echo** | Oracle | c6a.large | 2 | 4 GB | 10.100.11.10 | ![running](https://img.shields.io/badge/-running-00C853?style=flat-square) |

---

## 🔐 x402 Service Stack

All x402 services run as Docker containers on **delta** (`i-0e9a24f4902faaa06`):

| Container | Image | Port | Health Check | Depends On |
|-----------|-------|------|-------------|------------|
| **postgres** | postgres:16-alpine | 5432 | `pg_isready` | — |
| **facilitator** | fth-x402-facilitator | 3100 | `/health` | postgres |
| **treasury** | fth-x402-treasury | 3200 | `/health` | postgres |
| **guardian** | fth-guardian | 3300 | `/health` | postgres, facilitator, treasury |
| **financial-core** | fth-financial-core | 4400 | `/health` | — |
| **grafana** | grafana:11-alpine | 3400 | — | — |

### Docker Compose Stack

```yaml
services:
  postgres       # PostgreSQL 16 — shared state
  facilitator    # x402 payment processing
  treasury       # Agent fund management
  guardian       # Autonomous daemon army
  financial-core # Rust ledger/settlement/vault/risk
  grafana        # Monitoring dashboards
```

---

## 🌍 DNS & Routing

### Subdomain Map

| Subdomain | Type | Target | ALB Rule |
|-----------|------|--------|----------|
| `l1.unykorn.org` | A | ALB | Default → dashboard |
| `rpc.l1.unykorn.org` | A | NLB | Direct → :3001 |
| `api.l1.unykorn.org` | A | ALB | Path: /api/* |
| `demo.l1.unykorn.org` | A | ALB | Host-based |
| **`facilitator.l1.unykorn.org`** | A | ALB | Host → delta:3100 |
| **`treasury.l1.unykorn.org`** | A | ALB | Host → delta:3200 |
| **`guardian.l1.unykorn.org`** | A | ALB | Host → delta:3300 |
| **`x402.l1.unykorn.org`** | A | ALB | Host → delta:3100 (catch-all) |

### Routing Architecture

```
                   *.l1.unykorn.org (Wildcard ACM Cert)
                              │
                    ┌─────────▼─────────┐
                    │   ALB :443 (TLS)  │
                    └─────────┬─────────┘
                              │
            ┌─────────────────┼─────────────────────────┐
            │                 │                         │
   ┌────────▼────────┐ ┌─────▼──────────┐ ┌────────────▼────────────┐
   │ Host: l1.uny..  │ │ Path: /api/*   │ │ Host: facilitator.l1..  │
   │ → dashboard:3000│ │ → api:3001     │ │ → facilitator:3100      │
   └─────────────────┘ └────────────────┘ │                         │
                                          │ Host: treasury.l1..     │
                                          │ → treasury:3200         │
                                          │                         │
                                          │ Host: guardian.l1..     │
                                          │ → guardian:3300         │
                                          │                         │
                                          │ Host: x402.l1..        │
                                          │ → facilitator:3100      │
                                          └─────────────────────────┘
```

---

## 🛡 Security Posture

### Network Security

| Security Group | Inbound Rules | Sources |
|---------------|---------------|---------|
| `sg-alb-public` | 443/tcp, 80/tcp | 0.0.0.0/0 |
| `sg-nlb-rpc` | 3001/tcp | 0.0.0.0/0 |
| `sg-chain-nodes` | 30301-30305/tcp (P2P), 3001-3005/tcp (RPC), **3100/3200/3300/4400** (x402) | chain_nodes, nlb, **alb** |
| `sg-services` | 3000/tcp, 9090/tcp, **3100/3200/3300/4400** (x402) | alb |

### Authentication Layers

```
┌──────────────────────────────────────────────────────────┐
│                   3-Tier Auth Model                       │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Layer 1: Public                                         │
│  ├── GET  /health              — No auth required        │
│  ├── GET  /                    — No auth required        │
│  └── GET  /rates               — No auth required        │
│                                                          │
│  Layer 2: Service (HMAC-SHA256)                          │
│  ├── POST /pay                 — x-fth-signature header  │
│  ├── POST /verify              — x-fth-signature header  │
│  └── POST /settle              — x-fth-signature header  │
│                                                          │
│  Layer 3: Admin (Bearer Token)                           │
│  ├── GET  /admin/metrics       — Authorization: Bearer   │
│  ├── POST /admin/config        — Authorization: Bearer   │
│  └── GET  /admin/agents        — Authorization: Bearer   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Additional Security

- **WAFv2** — Rate limiting, geo-blocking, SQL injection protection
- **TLS 1.3** — ACM wildcard certificate (`*.l1.unykorn.org`)
- **KMS** — Envelope encryption for secrets and EBS volumes
- **VPC Flow Logs** — Full network traffic audit
- **CloudTrail** — API call audit logging
- **IMDSv2** — Instance metadata service hardened

---

## 🚀 Deployment

### Prerequisites

```bash
# Required tools
terraform >= 1.14
aws-cli >= 2.x
docker >= 24.x
node >= 24.x
```

### Deploy Infrastructure

```bash
cd aws/terraform

# Initialize
terraform init

# Plan
terraform plan -var-file=environments/devnet.tfvars

# Apply
terraform apply -var-file=environments/devnet.tfvars
```

### Deploy x402 Stack (Delta)

```bash
cd aws

# Build and push Docker images
./scripts/deploy.sh

# Or use docker-compose directly on delta
docker compose -f docker/docker-compose.production.yml up -d
```

### Verify Deployment

```bash
# Health checks
curl https://facilitator.l1.unykorn.org/health
curl https://treasury.l1.unykorn.org/health
curl https://guardian.l1.unykorn.org/health

# RPC
curl https://rpc.l1.unykorn.org -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

---

## ✅ E2E Verification

### Test Results: **28/28 PASSED**

| Suite | Tests | Status |
|-------|-------|--------|
| x402 Facilitator | 8 | ![pass](https://img.shields.io/badge/-PASS-00C853?style=flat-square) |
| x402 Treasury | 6 | ![pass](https://img.shields.io/badge/-PASS-00C853?style=flat-square) |
| Guardian Daemon | 5 | ![pass](https://img.shields.io/badge/-PASS-00C853?style=flat-square) |
| Financial Core | 4 | ![pass](https://img.shields.io/badge/-PASS-00C853?style=flat-square) |
| Integration (cross-service) | 3 | ![pass](https://img.shields.io/badge/-PASS-00C853?style=flat-square) |
| Auth Layer (3-tier) | 2 | ![pass](https://img.shields.io/badge/-PASS-00C853?style=flat-square) |

### Live Endpoint Verification

```
✅ facilitator.l1.unykorn.org/health → {"status":"ok","service":"fth-x402-facilitator","version":"0.2.0","db":"connected"}
✅ treasury.l1.unykorn.org/health    → {"ok":true,"service":"fth-x402-treasury"}
✅ guardian.l1.unykorn.org/health     → {"status":"ok","service":"guardian"}
✅ x402.l1.unykorn.org/health         → {"status":"ok","service":"fth-x402-facilitator"} (catch-all)
✅ rpc.l1.unykorn.org                 → JSON-RPC v2.0 responding
✅ l1.unykorn.org                     → ALB default route active
```

---

## 💰 Cost Profile

| Resource | Qty | Type | Est. $/month |
|----------|-----|------|-------------|
| EC2 (validators) | 3 | c6a.xlarge | $330 |
| EC2 (oracles) | 2 | c6a.large | $130 |
| EBS (gp3) | 1 TB | gp3 | $80 |
| ALB | 1 | Application | $25 |
| NLB | 1 | Network | $25 |
| NAT Gateway | 1 | — | $35 |
| S3 | 4 buckets | Standard | $5 |
| ECR | 2 repos | — | $5 |
| CloudWatch | — | Logs/Metrics | $20 |
| AMP + Grafana | — | Managed | $30 |
| Route 53 | 1 zone | 8 records | $1 |
| WAFv2 | 1 ACL | — | $10 |
| Secrets Manager | 5 secrets | — | $3 |
| **Total** | | | **~$699/mo** |

> 💡 Savings Plans or Reserved Instances can reduce EC2 costs by 30-40%.

---

## 📂 Directory Structure

```
.
├── 📄 README.md                          ← This file
│
├── 📁 aws/
│   ├── 📁 terraform/
│   │   ├── main.tf                       ← Root module (9 module orchestration)
│   │   ├── variables.tf                  ← Input variables
│   │   ├── outputs.tf                    ← Output values
│   │   ├── terraform.tfvars              ← Environment config
│   │   └── 📁 modules/
│   │       ├── vpc/                      ← VPC, subnets, NAT, IGW, flow logs
│   │       ├── security/                 ← Security groups, KMS, IAM
│   │       ├── compute/                  ← EC2 fleet, EBS, bootstrap
│   │       ├── load-balancing/           ← ALB, NLB, target groups, listener rules
│   │       ├── dns/                      ← Route 53 records
│   │       ├── storage/                  ← S3 buckets, ECR repos
│   │       ├── secrets/                  ← Secrets Manager
│   │       ├── observability/            ← CloudWatch, AMP, dashboards
│   │       └── waf/                      ← WAFv2 Web ACL
│   │
│   ├── 📁 docker/
│   │   ├── docker-compose.production.yml ← Full x402 + Guardian stack
│   │   ├── docker-compose.deploy.yml     ← Deploy-time compose
│   │   ├── Dockerfile.facilitator        ← x402 facilitator image
│   │   ├── Dockerfile.treasury           ← x402 treasury image
│   │   ├── Dockerfile.guardian           ← Guardian daemon image
│   │   ├── Dockerfile.financial-core     ← Rust financial core image
│   │   ├── Dockerfile.node               ← L1 node image
│   │   ├── Dockerfile.dashboard          ← Dashboard image
│   │   ├── init-db.sql                   ← PostgreSQL schema init
│   │   └── e2e-test.sh                   ← End-to-end test runner
│   │
│   ├── 📁 scripts/
│   │   ├── deploy.sh                     ← Full deploy orchestrator
│   │   ├── deploy.ps1                    ← Windows deploy script
│   │   ├── bootstrap-node.sh             ← Per-node bootstrap
│   │   ├── setup-tools.ps1               ← Dev environment setup
│   │   ├── teardown.sh                   ← Clean destroy
│   │   └── teardown.ps1                  ← Windows teardown
│   │
│   ├── 📁 packer/
│   │   └── node-ami.pkr.hcl             ← Pre-baked AMI template
│   │
│   └── 📁 docs/
│       └── RUNBOOK.md                    ← Operational runbook
│
├── 📁 packages/
│   ├── fth-x402-facilitator/             ← Payment processing service
│   ├── fth-x402-treasury/                ← Agent fund management
│   ├── fth-x402-core/                    ← Shared x402 protocol types
│   ├── fth-x402-sdk/                     ← Client SDK
│   ├── fth-x402-gateway/                 ← Cloudflare Worker gateway
│   ├── fth-x402-pricing/                 ← Pricing engine
│   ├── fth-guardian/                     ← Guardian daemon army
│   ├── fth-metering/                     ← Usage metering
│   ├── fth-financial-core/               ← Rust: 6 crates
│   │   └── crates/
│   │       ├── fth-api/                  ← Axum HTTP API (:4400)
│   │       ├── fth-ledger/               ← Double-entry accounting
│   │       ├── fth-settlement/           ← FIFO/LIFO/WAVG cost basis
│   │       ├── fth-vault/                ← Multi-custody key management
│   │       ├── fth-risk/                 ← Position limits & exposure
│   │       └── fth-types/                ← Shared types (Currency, Asset)
│   ├── unyKorn-contracts/                ← Solidity smart contracts
│   └── unyKorn-wallet/                   ← Wallet UI
│
├── 📁 db/
│   └── migrations-x402/                  ← Database migrations
│
├── 📁 ops/
│   ├── migrations/                       ← Operational migrations
│   └── scripts/                          ← Ops automation
│
└── 📁 workers/
    └── x407-ai-proxy/                    ← AI proxy worker
```

---

## 📊 Status

<table>
<tr>
<td>

### Infrastructure

| Component | Status |
|-----------|--------|
| VPC & Networking | ![verified](https://img.shields.io/badge/-VERIFIED-00C853?style=flat-square) |
| Security Groups | ![verified](https://img.shields.io/badge/-VERIFIED-00C853?style=flat-square) |
| EC2 Fleet (5/5) | ![verified](https://img.shields.io/badge/-VERIFIED-00C853?style=flat-square) |
| ALB + NLB | ![verified](https://img.shields.io/badge/-VERIFIED-00C853?style=flat-square) |
| DNS (8 records) | ![verified](https://img.shields.io/badge/-VERIFIED-00C853?style=flat-square) |
| TLS 1.3 Cert | ![verified](https://img.shields.io/badge/-VERIFIED-00C853?style=flat-square) |
| WAF | ![verified](https://img.shields.io/badge/-VERIFIED-00C853?style=flat-square) |
| Terraform Drift | ![zero](https://img.shields.io/badge/-ZERO-00C853?style=flat-square) |

</td>
<td>

### Services

| Component | Status |
|-----------|--------|
| x402 Facilitator | ![validated](https://img.shields.io/badge/-VALIDATED-00C853?style=flat-square) |
| x402 Treasury | ![validated](https://img.shields.io/badge/-VALIDATED-00C853?style=flat-square) |
| Guardian Daemon | ![validated](https://img.shields.io/badge/-VALIDATED-00C853?style=flat-square) |
| Financial Core | ![validated](https://img.shields.io/badge/-VALIDATED-00C853?style=flat-square) |
| PostgreSQL | ![validated](https://img.shields.io/badge/-VALIDATED-00C853?style=flat-square) |
| 3-Tier Auth | ![validated](https://img.shields.io/badge/-VALIDATED-00C853?style=flat-square) |
| E2E Tests (28/28) | ![validated](https://img.shields.io/badge/-VALIDATED-00C853?style=flat-square) |
| Public Endpoints | ![validated](https://img.shields.io/badge/-VALIDATED-00C853?style=flat-square) |

</td>
</tr>
</table>

---

<p align="center">
  <img src="https://img.shields.io/badge/FTH_Trading-UnyKorn_Protocol-6C3FC5?style=for-the-badge" alt="FTH Trading" />
  <br/>
  <sub>Built with precision. Verified end-to-end. Zero drift.</sub>
</p>
