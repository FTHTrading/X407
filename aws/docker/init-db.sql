-- init-db.sql
-- FTH x402 + Guardian production database schema
-- Runs automatically when PostgreSQL container starts fresh
--
-- IMPORTANT: Every table and column here is traced directly from
--   SQL queries in the TypeScript service layer.  Do NOT rename
--   columns without updating the corresponding *.ts files.

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════
--  x402 Facilitator — Credit Accounts
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS credit_accounts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address   TEXT UNIQUE NOT NULL,
    rail             TEXT NOT NULL DEFAULT 'unykorn-l1',
    namespace        TEXT,
    asset            TEXT NOT NULL DEFAULT 'UNY',
    balance          NUMERIC NOT NULL DEFAULT 0,
    frozen           BOOLEAN NOT NULL DEFAULT false,
    kyc_level        TEXT NOT NULL DEFAULT 'basic',
    pubkey           TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_accounts_wallet
    ON credit_accounts (wallet_address);

-- ═══════════════════════════════════════════════════
--  x402 Facilitator — Credit Transactions
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS credit_transactions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id       UUID NOT NULL REFERENCES credit_accounts(id),
    type             TEXT NOT NULL,            -- deposit | charge | refund | withdrawal
    amount           NUMERIC NOT NULL,
    balance_after    NUMERIC NOT NULL,
    reference        TEXT,
    rail             TEXT,
    tx_hash          TEXT,
    metadata         JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_account
    ON credit_transactions (account_id, created_at DESC);

-- ═══════════════════════════════════════════════════
--  x402 Facilitator — Invoices
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS invoices (
    invoice_id       TEXT PRIMARY KEY,
    nonce            TEXT NOT NULL,
    resource         TEXT,
    namespace        TEXT NOT NULL DEFAULT 'default',
    asset            TEXT NOT NULL DEFAULT 'UNY',
    amount           TEXT NOT NULL,
    receiver         TEXT,
    rail             TEXT NOT NULL DEFAULT 'unykorn-l1',
    status           TEXT NOT NULL DEFAULT 'pending',
    policy_version   TEXT,
    payer            TEXT,
    proof_type       TEXT,
    proof_data       JSONB,
    expires_at       TIMESTAMPTZ,
    paid_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_status
    ON invoices (status, created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_namespace
    ON invoices (namespace, created_at);

-- ═══════════════════════════════════════════════════
--  x402 Facilitator — Receipts
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS receipts (
    id               SERIAL,
    receipt_id       TEXT PRIMARY KEY,
    invoice_id       TEXT,
    channel_id       TEXT,
    payer            TEXT,
    amount           TEXT,
    asset            TEXT,
    rail             TEXT,
    proof_type       TEXT,
    batch_id         TEXT,
    merkle_index     INT,
    facilitator_sig  TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipts_invoice
    ON receipts (invoice_id);
CREATE INDEX IF NOT EXISTS idx_receipts_payer
    ON receipts (payer, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_batch
    ON receipts (batch_id);

-- ═══════════════════════════════════════════════════
--  x402 Facilitator — Receipt Roots (Merkle batches)
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS receipt_roots (
    id               SERIAL,
    batch_id         TEXT PRIMARY KEY,
    merkle_root      TEXT NOT NULL,
    rail             TEXT NOT NULL DEFAULT 'unykorn-l1',
    anchor_tx_hash   TEXT,
    item_count       INT NOT NULL DEFAULT 0,
    anchored_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipt_roots_unanchored
    ON receipt_roots (created_at ASC) WHERE anchor_tx_hash IS NULL;

-- ═══════════════════════════════════════════════════
--  x402 Facilitator — Payment Channels
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_channels (
    id               SERIAL,
    channel_id       TEXT PRIMARY KEY,
    wallet_address   TEXT NOT NULL,
    namespace        TEXT,
    rail             TEXT NOT NULL DEFAULT 'unykorn-l1',
    asset            TEXT NOT NULL DEFAULT 'UNY',
    deposited_amount NUMERIC NOT NULL DEFAULT 0,
    available_amount NUMERIC NOT NULL DEFAULT 0,
    spent_amount     NUMERIC NOT NULL DEFAULT 0,
    sequence         INT NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'open',
    opened_tx_hash   TEXT,
    closed_tx_hash   TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channels_wallet
    ON payment_channels (wallet_address);
CREATE INDEX IF NOT EXISTS idx_channels_status
    ON payment_channels (status);

-- ═══════════════════════════════════════════════════
--  x402 Facilitator — Webhook Subscriptions
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id               TEXT PRIMARY KEY,
    wallet_address   TEXT NOT NULL,
    url              TEXT NOT NULL,
    secret           TEXT,
    events           TEXT[] NOT NULL DEFAULT '{}',
    active           BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_subs_wallet
    ON webhook_subscriptions (wallet_address);

-- ═══════════════════════════════════════════════════
--  x402 Facilitator — Webhook Deliveries
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id               TEXT PRIMARY KEY,
    subscription_id  TEXT NOT NULL REFERENCES webhook_subscriptions(id),
    event_type       TEXT NOT NULL,
    payload          JSONB NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending',
    attempts         INT NOT NULL DEFAULT 0,
    response_code    INT,
    response_body    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_attempt_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_del_sub
    ON webhook_deliveries (subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_del_status
    ON webhook_deliveries (status) WHERE status = 'failed';

-- ═══════════════════════════════════════════════════
--  x402 Facilitator — Rate Limit Log
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rate_limit_log (
    id               SERIAL PRIMARY KEY,
    wallet_address   TEXT NOT NULL,
    namespace        TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_wallet_ns
    ON rate_limit_log (wallet_address, namespace, created_at DESC);

-- ═══════════════════════════════════════════════════
--  x402 Treasury — Agents
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS treasury_agents (
    agent_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address       TEXT UNIQUE NOT NULL,
    namespace            TEXT,
    asset                TEXT NOT NULL DEFAULT 'UNY',
    status               TEXT NOT NULL DEFAULT 'active',
    target_balance       NUMERIC NOT NULL,
    min_balance          NUMERIC NOT NULL,
    max_single_refill    NUMERIC NOT NULL,
    max_daily_refill     NUMERIC NOT NULL,
    last_refill_at       TIMESTAMPTZ,
    metadata             JSONB,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════
--  x402 Treasury — Refills
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS treasury_refills (
    refill_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id         UUID,
    account_id       UUID,
    wallet_address   TEXT,
    asset            TEXT NOT NULL DEFAULT 'UNY',
    amount           NUMERIC,
    funding_mode     TEXT,
    reference        TEXT,
    anchor_tx_hash   TEXT,
    status           TEXT NOT NULL DEFAULT 'pending',
    metadata         JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_treasury_refills_agent
    ON treasury_refills (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_treasury_refills_status
    ON treasury_refills (status, created_at);

-- ═══════════════════════════════════════════════════
--  x402 Treasury — Halts
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS treasury_halts (
    halt_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type       TEXT NOT NULL,           -- global | namespace | agent
    scope_key        TEXT,
    active           BOOLEAN NOT NULL DEFAULT true,
    reason           TEXT,
    metadata         JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    cleared_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_treasury_halts_active
    ON treasury_halts (active, scope_type);

-- ═══════════════════════════════════════════════════
--  Guardian Tables (also created by state-store.ts)
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS guardian_daemon_state (
    daemon_name    TEXT PRIMARY KEY,
    status         TEXT DEFAULT 'stopped',
    last_run_at    TIMESTAMPTZ,
    next_run_at    TIMESTAMPTZ,
    error_count    INTEGER DEFAULT 0,
    success_count  INTEGER DEFAULT 0,
    config         JSONB DEFAULT '{}',
    metadata       JSONB DEFAULT '{}',
    updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guardian_metrics (
    id             BIGSERIAL PRIMARY KEY,
    metric_name    TEXT NOT NULL,
    metric_value   DOUBLE PRECISION NOT NULL,
    labels         JSONB DEFAULT '{}',
    recorded_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guardian_metrics_name_time
    ON guardian_metrics (metric_name, recorded_at DESC);

CREATE TABLE IF NOT EXISTS guardian_audit_log (
    id             BIGSERIAL PRIMARY KEY,
    event_type     TEXT NOT NULL,
    source         TEXT NOT NULL,
    severity       TEXT DEFAULT 'info',
    message        TEXT,
    details        JSONB DEFAULT '{}',
    created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guardian_audit_severity
    ON guardian_audit_log (severity, created_at DESC);

CREATE TABLE IF NOT EXISTS guardian_upgrades (
    id             BIGSERIAL PRIMARY KEY,
    component      TEXT NOT NULL,
    from_version   TEXT,
    to_version     TEXT NOT NULL,
    status         TEXT DEFAULT 'pending',
    initiated_by   TEXT DEFAULT 'auto',
    started_at     TIMESTAMPTZ DEFAULT now(),
    completed_at   TIMESTAMPTZ,
    rollback_at    TIMESTAMPTZ,
    details        JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS guardian_security_events (
    id             BIGSERIAL PRIMARY KEY,
    event_type     TEXT NOT NULL,
    source_ip      TEXT,
    target         TEXT,
    severity       TEXT DEFAULT 'medium',
    action_taken   TEXT,
    blocked        BOOLEAN DEFAULT false,
    details        JSONB DEFAULT '{}',
    created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guardian_security_severity
    ON guardian_security_events (severity, created_at DESC);

CREATE TABLE IF NOT EXISTS guardian_revenue (
    id             BIGSERIAL PRIMARY KEY,
    source         TEXT NOT NULL,
    amount_uny     TEXT NOT NULL DEFAULT '0',
    amount_alt     TEXT NOT NULL DEFAULT '0',
    tx_hash        TEXT,
    block_height   BIGINT,
    category       TEXT DEFAULT 'fee',
    details        JSONB DEFAULT '{}',
    created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guardian_revenue_time
    ON guardian_revenue (created_at DESC);

-- ═══════════════════════════════════════════════════
--  Grants
-- ═══════════════════════════════════════════════════

-- Ensure the app user has full access
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fth_x402_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fth_x402_app;
