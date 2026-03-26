/**
 * FTH x402 Facilitator — Health & Admin Routes
 */

import type { FastifyInstance } from "fastify";
import pool from "../db";

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Basic health check
  app.get("/health", async (_req, reply) => {
    // Quick DB ping
    let dbOk = false;
    try {
      await pool.query("SELECT 1");
      dbOk = true;
    } catch { /* db down */ }

    const status = dbOk ? "ok" : "degraded";
    return reply.status(dbOk ? 200 : 503).send({
      status,
      service: "fth-x402-facilitator",
      version: "0.2.0",
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
      db: dbOk ? "connected" : "unreachable",
    });
  });

  // Detailed admin stats
  app.get("/admin/stats", async (_req, reply) => {
    const [accounts, invoices, receipts, channels, batches] =
      await Promise.all([
        pool.query(`
          SELECT
            COUNT(*)::int               AS total_accounts,
            COALESCE(SUM(balance::numeric), 0)  AS total_balance,
            COUNT(*) FILTER (WHERE frozen)::int  AS frozen_accounts
          FROM credit_accounts
        `),
        pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE status = 'paid')::int    AS paid,
            COUNT(*) FILTER (WHERE status = 'expired')::int AS expired
          FROM invoices
        `),
        pool.query(`
          SELECT
            COUNT(*)::int AS total_receipts,
            COUNT(DISTINCT batch_id)::int AS total_batches,
            COALESCE(SUM(amount::numeric), 0) AS total_volume
          FROM receipts
        `),
        pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'open')::int   AS open_channels,
            COUNT(*) FILTER (WHERE status = 'closed')::int AS closed_channels,
            COALESCE(SUM(deposited_amount::numeric), 0)    AS total_deposited,
            COALESCE(SUM(spent_amount::numeric), 0)        AS total_spent
          FROM payment_channels
        `),
        pool.query(`
          SELECT
            COUNT(*)::int AS total_batches,
            COUNT(*) FILTER (WHERE anchor_tx_hash IS NOT NULL)::int AS anchored,
            COUNT(*) FILTER (WHERE anchor_tx_hash IS NULL)::int     AS pending_anchor
          FROM receipt_roots
        `),
      ]);

    return reply.send({
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
      memory: {
        rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heap_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
      accounts: accounts.rows[0],
      invoices: invoices.rows[0],
      receipts: receipts.rows[0],
      channels: channels.rows[0],
      anchoring: batches.rows[0],
    });
  });

  // Recent activity feed (last 20 receipts)
  app.get("/admin/activity", async (_req, reply) => {
    const { rows } = await pool.query(`
      SELECT r.receipt_id, r.invoice_id, r.payer, r.amount, r.asset,
             r.proof_type, r.rail, r.created_at,
             i.resource, i.namespace
      FROM receipts r
      LEFT JOIN invoices i ON i.invoice_id = r.invoice_id
      ORDER BY r.created_at DESC
      LIMIT 20
    `);
    return reply.send({ activity: rows });
  });
}
