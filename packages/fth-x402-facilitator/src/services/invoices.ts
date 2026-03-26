/**
 * FTH x402 Facilitator — Invoice Service
 *
 * Creates, looks up, and manages payment invoices.
 * Invoices are short-lived (default 5min TTL) and single-use (replay guard).
 */

import { nanoid } from "nanoid";
import pool from "../db";
import type { Invoice, InvoiceCreateBody } from "../types";

/**
 * Create a new invoice. Returns invoice_id + nonce + expiry.
 */
export async function createInvoice(body: InvoiceCreateBody) {
  const invoice_id = `inv_${nanoid(16)}`;
  const nonce = `n_${nanoid(12)}`;
  const ttl = body.ttl_seconds ?? 300;
  const expires_at = new Date(Date.now() + ttl * 1000);

  await pool.query(
    `INSERT INTO invoices
       (invoice_id, nonce, resource, namespace, asset, amount, receiver, rail, status, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)`,
    [
      invoice_id,
      nonce,
      body.resource,
      body.namespace,
      body.asset,
      body.amount,
      body.receiver,
      body.rail ?? "unykorn-l1",
      expires_at,
    ],
  );

  return { invoice_id, nonce, expires_at: expires_at.toISOString() };
}

/**
 * Look up an invoice by invoice_id.
 */
export async function getInvoice(invoice_id: string): Promise<Invoice | null> {
  const { rows } = await pool.query(
    `SELECT * FROM invoices WHERE invoice_id = $1`,
    [invoice_id],
  );
  return (rows[0] as Invoice) ?? null;
}

/**
 * Mark an invoice as paid with the given proof.
 */
export async function markInvoicePaid(
  invoice_id: string,
  payer: string,
  proof_type: string,
  proof_data: Record<string, unknown>,
): Promise<void> {
  await pool.query(
    `UPDATE invoices
     SET status = 'paid', payer = $2, proof_type = $3, proof_data = $4, paid_at = now()
     WHERE invoice_id = $1 AND status = 'pending'`,
    [invoice_id, payer, proof_type, JSON.stringify(proof_data)],
  );
}

/**
 * Expire invoices past their TTL (called periodically).
 */
export async function expireInvoices(): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE invoices SET status = 'expired' WHERE status = 'pending' AND expires_at < now()`,
  );
  return rowCount ?? 0;
}
