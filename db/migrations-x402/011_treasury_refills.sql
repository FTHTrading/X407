-- FTH x402 Migration 011: treasury_refills
-- Audit log of treasury-initiated top-ups.

CREATE TABLE IF NOT EXISTS treasury_refills (
  refill_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         UUID NOT NULL REFERENCES treasury_agents(agent_id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE CASCADE,
  wallet_address   TEXT NOT NULL,
  amount_usdf      DECIMAL(20,7) NOT NULL,
  funding_mode     TEXT NOT NULL DEFAULT 'credit' CHECK (funding_mode IN ('credit', 'uny', 'mixed')),
  reference        TEXT,
  anchor_tx_hash   TEXT,
  status           TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('queued', 'completed', 'failed', 'blocked', 'dry_run')),
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_treasury_refills_agent ON treasury_refills(agent_id);
CREATE INDEX IF NOT EXISTS idx_treasury_refills_status ON treasury_refills(status);
CREATE INDEX IF NOT EXISTS idx_treasury_refills_created ON treasury_refills(created_at);