# X407

<div align="center">

## Agent Commerce Infrastructure at Enterprise Grade

**X407** is a premium protocol-and-platform initiative for agent-native payments, programmable access control, compliance-aware monetization, and machine-to-machine commerce.

![Status](https://img.shields.io/badge/status-strategic%20build-0f172a?style=for-the-badge)
![Model](https://img.shields.io/badge/model-agent--native-2563eb?style=for-the-badge)
![Trust](https://img.shields.io/badge/trust-cryptographic-7c3aed?style=for-the-badge)
![Monetization](https://img.shields.io/badge/monetization-real--time-059669?style=for-the-badge)
![IP](https://img.shields.io/badge/IP-protected-b45309?style=for-the-badge)

</div>

---

## Overview

X407 implements agent-native commerce infrastructure built on the [x402 payment protocol](https://www.x402.org/). The system provides:

- **Protocol-native monetization** for APIs and AI services
- **Edge-side payment enforcement** and proof verification
- **Compliance-ready receipts and audit trails**
- **Enterprise-ready integration and policy control**
- **Rust financial core** for high-performance ledger, settlement, and risk

## Monorepo Structure

```text
X407/
+-- packages/
|   +-- facilitator/          # x402 payment facilitator (TypeScript/Fastify)
|   +-- treasury/             # Treasury management service
|   +-- guardian/             # Guardian daemon army (7 daemons)
|   +-- fth-financial-core/  # Rust financial engine (6 crates)
|   +-- unyKorn-contracts/   # Smart contracts (Hardhat)
|   +-- unyKorn-wallet/      # Wallet UI (Vite + React)
+-- aws/
|   +-- docker/               # Docker Compose, init-db.sql, e2e tests
|   +-- terraform/            # Infrastructure as Code
+-- registry/                 # Token, pool, and wallet registry
+-- scripts/                  # Inventory, deployment, operations
+-- workers/                  # Cloudflare Worker proxies
+-- docs/                     # Strategic docs, insights, GitHub Pages
+-- ops/                      # Operations guides and reports
```

## Services

| Service | Port | Language | Description |
|---------|------|----------|-------------|
| Facilitator | 3100 | TypeScript | x402 payment facilitation and verification |
| Treasury | 3200 | TypeScript | Wallet management, balance tracking, payments |
| Guardian | 3300 | TypeScript | 7-daemon monitoring army (health, sweep, audit, etc.) |
| Financial Core | 4400 | Rust | Ledger, settlement, vault, risk engine |

## Tech Stack

- **Runtime**: Node.js 24, Rust 1.93
- **Frameworks**: Fastify (TS), Axum (Rust)
- **Database**: PostgreSQL 16
- **Blockchain**: Avalanche C-Chain, UNY ERC-20 stablecoin
- **Infrastructure**: AWS (EC2, ECR, RDS, ALB), Docker Compose
- **Protocol**: x402 HTTP payment challenges

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp aws/docker/.env.example aws/docker/.env

# Start services locally
cd aws/docker && docker compose up -d

# Run E2E tests
bash aws/docker/e2e-test.sh
```

## Development

```powershell
# Open workspace
code unyKorn.code-workspace

# Build Rust financial core
cd packages/fth-financial-core
cargo build --release

# Run Rust tests
cargo test
```

## Security

- `.env` files are git-ignored. Copy `.env.example` -> `.env` in each package.
- Private keys and seed phrases are **never** stored in this repo.
- See [SECURITY.md](SECURITY.md) for responsible disclosure.

## Documentation

- [Competitive Positioning](docs/COMPETITIVE-POSITIONING.md)
- [90-Day Execution Plan](docs/EXECUTION-90-DAYS.md)
- [Implementation Roadmap](docs/IMPLEMENTATION-ROADMAP.md)
- [IP Protection Strategy](docs/IP-PROTECTION.md)
- [Pilot Partner Program](docs/PILOT-PARTNER-PROGRAM.md)
- [Operations Reference](docs/OPERATIONS.md)

---

<div align="center">

**X407** -- Commercial-grade infrastructure for agent-native monetization, trust, and scale.

</div>