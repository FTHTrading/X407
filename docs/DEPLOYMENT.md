# FTH x402 — Deployment Guide

> Version: Phase E · Last updated: 2026-03-21

This document covers deploying the FTH x402 system across three environments:
**local development**, **staging**, and **production**.

It also reflects the current live operating shape of the stack:

- public operator explorer at [x402.unykorn.org/explorer](https://x402.unykorn.org/explorer)
- local gateway commonly running on `:8788` or `:8790`
- facilitator on `:3100`
- treasury on `:3200`
- explorer treasury fallback through facilitator `/admin/treasury/*`
- UnyKorn anchoring visible from the explorer operator board

---

## Architecture overview

```
┌──────────────────────────┐      ┌──────────────────────────┐
│  Cloudflare Worker       │      │  Facilitator (Fastify)   │
│  fth-x402-gateway        │─────▶│  :3100                   │
│  api.fth.trading/api/*   │      │  PostgreSQL, L1 adapter  │
└──────────────────────────┘      └──────────────────────────┘
        ▲                                   │
        │ HTTPS                             │ L1 RPC
   Public clients                   UnyKorn L1 chain
```

| Component | Technology | Deploy target |
|-----------|-----------|---------------|
| Gateway | Cloudflare Worker (esbuild) | Cloudflare Edge |
| Facilitator | Node.js / Fastify | Docker container (VM / managed host) |
| Database | PostgreSQL 15+ | Docker or managed (RDS, Cloud SQL) |
| L1 | UnyKorn chain | EC2 fleet (see `ops/DEPLOYMENT_READINESS_CHECKLIST.md`) |

---

## Prerequisites

| Tool | Min version | Install |
|------|-----------|---------|
| Node.js | 20 LTS | `nvm install 20` |
| npm | 10+ | Ships with Node 20 |
| wrangler | 3.x | `npm i -g wrangler` |
| Docker | 24+ | docker.com |
| PostgreSQL client | 15+ | Optional — for `psql` debugging |

---

## 1 — Local development

### 1.1 Database

Start the PostgreSQL container (if not already running):

```bash
docker run -d --name unykorn-postgres \
  -e POSTGRES_USER=unykorn \
  -e POSTGRES_PASSWORD=unykorn_dev \
  -e POSTGRES_DB=fth_x402 \
  -p 5432:5432 \
  postgres:15-alpine
```

Run migrations and seed data:

```bash
node scripts/x402-db-setup.mjs
node scripts/x402-seed-namespaces.mjs
```

### 1.2 Environment

Copy the template and fill in your signing key:

```bash
cp .env.example .env    # or edit the existing .env
```

Required variables for local dev:

| Variable | Example | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `postgresql://unykorn:unykorn_dev@localhost:5432/fth_x402` | |
| `FTH_SIGNING_KEY` | (base64 Ed25519 key) | Generate: `node scripts/x402-generate-key.mjs` |
| `PORT` | `3100` | Facilitator port |
| `NODE_ENV` | `production` | Use `production` to skip pino-pretty |

### 1.3 Start the Facilitator

```bash
cd packages/fth-x402-facilitator
npx tsc --noEmit          # type-check
npm run start             # built entrypoint
# or: node --env-file=../../.env dist/fth-x402-facilitator/src/index.js
# or: npx tsx src/index.ts
```

Verify: `curl http://localhost:3100/health` → `{"status":"ok"}`

If `npm run start` exits with `EADDRINUSE: address already in use 0.0.0.0:3100`, the facilitator is already running on that port. Reuse the existing process or stop the current listener before restarting.

### 1.4 Start the Gateway (local)

```bash
cd packages/fth-x402-gateway
npx wrangler dev
```

Wrangler dev may bind on `http://localhost:8788` or `http://localhost:8790` depending on the active local session. The integration test now auto-detects the live local gateway port. The gateway reads `FACILITATOR_URL=http://localhost:3100` from `wrangler.toml [vars]`.

Verify:

```bash
curl http://localhost:8788/health
# or
curl http://localhost:8790/health
```

One of those should return:

```json
{"status":"ok","gateway":"fth-x402","version":"2.0",...}
```

### 1.5 Start the Treasury (local)

```bash
cd packages/fth-x402-treasury
npm run build
node --env-file=../../.env dist/index.js
```

Verify:

```bash
curl http://localhost:3200/health
```

Expected:

```json
{"ok":true,"service":"fth-x402-treasury",...}
```

### 1.6 Run tests

```bash
# Smoke tests (facilitator must be running on :3100)
node scripts/x402-smoke-test.mjs
node scripts/x402-channel-smoke-test.mjs

# Full E2E integration
node scripts/x402-e2e-integration-test.mjs

# Gateway ↔ facilitator integration
node scripts/x402-gateway-integration-test.mjs
```

Current validated state:

- `x402-e2e-integration-test.mjs` → `28 passed, 0 failed`
- `x402-gateway-integration-test.mjs` → `9 passed, 0 failed`

### 1.7 Explorer operator view

Open:

```text
https://x402.unykorn.org/explorer
```

What the explorer now shows:

- gateway health
- paid-route `402` challenge behavior
- invoices
- receipts
- anchoring batches
- UnyKorn L1 health
- treasury status, exposure, and refills

If `Treasury base URL` is left blank, the explorer automatically uses facilitator-backed treasury admin surfaces:

- `/admin/treasury/status`
- `/admin/treasury/exposure`
- `/admin/treasury/refills`

This allows the public operator board to show treasury state even when there is no separate public treasury hostname.

### 1.8 Temporary public live probe

For quick public demos, the local gateway and facilitator can be exposed through Cloudflare quick tunnels.

Start tunnels:

```bash
cloudflared tunnel --url http://127.0.0.1:3100 --no-autoupdate
cloudflared tunnel --url http://127.0.0.1:8788 --no-autoupdate
```

Or log them to files from the repo root:

```bash
cloudflared tunnel --url http://127.0.0.1:3100 --no-autoupdate --logfile .cloudflared-facilitator.log
cloudflared tunnel --url http://127.0.0.1:8788 --no-autoupdate --logfile .cloudflared-gateway.log
```

Important:

- quick tunnels are temporary
- URLs expire when the local tunnel process stops
- they are valid for demos, not permanent production
- the public explorer preset may be updated to point at whichever quick tunnels are currently active
- a Pages deployment alias can update before the `x402.unykorn.org` custom domain finishes catching up, so verify both when publishing explorer changes

---

## 2 — Staging deployment

### 2.1 DNS

| Record | Type | Value |
|--------|------|-------|
| `staging-api.fth.trading` | CNAME | Cloudflare Worker custom domain (auto-managed by wrangler) |
| `facilitator-staging.fth.trading` | A / CNAME | IP or hostname of staging facilitator host |

### 2.2 Facilitator (Docker)

Build from monorepo root:

```bash
docker build -t fth-x402-facilitator:staging \
  -f packages/fth-x402-facilitator/Dockerfile .
```

Run with staging env:

```bash
docker run -d --name fth-facilitator-staging \
  --env-file .env.staging \
  -p 3100:3100 \
  fth-x402-facilitator:staging
```

PostgreSQL for staging should be a dedicated instance (not the local dev container).

### 2.3 Gateway (Cloudflare Worker)

Set secrets once:

```bash
wrangler secret put OPENMETER_ENDPOINT --env staging
wrangler secret put OPENMETER_API_KEY  --env staging
```

Deploy:

```bash
./scripts/x402-deploy-gateway.sh staging
```

This will:
1. Type-check the gateway
2. `wrangler deploy --env staging`
3. Health-check `https://staging-api.fth.trading/health`

### 2.4 Verify

```bash
# Health
curl https://staging-api.fth.trading/health

# Paid route → expect 402
curl -i https://staging-api.fth.trading/api/v1/genesis/repro-pack/alpha
```

### 2.5 Explorer Pages preview deploy

The x402 explorer site supports both preview and production Pages uploads.

Preview deploy:

```bash
cd packages/fth-x402-site
npm run deploy:preview
```

This updates a preview deployment and branch alias such as `master.x402-site-a5m.pages.dev`, but it does not necessarily update the live `x402.unykorn.org` custom domain.

---

## 3 — Production deployment

### 3.1 DNS

| Record | Type | Value |
|--------|------|-------|
| `api.fth.trading` | CNAME | Cloudflare Worker custom domain (auto-managed by wrangler) |
| `facilitator.fth.trading` | A / CNAME | Production facilitator host IP (private network preferred) |

### 3.2 Secrets management

**Never commit production secrets.** Use one of:

- Cloudflare Worker secrets (for gateway): `wrangler secret put <KEY> --env production`
- Vault / AWS Secrets Manager / Azure Key Vault (for facilitator env vars)
- Docker secrets (if using Swarm/Compose)

Required secrets:

| Secret | Set via | Used by |
|--------|---------|---------|
| `FTH_SIGNING_KEY` | env / vault | Facilitator |
| `DATABASE_URL` | env / vault | Facilitator |
| `OPENMETER_ENDPOINT` | `wrangler secret put` | Gateway |
| `OPENMETER_API_KEY` | `wrangler secret put` | Gateway |

### 3.3 Facilitator

```bash
# Build
docker build -t fth-x402-facilitator:latest \
  -f packages/fth-x402-facilitator/Dockerfile .

# Tag for your registry
docker tag fth-x402-facilitator:latest \
  registry.fth.trading/fth-x402-facilitator:$(git rev-parse --short HEAD)

# Push
docker push registry.fth.trading/fth-x402-facilitator:$(git rev-parse --short HEAD)

# Deploy (example: docker run on host)
docker run -d --name fth-facilitator \
  --env-file .env.production \
  -p 3100:3100 \
  --restart unless-stopped \
  fth-x402-facilitator:latest
```

The facilitator starts with **startup validation** — it will exit immediately if `DATABASE_URL` or `FTH_SIGNING_KEY` are missing.

### 3.4 Database migrations

Connect to the production database and run:

```bash
DATABASE_URL=<prod-url> node scripts/x402-db-setup.mjs
DATABASE_URL=<prod-url> node scripts/x402-seed-namespaces.mjs
```

All migrations are idempotent (`CREATE TABLE IF NOT EXISTS`).

### 3.5 Gateway

Set secrets once:

```bash
wrangler secret put OPENMETER_ENDPOINT --env production
wrangler secret put OPENMETER_API_KEY  --env production
```

Deploy:

```bash
./scripts/x402-deploy-gateway.sh production
```

### 3.6 Post-deploy verification

```bash
# Health
curl https://api.fth.trading/health
# Expect: {"status":"ok","version":"fth-x402/2.0","environment":"production", ...}

# Paid route
curl -i https://api.fth.trading/api/v1/genesis/repro-pack/alpha
# Expect: HTTP 402 with X-PAYMENT-REQUIRED header and PaymentRequirement JSON body

# Facilitator health
curl https://facilitator.fth.trading/health
# Expect: {"status":"ok", "uptime":...}

# Operator endpoints
curl https://facilitator.fth.trading/admin/receipts?limit=5
curl https://facilitator.fth.trading/admin/channels?limit=5
```

Additional current operator checks:

```bash
curl https://facilitator.fth.trading/admin/anchoring
curl https://facilitator.fth.trading/admin/treasury/status
curl https://facilitator.fth.trading/admin/treasury/refills?limit=5
```

If a stable public treasury hostname is not deployed, use the facilitator treasury admin surfaces through the explorer fallback path.

If `ADMIN_API_TOKEN` is enabled, verify protected operator access explicitly:

```bash
# Expect: 401 Unauthorized
curl -i https://facilitator.fth.trading/admin/anchoring

# Expect: 200 OK
curl -i https://facilitator.fth.trading/admin/anchoring \
  -H "Authorization: Bearer <ADMIN_API_TOKEN>"

# Also supported: X-Admin-Token
curl -i https://facilitator.fth.trading/admin/anchoring \
  -H "X-Admin-Token: <ADMIN_API_TOKEN>"
```

### 3.7 Explorer Pages production deploy

To publish the explorer and site changes to the `x402.unykorn.org` custom domain, deploy the Pages site to the production branch:

```bash
cd packages/fth-x402-site
npm run deploy:production
```

Current project behavior:

- preview deploys land on the `master` branch alias
- production deploys land on the `main` branch
- `x402.unykorn.org` follows the production Pages deployment, not the preview alias

---

## 4 — Configuration reference

### 4.1 Environment files

| File | Purpose |
|------|---------|
| `.env` | Local development defaults |
| `.env.staging` | Staging template (secrets are `CHANGE_ME` placeholders) |
| `.env.production` | Production template (secrets are `VAULT_SECRET` placeholders) |

### 4.2 Gateway environment variables

Set in `wrangler.toml` `[vars]` or via `wrangler secret put`:

| Variable | Type | Description |
|----------|------|-------------|
| `FACILITATOR_URL` | var | URL of the facilitator instance |
| `ENVIRONMENT` | var | `development` / `staging` / `production` |
| `OPENMETER_ENDPOINT` | secret | OpenMeter API base URL |
| `OPENMETER_API_KEY` | secret | OpenMeter API key |

### 4.3 Facilitator environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **yes** | PostgreSQL connection string |
| `FTH_SIGNING_KEY` | **yes** | Base64 Ed25519 64-byte key |
| `PORT` | no | Default: `3100` |
| `HOST` | no | Default: `0.0.0.0` |
| `NODE_ENV` | no | Default: `production` (avoids pino-pretty) |
| `LOG_LEVEL` | no | Default: `info` (`warn` recommended for prod) |
| `ADMIN_API_TOKEN` | no | When set, protects all `/admin/*` routes via `Authorization: Bearer <token>` or `X-Admin-Token` |
| `CORS_ORIGIN` | no | Default: `*` |
| `L1_RPC_URL` | no | Default: `https://rpc.l1.unykorn.org` |
| `L1_RPC_FALLBACK_URL` | no | Secondary RPC if primary fails |
| `OPENMETER_ENDPOINT` | no | OpenMeter API URL |
| `OPENMETER_API_KEY` | no | OpenMeter API key |

### 4.4 Current hardening gaps

The stack is live and operational, but these should be tightened before claiming production-grade security for enterprise or data-science use cases:

1. set `ADMIN_API_TOKEN` in staging and production to protect facilitator `/admin/*`
2. replace wildcard `CORS_ORIGIN=*` with explicit allowed origins
3. add signed or mutually authenticated gateway → facilitator service auth
4. complete Stellar `signed_auth` support if Stellar remains an advertised rail

The public explorer now includes an `Admin token` field for protected operator probes. Prefer entering the token in the UI rather than sharing it in URLs.

When protected admin routes return `401`, the explorer now shows a token-required warning instead of looking like a generic facilitator failure.

---

## 5 — Rollback

### Gateway rollback

Cloudflare Workers support instant rollback via the dashboard or CLI:

```bash
# List deployments
wrangler deployments list --env production

# Rollback to previous version
wrangler rollback --env production
```

### Facilitator rollback

```bash
# Stop current
docker stop fth-facilitator

# Start previous image tag
docker run -d --name fth-facilitator \
  --env-file .env.production \
  -p 3100:3100 \
  fth-x402-facilitator:<previous-tag>
```

Database migrations are forward-only. If a migration causes issues, deploy a hotfix rather than rolling back the schema.

---

## 6 — Monitoring & alerting

### Health endpoints

| Endpoint | Component | Expected |
|----------|-----------|----------|
| `GET /health` | Gateway | `{"status":"ok","version":"fth-x402/2.0"}` |
| `GET /health` | Facilitator | `{"status":"ok","uptime":...}` |
| `GET /admin/stats` | Facilitator | Invoice/receipt/channel counts |
| `GET /admin/activity` | Facilitator | Last 24h activity summary |

### Operator visibility (Facilitator)

| Endpoint | Purpose |
|----------|---------|
| `GET /admin/receipts` | Settled payment receipts |
| `GET /admin/channels` | Payment channel state |
| `GET /admin/webhooks/deliveries` | Webhook delivery status |
| `GET /admin/verifications/failures` | Failed verifications / rate-limits |
| `GET /admin/invoices` | Invoice ledger |
| `GET /admin/accounts` | Credit accounts |
| `GET /admin/anchoring` | L1 batch anchoring status |

### Docker healthcheck

The Dockerfile includes a built-in healthcheck:

```
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3
  CMD wget -q --spider http://localhost:3100/health || exit 1
```

### Recommended external monitoring

- **Uptime robot / Pingdom**: Poll `GET /health` on both gateway and facilitator every 60s
- **Cloudflare Analytics**: Built-in for Worker — request count, latency, error rate
- **OpenMeter**: API request metering (wired into gateway)
- **PagerDuty / Opsgenie**: Alert on 5xx rate > 1% or health check failures

---

## 7 — Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Gateway returns 502 | Facilitator unreachable | Check `FACILITATOR_URL`, verify facilitator is running |
| Facilitator start fails with `EADDRINUSE` | Port `3100` already has a running listener | Stop the existing process on `3100` or keep using the current facilitator instance |
| Facilitator exits on start | Missing `DATABASE_URL` or `FTH_SIGNING_KEY` | Check env vars — startup validates required vars |
| 402 missing PaymentRequirement | Facilitator `/invoices` endpoint failing | Check facilitator logs, DB connectivity |
| L1 anchoring fails | RPC unreachable | Circuit breaker will retry; check `L1_RPC_URL` and fallback |
| pino-pretty error | `NODE_ENV` not set to `production` | Set `NODE_ENV=production` |
| npm install fails at root | pino-pretty Invalid Version | Known issue — use per-package builds instead |
| `master.x402-site-a5m.pages.dev` is newer than `x402.unykorn.org` | Cloudflare Pages alias updated before custom domain/cache | Validate the Pages alias first, then refresh or repoint the custom domain |
