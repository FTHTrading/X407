/**
 * FTH x402 Facilitator — Replay Guard
 *
 * Prevents double-spend by tracking consumed (invoice_id, nonce) pairs.
 * Uses a PostgreSQL-backed set check. In production, consider a Redis
 * Bloom filter for hot-path speed.
 */

import pool from "../db";

/**
 * Check if this (invoice_id, nonce) pair was already consumed.
 */
export async function checkReplay(
  invoice_id: string,
  nonce: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM invoices
     WHERE invoice_id = $1 AND nonce = $2 AND status = 'paid'`,
    [invoice_id, nonce],
  );
  return rows.length > 0;
}

/**
 * Record that a nonce was consumed (the invoice update in markInvoicePaid
 * handles this implicitly, but we keep the explicit call for clarity).
 */
export async function recordNonce(
  _invoice_id: string,
  _nonce: string,
): Promise<void> {
  // Currently handled by markInvoicePaid setting status = 'paid'.
  // Future: dedicated nonce table for decoupled replay guard.
}
