-- FTH x402 Migration 010: treasury_agents
-- Registered agents eligible for automated treasury-backed refills.

CREATE TABLE IF NOT EXISTS treasury_agents (
  agent_id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address           TEXT NOT NULL UNIQUE REFERENCES credit_accounts(wallet_address) ON DELETE CASCADE,
  namespace                TEXT,
  status                   TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'halted')),
  target_balance_usdf      DECIMAL(20,7) NOT NULL DEFAULT 50,
  min_balance_usdf         DECIMAL(20,7) NOT NULL DEFAULT 10,
  max_single_refill_usdf   DECIMAL(20,7) NOT NULL DEFAULT 25,
  max_daily_refill_usdf    DECIMAL(20,7) NOT NULL DEFAULT 250,
  last_refill_at           TIMESTAMPTZ,
  metadata                 JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (target_balance_usdf >= min_balance_usdf)
);

CREATE INDEX IF NOT EXISTS idx_treasury_agents_status ON treasury_agents(status);
CREATE INDEX IF NOT EXISTS idx_treasury_agents_namespace ON treasury_agents(namespace);