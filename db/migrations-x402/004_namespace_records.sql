-- FTH x402 Migration 004: namespace_records
-- Hierarchical namespace registry for FTH domain resolution.

CREATE TABLE IF NOT EXISTS namespace_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fqn             TEXT NOT NULL UNIQUE,
  owner           TEXT NOT NULL,
  resolve_type    TEXT NOT NULL CHECK (resolve_type IN ('address', 'endpoint', 'asset', 'policy', 'config')),
  resolve_network TEXT,
  resolve_value   TEXT NOT NULL,
  visibility      TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'permissioned')),
  acl             TEXT[],
  payment_required BOOLEAN DEFAULT false,
  payment_config  JSONB,
  onchain_anchor  JSONB,
  metadata_hash   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ns_fqn ON namespace_records(fqn);
CREATE INDEX IF NOT EXISTS idx_ns_owner ON namespace_records(owner);
CREATE INDEX IF NOT EXISTS idx_ns_fqn_prefix ON namespace_records USING btree (fqn text_pattern_ops);
