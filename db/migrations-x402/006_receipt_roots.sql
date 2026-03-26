-- FTH x402 Migration 006: receipt_roots
-- Merkle batch roots anchored to UnyKorn L1 for receipt verification.

CREATE TABLE IF NOT EXISTS receipt_roots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        TEXT NOT NULL UNIQUE,
  merkle_root     TEXT NOT NULL,
  rail            TEXT NOT NULL DEFAULT 'unykorn-l1',
  anchor_tx_hash  TEXT,
  item_count      INT NOT NULL,
  anchored_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipt_roots_batch ON receipt_roots(batch_id);
CREATE INDEX IF NOT EXISTS idx_receipt_roots_anchored ON receipt_roots(anchored_at);
