-- FTH x402 Migration 013: treasury_limits
-- Declarative treasury risk boundaries by scope.

CREATE TABLE IF NOT EXISTS treasury_limits (
  limit_id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type               TEXT NOT NULL CHECK (scope_type IN ('global', 'namespace', 'agent')),
  scope_key                TEXT,
  max_hourly_refill_usdf   DECIMAL(20,7),
  max_daily_refill_usdf    DECIMAL(20,7),
  metadata                 JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treasury_limits_scope ON treasury_limits(scope_type, scope_key);