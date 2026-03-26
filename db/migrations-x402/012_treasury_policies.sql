-- FTH x402 Migration 012: treasury_policies
-- Namespace or platform-wide default treasury policy presets.

CREATE TABLE IF NOT EXISTS treasury_policies (
  policy_id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace                    TEXT,
  status                       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  default_min_balance_usdf     DECIMAL(20,7) NOT NULL DEFAULT 10,
  default_target_balance_usdf  DECIMAL(20,7) NOT NULL DEFAULT 50,
  default_max_single_refill_usdf DECIMAL(20,7) NOT NULL DEFAULT 25,
  default_max_daily_refill_usdf  DECIMAL(20,7) NOT NULL DEFAULT 250,
  funding_mode                 TEXT NOT NULL DEFAULT 'credit' CHECK (funding_mode IN ('credit', 'uny', 'mixed')),
  metadata                     JSONB,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treasury_policies_namespace ON treasury_policies(namespace);
CREATE INDEX IF NOT EXISTS idx_treasury_policies_status ON treasury_policies(status);