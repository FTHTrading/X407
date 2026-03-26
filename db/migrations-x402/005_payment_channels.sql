-- FTH x402 Migration 005: payment_channels
-- Prepaid payment channels on UnyKorn L1 for microcharge flows.

CREATE TABLE IF NOT EXISTS payment_channels (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id       TEXT NOT NULL UNIQUE,
  wallet_address   TEXT NOT NULL,
  namespace        TEXT,
  rail             TEXT NOT NULL DEFAULT 'unykorn-l1',
  asset            TEXT NOT NULL DEFAULT 'USDF',
  deposited_amount DECIMAL(20,7) NOT NULL,
  available_amount DECIMAL(20,7) NOT NULL,
  spent_amount     DECIMAL(20,7) NOT NULL DEFAULT 0,
  sequence         BIGINT NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closing', 'closed', 'disputed')),
  opened_tx_hash   TEXT,
  closed_tx_hash   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channels_channel_id ON payment_channels(channel_id);
CREATE INDEX IF NOT EXISTS idx_channels_wallet ON payment_channels(wallet_address);
CREATE INDEX IF NOT EXISTS idx_channels_status ON payment_channels(status);
