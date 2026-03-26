# x402 Treasury Phase 2 Repo Plan

Date: 2026-03-21
Status: Initial implementation landed

## What is now in repo

### New package
- `packages/fth-x402-treasury`

### New migrations
- `db/migrations-x402/010_treasury_agents.sql`
- `db/migrations-x402/011_treasury_refills.sql`
- `db/migrations-x402/012_treasury_policies.sql`
- `db/migrations-x402/013_treasury_limits.sql`
- `db/migrations-x402/014_treasury_halts.sql`

### New root scripts
- `npm run x402:treasury`
- `npm run x402:build:treasury`

## Implemented API surface

### Health
- `GET /health`
- `GET /`

### Treasury
- `POST /treasury/agents/register`
- `GET /treasury/agents`
- `GET /treasury/agents/:id`
- `POST /treasury/agents/:id/fund`
- `POST /treasury/agents/:id/refill`
- `POST /treasury/policy/evaluate`
- `GET /treasury/refills`
- `GET /treasury/exposure`
- `GET /treasury/status`
- `POST /treasury/halt`

## What works now

- treasury agent registration backed by `credit_accounts`
- treasury refill audit trail in `treasury_refills`
- direct treasury-funded credit deposits into `credit_transactions`
- refill policy evaluation using:
  - current balance
  - min balance
  - target balance
  - max single refill
  - max daily refill
- emergency halt records by:
  - `global`
  - `namespace`
  - `agent`
- optional automatic refill worker controlled by env

## Required next wiring

### 1. Run migrations
Apply the new `010`–`014` treasury migrations to the x402 database.

### 2. Add env vars
Add and standardize:
- `TREASURY_PORT`
- `TREASURY_HOST`
- `TREASURY_REFILL_ENABLED`
- `TREASURY_REFILL_INTERVAL_MS`
- `TREASURY_DEFAULT_MIN_BALANCE_USDF`
- `TREASURY_DEFAULT_TARGET_BALANCE_USDF`
- `TREASURY_MAX_SINGLE_REFILL_USDF`
- `TREASURY_MAX_DAILY_REFILL_USDF`
- `TREASURY_FUNDING_MODE`

### 3. Integrate operator surface
Add treasury cards to the explorer or operator page for:
- low-balance agents
- refill volume
- active halts
- refill history
- total treasury exposure

### 4. Join treasury to facilitator events
Recommended next join points:
- call treasury evaluation after successful `charge`
- emit webhook events for refill success/failure
- show treasury state in facilitator `/admin/*`

### 5. Add permanent hosting
Run treasury on a stable hostname next to gateway and facilitator.

## Recommended immediate rollout order

1. apply treasury migrations
2. start treasury service locally
3. register 1–2 agent wallets
4. test manual funding via `/treasury/agents/:id/fund`
5. test recommended refill via `/treasury/agents/:id/refill`
6. enable `TREASURY_REFILL_ENABLED=true`
7. surface treasury exposure in explorer

## Definition of success for Phase 2

Phase 2 is complete when:
- agents can be registered to treasury policy
- balances can be auto-refilled without manual shell scripts
- refill actions are visible and auditable
- treasury halts can stop all refill activity immediately
- the explorer shows treasury state alongside invoices, receipts, and anchors
