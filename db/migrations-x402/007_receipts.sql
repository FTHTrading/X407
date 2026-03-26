-- FTH x402 Migration 007: receipts
-- Offchain payment receipts, signed by facilitator, batch-indexed.

CREATE TABLE IF NOT EXISTS receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id      TEXT NOT NULL UNIQUE,
  invoice_id      TEXT NOT NULL REFERENCES invoices(invoice_id),
  channel_id      TEXT,
  payer           TEXT NOT NULL,
  amount          DECIMAL(20,7) NOT NULL,
  asset           TEXT NOT NULL DEFAULT 'USDF',
  rail            TEXT NOT NULL,
  proof_type      TEXT NOT NULL,
  batch_id        TEXT,
  merkle_index    INT,
  facilitator_sig TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipts_receipt_id ON receipts(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipts_invoice ON receipts(invoice_id);
CREATE INDEX IF NOT EXISTS idx_receipts_payer ON receipts(payer);
CREATE INDEX IF NOT EXISTS idx_receipts_batch ON receipts(batch_id);
