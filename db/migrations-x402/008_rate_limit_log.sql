-- FTH x402 Migration 008: Rate Limit Log
-- Sliding-window rate limiter state table

CREATE TABLE IF NOT EXISTS rate_limit_log (
  id              BIGSERIAL PRIMARY KEY,
  wallet_address  TEXT        NOT NULL,
  namespace       TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for sliding-window queries
CREATE INDEX IF NOT EXISTS idx_rate_limit_wallet_ns_time
  ON rate_limit_log (wallet_address, namespace, created_at DESC);

-- Partial index for cleanup
CREATE INDEX IF NOT EXISTS idx_rate_limit_created
  ON rate_limit_log (created_at);
