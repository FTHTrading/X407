-- FTH x402 Migration 001: credit_accounts
-- Prepaid credit accounts for wallets using the x402 protocol.

CREATE TABLE IF NOT EXISTS credit_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  TEXT NOT NULL UNIQUE,
  rail            TEXT NOT NULL DEFAULT 'unykorn-l1',
  namespace       TEXT,
  balance_usdf    DECIMAL(20,7) NOT NULL DEFAULT 0,
  frozen          BOOLEAN NOT NULL DEFAULT false,
  kyc_level       TEXT DEFAULT 'none',
  pubkey          TEXT,  -- Base64-encoded Ed25519 public key for proof verification
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_accounts_wallet ON credit_accounts(wallet_address);
CREATE INDEX IF NOT EXISTS idx_credit_accounts_rail ON credit_accounts(rail);
