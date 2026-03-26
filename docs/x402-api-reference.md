# FTH x402 Facilitator — API Reference (v0.2.0)

> Settlement brain for the FTH x402 payment protocol on UnyKorn L1.
> Base URL: `http://localhost:3100`

---

## Table of Contents

- [Health & Admin](#health--admin)
- [Invoices](#invoices)
- [Verification & Settlement](#verification--settlement)
- [Credit Ledger](#credit-ledger)
- [Payment Channels](#payment-channels)
- [Receipts & Batching](#receipts--batching)
- [Namespaces](#namespaces)
- [L1 Anchoring](#l1-anchoring)
- [Webhooks](#webhooks)
- [Data Types](#data-types)

---

## Health & Admin

### `GET /health`

Returns service health status.

**Response 200**
```json
{
  "status": "ok",          // "ok" | "degraded"
  "service": "fth-x402-facilitator",
  "version": "0.2.0",
  "timestamp": "2026-03-21T12:00:00.000Z",
  "uptime_seconds": 3600,
  "db": "connected"        // "connected" | "disconnected"
}
```

### `GET /admin/stats`

Aggregated system statistics.

**Response 200**
```json
{
  "timestamp": "...",
  "uptime_seconds": 3600,
  "memory": { "rss_mb": 113, "heap_mb": 20 },
  "accounts": { "total_accounts": 5, "total_balance": "34.00", "frozen_accounts": 0 },
  "invoices": { "total": 10, "pending": 2, "paid": 7, "expired": 1 },
  "receipts": { "total_receipts": 7, "total_batches": 3, "total_volume": "3.50" },
  "channels": { "total": 3, "open_channels": 1, "closed_channels": 2, "total_deposited": "9.00", "total_spent": "4.50" },
  "anchoring": { "total_batches": 3, "anchored": 1, "pending_anchor": 2 }
}
```

### `GET /admin/activity`

Recent payment activity (last 20 receipts).

**Response 200**
```json
{
  "activity": [
    {
      "receipt_id": "rcpt_...",
      "invoice_id": "inv_...",
      "payer": "uny1_...",
      "amount": "0.50",
      "asset": "USDF",
      "proof_type": "prepaid_credit",
      "rail": "unykorn-l1",
      "created_at": "...",
      "resource": "/api/v1/...",
      "namespace": "fth.x402.route.genesis-repro"
    }
  ]
}
```

---

## Invoices

### `POST /invoices`

Create a new invoice (typically called by the gateway worker on 402 response).

**Request Body**
```json
{
  "resource": "/api/v1/genesis/repro-pack/alpha",
  "namespace": "fth.x402.route.genesis-repro",
  "asset": "USDF",
  "amount": "0.50",
  "receiver": "uny1_FTH_TREASURY",
  "memo": "fth:genesis:alpha",
  "policy": {
    "kyc_required": false,
    "min_pass_level": "basic",
    "rate_limit": "100/hour"
  },
  "ttl_seconds": 300
}
```

**Response 201**
```json
{
  "invoice_id": "inv_...",
  "nonce": "n_...",
  "resource": "/api/v1/genesis/repro-pack/alpha",
  "namespace": "fth.x402.route.genesis-repro",
  "asset": "USDF",
  "amount": "0.5000000",
  "receiver": "uny1_FTH_TREASURY",
  "rail": "unykorn-l1",
  "status": "pending",
  "expires_at": "2026-03-21T12:05:00.000Z"
}
```

### `GET /invoices/:id`

Look up an invoice by ID.

**Response 200** — Invoice object  
**Response 404** — `{ "error": "Invoice not found" }`

---

## Verification & Settlement

### `POST /verify`

Verify a payment proof and settle the invoice.

**Request Body**
```json
{
  "invoice_id": "inv_...",
  "nonce": "n_...",
  "proof": { ... },
  "resource": "/api/v1/...",
  "namespace": "fth.x402.route.genesis-repro"
}
```

#### Proof Types

**1. Prepaid Credit**
```json
{
  "proof_type": "prepaid_credit",
  "credit_id": "uny1_...",
  "payer": "uny1_...",
  "signature": "<base64 Ed25519 sig of 'invoice_id|nonce'>",
  "invoice_id": "inv_...",
  "nonce": "n_..."
}
```

**2. Channel Spend**
```json
{
  "proof_type": "channel_spend",
  "channel_id": "chan_...",
  "sequence": 1,
  "payer": "uny1_...",
  "signature": "<base64 Ed25519 sig of 'channel_id|sequence|invoice_id'>",
  "invoice_id": "inv_...",
  "nonce": "n_..."
}
```

**3. Signed Auth** (Stellar — Phase 2)
```json
{
  "proof_type": "signed_auth",
  "rail": "stellar",
  "auth_entry": "...",
  "payer": "G...",
  "invoice_id": "inv_..."
}
```

**4. TX Hash** (on-chain fallback)
```json
{
  "proof_type": "tx_hash",
  "rail": "unykorn-l1",
  "tx_hash": "0x...",
  "invoice_id": "inv_...",
  "nonce": "n_...",
  "payer": "uny1_...",
  "timestamp": "..."
}
```

**Response 200 (success)**
```json
{
  "verified": true,
  "receipt_id": "rcpt_..."
}
```

**Response 200 (failure)**
```json
{
  "verified": false,
  "error": "Insufficient balance",
  "error_code": "insufficient_amount"
}
```

**Error Codes**: `invoice_not_found`, `invoice_redeemed`, `invoice_expired`, `invoice_invalid`, `nonce_mismatch`, `rate_limited`, `invalid_proof`, `insufficient_amount`, `channel_sequence_invalid`, `rail_not_allowed`

---

## Credit Ledger

### `POST /credits/register`

Register a wallet and its Ed25519 public key.

```json
{
  "wallet_address": "uny1_...",
  "pubkey": "<base64 Ed25519 public key>",
  "rail": "unykorn-l1"
}
```

**Response 200**
```json
{
  "wallet_address": "uny1_...",
  "balance": "0.0000000",
  "pubkey_registered": true
}
```

### `POST /credits/deposit`

Deposit USDF into a wallet's credit account.

```json
{
  "wallet_address": "uny1_...",
  "amount": "5.00",
  "reference": "optional-ref"
}
```

**Response 200**
```json
{
  "wallet_address": "uny1_...",
  "deposited": "5.00",
  "balance": "5.0000000",
  "transaction_id": "..."
}
```

### `GET /credits/:wallet`

Get wallet balance summary.

**Response 200**
```json
{
  "wallet_address": "uny1_...",
  "balance": "4.5000000"
}
```

### `GET /credits/:wallet/account`

Full account details.

**Response 200**
```json
{
  "wallet_address": "uny1_...",
  "rail": "unykorn-l1",
  "balance_usdf": "4.5000000",
  "frozen": false,
  "kyc_level": "basic",
  "pubkey": "...",
  "created_at": "...",
  "updated_at": "..."
}
```

### `GET /credits/:wallet/transactions`

Paginated transaction history.

**Query Parameters**
| Param  | Default | Description |
|--------|---------|-------------|
| limit  | 20      | Max 100     |
| offset | 0       | Pagination  |
| type   | —       | Filter: `deposit`, `charge`, `refund`, `withdrawal` |

**Response 200**
```json
{
  "transactions": [...],
  "total": 15,
  "limit": 20,
  "offset": 0
}
```

---

## Payment Channels

### `POST /channels/open`

Open a new payment channel.

```json
{
  "wallet_address": "uny1_...",
  "deposited_amount": "3.00",
  "opened_tx_hash": "0x...",
  "namespace": "fth.x402.route.genesis-repro"
}
```

**Response 201**
```json
{
  "channel_id": "chan_...",
  "wallet_address": "uny1_...",
  "deposited_amount": "3.0000000",
  "available_amount": "3.0000000",
  "spent_amount": "0",
  "sequence": 0,
  "status": "open"
}
```

### `GET /channels/:id`

Get channel state.

**Response 200** — Full channel object  
**Response 404** — `{ "error": "Channel not found" }`

### `POST /channels/:id/close`

Close a payment channel.

```json
{
  "closed_tx_hash": "0x..."
}
```

**Response 200**
```json
{
  "channel_id": "chan_...",
  "status": "closed",
  "spent_amount": "1.5000000",
  "available_amount": "1.5000000"
}
```

---

## Receipts & Batching

### `GET /receipts`

List recent receipts.

**Query**: `?limit=20`

**Response 200**
```json
{
  "receipts": [...],
  "total": 5
}
```

### `GET /receipts/:id`

Get a specific receipt.

**Response 200** — Full receipt object  
**Response 404** — `{ "error": "Receipt not found" }`

---

## Namespaces

### `GET /namespaces`

List all namespace records.

**Response 200**
```json
{
  "namespaces": [
    {
      "namespace": "fth.x402.route.genesis-repro",
      "resolve_type": "route",
      "resolve_target": "/api/v1/genesis/repro-pack",
      "payment_config": { ... },
      "active": true
    }
  ]
}
```

### `GET /namespaces/:namespace`

Look up a specific namespace.

---

## L1 Anchoring

### `GET /l1/health`

UnyKorn L1 chain health status.

**Response 200**
```json
{
  "reachable": true,
  "chain_id": 7331,
  "block_height": 12345,
  "block_hash": "0x...",
  "latency_ms": 45,
  "synced": true
}
```

### `GET /l1/batches`

List recent receipt batches (50 most recent).

**Response 200**
```json
{
  "batches": [
    {
      "batch_id": "batch_...",
      "merkle_root": "...",
      "rail": "unykorn-l1",
      "anchor_tx_hash": null,
      "item_count": 3,
      "anchored_at": null,
      "created_at": "..."
    }
  ],
  "total": 3
}
```

### `POST /l1/anchor`

Manually trigger anchor of pending batches.

**Response 200**
```json
{
  "anchored": 2,
  "message": "Anchored 2 batch(es)"
}
```

### `GET /l1/batch/:batchId`

Get a specific batch with its receipts.

---

## Webhooks

### `POST /webhooks`

Create a webhook subscription.

```json
{
  "wallet_address": "uny1_...",
  "url": "https://example.com/webhooks/fth",
  "events": ["payment.received", "channel.closed"]
}
```

**Response 201**
```json
{
  "id": "whk_...",
  "wallet_address": "uny1_...",
  "url": "https://example.com/webhooks/fth",
  "secret": "whsec_...",
  "events": ["payment.received", "channel.closed"],
  "active": true,
  "created_at": "..."
}
```

> **Important**: The `secret` is only returned once at creation. Store it securely for HMAC verification.

### `GET /webhooks?wallet=<address>`

List webhook subscriptions for a wallet.

### `GET /webhooks/:id`

Get subscription details (secret not included).

### `PATCH /webhooks/:id`

Update subscription.

```json
{
  "url": "https://new-url.com/hook",
  "events": ["payment.received"],
  "active": false
}
```

### `DELETE /webhooks/:id`

Delete subscription and all delivery history.

### `GET /webhooks/:id/deliveries`

View delivery history. Query: `?limit=20`

### `POST /webhooks/:id/test`

Send a test webhook event.

---

### Webhook Events

| Event               | Trigger                          |
|---------------------|----------------------------------|
| `payment.received`  | Payment verified and settled     |
| `payment.batched`   | Receipt included in merkle batch |
| `channel.opened`    | Payment channel created          |
| `channel.closed`    | Payment channel closed           |
| `credit.deposited`  | Credit added to account          |
| `anchor.confirmed`  | Batch anchored on L1 chain       |

### Webhook Delivery Format

```http
POST /your/webhook/url HTTP/1.1
Content-Type: application/json
X-FTH-Signature: sha256=<hmac_hex>
X-FTH-Event: payment.received
X-FTH-Delivery: dlv_...

{
  "event": "payment.received",
  "timestamp": "2026-03-21T12:00:00.000Z",
  "data": {
    "receipt_id": "rcpt_...",
    "invoice_id": "inv_...",
    "payer": "uny1_...",
    "amount": "0.50",
    "asset": "USDF"
  }
}
```

Verify with HMAC-SHA256: `HMAC(body, secret) === signature`

---

## Data Types

### Rails
- `unykorn-l1` — UnyKorn L1 chain (primary)
- `stellar` — Stellar network (Phase 2)
- `xrpl` — XRP Ledger (Phase 3)

### Proof Types
- `prepaid_credit` — Deduct from prepaid USDF balance
- `channel_spend` — Spend from open payment channel
- `signed_auth` — Stellar soroban auth (Phase 2)
- `tx_hash` — On-chain transaction reference

### Invoice Status
`pending` → `paid` | `expired` | `cancelled`

### Channel Status
`open` → `closing` → `closed` | `disputed`

### Credit Transaction Types
`deposit` | `charge` | `refund` | `withdrawal`

### Pass Tiers (KYC Levels)
`basic` | `pro` | `institutional` | `kyc-enhanced`

---

*Generated for FTH x402 Facilitator v0.2.0*
