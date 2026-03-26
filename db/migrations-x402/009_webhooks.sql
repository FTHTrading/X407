-- 009: Webhook subscriptions + delivery log
-- Enables merchants to receive real-time notifications for payment events

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id            TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  url           TEXT NOT NULL,
  secret        TEXT NOT NULL,            -- HMAC-SHA256 signing secret
  events        TEXT[] NOT NULL DEFAULT '{payment.received,channel.closed}',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_subs_wallet ON webhook_subscriptions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_webhook_subs_active ON webhook_subscriptions(active) WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',   -- pending | delivered | failed
  attempts        INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  response_code   INT,
  response_body   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_del_sub ON webhook_deliveries(subscription_id);
CREATE INDEX IF NOT EXISTS idx_webhook_del_status ON webhook_deliveries(status) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_webhook_del_created ON webhook_deliveries(created_at);
