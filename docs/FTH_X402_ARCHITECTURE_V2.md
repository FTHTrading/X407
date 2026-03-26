# FTH x402 Architecture Pack — V2
**Date:** 2026-03-21  
**Supersedes:** FTH_X402_ARCHITECTURE.md (2026-03-19 V1)  
**Scope:** x402 edge gateway + UnyKorn facilitator + multi-rail settlement  
**Stack:** Cloudflare Worker (edge) → UnyKorn Facilitator → UnyKorn L1 (primary) → Stellar (bridge) → XRPL (mirror)

---

## Executive Summary

This document defines the concrete architecture for the FTH payment protocol stack:

1. **Namespace registry** — `fth.*` hierarchical naming with rail and policy resolution
2. **x402 edge gateway** — Cloudflare Worker enforcing HTTP 402 pay-per-request
3. **UnyKorn facilitator** — server-side verification, settlement, receipt, replay lock
4. **UnyKorn L1 native settlement** — canonical USDF ledger, payment channels, receipt anchoring
5. **Stellar bridge rail** — x402-compatible auth-entry flow, `sUSDF` bridge representation
6. **XRPL mirror rail** — `xUSDF` mirror, existing issuer path, liquidity distribution
7. **Token stack** — USDF + PASS + RCPT

> **Target: working MVP in 4–6 weeks with UnyKorn L1 as the primary prepaid settlement
> rail, Cloudflare Worker as the x402 enforcement edge, Stellar as a bridge and
> auth-compatible secondary rail, and XRPL as mirror / distribution rail.**

### V1 → V2 delta

| V1 | V2 |
|----|-----|
| Stellar primary settlement | **UnyKorn L1 primary settlement** |
| XRPL mirror | XRPL mirror (unchanged) |
| UnyKorn L1 "future" sovereign | **UnyKorn L1 canonical ledger of truth** |
| Gateway contains all logic | **Gateway is thin edge; Facilitator owns settlement** |
| No Cloudflare Worker | **Cloudflare Worker = x402 enforcement edge** |
| USDF issued on Stellar | **USDF canonical on L1; sUSDF on Stellar; xUSDF on XRPL** |
| No channel model | **Prepaid payment channels as primary commercial path** |
| Receipts per request | **Offchain receipts + periodic Merkle root anchoring** |

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
│               │  • intercept 402         │                          │
│               │  • resolve namespaces    │                          │
│               │  • sign channel spends   │                          │
│               │  • auto-retry with proof │                          │
│               └────────────┬─────────────┘                          │
└────────────────────────────┼────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   x402 EDGE GATEWAY (Cloudflare Worker)             │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  • Route matching          • 402 response generation         │   │
│  │  • Payment header parsing  • Rate limiting (per wallet)      │   │
│  │  • Proof forwarding        • R2 / origin fetch on success    │   │
│  └──────────────────────────────┬───────────────────────────────┘   │
└─────────────────────────────────┼───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     UNYKORN FACILITATOR                              │
│                                                                     │
│  ┌──────────┐  ┌─────────────┐  ┌────────────────────────────────┐ │
│  │ Invoice  │  │  Payment    │  │  Namespace                     │ │
│  │ Service  │  │  Verifier   │  │  Resolver                      │ │
│  └──────────┘  └─────────────┘  └────────────────────────────────┘ │
│  ┌──────────┐  ┌─────────────┐  ┌────────────────────────────────┐ │
│  │ Channel  │  │  Receipt    │  │  Policy                        │ │
│  │ Manager  │  │  Batcher    │  │  Engine (KYC/AML/RBAC)         │ │
│  └──────────┘  └─────────────┘  └────────────────────────────────┘ │
│  ┌──────────┐  ┌─────────────┐  ┌────────────────────────────────┐ │
│  │ Replay   │  │  Credit     │  │  Rail Adapters                 │ │
│  │ Guard    │  │  Ledger     │  │  (UnyKorn / Stellar / XRPL)   │ │
│  └──────────┘  └─────────────┘  └────────────────────────────────┘ │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                    ┌─────────────┼──────────────┐
                    ▼             ▼              ▼
┌────────────────────┐ ┌──────────────┐ ┌────────────────┐
│  UNYKORN L1        │ │   STELLAR    │ │   XRPL         │
│  (primary rail)    │ │   (bridge)   │ │   (mirror)     │
│                    │ │              │ │                │
│  canonical USDF    │ │  sUSDF bridge│ │  xUSDF IOU     │
│  payment channels  │ │  Soroban auth│ │  trustlines    │
│  receipt anchoring │ │  x402 compat │ │  DEX path      │
│  trade-finance mod │ │  liquidity   │ │  distribution  │
│  compliance engine │ │  interop     │ │                │
└────────────────────┘ └──────────────┘ └────────────────┘
```

### Component roles

| Component | Responsibility | Does NOT own |
|-----------|---------------|--------------|
| **Cloudflare Worker** | HTTP 402 enforcement, route matching, proof header parsing, R2 file delivery | Settlement logic, verification, state |
| **UnyKorn Facilitator** | Proof verification, replay protection, invoice management, channel state, receipt creation, batch anchoring | HTTP routing, file serving, edge caching |
| **UnyKorn L1** | Canonical USDF ledger, payment channel finality, receipt root storage, trade-finance modules | HTTP protocol, client interaction |
| **Stellar** | Bridge rail, Soroban auth-entry x402 compatibility, sUSDF liquidity | Primary settlement, canonical supply |
| **XRPL** | Mirror rail, xUSDF distribution, existing IOU infrastructure | Settlement authority |

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
├── x402                     # x402 protocol namespace
│   ├── route                # route catalog
│   ├── price                # pricing definitions
│   ├── receipt              # receipt lookup
│   ├── entitlement          # access entitlements
│   └── facilitator          # facilitator endpoints
├── rail                     # settlement rail namespace
│   ├── unykorn              # L1 rail config
│   ├── stellar              # Stellar bridge config
│   └── xrpl                 # XRPL mirror config
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
│   │   ├── channel          # payment channel state
│   │   └── policy           # client-specific rules
└── node                     # L1 node namespace
    ├── alpha
    ├── bravo
    ├── charlie
    ├── delta
    └── echo
```

### Registry Record Schema

```typescript
interface NamespaceRecord {
  // Identity
  fqn: string;              // "fth.usdf.pay"
  owner: string;            // wallet address or org ID
  created_at: string;       // ISO 8601
  updated_at: string;

  // Resolution
  resolve_to: {
    type: "address" | "endpoint" | "asset" | "policy" | "config";
    network?: "unykorn-l1" | "stellar" | "xrpl" | "polygon";
    value: string;
  };

  // Access
  visibility: "public" | "private" | "permissioned";
  acl?: string[];

  // Payment
  payment_required?: boolean;
  payment_config?: {
    asset: string;                     // "USDF"
    amount_per_request?: string;
    receiver: string;                  // settlement address
    credit_model?: "per-request" | "prepaid" | "session";
    primary_rail?: "unykorn-l1" | "stellar" | "xrpl";
    settlement_mode?: "prepaid_channel" | "signed_auth" | "tx_hash";
    receipt_mode?: "offchain" | "anchored" | "onchain";
    entitlement_ttl_seconds?: number;
    batch_policy?: {
      enabled: boolean;
      max_items?: number;
      max_delay_ms?: number;
    };
  };

  // Integrity
  onchain_anchor?: {
    network: string;
    tx_hash: string;
    block: number;
  };
  metadata_hash?: string;
}
```

### Example Records

```json
[
  {
    "fqn": "fth.usdf",
    "owner": "uny1...FTH_TREASURY",
    "resolve_to": {
      "type": "asset",
      "network": "unykorn-l1",
      "value": "USDF"
    },
    "visibility": "public",
    "payment_required": false
  },
  {
    "fqn": "fth.x402.route.genesis-repro",
    "owner": "fth-ops",
    "resolve_to": {
      "type": "endpoint",
      "value": "https://api.fth.trading/v1/genesis/repro-pack"
    },
    "visibility": "permissioned",
    "payment_required": true,
    "payment_config": {
      "asset": "USDF",
      "amount_per_request": "0.50",
      "receiver": "uny1...FTH_TREASURY",
      "credit_model": "prepaid",
      "primary_rail": "unykorn-l1",
      "settlement_mode": "prepaid_channel",
      "receipt_mode": "anchored",
      "batch_policy": {
        "enabled": true,
        "max_items": 100,
        "max_delay_ms": 30000
      }
    }
  },
  {
    "fqn": "fth.client.acme.wallet",
    "owner": "acme-corp",
    "resolve_to": {
      "type": "address",
      "network": "unykorn-l1",
      "value": "uny1...ACME_WALLET"
    },
    "visibility": "private",
    "acl": ["fth-ops", "acme-admin"]
  }
]
```

---

## Part 3 — Token Model

### Settlement hierarchy

| Asset | Role | Canonical rail | Relationship |
|-------|------|---------------|-------------|
| `USDF` | Canonical settlement unit | **UnyKorn L1** | Source of truth |
| `sUSDF` | Stellar bridge representation | Stellar | Derived from L1 supply |
| `xUSDF` | XRPL mirror representation | XRPL | Derived from L1 supply |

**Rule:** Stellar and XRPL supplies are derived representations of UnyKorn treasury
state, not independent truth. Total `sUSDF` + `xUSDF` outstanding must never exceed
bridged reserves locked on L1.

### USDF — Canonical Stablecoin

```
┌──────────────────────────────────────────────┐
│                    USDF                       │
│                                              │
│  Type:     Payment stablecoin                │
│  Peg:      1 USDF = 1 USD                   │
│  Model:    Internal settlement (Model C)     │
│            → Fully reserved (Model A) later  │
│                                              │
│  Canonical: UnyKorn L1 treasury module       │
│  Supply:   Mint on deposit, burn on redeem   │
│  Controls: freeze, unfreeze, clawback        │
│  Policy:   allowlist required for holding    │
│  Audit:    reserve proof published quarterly │
│                                              │
│  Rails:                                      │
│    Primary:  UnyKorn L1 (canonical USDF)     │
│    Bridge:   Stellar (sUSDF via bridge)      │
│    Mirror:   XRPL (xUSDF via master-issuer)  │
└──────────────────────────────────────────────┘
```

### UnyKorn L1 Treasury Operations

| Operation | Description | Access |
|-----------|-------------|--------|
| `mint(wallet, amount)` | Issue canonical USDF | Treasury admin only |
| `burn(wallet, amount)` | Destroy USDF (redemption) | Treasury admin only |
| `freeze(wallet)` | Lock USDF in wallet | Compliance officer |
| `unfreeze(wallet)` | Unlock frozen wallet | Compliance officer |
| `clawback(wallet, amount)` | Force recall (regulatory) | Legal + 2-of-3 multisig |
| `allowlist_add(wallet)` | Approve wallet to hold | KYC service |
| `allowlist_remove(wallet)` | Revoke holding permission | Compliance officer |
| `open_channel(wallet, amount)` | Create prepaid channel | Any allowed wallet |
| `close_channel(channel_id)` | Settle and close channel | Channel owner or timeout |

### Bridge representations

| Token | Underlying | Rail | Model |
|-------|-----------|------|-------|
| `sUSDF` | USDF locked on L1 | Stellar | Bridge-issued, Soroban-auth compatible |
| `xUSDF` | USDF locked on L1 | XRPL | Mirror-issued via master-issuer |

### Wrapped Assets (Phase 4)

| Token | Underlying | Rail | Model |
|-------|-----------|------|-------|
| `wXAU` | Gold spot | UnyKorn L1 → Stellar | Oracle-fed price, reserve-backed |
| `wUSTB` | US Treasury Bills | UnyKorn L1 | Reserve-backed, quarterly NAV |
| `wBOND` | Corporate bonds | UnyKorn L1 | Per-issuance, SPV-linked |
| `wINV` | Trade invoices | UnyKorn L1 | Trade-finance module native |

### Access / Utility Tokens

| Token | Purpose | Model |
|-------|---------|-------|
| `PASS` | Access entitlement — proves wallet is authorized for API | Non-transferable, scoped tiers |
| `RCPT` | Payment receipt proof — batch-anchored Merkle roots | Offchain per-request, onchain periodic |
| `UNY` | Governance — existing token (Avalanche + XRPL mirror) | Already deployed |

### PASS tiers

| Tier | Access level |
|------|-------------|
| `pass:basic` | Standard API access |
| `pass:pro` | Higher rate limits, priority routes |
| `pass:institutional` | Enterprise SLAs, dedicated channels |
| `pass:kyc-enhanced` | Regulated endpoints, compliance-cleared |

### RCPT strategy

**Do not mint one onchain receipt per request.**

| Layer | Behavior |
|-------|---------|
| Per-request | Offchain receipt object (JSON, signed by facilitator) |
| Periodic | Merkle root of receipt batch anchored to UnyKorn L1 |
| On-demand | Individual receipt inclusion proof via Merkle path |

---

## Part 4 — x402 HTTP Protocol Specification

### Overview

The FTH x402 protocol enables HTTP-native pay-per-request. A Cloudflare Worker
intercepts requests to paid routes, returns `402 Payment Required` with
machine-readable payment instructions, and forwards proof to the UnyKorn
Facilitator for verification. On success, the Worker releases the protected
resource from R2 or origin.

### x402 V2 header standard

| Header | Direction | Purpose |
|--------|-----------|---------|
| `X-PAYMENT-REQUIRED` | Server → Client | Payment instructions (in 402 response) |
| `X-PAYMENT-SIGNATURE` | Client → Server | Payment proof on retry |
| `X-PAYMENT-RESPONSE` | Server → Client | Settlement confirmation (in 200 response) |

### Flow Diagram

```
Client                    CF Worker                 Facilitator             UnyKorn L1
  │                          │                          │                      │
  │  GET /api/v1/resource    │                          │                      │
  ├─────────────────────────►│                          │                      │
  │                          │  check route policy      │                      │
  │  402 Payment Required    │                          │                      │
  │  X-PAYMENT-REQUIRED:{..} │                          │                      │
  │◄─────────────────────────┤                          │                      │
  │                          │                          │                      │
  │  [SDK auto-pay from      │                          │                      │
  │   prepaid channel]       │                          │                      │
  │                          │                          │                      │
  │  GET /api/v1/resource    │                          │                      │
  │  X-PAYMENT-SIGNATURE:{..}│                          │                      │
  ├─────────────────────────►│                          │                      │
  │                          │  POST /verify            │                      │
  │                          ├─────────────────────────►│                      │
  │                          │                          │  check channel seq   │
  │                          │                          │  check replay guard  │
  │                          │                          │  deduct balance      │
  │                          │  { verified: true }      │                      │
  │                          │◄─────────────────────────┤                      │
  │                          │                          │  queue receipt       │
  │                          │  fetch R2 / origin       │                      │
  │  200 OK + resource       │                          │                      │
  │  X-PAYMENT-RESPONSE:{..} │                          │                      │
  │◄─────────────────────────┤                          │                      │
  │                          │                          │                      │
  │                          │                          │  [batch anchor]      │
  │                          │                          ├─────────────────────►│
  │                          │                          │  Merkle root stored  │
  │                          │                          │◄─────────────────────┤
```

### 402 Response Format

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
X-PAYMENT-REQUIRED: <base64-encoded payment instructions>

{
  "version": "fth-x402/2.0",
  "resource": "/api/v1/genesis/repro-pack/alpha",
  "payment": {
    "asset": "USDF",
    "amount": "0.50",
    "receiver": "uny1...FTH_TREASURY",
    "memo": "fth:genesis:alpha",
    "invoice_id": "inv_abc123def456",
    "nonce": "n_7f3a2b1c",
    "expires_at": "2026-03-21T12:05:00Z",
    "accepted_rails": ["unykorn-l1", "stellar", "xrpl"],
    "accepted_proofs": ["prepaid_credit", "channel_spend", "signed_auth", "tx_hash"]
  },
  "namespace": "fth.x402.route.genesis-repro",
  "policy": {
    "kyc_required": false,
    "min_pass_level": "basic",
    "rate_limit": "100/hour"
  }
}
```

### Payment proof types (priority order)

#### 1. `prepaid_credit` — primary for UnyKorn

```json
{
  "proof_type": "prepaid_credit",
  "credit_id": "cred_xyz789",
  "payer": "uny1...CLIENT",
  "signature": "ed25519_sig_of_invoice_id_and_nonce",
  "invoice_id": "inv_abc123def456",
  "nonce": "n_7f3a2b1c"
}
```

#### 2. `channel_spend` — prepaid channel on UnyKorn L1

```json
{
  "proof_type": "channel_spend",
  "channel_id": "chan_123",
  "sequence": 91,
  "payer": "uny1...CLIENT",
  "signature": "ed25519_sig_of_channel_sequence_invoice",
  "invoice_id": "inv_abc123def456",
  "nonce": "n_7f3a2b1c"
}
```

#### 3. `signed_auth` — Stellar secondary rail

```json
{
  "proof_type": "signed_auth",
  "rail": "stellar",
  "auth_entry": "base64_encoded_soroban_auth...",
  "payer": "GBCX...CLIENT_WALLET",
  "invoice_id": "inv_abc123def456"
}
```

#### 4. `tx_hash` — fallback only

```json
{
  "proof_type": "tx_hash",
  "rail": "unykorn-l1",
  "tx_hash": "abc123...def456",
  "invoice_id": "inv_abc123def456",
  "nonce": "n_7f3a2b1c",
  "payer": "uny1...CLIENT",
  "timestamp": "2026-03-21T12:04:55Z"
}
```

### Verification Rules

The facilitator MUST verify ALL applicable checks before returning verified:

| Check | Required | Notes |
|-------|----------|-------|
| Asset matches `USDF` / `sUSDF` / `xUSDF` | YES | |
| Amount >= requested amount | YES | |
| Receiver matches treasury address | YES | |
| Nonce matches issued nonce | YES | |
| Invoice not expired | YES | |
| Invoice not already redeemed | YES | Replay guard |
| Rail matches namespace allowed list | YES | |
| Route policy version matches | YES | Prevent stale pricing |
| Receipt not previously consumed | YES | Idempotency |
| Channel sequence monotonic | YES | For `channel_spend` |
| Entitlement still valid | YES | For session model |
| Payer class satisfies route policy | YES | PASS tier check |
| Transaction finality confirmed | YES | For `tx_hash` only |
| Payer passes KYC policy (if required) | YES | |

### Settlement model

| Concept | Behavior |
|---------|---------|
| **Semantic settlement** | Facilitator accepts proof, issues receipt immediately. Worker releases resource. |
| **Final chain settlement** | Facilitator batches receipts, anchors Merkle root to L1 later. |
| **Latency** | Semantic: <50ms. Final: batch interval (default 30s). |

### Error Codes

| HTTP | Code | Meaning |
|------|------|---------|
| 402 | `payment_required` | No payment proof attached |
| 402 | `insufficient_amount` | Amount too low |
| 402 | `wrong_asset` | Not USDF/sUSDF/xUSDF |
| 402 | `invoice_expired` | Past `expires_at` |
| 402 | `invoice_redeemed` | Already used |
| 402 | `nonce_mismatch` | Replay attempt |
| 402 | `channel_sequence_invalid` | Non-monotonic sequence |
| 402 | `rail_not_allowed` | Rail not in namespace policy |
| 403 | `kyc_required` | Wallet not KYC'd |
| 403 | `pass_required` | No valid PASS token |
| 403 | `pass_insufficient` | PASS tier too low for route |
| 503 | `settlement_pending` | Network finality not yet reached |

---

## Part 5 — Stablecoin Mint/Burn Design

### Canonical treasury (UnyKorn L1)

```
┌──────────────┐     deposit      ┌──────────────┐     mint       ┌──────────────┐
│  Client Bank │ ────────────────►│  FTH Treasury│ ──────────────►│  UnyKorn L1  │
│  Account     │     (USD wire)   │  (custodial) │   USDF issued  │  (canonical) │
└──────────────┘                  └──────────────┘                └──────────────┘

┌──────────────┐     withdrawal   ┌──────────────┐     burn       ┌──────────────┐
│  Client Bank │ ◄────────────────│  FTH Treasury│ ◄──────────────│  UnyKorn L1  │
│  Account     │     (USD wire)   │  (custodial) │   USDF burned  │  (canonical) │
└──────────────┘                  └──────────────┘                └──────────────┘
```

### Bridge issuers (derived supply)

```
UnyKorn L1 (canonical USDF)
    │
    ├──► Bridge lock ──► Stellar issuer mints sUSDF
    │                    (supply = locked USDF on L1)
    │
    └──► Bridge lock ──► XRPL master-issuer mints xUSDF
                         (supply = locked USDF on L1)
```

**Rule:** `sUSDF_supply + xUSDF_supply <= bridge_locked_USDF_on_L1`

### Stellar bridge parameters

| Parameter | Value |
|-----------|-------|
| Asset code | `sUSDF` |
| Issuer account | New Stellar keypair (FTH bridge) |
| Auth required | `true` |
| Auth revocable | `true` |
| Auth clawback | `true` |
| Home domain | `usdf.fth.trading` |
| TOML | `https://usdf.fth.trading/.well-known/stellar.toml` |

### XRPL mirror parameters

| Parameter | Value |
|-----------|-------|
| Currency code | `xUSDF` |
| Issuer | `rE85pdv...Z1Dqm` (existing master-issuer) |
| Require auth | `true` |
| Freeze | enabled |
| Supply management | Mirror of L1 bridge-locked supply |

---

## Part 6 — Credit Ledger Design

### Schema

```sql
-- credit_accounts
CREATE TABLE credit_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  TEXT NOT NULL UNIQUE,
  rail            TEXT NOT NULL DEFAULT 'unykorn-l1',
  namespace       TEXT,
  balance_usdf    DECIMAL(20,7) NOT NULL DEFAULT 0,
  frozen          BOOLEAN NOT NULL DEFAULT false,
  kyc_level       TEXT DEFAULT 'none',
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
  reference       TEXT,
  rail            TEXT,
  tx_hash         TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- invoices
CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      TEXT NOT NULL UNIQUE,
  nonce           TEXT NOT NULL UNIQUE,
  resource        TEXT NOT NULL,
  namespace       TEXT,
  asset           TEXT NOT NULL DEFAULT 'USDF',
  amount          DECIMAL(20,7) NOT NULL,
  receiver        TEXT NOT NULL,
  rail            TEXT NOT NULL DEFAULT 'unykorn-l1',
  status          TEXT NOT NULL DEFAULT 'pending',
  policy_version  TEXT,
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

-- payment_channels
CREATE TABLE payment_channels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      TEXT NOT NULL UNIQUE,
  wallet_address  TEXT NOT NULL,
  namespace       TEXT,
  rail            TEXT NOT NULL DEFAULT 'unykorn-l1',
  asset           TEXT NOT NULL DEFAULT 'USDF',
  deposited_amount DECIMAL(20,7) NOT NULL,
  available_amount DECIMAL(20,7) NOT NULL,
  spent_amount    DECIMAL(20,7) NOT NULL DEFAULT 0,
  sequence        BIGINT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'open',
  opened_tx_hash  TEXT,
  closed_tx_hash  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- receipt_roots
CREATE TABLE receipt_roots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        TEXT NOT NULL UNIQUE,
  merkle_root     TEXT NOT NULL,
  rail            TEXT NOT NULL DEFAULT 'unykorn-l1',
  anchor_tx_hash  TEXT,
  item_count      INT NOT NULL,
  anchored_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- receipts (offchain, indexed for lookup)
CREATE TABLE receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id      TEXT NOT NULL UNIQUE,
  invoice_id      TEXT NOT NULL REFERENCES invoices(invoice_id),
  channel_id      TEXT,
  payer           TEXT NOT NULL,
  amount          DECIMAL(20,7) NOT NULL,
  asset           TEXT NOT NULL DEFAULT 'USDF',
  rail            TEXT NOT NULL,
  proof_type      TEXT NOT NULL,
  batch_id        TEXT,
  merkle_index    INT,
  facilitator_sig TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Part 7 — MVP Repo Structure

```
unyKorn-master/
├── packages/
│   ├── fth-x402-gateway/          # Cloudflare Worker edge proxy
│   │   ├── src/
│   │   │   ├── index.ts           # Worker entry
│   │   │   ├── routes.ts          # Route matching
│   │   │   ├── x402.ts            # 402 response builder
│   │   │   ├── proof.ts           # Payment header parsing
│   │   │   └── types.ts           # Protocol types
│   │   ├── wrangler.toml
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── fth-x402-facilitator/      # Settlement + verify brain
│   │   ├── src/
│   │   │   ├── index.ts           # Fastify entry
│   │   │   ├── services/
│   │   │   │   ├── verify.ts      # Payment proof verification
│   │   │   │   ├── settle.ts      # Channel + credit settlement
│   │   │   │   ├── invoices.ts    # Invoice creation + lookup
│   │   │   │   ├── receipts.ts    # Receipt creation + batching
│   │   │   │   ├── replay.ts      # Replay guard (nonce + idempotency)
│   │   │   │   ├── channels.ts    # Payment channel management
│   │   │   │   ├── namespace.ts   # Namespace resolver
│   │   │   │   └── policy.ts      # Route policy engine
│   │   │   ├── adapters/
│   │   │   │   ├── unykorn.ts     # UnyKorn L1 RPC client
│   │   │   │   ├── stellar.ts     # Stellar SDK integration
│   │   │   │   └── xrpl.ts        # XRPL SDK integration
│   │   │   ├── routes/
│   │   │   │   ├── health.ts
│   │   │   │   ├── verify.ts
│   │   │   │   ├── invoices.ts
│   │   │   │   ├── channels.ts
│   │   │   │   ├── credits.ts
│   │   │   │   ├── receipts.ts
│   │   │   │   ├── namespaces.ts
│   │   │   │   └── admin.ts
│   │   │   ├── db.ts              # PostgreSQL connection
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── fth-x402-sdk/              # Client SDK (JS/TS)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── client.ts          # FTHClient class
│   │   │   ├── wallet.ts          # Wallet signing
│   │   │   ├── x402.ts            # Auto-pay 402 interceptor
│   │   │   ├── channels.ts        # Channel spend signing
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── fth-x402-pricing/          # Route pricing + entitlements
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── routes.ts          # Route price catalog
│   │   │   ├── policies.ts        # Route policy definitions
│   │   │   └── entitlements.ts    # PASS tier logic
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── unyKorn-contracts/         # [existing]
│   ├── unyKorn-wallet/            # [existing]
│   └── exports/                   # [existing]
│
├── db/
│   └── migrations-x402/
│       ├── 001_credit_accounts.sql
│       ├── 002_credit_transactions.sql
│       ├── 003_invoices.sql
│       ├── 004_namespace_records.sql
│       ├── 005_payment_channels.sql
│       ├── 006_receipt_roots.sql
│       └── 007_receipts.sql
│
├── config/
│   ├── namespace-seed.json
│   └── stellar.toml
│
├── registry/                      # [existing]
├── scripts/                       # [existing]
├── aws/                           # [existing]
├── ops/                           # [existing]
├── docs/                          # [existing + this file]
├── design-system/                 # [existing]
├── exports/                       # [existing]
└── package.json                   # [updated monorepo root]
```

---

## Part 8 — Implementation Phases

### Phase 1 — UnyKorn-first x402 core (Week 1–2)

**Deliverables:**
- [ ] Cloudflare Worker x402 gate (route match, 402 response, proof forwarding)
- [ ] Namespace resolver (PostgreSQL + REST API)
- [ ] Seed `fth.*` namespace records
- [ ] Invoice service (create, lookup, expire)
- [ ] Facilitator skeleton (verify endpoint, replay guard)
- [ ] UnyKorn payment channel model (open, spend, close)
- [ ] Prepaid credit primary flow (deposit, charge, refund)
- [ ] Credit ledger (PostgreSQL)
- [ ] One paid route live: `/api/genesis/repro-pack/:suite`
- [ ] Minimal SDK: intercept 402, retry with proof
- [ ] Receipt generation (offchain)

**Tech:**
- Gateway: Cloudflare Worker (TypeScript)
- Facilitator: Node.js + Fastify
- DB: PostgreSQL 16
- Auth: Ed25519 wallet signatures
- L1 RPC: `rpc.l1.unykorn.org`

### Phase 2 — Stellar bridge support (Week 3–4)

**Deliverables:**
- [ ] Stellar `signed_auth` verification in facilitator
- [ ] Stellar `sUSDF` bridge issuer account (testnet first)
- [ ] `stellar.toml` hosted
- [ ] SDK retry logic (multi-rail fallback)
- [ ] Route pricing console
- [ ] Receipt root batch anchoring to L1
- [ ] Operator dashboard v1 (balances, invoices, receipts)

**Tech:**
- Stellar SDK: `@stellar/stellar-sdk`
- Dashboard: Vite + React (extend existing unyKorn-wallet pattern)

### Phase 3 — XRPL mirror + operator controls (Week 5–6)

**Deliverables:**
- [ ] XRPL `xUSDF` mirror via existing master-issuer
- [ ] XRPL payment verification in facilitator
- [ ] Reserve / supply reconciliation (L1 ↔ Stellar ↔ XRPL)
- [ ] PASS issuance (basic, pro, institutional, kyc-enhanced)
- [ ] RCPT receipt root explorer
- [ ] Full operator dashboard (namespaces, channels, policies)
- [ ] Rate limiting per wallet/namespace

**Tech:**
- XRPL: `xrpl` npm package
- Dashboard: extend Phase 2 dashboard

### Phase 4 — Wrapped assets + trade-finance (Week 7–8)

**Deliverables:**
- [ ] wXAU, wUSTB asset definitions on L1
- [ ] Oracle price feed integration
- [ ] UnyKorn trade-finance settlement hooks
- [ ] Policy-bound routes (institutional entitlements)
- [ ] Bridge service: L1 ↔ Stellar
- [ ] Audit export (CSV/JSON)

---

## Part 9 — Key Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary settlement | **UnyKorn L1** | Sovereign control, canonical USDF ledger, direct policy integration |
| Bridge rail | **Stellar** | x402-compatible auth-entry flow, Soroban signing, external interoperability |
| Mirror rail | **XRPL** | Existing master-issuer + IOUs, DEX liquidity path |
| Edge gateway | **Cloudflare Worker** | x402 docs built around Worker-gated resources, edge performance |
| Settlement brain | **UnyKorn Facilitator** | Separation of concerns: gateway is thin, facilitator owns all verification |
| USDF canonical rail | **UnyKorn L1** | Single source of truth; Stellar/XRPL are derived representations |
| Token naming | `USDF` / `sUSDF` / `xUSDF` | Clear provenance per rail |
| Primary proof type | `prepaid_credit` / `channel_spend` | Best agent UX, fastest API flow, uses own L1 |
| Receipt strategy | Offchain + batch Merkle root | Avoids per-request chain writes; senior-engineered path |
| Namespace storage | PostgreSQL (offchain) | Speed, admin control, onchain anchor later |
| Auth model | Ed25519 wallet signatures | Works across UnyKorn, Stellar, and XRPL |
| API framework | Fastify | Performance, TypeScript native, plugin ecosystem |
| Database | PostgreSQL 16 | JSON support, row-level security, battle-tested |

---

## Appendix A — First Live Route

### Route: `/api/genesis/repro-pack/:suite`

This is the first paid endpoint that proves the full x402 stack.

### Flow

1. Namespace resolves `fth.x402.route.genesis-repro`
2. Worker returns 402 with invoice
3. Client retries with `prepaid_credit` or `channel_spend`
4. Facilitator verifies proof, deducts balance, issues receipt
5. Worker releases file from R2
6. Facilitator records offchain receipt
7. Batch root anchors receipt Merkle tree to UnyKorn L1 later

### Configuration

```json
{
  "fqn": "fth.x402.route.genesis-repro",
  "payment_config": {
    "asset": "USDF",
    "amount_per_request": "0.50",
    "primary_rail": "unykorn-l1",
    "settlement_mode": "prepaid_channel",
    "receipt_mode": "anchored",
    "batch_policy": { "enabled": true, "max_items": 100, "max_delay_ms": 30000 }
  }
}
```

---

## Appendix B — Existing Assets to Bridge

From the current UnyKorn registry:

| Asset | Current Location | Bridge Target |
|-------|-----------------|---------------|
| `UNY` | Avalanche C-Chain + XRPL IOU | UnyKorn L1 native governance |
| `USDT` (XRPL) | XRPL master-issuer, 39.7M | Reference for USDF pricing |
| TLD NFTs | Polygon (107+ soulbound) | Namespace proof-of-ownership |
| DTT, VAULTUSD, GOLDC | XRPL IOUs | Wrapped asset candidates |

### Existing Infrastructure (reuse plan)

| Component | Status | Reuse |
|-----------|--------|-------|
| XRPL master-issuer | Active | Issue `xUSDF` IOU directly |
| Polygon GlacierMint contracts | Active (107+ TLDs) | Onchain namespace anchoring |
| UnyKorn L1 devnet | 5/5 healthy | **Primary settlement rail** |
| unyKorn-wallet (Vite) | Deployed | Extend for dashboard |
| unyKorn-contracts (Hardhat) | Deployed | Treasury tools |
| Cloudflare account | Active | Worker + R2 deployment |
