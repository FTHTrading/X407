/**
 * FTH x402 Facilitator — Namespace Resolver
 *
 * Resolves FQN (fully-qualified names) from the namespace registry.
 * Backed by PostgreSQL namespace_records table.
 */

import pool from "../db";

export interface NamespaceRecord {
  fqn: string;
  owner: string;
  resolve_type: string;
  resolve_network: string | null;
  resolve_value: string;
  visibility: string;
  payment_required: boolean;
  payment_config: Record<string, unknown> | null;
}

/**
 * Resolve a namespace FQN to its record.
 */
export async function resolveNamespace(fqn: string): Promise<NamespaceRecord | null> {
  const { rows } = await pool.query(
    `SELECT * FROM namespace_records WHERE fqn = $1`,
    [fqn],
  );
  return (rows[0] as NamespaceRecord) ?? null;
}

/**
 * List all namespace records under a prefix.
 */
export async function listNamespaces(prefix: string): Promise<NamespaceRecord[]> {
  const { rows } = await pool.query(
    `SELECT * FROM namespace_records WHERE fqn LIKE $1 ORDER BY fqn`,
    [`${prefix}%`],
  );
  return rows as NamespaceRecord[];
}

/**
 * Create or update a namespace record.
 */
export async function upsertNamespace(record: Omit<NamespaceRecord, "id">): Promise<void> {
  await pool.query(
    `INSERT INTO namespace_records
       (fqn, owner, resolve_type, resolve_network, resolve_value, visibility, payment_required, payment_config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (fqn) DO UPDATE SET
       owner = EXCLUDED.owner,
       resolve_type = EXCLUDED.resolve_type,
       resolve_network = EXCLUDED.resolve_network,
       resolve_value = EXCLUDED.resolve_value,
       visibility = EXCLUDED.visibility,
       payment_required = EXCLUDED.payment_required,
       payment_config = EXCLUDED.payment_config,
       updated_at = now()`,
    [
      record.fqn,
      record.owner,
      record.resolve_type,
      record.resolve_network,
      record.resolve_value,
      record.visibility,
      record.payment_required,
      record.payment_config ? JSON.stringify(record.payment_config) : null,
    ],
  );
}
