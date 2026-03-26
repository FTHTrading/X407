# x402 + UnyKorn — Concrete Implementation Checklist

Date: 2026-03-21
Status: Repo-specific execution checklist

## Purpose

This document turns the best-case production sequence into concrete work items for the current repository.

It is based on the live state already present in this codebase:

- gateway worker in `packages/fth-x402-gateway`
- facilitator in `packages/fth-x402-facilitator`
- explorer in `packages/fth-x402-site`
- UnyKorn L1 anchoring already working
- local/public live demo already working

---

## 1. Existing building blocks already in repo

### Gateway

Path:
- `packages/fth-x402-gateway`

Current role:
- route matching
- `402 Payment Required`
- proof forwarding to facilitator
- paid resource delivery
- browser CORS support

Important files:
- `packages/fth-x402-gateway/src/index.ts`
- `packages/fth-x402-gateway/src/routes.ts`
- `packages/fth-x402-gateway/wrangler.toml`

### Facilitator

Path:
- `packages/fth-x402-facilitator`

Current role:
- invoice issuance
- proof verification
- credit ledger
- channels
- receipt issuance
- receipt batching
- UnyKorn anchoring
- operator APIs
- webhooks

Important files:
- `packages/fth-x402-facilitator/src/index.ts`
- `packages/fth-x402-facilitator/src/routes/*.ts`
- `packages/fth-x402-facilitator/src/services/*.ts`

### Explorer

Path:
- `packages/fth-x402-site/public/explorer.html`

Current role:
- gateway/facilitator probe surface
- normal operating picture
- invoices / receipts / anchoring view
- named AI system lane map

### Chain integration

Path:
- `unykorn-l1`

Current role:
- anchor RPC support
- tx status compatibility
- latest block compatibility

---

## 2. Current database objects already available

From `db/migrations-x402`.

### Financial state tables
- `credit_accounts`
- `credit_transactions`
- `invoices`
- `payment_channels`
- `receipt_roots`
- `receipts`

### Control / platform tables
- `namespace_records`
- `rate_limit_log`
- `webhook_subscriptions`
- `webhook_deliveries`

### Key production meaning

#### `credit_accounts`
Use for:
- agent wallet account state
- frozen status
- KYC level
- default rail
- stable-value operating balance

#### `credit_transactions`
Use for:
- treasury top-ups
- usage deductions
- refunds
- audit trail for every balance change

#### `invoices`
Use for:
- every paid request
- pricing metadata
- proof linkage
- expiry and status state

#### `receipts`
Use for:
- merchantable proof of completed agent payment
- settlement trail for operators

#### `receipt_roots`
Use for:
- final anchor unit onto UnyKorn
- operator proof that batches settled

---

## 3. Current API surfaces already available

### Gateway-facing
- paid route challenge generation
- payment verification handoff
- payment response headers

### Facilitator-facing

#### Credits
- `POST /credits/register`
- `POST /credits/deposit`
- `GET /credits/:wallet`
- `GET /credits/:wallet/account`
- `GET /credits/:wallet/transactions`

#### Channels
- `POST /channels/open`
- `POST /channels/:id/close`
- `GET /channels/:id`

#### Invoices / verify / receipts
- `POST /invoices`
- `POST /verify`
- `GET /receipts/:id`

#### L1
- `GET /l1/health`
- `GET /l1/batches`
- `POST /l1/anchor`
- `GET /l1/batch/:batchId`

#### Operator
- `GET /admin/receipts`
- `GET /admin/channels`
- `GET /admin/webhooks/deliveries`
- `GET /admin/verifications/failures`
- `GET /admin/invoices`
- `GET /admin/anchoring`

#### Webhooks
- `POST /webhooks`
- `GET /webhooks`
- `GET /webhooks/:id`
- `PATCH /webhooks/:id`
- `DELETE /webhooks/:id`
- `GET /webhooks/:id/deliveries`
- `POST /webhooks/:id/test`

---

## 4. Best production architecture for this repo

## Settlement model

Recommended:
- `UNY` = settlement / treasury / anchor asset
- x402 credits = stable-value operating balance
- optional stablecoin later, not first

## Runtime topology

### Always-on services
1. `gateway`
2. `facilitator`
3. `postgres`
4. `unykorn-l1`
5. `explorer`
6. `treasury service` (new)
7. `monitoring/alerts` (new)

---

## 5. New components to add next

## A. Treasury service

### Recommended new package
- `packages/fth-x402-treasury`

### Responsibilities
- keep per-agent balances above floor
- issue top-ups into x402 credits
- optionally submit direct UnyKorn funding txs
- enforce daily / hourly spend caps
- create operator-visible refill events

### Recommended endpoints
- `POST /treasury/agents/register`
- `POST /treasury/agents/:id/fund`
- `POST /treasury/agents/:id/refill`
- `POST /treasury/policy/evaluate`
- `GET /treasury/agents`
- `GET /treasury/agents/:id`
- `GET /treasury/refills`
- `GET /treasury/exposure`
- `POST /treasury/halt`

### Recommended tables
- `treasury_agents`
- `treasury_refills`
- `treasury_policies`
- `treasury_limits`
- `treasury_halts`

### Minimum columns

#### `treasury_agents`
- `agent_id`
- `wallet_address`
- `namespace`
- `status`
- `target_balance_usdf`
- `min_balance_usdf`
- `max_daily_refill_usdf`
- `last_refill_at`
- `created_at`

#### `treasury_refills`
- `refill_id`
- `agent_id`
- `wallet_address`
- `amount_usdf`
- `funding_mode` (`credit`, `uny`, `mixed`)
- `reference`
- `anchor_tx_hash`
- `status`
- `created_at`

---

## B. Stable pricing service

### Recommended new package
- `packages/fth-x402-pricing` already exists and should become active in production policy

### Responsibilities
- define stable-value route prices
- translate route price to treasury operating units
- support route-level overrides

### Recommended config shape
- route namespace
- target price in stable units
- pricing tier
- minimum agent balance threshold
- refill amount

---

## C. Operator treasury view

### Recommended new UI additions
Add to explorer or separate operator page:
- treasury balances
- agents near empty
- refill velocity
- refill failures
- top namespaces by spend
- anchored treasury events

---

## 6. Exact env vars to standardize

## Gateway
Already present or implied:
- `FACILITATOR_URL`
- `ENVIRONMENT`
- `UNYKORN_TREASURY_ADDRESS`
- `OPENMETER_ENDPOINT`
- `OPENMETER_API_KEY`

## Facilitator
Already present:
- `DATABASE_URL`
- `PORT`
- `HOST`
- `NODE_ENV`
- `LOG_LEVEL`
- `CORS_ORIGIN`
- `FTH_SIGNING_KEY`
- `UNYKORN_RPC_URL`
- `L1_RPC_URL`
- `L1_RPC_FALLBACK_URL`
- `L1_CHAIN_ID`
- `L1_ANCHOR_WALLET`
- `L1_MODULE`

## Treasury service (new)
Add:
- `TREASURY_MASTER_WALLET`
- `TREASURY_REFILL_ENABLED`
- `TREASURY_DEFAULT_MIN_BALANCE_USDF`
- `TREASURY_DEFAULT_TARGET_BALANCE_USDF`
- `TREASURY_MAX_DAILY_REFILL_USDF`
- `TREASURY_MAX_SINGLE_REFILL_USDF`
- `TREASURY_ALLOWED_NAMESPACES`
- `TREASURY_EMERGENCY_HALT`
- `TREASURY_FUNDING_MODE`

## Explorer defaults
Add / standardize:
- `VITE_DEFAULT_GATEWAY_URL`
- `VITE_DEFAULT_FACILITATOR_URL`
- `VITE_DEFAULT_EXPLORER_URL`

---

## 7. Best implementation sequence in this repo

## Phase 1 — permanent infrastructure

### Checklist
- [ ] put gateway on stable public hostname
- [ ] put facilitator on stable public hostname
- [ ] remove dependency on quick tunnels
- [ ] ensure explorer defaults use stable public URLs
- [ ] back PostgreSQL with persistent service and backup policy
- [ ] add process supervision for facilitator
- [ ] add health checks and restart policy

### Definition of done
- explorer works without manually pasted tunnel URLs
- gateway and facilitator survive restarts
- receipts and anchors persist cleanly

---

## Phase 2 — treasury-backed agent runtime

### Checklist
- [ ] add `fth-x402-treasury` package
- [ ] add treasury tables
- [ ] implement agent registration
- [ ] implement refill policy engine
- [ ] implement refill audit log
- [ ] expose treasury operator APIs
- [ ] connect treasury funding to `credit_transactions`

### Definition of done
- agents can be auto-funded
- agent spend is policy-controlled
- all treasury flows are auditable

---

## Phase 3 — stable-value pricing

### Checklist
- [ ] standardize route pricing in stable-value units
- [ ] activate pricing service for namespaces
- [ ] show stable price + settlement rail in receipts
- [ ] add route pricing config by namespace

### Definition of done
- operator can quote predictable route prices
- agent budgets stay stable over time

---

## Phase 4 — governed `UNY` issuance

### Checklist
- [ ] define issuance authority
- [ ] define treasury mint limits
- [ ] define mint audit trail
- [ ] define refill policy boundaries
- [ ] anchor issuance-related events on UnyKorn

### Definition of done
- treasury funding source is formalized
- issuance is bounded and explainable

---

## Phase 5 — optional stablecoin later

### Checklist
- [ ] define reserve model
- [ ] define redemption model
- [ ] define mint/burn policy
- [ ] define compliance and reporting model
- [ ] only proceed after phases 1–4 are stable

### Definition of done
- production token economics can be explained externally without ambiguity

---

## 8. Exact workflow to implement for “always running like real AI commerce”

## Normal request flow
1. agent hits paid gateway route
2. gateway returns `402`
3. agent checks balance
4. treasury refills if below floor
5. agent submits proof
6. facilitator verifies
7. facilitator creates receipt
8. receipt joins batch
9. batch anchors on UnyKorn
10. operator dashboard updates

## Low-balance flow
1. facilitator or treasury detects low balance
2. treasury evaluates policy
3. if allowed, treasury creates refill event
4. refill posts credit or chain funding
5. refill logged in `credit_transactions`
6. receipt / refill event becomes operator-visible

## Failure flow
1. gateway cannot verify proof or facilitator unavailable
2. request returns appropriate failure status
3. failure recorded in operator surfaces
4. refill halt or route halt can be invoked if systemic

---

## 9. Best immediate coding tasks

### Highest-value next tasks
- [ ] create `packages/fth-x402-treasury`
- [ ] add treasury migrations
- [ ] add treasury refill worker loop
- [ ] add `/admin/treasury/*` endpoints
- [ ] add explorer treasury cards
- [ ] set stable public gateway/facilitator defaults in explorer

### Strong follow-up tasks
- [ ] add signed treasury refill records
- [ ] add namespace-level spend controls
- [ ] add operator alerts for low-balance agents
- [ ] add webhook events for refill success/failure

---

## 10. Recommended short answer for stakeholders

If asked how this becomes real and always-on:

- keep UnyKorn as settlement,
- price routes in stable-value credits,
- auto-fund agent wallets from treasury,
- anchor receipts on-chain,
- productionize infra before public token issuance.

That is the best path for this repo.
