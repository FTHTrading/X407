# FTH x402 — Request Lifecycle

> Version: Phase D · Protocol: fth-x402/2.0

This document traces a single HTTP request from the moment it hits the
Cloudflare edge to final settlement and receipt. Use it as a reference
when debugging, auditing, or onboarding.

---

## Participants

| Actor | Role |
|-------|------|
| **Client** | Makes the HTTP request (browser, SDK, CLI) |
| **Gateway** | Cloudflare Worker at `api.fth.trading` — route gating + 402 issuance |
| **Facilitator** | Fastify at `facilitator.fth.trading:3100` — invoices, verification, settlement |
| **PostgreSQL** | Stores invoices, receipts, channels, credit accounts, rate-limit log |
| **UnyKorn L1** | Anchoring chain — batch receipt Merkle roots posted on-chain |
| **OpenMeter** | Usage metering — request counts, amounts, latency |

---

## Sequence diagram

```
Client                   Gateway (CF Worker)              Facilitator (:3100)          PostgreSQL
  │                           │                                │                          │
  │  GET /api/v1/genesis/     │                                │                          │
  │  repro-pack/alpha         │                                │                          │
  │ ─────────────────────────▶│                                │                          │
  │                           │                                │                          │
  │                           │  matchRoute("/api/v1/…")       │                          │
  │                           │  → hit: genesis-repro          │                          │
  │                           │                                │                          │
  │                           │  extractProof(request)         │                          │
  │                           │  → null (no header)            │                          │
  │                           │                                │                          │
  │                           │  POST /invoices ──────────────▶│                          │
  │                           │  {resource, namespace, asset,  │  INSERT invoices         │
  │                           │   amount, receiver, memo,      │ ────────────────────────▶│
  │                           │   policy, ttl_seconds}         │  ◀────────────────────── │
  │                           │  ◀─────────────────────────────│                          │
  │                           │  {invoice_id, nonce, expires}  │                          │
  │                           │                                │                          │
  │  ◀────────────────────── │                                │                          │
  │  HTTP 402                 │  emit metering (402, anon)     │                          │
  │  X-PAYMENT-REQUIRED: …   │                                │                          │
  │  { PaymentRequirement }   │                                │                          │
  │                           │                                │                          │
  │  *** Client constructs    │                                │                          │
  │  *** payment proof and    │                                │                          │
  │  *** retries request      │                                │                          │
  │                           │                                │                          │
  │  GET /api/v1/genesis/     │                                │                          │
  │  repro-pack/alpha         │                                │                          │
  │  X-PAYMENT-SIGNATURE: …  │                                │                          │
  │ ─────────────────────────▶│                                │                          │
  │                           │  extractProof(request)         │                          │
  │                           │  → valid proof object          │                          │
  │                           │                                │                          │
  │                           │  POST /verify ────────────────▶│                          │
  │                           │  {invoice_id, nonce, proof,    │  SELECT invoice          │
  │                           │   resource, namespace}         │ ────────────────────────▶│
  │                           │                                │  verify signature        │
  │                           │                                │  check replay / nonce    │
  │                           │                                │  INSERT receipt          │
  │                           │                                │ ────────────────────────▶│
  │                           │                                │  UPDATE invoice → settled│
  │                           │                                │ ────────────────────────▶│
  │                           │  ◀─────────────────────────────│                          │
  │                           │  {verified, receipt_id}        │                          │
  │                           │                                │                          │
  │                           │  serveResource(route, params)  │                          │
  │                           │   → R2 / origin / metadata     │                          │
  │                           │                                │                          │
  │  ◀────────────────────── │  emit metering (200, payer)    │                          │
  │  HTTP 200                 │                                │                          │
  │  X-PAYMENT-RESPONSE: …   │                                │                          │
  │  { resource body }        │                                │                          │
```

---

## Phase-by-phase detail

### Phase 1 — Route matching (Gateway)

The Worker receives the request and checks `url.pathname` against the
paid-route catalog defined in [routes.ts](packages/fth-x402-gateway/src/routes.ts).

```
matchRoute("/api/v1/genesis/repro-pack/alpha")
→ { route: genesis-repro, params: { suite: "alpha" } }
```

If no route matches → **404 Not Found** (not a paid path).

If the path is `/health` → **200** health response, no further processing.

### Phase 2 — Proof extraction (Gateway)

The gateway reads the `X-PAYMENT-SIGNATURE` header via
[proof.ts](packages/fth-x402-gateway/src/proof.ts).

| Outcome | Result |
|---------|--------|
| No header present | `null` → proceed to Phase 3 (issue 402) |
| Base64-encoded JSON | Decoded, parsed, structurally validated via `validateProofStructure()` |
| Malformed header | **400** `{ error, code: "invalid_proof" }` |

Structural validation (from `fth-x402-core`) checks:
- `proof_type` is one of: `signed_auth`, `receipt_ref`, `channel_ticket`, `credit_ref`
- Required fields present for the proof type (`payer`, `invoice_id`, `signature`, etc.)

### Phase 3 — Invoice creation (Gateway → Facilitator)

When no proof is present, the gateway calls `POST /invoices` on the facilitator
([x402.ts](packages/fth-x402-gateway/src/x402.ts)).

**Request body:**
```json
{
  "resource": "/api/v1/genesis/repro-pack/alpha",
  "namespace": "fth.x402.route.genesis-repro",
  "asset": "USDF",
  "amount": "0.50",
  "receiver": "uny1_FTH_TREASURY",
  "memo": "fth:genesis:alpha",
  "policy": { "kyc_required": false, "min_pass_level": "basic", "rate_limit": "100/hour" },
  "ttl_seconds": 300
}
```

**Facilitator actions:**
1. Generate `invoice_id` (nanoid) and `nonce` (nanoid)
2. `INSERT INTO invoices` with status `pending`, `expires_at = now() + ttl`
3. Return `{ invoice_id, nonce, expires_at }`

**Gateway builds 402 response:**
```
HTTP/1.1 402 Payment Required
Content-Type: application/json
X-PAYMENT-REQUIRED: <base64-encoded PaymentRequirement>

{
  "version": "fth-x402/2.0",
  "resource": "/api/v1/genesis/repro-pack/alpha",
  "payment": {
    "asset": "USDF",
    "amount": "0.50",
    "receiver": "uny1_FTH_TREASURY",
    "memo": "fth:genesis:alpha",
    "invoice_id": "rNbL3x9k...",
    "nonce": "pQm7Yz...",
    "expires_at": "2026-03-16T12:05:00Z",
    "accepted_rails": ["unykorn-l1", "stellar", "xrpl-mirror"],
    "accepted_proofs": ["signed_auth", "receipt_ref", "channel_ticket", "credit_ref"]
  },
  "namespace": "fth.x402.route.genesis-repro",
  "policy": { "kyc_required": false, "min_pass_level": "basic", "rate_limit": "100/hour" }
}
```

A metering event is emitted with `status_code: 402, subject: "anonymous"`.

### Phase 4 — Client constructs proof

The client reads the 402 body and constructs a payment proof. This happens
**outside** the server — in the FTH SDK, a wallet, or manually.

Example `signed_auth` proof:

```json
{
  "proof_type": "signed_auth",
  "payer": "uny1_alice_wallet",
  "invoice_id": "rNbL3x9k...",
  "nonce": "pQm7Yz...",
  "signature": "base64-ed25519-signature",
  "timestamp": "2026-03-16T12:01:30Z"
}
```

The proof is base64-encoded and sent as the `X-PAYMENT-SIGNATURE` header on
a retry of the same request.

### Phase 5 — Verification (Gateway → Facilitator)

The gateway sends the proof to `POST /verify` on the facilitator.

**Request body:**
```json
{
  "invoice_id": "rNbL3x9k...",
  "nonce": "pQm7Yz...",
  "proof": { "proof_type": "signed_auth", "payer": "...", "signature": "..." },
  "resource": "/api/v1/genesis/repro-pack/alpha",
  "namespace": "fth.x402.route.genesis-repro"
}
```

**Facilitator verification steps:**
1. Look up invoice by `invoice_id` — must exist and be `pending`
2. Check `expires_at > now()` — reject if expired
3. Check nonce matches — replay protection
4. Verify Ed25519 signature using `FTH_SIGNING_KEY`
5. Check rate-limit window for the payer + namespace
6. On success:
   - Create receipt record (`INSERT INTO receipts`)
   - Update invoice status to `settled`
   - Fire webhook events (if subscribers exist)
   - Add receipt to the next batching window

**Response:**
```json
{
  "verified": true,
  "receipt_id": "rec_abc123..."
}
```

On failure:
```json
{
  "verified": false,
  "error": "Invoice expired",
  "error_code": "invoice_expired"
}
```

### Phase 6 — Resource delivery (Gateway)

After successful verification, the gateway serves the protected resource.
Resource resolution follows a waterfall:

1. **R2 bucket** — If the route has `r2_key_pattern` and the `ASSETS` R2 binding
   is configured, fetch the object from R2.
   - `genesis/{suite}` → `genesis/alpha` → R2 object
2. **Origin proxy** — If `route.origin` is set, proxy to that URL.
3. **Metadata fallback** — Return a JSON stub confirming payment was accepted.

The response includes the receipt header:

```
HTTP/1.1 200 OK
Content-Type: application/octet-stream
X-PAYMENT-RESPONSE: <base64>

{ receipt_id, verified: true, rail: "unykorn-l1", version: "fth-x402/2.0" }
```

A metering event is emitted with the payer identity, proof type, and latency.

### Phase 7 — Background settlement

After the synchronous request completes, the facilitator continues
asynchronously:

| Process | Interval | Purpose |
|---------|----------|---------|
| **Receipt batcher** | 30s | Groups receipts into Merkle batches |
| **L1 anchoring** | 5min | Posts batch roots to UnyKorn L1 via `anchorPendingBatches()` |
| **Invoice expiry** | 60s | Marks pending invoices past `expires_at` as `expired` |
| **Webhook delivery** | 30s | Retries failed deliveries (up to 3 attempts) |
| **Rate-limit cleanup** | 60s | Prunes old rate-limit log entries |

---

## Error paths

| Condition | HTTP status | Error code | Source |
|-----------|-----------|------------|--------|
| Path not in paid catalog | 404 | — | Gateway |
| Malformed proof header | 400 | `invalid_proof` | Gateway |
| No proof provided | 402 | — (returns PaymentRequirement) | Gateway |
| Facilitator unreachable | 503 | — | Gateway |
| Invoice not found | 402 | `verification_error` | Facilitator |
| Invoice expired | 402 | `invoice_expired` | Facilitator |
| Nonce mismatch (replay) | 402 | `replay_detected` | Facilitator |
| Signature invalid | 402 | `verification_failed` | Facilitator |
| Rate limit exceeded | 429 | `rate_limited` | Facilitator |
| Proof verified but not valid | 402 | `verification_failed` | Gateway (relays facilitator) |
| R2/origin unavailable | 200 | — (metadata fallback) | Gateway |

---

## Headers reference

| Header | Direction | Description |
|--------|-----------|-------------|
| `X-PAYMENT-REQUIRED` | Response (402) | Base64-encoded `PaymentRequirement` JSON |
| `X-PAYMENT-SIGNATURE` | Request | Base64-encoded `PaymentProof` JSON |
| `X-PAYMENT-RESPONSE` | Response (200) | Base64-encoded receipt confirmation |

---

## Proof types

| Type | Use case | Required fields |
|------|----------|-----------------|
| `signed_auth` | Direct Ed25519 signature | `payer`, `invoice_id`, `nonce`, `signature`, `timestamp` |
| `receipt_ref` | Re-use a previous receipt | `payer`, `receipt_id`, `original_invoice_id` |
| `channel_ticket` | Pre-funded payment channel | `payer`, `channel_id`, `ticket_amount`, `ticket_signature`, `sequence` |
| `credit_ref` | Credit account debit | `payer`, `credit_account_id`, `amount` |

---

## Payment rails

| Rail | Settlement target | Status |
|------|------------------|--------|
| `unykorn-l1` | UnyKorn L1 chain (primary) | Active |
| `stellar` | Stellar bridge | Planned |
| `xrpl-mirror` | XRPL mirror ledger | Planned |

---

## Metering events

Two metering events per paid request lifecycle:

1. **402 hit** — `subject: "anonymous"`, `status_code: 402`, tracks demand
2. **200 success** — `subject: <payer>`, `status_code: 200`, tracks revenue

Events are emitted fire-and-forget via the OpenMeter CloudEvents API.
See [metering.ts](packages/fth-x402-gateway/src/metering.ts) for implementation.
