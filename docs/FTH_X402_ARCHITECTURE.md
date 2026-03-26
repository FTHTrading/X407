# FTH x402 Architecture Pack
**Date:** 2026-03-19  
**Scope:** Namespace + USDF + x402-style pay-per-request protocol  
**Stack:** UnyKorn L1 (sovereign) + Stellar (settlement) + XRPL (mirror)

---

## Executive Summary

This document defines the concrete architecture for the FTH payment protocol stack:

1. **Namespace registry** — `fth.*` hierarchical naming
2. **USDF stablecoin** — internal settlement, Stellar-issued, XRPL-mirrored
3. **x402 payment gateway** — HTTP 402-based pay-per-request for APIs and agents
4. **Wrapped assets** — `wXAU`, `wUSTB`, `wBOND`, `wINV`
5. **Token stack** — USDF + PASS + RCPT

Target: working MVP in 4 weeks with offchain namespace, Stellar-issued USDF,
and a functioning 402 gateway that agents can pay through.

---

## Part 1 — System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT / AGENT LAYER                         │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  Browser  │  │ AI Agent │  │ Wallet   │  │ Enterprise Client │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────────┬─────────┘  │
│       │              │             │                    │            │
│       └──────────────┼─────────────┼────────────────────┘            │
│                      │             │                                 │
│                      ▼             ▼                                 │
│               ┌──────────────────────────┐                          │
│               │   FTH Wallet SDK (JS)    │                          │
│               │  • sign payments         │                          │
│               │  • resolve namespaces    │                          │
│               │  • manage balances       │                          │
│               └────────────┬─────────────┘                          │
└────────────────────────────┼────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      x402 GATEWAY LAYER                             │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                  API Gateway / Middleware                     │   │
│  │  ┌──────────┐  ┌─────────────┐  ┌────────────────────────┐  │   │
│  │  │ Invoice  │  │  Payment    │  │  Namespace             │  │   │
│  │  │ Service  │  │  Verifier   │  │  Resolver              │  │   │
│  │  └──────────┘  └─────────────┘  └────────────────────────┘  │   │
│  │  ┌──────────┐  ┌─────────────┐  ┌────────────────────────┐  │   │
│  │  │ Rate     │  │  Credit     │  │  Policy                │  │   │
│  │  │ Limiter  │  │  Ledger     │  │  Engine (KYC/AML/RBAC) │  │   │
│  │  └──────────┘  └─────────────┘  └────────────────────────┘  │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
                ┌─────────────┼──────────────┐
                ▼             ▼              ▼
┌────────────────┐ ┌──────────────┐ ┌────────────────┐
│  STELLAR       │ │   XRPL       │ │  UNYKORN L1    │
│  (primary)     │ │   (mirror)   │ │  (sovereign)   │
│                │ │              │ │                │
│  USDF issuer   │ │  USDF IOU    │ │  native USDF   │
│  Soroban auth  │ │  trustlines  │ │  trade-finance │
│  x402 native   │ │  DEX path    │ │  modules       │
└────────────────┘ └──────────────┘ └────────────────┘
```

---

## Part 2 — Namespace Schema

### Hierarchy

```
fth                          # root namespace (FTH Trading)
├── usdf                     # stablecoin namespace
│   ├── pay                  # payment endpoints
│   ├── mint                 # mint/burn operations
│   ├── reserve              # reserve proofs
│   └── rwa                  # real-world asset links
├── api                      # API namespace
│   ├── invoice              # invoice service
│   ├── verify               # payment verification
│   ├── kyc                  # KYC/AML checks
│   └── trade                # trade-finance endpoints
├── asset                    # wrapped asset namespace
│   ├── xau                  # gold (wXAU)
│   ├── ustb                 # T-bills (wUSTB)
│   ├── bond                 # bonds (wBOND)
│   └── inv                  # invoices (wINV)
├── client                   # per-client namespaces
│   ├── {client_id}
│   │   ├── wallet           # resolved settlement address
│   │   ├── credit           # prepaid balance
│   │   └── policy           # client-specific rules
└── node                     # L1 node namespace
    ├── alpha                # node endpoints
    ├── bravo
    ├── charlie
    ├── delta
    └── echo
```

### Registry Record Schema

```typescript
interface NamespaceRecord {
  // Identity
  fqn: string;              // "fth.usdf.pay" — fully qualified name
  owner: string;            // wallet address or org ID
  created_at: string;       // ISO 8601
  updated_at: string;

  // Resolution
  resolve_to: {
    type: "address" | "endpoint" | "asset" | "policy" | "config";
    network?: "stellar" | "xrpl" | "unykorn-l1" | "polygon";
    value: string;           // address, URL, asset code, etc.
  };

  // Access
  visibility: "public" | "private" | "permissioned";
  acl?: string[];            // wallet addresses or role IDs

  // Payment
  payment_required?: boolean;
  payment_config?: {
    asset: string;           // "USDF"
    network: string;         // "stellar"
    amount_per_request?: string;
    credit_model?: "per-request" | "prepaid" | "session";
    receiver: string;        // settlement address
  };

  // Integrity
  onchain_anchor?: {
    network: string;
    tx_hash: string;
    block: number;
  };
  metadata_hash?: string;    // SHA-256 of full record
}
```

### Example Records

```json
[
  {
    "fqn": "fth.usdf",
    "owner": "GDKX...FTH_ISSUER",
    "resolve_to": {
      "type": "asset",
      "network": "stellar",
      "value": "USDF:GDKX...FTH_ISSUER"
    },
    "visibility": "public",
    "payment_required": false
  },
  {
    "fqn": "fth.api.invoice",
    "owner": "fth-ops",
    "resolve_to": {
      "type": "endpoint",
      "value": "https://api.fth.usdf/v1/invoice"
    },
    "visibility": "permissioned",
    "payment_required": true,
    "payment_config": {
      "asset": "USDF",
      "network": "stellar",
      "amount_per_request": "0.01",
      "credit_model": "prepaid",
      "receiver": "GDKX...FTH_TREASURY"
    }
  },
  {
    "fqn": "fth.client.acme.wallet",
    "owner": "acme-corp",
    "resolve_to": {
      "type": "address",
      "network": "stellar",
      "value": "GBCX...ACME_WALLET"
    },
    "visibility": "private",
    "acl": ["fth-ops", "acme-admin"]
  }
]
```

---

## Part 3 — Token Model

### USDF — Payment Stablecoin

```
┌──────────────────────────────────────────────┐
│                    USDF                       │
│                                              │
│  Type:     Payment stablecoin                │
│  Peg:      1 USDF = 1 USD                   │
│  Model:    Internal settlement (Model C)     │
│            → Fully reserved (Model A) later  │
│                                              │
│  Supply:   Mint on deposit, burn on redeem   │
│  Controls: freeze, unfreeze, clawback        │
│  Policy:   allowlist required for holding    │
│  Audit:    reserve proof published quarterly │
│                                              │
│  Networks:                                   │
│    Primary:  Stellar (issued asset)          │
│    Mirror:   XRPL (IOU via master-issuer)    │
│    Future:   UnyKorn L1 (native module)      │
└──────────────────────────────────────────────┘
```

### Stellar Issuance

| Parameter | Value |
|-----------|-------|
| Asset code | `USDF` |
| Issuer account | New Stellar keypair (FTH treasury) |
| Auth required | `true` — trustline must be approved |
| Auth revocable | `true` — freeze support |
| Auth clawback | `true` — regulatory compliance |
| Home domain | `usdf.fth.trading` |
| TOML | `https://usdf.fth.trading/.well-known/stellar.toml` |

### XRPL Mirror

| Parameter | Value |
|-----------|-------|
| Currency code | `USDF` |
| Issuer | `rE85pdv...Z1Dqm` (existing master-issuer) |
| Require auth | `true` (asfRequireAuth) |
| Freeze | enabled |
| Supply management | mirror of Stellar supply via bridge service |

### Wrapped Assets

| Token | Underlying | Network | Model |
|-------|-----------|---------|-------|
| `wXAU` | Gold spot | Stellar → L1 | Oracle-fed price, reserve-backed |
| `wUSTB` | US Treasury Bills | Stellar | Reserve-backed, quarterly NAV |
| `wBOND` | Corporate bonds | Stellar | Per-issuance, SPV-linked |
| `wINV` | Trade invoices | L1 | Trade-finance module native |

### Access / Utility Tokens

| Token | Purpose | Model |
|-------|---------|-------|
| `PASS` | Access entitlement — proves wallet is authorized for API | Non-transferable, issuer-controlled |
| `RCPT` | Payment receipt — proves a paid event occurred | Immutable, timestamped, optional |
| `UNY` | Governance — existing token (Avalanche + XRPL mirror) | Already deployed |

---

## Part 4 — x402 HTTP Protocol Specification

### Overview

The FTH x402 protocol enables HTTP-native pay-per-request. When a client requests
a paywalled resource, the server returns `402 Payment Required` with machine-readable
payment instructions. The client pays, attaches proof, and re-requests.

### Flow Diagram

```
Client                          Gateway                         Stellar/XRPL/L1
  │                               │                                   │
  │  GET /api/v1/resource         │                                   │
  ├──────────────────────────────►│                                   │
  │                               │  check auth + credit              │
  │  402 Payment Required         │                                   │
  │  X-Payment: {...}             │                                   │
  │◄──────────────────────────────┤                                   │
  │                               │                                   │
  │  [client signs + sends tx]    │                                   │
  │───────────────────────────────┼──────────────────────────────────►│
  │                               │                                   │
  │  GET /api/v1/resource         │                                   │
  │  X-Payment-Proof: {...}       │                                   │
  ├──────────────────────────────►│                                   │
  │                               │  verify payment                   │
  │                               │──────────────────────────────────►│
  │                               │  confirmed                        │
  │                               │◄──────────────────────────────────┤
  │  200 OK + resource            │                                   │
  │◄──────────────────────────────┤                                   │
```

### 402 Response Format

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
X-Payment-Version: fth-x402/1.0

{
  "version": "fth-x402/1.0",
  "resource": "/api/v1/trade/invoice/INV-2026-0042",
  "payment": {
    "asset": "USDF",
    "amount": "0.50",
    "receiver": "GDKX...FTH_TREASURY",
    "network": "stellar",
    "memo": "fth:inv:INV-2026-0042",
    "invoice_id": "inv_abc123def456",
    "nonce": "n_7f3a2b1c",
    "expires_at": "2026-03-19T12:05:00Z",
    "accepted_networks": ["stellar", "xrpl", "unykorn-l1"],
    "accepted_assets": ["USDF"],
    "accepted_proofs": ["tx_hash", "signed_auth", "prepaid_credit"]
  },
  "namespace": "fth.api.trade.invoice",
  "policy": {
    "kyc_required": true,
    "min_pass_level": "basic",
    "rate_limit": "100/hour"
  }
}
```

### Payment Proof Header

```http
GET /api/v1/trade/invoice/INV-2026-0042 HTTP/1.1
X-Payment-Proof: {
  "version": "fth-x402/1.0",
  "proof_type": "tx_hash",
  "network": "stellar",
  "tx_hash": "abc123...def456",
  "invoice_id": "inv_abc123def456",
  "nonce": "n_7f3a2b1c",
  "payer": "GBCX...CLIENT_WALLET",
  "timestamp": "2026-03-19T12:04:55Z"
}
```

### Alternative Proof Types

#### Signed Authorization (Soroban-style)

```json
{
  "proof_type": "signed_auth",
  "network": "stellar",
  "auth_entry": "base64_encoded_soroban_auth...",
  "payer": "GBCX...CLIENT_WALLET",
  "invoice_id": "inv_abc123def456"
}
```

#### Prepaid Credit

```json
{
  "proof_type": "prepaid_credit",
  "credit_id": "cred_xyz789",
  "payer": "GBCX...CLIENT_WALLET",
  "signature": "ed25519_sig_of_invoice_id_and_nonce"
}
```

### Verification Rules

The gateway MUST verify ALL of the following before returning 200:

| Check | Required |
|-------|----------|
| Asset matches `USDF` | YES |
| Amount >= requested amount | YES |
| Receiver matches treasury address | YES |
| Nonce matches issued nonce | YES |
| Invoice not expired | YES |
| Invoice not already redeemed | YES |
| Network matches accepted list | YES |
| Transaction finality confirmed | YES |
| Payer passes KYC policy (if required) | YES |
| Payer holds valid `PASS` token (if required) | OPTIONAL |

### Error Codes

| HTTP | Code | Meaning |
|------|------|---------|
| 402 | `payment_required` | No payment proof attached |
| 402 | `insufficient_amount` | Amount too low |
| 402 | `wrong_asset` | Not USDF |
| 402 | `invoice_expired` | Past `expires_at` |
| 402 | `invoice_redeemed` | Already used |
| 402 | `nonce_mismatch` | Replay attempt |
| 403 | `kyc_required` | Wallet not KYC'd |
| 403 | `pass_required` | No valid PASS token |
| 503 | `settlement_pending` | Network finality not yet reached |

---

## Part 5 — Stablecoin Mint/Burn Design

### Phase 1 — Model C (Internal Settlement)

```
┌──────────────┐     deposit      ┌──────────────┐     mint       ┌──────────┐
│  Client Bank │ ────────────────►│  FTH Treasury│ ──────────────►│  Stellar │
│  Account     │     (USD wire)   │  (custodial) │   USDF issued  │  Network │
└──────────────┘                  └──────────────┘                └──────────┘

┌──────────────┐     withdrawal   ┌──────────────┐     burn       ┌──────────┐
│  Client Bank │ ◄────────────────│  FTH Treasury│ ◄──────────────│  Stellar │
│  Account     │     (USD wire)   │  (custodial) │   USDF burned  │  Network │
└──────────────┘                  └──────────────┘                └──────────┘
```

### Issuer Operations

| Operation | Description | Access |
|-----------|-------------|--------|
| `mint(wallet, amount)` | Issue USDF to approved wallet | Treasury admin only |
| `burn(wallet, amount)` | Destroy USDF from wallet (redemption) | Treasury admin only |
| `freeze(wallet)` | Lock all USDF in wallet | Compliance officer |
| `unfreeze(wallet)` | Unlock frozen wallet | Compliance officer |
| `clawback(wallet, amount)` | Force recall (regulatory order) | Legal + 2-of-3 multisig |
| `allowlist_add(wallet)` | Approve wallet to hold USDF | KYC service |
| `allowlist_remove(wallet)` | Revoke holding permission | Compliance officer |

### Stellar stellar.toml

```toml
# https://usdf.fth.trading/.well-known/stellar.toml

ACCOUNTS = ["GDKX...FTH_ISSUER"]
VERSION = "2.6.0"

[DOCUMENTATION]
ORG_NAME = "FTH Trading"
ORG_URL = "https://fth.trading"
ORG_DESCRIPTION = "Institutional payment infrastructure"

[[CURRENCIES]]
code = "USDF"
issuer = "GDKX...FTH_ISSUER"
display_decimals = 7
name = "FTH US Dollar"
desc = "Internal settlement stablecoin. 1 USDF = 1 USD."
anchor_asset_type = "fiat"
anchor_asset = "USD"
is_asset_anchored = true
redemption_instructions = "Contact treasury@fth.trading for redemption."
```

---

## Part 6 — Credit Ledger Design

For agent/API use, the prepaid credit model is the primary commercial product.

### Schema

```sql
-- credit_accounts
CREATE TABLE credit_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  TEXT NOT NULL UNIQUE,
  network         TEXT NOT NULL DEFAULT 'stellar',  -- stellar, xrpl, unykorn-l1
  namespace       TEXT,                              -- e.g. "fth.client.acme"
  balance_usdf    DECIMAL(20,7) NOT NULL DEFAULT 0,
  frozen          BOOLEAN NOT NULL DEFAULT false,
  kyc_level       TEXT DEFAULT 'none',               -- none, basic, enhanced
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- credit_transactions
CREATE TABLE credit_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES credit_accounts(id),
  type            TEXT NOT NULL,  -- 'deposit', 'charge', 'refund', 'withdrawal'
  amount          DECIMAL(20,7) NOT NULL,
  balance_after   DECIMAL(20,7) NOT NULL,
  reference       TEXT,           -- invoice_id, tx_hash, etc.
  network         TEXT,
  tx_hash         TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- invoices
CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      TEXT NOT NULL UNIQUE,  -- "inv_abc123def456"
  nonce           TEXT NOT NULL UNIQUE,
  resource        TEXT NOT NULL,          -- "/api/v1/trade/invoice/INV-2026-0042"
  namespace       TEXT,
  asset           TEXT NOT NULL DEFAULT 'USDF',
  amount          DECIMAL(20,7) NOT NULL,
  receiver        TEXT NOT NULL,
  network         TEXT NOT NULL DEFAULT 'stellar',
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending, paid, expired, refunded
  payer           TEXT,
  proof_type      TEXT,
  proof_data      JSONB,
  expires_at      TIMESTAMPTZ NOT NULL,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- namespace_records
CREATE TABLE namespace_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fqn             TEXT NOT NULL UNIQUE,
  owner           TEXT NOT NULL,
  resolve_type    TEXT NOT NULL,
  resolve_network TEXT,
  resolve_value   TEXT NOT NULL,
  visibility      TEXT NOT NULL DEFAULT 'public',
  acl             TEXT[],
  payment_required BOOLEAN DEFAULT false,
  payment_config  JSONB,
  onchain_anchor  JSONB,
  metadata_hash   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Part 7 — MVP Repo Structure

```
fth-x402/
├── README.md
├── package.json                   # monorepo root
├── docker-compose.yml             # local dev stack
├── .env.example
│
├── packages/
│   ├── gateway/                   # x402 API gateway
│   │   ├── src/
│   │   │   ├── index.ts           # Express/Fastify entry
│   │   │   ├── middleware/
│   │   │   │   ├── x402.ts        # 402 handler middleware
│   │   │   │   ├── auth.ts        # JWT + wallet auth
│   │   │   │   └── rate-limit.ts
│   │   │   ├── services/
│   │   │   │   ├── invoice.ts     # invoice creation + lookup
│   │   │   │   ├── verifier.ts    # payment proof verification
│   │   │   │   ├── credit.ts      # prepaid credit ledger
│   │   │   │   ├── namespace.ts   # namespace resolver
│   │   │   │   └── policy.ts      # KYC/AML/RBAC checks
│   │   │   ├── networks/
│   │   │   │   ├── stellar.ts     # Stellar SDK integration
│   │   │   │   ├── xrpl.ts        # XRPL SDK integration
│   │   │   │   └── unykorn.ts     # UnyKorn L1 RPC client
│   │   │   ├── routes/
│   │   │   │   ├── health.ts
│   │   │   │   ├── namespace.ts
│   │   │   │   ├── credit.ts
│   │   │   │   └── admin.ts
│   │   │   └── types/
│   │   │       ├── x402.ts        # protocol types
│   │   │       ├── invoice.ts
│   │   │       └── namespace.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── sdk/                       # client SDK (JS/TS)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── client.ts          # FTHClient class
│   │   │   ├── wallet.ts          # wallet signing
│   │   │   ├── x402.ts            # auto-pay 402 responses
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── issuer/                    # USDF issuer admin
│   │   ├── src/
│   │   │   ├── mint.ts
│   │   │   ├── burn.ts
│   │   │   ├── freeze.ts
│   │   │   ├── allowlist.ts
│   │   │   └── reserve-proof.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── dashboard/                 # operator web UI
│       ├── src/
│       ├── index.html
│       ├── package.json
│       └── vite.config.ts
│
├── db/
│   └── migrations/
│       ├── 001_credit_accounts.sql
│       ├── 002_credit_transactions.sql
│       ├── 003_invoices.sql
│       └── 004_namespace_records.sql
│
├── config/
│   ├── namespace-seed.json        # initial namespace records
│   └── stellar.toml               # Stellar anchor TOML
│
├── deploy/
│   ├── Dockerfile.gateway
│   ├── Dockerfile.issuer
│   └── docker-compose.prod.yml
│
└── docs/
    ├── PROTOCOL.md                # x402 spec (detailed)
    ├── NAMESPACE.md               # namespace design
    ├── TOKEN_MODEL.md             # USDF + wrapped assets
    └── INTEGRATION.md             # how to integrate as client
```

---

## Part 8 — Implementation Phases

### Phase 1 — USDF Sandbox (Week 1-2)

**Deliverables:**
- [ ] Stellar testnet USDF issuer account
- [ ] `stellar.toml` hosted
- [ ] Namespace registry (PostgreSQL + REST API)
- [ ] Seed `fth.*` namespace records
- [ ] Invoice service (create, lookup, expire)
- [ ] Basic 402 middleware returning payment instructions
- [ ] Wallet SDK: resolve namespace, read 402 response

**Tech:**
- Gateway: Node.js + Fastify
- DB: PostgreSQL 16
- Stellar SDK: `@stellar/stellar-sdk`
- Auth: Ed25519 wallet signatures

### Phase 2 — x402 Developer Product (Week 3-4)

**Deliverables:**
- [ ] Payment verifier (Stellar tx confirmation)
- [ ] Credit ledger (deposit USDF → prepaid balance)
- [ ] Auto-pay SDK (intercepts 402, pays, retries)
- [ ] Rate limiting per wallet/namespace
- [ ] Admin dashboard (balances, invoices, namespaces)
- [ ] XRPL mirror: USDF IOU on existing master-issuer

**Tech:**
- XRPL: `xrpl` npm package
- Dashboard: Vite + React (extend existing unyKorn-wallet pattern)

### Phase 3 — Issuer Stack (Week 5-6)

**Deliverables:**
- [ ] Mint/burn CLI and API
- [ ] Freeze/unfreeze/clawback operations
- [ ] Allowlist management (manual KYC)
- [ ] Reserve dashboard
- [ ] Audit export (CSV/JSON)
- [ ] PASS token: issue access entitlements

### Phase 4 — Wrapped Assets + L1 Bridge (Week 7-8)

**Deliverables:**
- [ ] wXAU, wUSTB asset definitions
- [ ] Oracle price feed integration
- [ ] UnyKorn L1 RPC client in gateway
- [ ] Bridge service: Stellar ↔ L1
- [ ] L1 trade-finance module integration
- [ ] RCPT token: payment receipts on L1

---

## Part 9 — Network Integration Matrix

### Stellar Integration

```typescript
// Stellar USDF operations
import * as StellarSdk from '@stellar/stellar-sdk';

// Issue USDF to wallet
async function mintUSDFStellar(destination: string, amount: string) {
  const server = new StellarSdk.Horizon.Server('https://horizon.stellar.org');
  const issuer = StellarSdk.Keypair.fromSecret(ISSUER_SECRET);
  const account = await server.loadAccount(issuer.publicKey());

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.PUBLIC
  })
    .addOperation(StellarSdk.Operation.payment({
      destination,
      asset: new StellarSdk.Asset('USDF', issuer.publicKey()),
      amount
    }))
    .setTimeout(30)
    .build();

  tx.sign(issuer);
  return server.submitTransaction(tx);
}

// Verify USDF payment
async function verifyPaymentStellar(txHash: string, invoice: Invoice) {
  const server = new StellarSdk.Horizon.Server('https://horizon.stellar.org');
  const tx = await server.transactions().transaction(txHash).call();
  const ops = await tx.operations();

  const payment = ops.records.find(op =>
    op.type === 'payment' &&
    op.asset_code === 'USDF' &&
    op.to === invoice.receiver &&
    parseFloat(op.amount) >= parseFloat(invoice.amount)
  );

  if (!payment) throw new Error('Payment not found or insufficient');
  return { verified: true, ledger: tx.ledger, payer: payment.from };
}
```

### XRPL Integration

```typescript
// XRPL USDF mirror
import { Client, Wallet, Payment } from 'xrpl';

async function verifyPaymentXRPL(txHash: string, invoice: Invoice) {
  const client = new Client('wss://xrplcluster.com');
  await client.connect();

  const tx = await client.request({
    command: 'tx',
    transaction: txHash
  });

  const result = tx.result;
  if (result.meta?.TransactionResult !== 'tesSUCCESS') {
    throw new Error('Transaction failed');
  }

  // Check payment details
  if (result.TransactionType !== 'Payment') throw new Error('Not a payment');
  if (result.Destination !== invoice.receiver_xrpl) throw new Error('Wrong receiver');

  const amount = result.Amount as { currency: string; value: string; issuer: string };
  if (amount.currency !== 'USDF') throw new Error('Wrong asset');
  if (parseFloat(amount.value) < parseFloat(invoice.amount)) throw new Error('Insufficient amount');

  await client.disconnect();
  return { verified: true, ledger: result.ledger_index, payer: result.Account };
}
```

### UnyKorn L1 Integration

```typescript
// UnyKorn L1 — RPC client for payment verification
const UNYKORN_RPC = 'http://rpc.l1.unykorn.org:3001';

async function verifyPaymentL1(txHash: string, invoice: Invoice) {
  const response = await fetch(`${UNYKORN_RPC}/tx/${txHash}`);
  const tx = await response.json();

  if (tx.status !== 'finalized') throw new Error('Not finalized');
  if (tx.to !== invoice.receiver_l1) throw new Error('Wrong receiver');
  if (tx.asset !== 'USDF') throw new Error('Wrong asset');
  if (BigInt(tx.amount) < BigInt(invoice.amount_wei)) throw new Error('Insufficient');

  return { verified: true, block: tx.block_number, payer: tx.from };
}
```

---

## Part 10 — Key Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Settlement layer | Stellar first | x402 native support, anchor ecosystem, fastest to market |
| Mirror layer | XRPL | Already have master-issuer + IOUs, DEX liquidity path |
| Sovereign layer | UnyKorn L1 | Trade-finance module, full control, already deployed |
| Namespace storage | PostgreSQL (offchain) | Speed, admin control, onchain anchor later |
| Stablecoin model | Model C (internal) → Model A | Start private, add reserves when volume justifies |
| Payment proof | Prepaid credit primary | Best agent UX, fastest API flow |
| Auth model | Ed25519 wallet signatures | Works across Stellar, XRPL, and L1 |
| API framework | Fastify | Performance, TypeScript native, plugin ecosystem |
| Database | PostgreSQL 16 | JSON support, row-level security, battle-tested |

---

## Appendix A — Existing Assets to Bridge

From the current UnyKorn registry:

| Asset | Current Location | Bridge Target |
|-------|-----------------|---------------|
| `UNY` | Avalanche C-Chain (`0xc090...d66`) + XRPL IOU | UnyKorn L1 native governance |
| `USDT` (XRPL) | XRPL master-issuer, 39.7M supply | Reference asset for USDF pricing |
| TLD NFTs | Polygon (107+ soulbound) | Namespace proof-of-ownership |
| DTT, VAULTUSD, GOLDC | XRPL IOUs | Wrapped asset candidates |

### Existing Infrastructure

| Component | Status | Reuse Plan |
|-----------|--------|-----------|
| XRPL master-issuer | Active | Issue USDF IOU directly |
| Polygon GlacierMint contracts | Active (107+ TLDs) | Onchain namespace anchoring |
| UnyKorn L1 devnet | 5/5 healthy | Trade-finance settlement |
| unyKorn-wallet (Vite) | Deployed | Extend for USDF + x402 |
| unyKorn-contracts (Hardhat) | Deployed | Treasury dashboard source |
