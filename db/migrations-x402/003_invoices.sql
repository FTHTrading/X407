-- FTH x402 Migration 003: invoices
-- Short-lived payment invoices generated per 402 request.

CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      TEXT NOT NULL UNIQUE,
  nonce           TEXT NOT NULL UNIQUE,
  resource        TEXT NOT NULL,
  namespace       TEXT,
  asset           TEXT NOT NULL DEFAULT 'USDF',
  amount          DECIMAL(20,7) NOT NULL,
  receiver        TEXT NOT NULL,
  rail            TEXT NOT NULL DEFAULT 'unykorn-l1',
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
  policy_version  TEXT,
  payer           TEXT,
  proof_type      TEXT,
  proof_data      JSONB,
  expires_at      TIMESTAMPTZ NOT NULL,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_invoice_id ON invoices(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_nonce ON invoices(nonce);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_payer ON invoices(payer);
CREATE INDEX IF NOT EXISTS idx_invoices_expires ON invoices(expires_at) WHERE status = 'pending';
