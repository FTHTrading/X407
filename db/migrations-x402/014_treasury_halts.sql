-- FTH x402 Migration 014: treasury_halts
-- Emergency stop records for treasury refills.

CREATE TABLE IF NOT EXISTS treasury_halts (
  halt_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type      TEXT NOT NULL CHECK (scope_type IN ('global', 'namespace', 'agent')),
  scope_key       TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  reason          TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  cleared_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_treasury_halts_active ON treasury_halts(active);
CREATE INDEX IF NOT EXISTS idx_treasury_halts_scope ON treasury_halts(scope_type, scope_key);