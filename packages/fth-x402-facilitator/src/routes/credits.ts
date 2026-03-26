/**
 * FTH x402 Facilitator — Credit Routes
 *
 * POST /credits/deposit     — deposit prepaid credits
 * POST /credits/register    — register wallet + pubkey
 * GET  /credits/:wallet     — get balance
 * GET  /credits/:wallet/transactions — transaction history
 * GET  /credits/:wallet/account      — full account details
 */

import type { FastifyInstance } from "fastify";
import { deposit, getBalance, getOrCreateAccount, registerPubkey } from "../services/settle";
import pool from "../db";

export default async function creditRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Register a wallet and its Ed25519 public key.
   * Must be done before proof verification can succeed.
   */
  app.post<{
    Body: { wallet_address: string; pubkey: string; rail?: string };
  }>("/credits/register", async (req, reply) => {
    const { wallet_address, pubkey, rail } = req.body;

    if (!wallet_address || !pubkey) {
      return reply.status(400).send({ error: "Missing wallet_address or pubkey" });
    }

    const account = await getOrCreateAccount(wallet_address, rail ?? "unykorn-l1", pubkey);

    // Also update pubkey if account already existed without one
    if (!account.pubkey) {
      await registerPubkey(wallet_address, pubkey);
    }

    return reply.status(200).send({
      wallet_address,
      pubkey_registered: true,
    });
  });

  app.post<{
    Body: { wallet_address: string; amount: string; reference?: string; tx_hash?: string };
  }>("/credits/deposit", async (req, reply) => {
    const { wallet_address, amount, reference, tx_hash } = req.body;

    if (!wallet_address || !amount) {
      return reply.status(400).send({ error: "Missing wallet_address or amount" });
    }

    // Ensure account exists
    await getOrCreateAccount(wallet_address);

    const tx = await deposit(wallet_address, amount, reference, tx_hash);
    const balance = await getBalance(wallet_address);

    return reply.status(200).send({
      wallet_address,
      deposited: amount,
      balance,
      transaction_id: tx.id,
    });
  });

  app.get<{ Params: { wallet: string } }>("/credits/:wallet", async (req, reply) => {
    const balance = await getBalance(req.params.wallet);
    return reply.send({
      wallet_address: req.params.wallet,
      balance,
    });
  });

  /**
   * Full account detail including pubkey, frozen status, etc.
   */
  app.get<{ Params: { wallet: string } }>("/credits/:wallet/account", async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT wallet_address, rail, balance, frozen, kyc_level, pubkey IS NOT NULL AS has_pubkey,
              created_at, updated_at
       FROM credit_accounts WHERE wallet_address = $1`,
      [req.params.wallet],
    );
    if (!rows[0]) {
      return reply.status(404).send({ error: "Account not found" });
    }
    return reply.send(rows[0]);
  });

  /**
   * Transaction history for a wallet.
   */
  app.get<{
    Params: { wallet: string };
    Querystring: { limit?: string; offset?: string; type?: string };
  }>("/credits/:wallet/transactions", async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit ?? "50", 10), 200);
    const offset = parseInt(req.query.offset ?? "0", 10);
    const typeFilter = req.query.type; // "deposit", "charge", "refund", "withdrawal"

    let query = `
      SELECT ct.id, ct.type, ct.amount, ct.balance_after, ct.reference,
             ct.rail, ct.tx_hash, ct.created_at
      FROM credit_transactions ct
      JOIN credit_accounts ca ON ca.id = ct.account_id
      WHERE ca.wallet_address = $1
    `;
    const params: (string | number)[] = [req.params.wallet];

    if (typeFilter) {
      params.push(typeFilter);
      query += ` AND ct.type = $${params.length}`;
    }

    query += ` ORDER BY ct.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    // Total count
    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM credit_transactions ct
      JOIN credit_accounts ca ON ca.id = ct.account_id
      WHERE ca.wallet_address = $1
      ${typeFilter ? "AND ct.type = $2" : ""}
    `;
    const countParams = typeFilter
      ? [req.params.wallet, typeFilter]
      : [req.params.wallet];
    const { rows: countRows } = await pool.query(countQuery, countParams);

    return reply.send({
      wallet_address: req.params.wallet,
      transactions: rows,
      total: countRows[0].total,
      limit,
      offset,
    });
  });
}
