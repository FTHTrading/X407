-- FTH x402 Migration 002: credit_transactions
-- Ledger of all credit account movements (deposits, charges, refunds, withdrawals).

CREATE TABLE IF NOT EXISTS credit_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES credit_accounts(id),
  type            TEXT NOT NULL CHECK (type IN ('deposit', 'charge', 'refund', 'withdrawal')),
  amount          DECIMAL(20,7) NOT NULL,
  balance_after   DECIMAL(20,7) NOT NULL,
  reference       TEXT,
  rail            TEXT,
  tx_hash         TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_account ON credit_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_type ON credit_transactions(type);
CREATE INDEX IF NOT EXISTS idx_credit_tx_created ON credit_transactions(created_at);
