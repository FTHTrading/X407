/**
 * FTH x402 Facilitator — Operator Routes
 *
 * Admin-only endpoints for operator visibility into receipts, channels,
 * webhooks, verification failures, and metering. These are the "dashboard
 * API" — consumption by ops UI or CLI tools.
 *
 * All routes are under /admin/...
 */

import type { FastifyInstance } from "fastify";
import pool from "../db";

const TREASURY_REFILL_ENABLED = String(process.env.TREASURY_REFILL_ENABLED ?? "false") === "true";
const TREASURY_FUNDING_MODE = process.env.TREASURY_FUNDING_MODE ?? "credit";
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN?.trim() ?? "";

function getBearerToken(header?: string): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function isAuthorizedAdminRequest(headers: Record<string, unknown>): boolean {
  if (!ADMIN_API_TOKEN) return true;

  const authorization = typeof headers.authorization === "string" ? headers.authorization : undefined;
  const xAdminToken = typeof headers["x-admin-token"] === "string" ? headers["x-admin-token"] : undefined;
  const bearerToken = getBearerToken(authorization);

  return bearerToken === ADMIN_API_TOKEN || xAdminToken === ADMIN_API_TOKEN;
}

async function getTreasuryExposure() {
  const [summaryResult, refillResult, haltResult] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS agents_total,
         COUNT(*) FILTER (WHERE ta.status = 'active')::int AS agents_active,
         COUNT(*) FILTER (WHERE ca.balance < ta.min_balance)::int AS agents_below_min,
         COALESCE(SUM(ca.balance), 0)::text AS total_balance,
         COALESCE(SUM(GREATEST(ta.target_balance - ca.balance, 0)), 0)::text AS total_deficit
       FROM treasury_agents ta
       JOIN credit_accounts ca ON ca.wallet_address = ta.wallet_address`,
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS refill_count_24h,
         COALESCE(SUM(amount), 0)::text AS refill_volume_24h
       FROM treasury_refills
       WHERE status = 'completed'
         AND created_at >= now() - interval '24 hours'`,
    ),
    pool.query(
      `SELECT halt_id, scope_type, scope_key, reason, created_at, cleared_at
       FROM treasury_halts
       WHERE active = true
       ORDER BY created_at DESC`,
    ),
  ]);

  return {
    summary: summaryResult.rows[0],
    refill_24h: refillResult.rows[0],
    active_halts: haltResult.rows,
  };
}

async function getTreasuryStatus(limit = 10) {
  const exposure = await getTreasuryExposure();
  const recentRefills = await pool.query(
    `SELECT refill_id, agent_id, wallet_address, amount, asset, funding_mode,
            reference, anchor_tx_hash, status, metadata,
            created_at, completed_at
     FROM treasury_refills
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );

  return {
    service: "fth-x402-treasury",
    refill_enabled: TREASURY_REFILL_ENABLED,
    funding_mode: TREASURY_FUNDING_MODE,
    exposure,
    recent_refills: recentRefills.rows,
  };
}

export default async function operatorRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (req, reply) => {
    if (isAuthorizedAdminRequest(req.headers as Record<string, unknown>)) {
      return;
    }

    return reply
      .code(401)
      .header("WWW-Authenticate", 'Bearer realm="fth-x402-admin"')
      .send({
        error: "Unauthorized",
        error_code: "admin_auth_required",
      });
  });

  // =========================================================================
  // Receipts viewer — paginated, filterable
  // =========================================================================
  app.get<{
    Querystring: {
      limit?: string;
      offset?: string;
      payer?: string;
      namespace?: string;
      proof_type?: string;
      since?: string;
    };
  }>("/admin/receipts", async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit ?? "50", 10), 200);
    const offset = parseInt(req.query.offset ?? "0", 10);

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (req.query.payer) {
      conditions.push(`r.payer = $${idx++}`);
      params.push(req.query.payer);
    }
    if (req.query.namespace) {
      conditions.push(`i.namespace = $${idx++}`);
      params.push(req.query.namespace);
    }
    if (req.query.proof_type) {
      conditions.push(`r.proof_type = $${idx++}`);
      params.push(req.query.proof_type);
    }
    if (req.query.since) {
      conditions.push(`r.created_at >= $${idx++}`);
      params.push(req.query.since);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM receipts r LEFT JOIN invoices i ON i.invoice_id = r.invoice_id ${where}`,
      params,
    );

    const { rows } = await pool.query(
      `SELECT r.receipt_id, r.invoice_id, r.payer, r.amount, r.asset,
              r.proof_type, r.rail, r.batch_id, r.created_at,
              i.resource, i.namespace
       FROM receipts r
       LEFT JOIN invoices i ON i.invoice_id = r.invoice_id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    return reply.send({
      receipts: rows,
      total: countResult.rows[0].total,
      limit,
      offset,
    });
  });

  // =========================================================================
  // Channels viewer — all channels with state
  // =========================================================================
  app.get<{
    Querystring: {
      status?: string;
      wallet?: string;
      namespace?: string;
      limit?: string;
      offset?: string;
    };
  }>("/admin/channels", async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit ?? "50", 10), 200);
    const offset = parseInt(req.query.offset ?? "0", 10);

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (req.query.status) {
      conditions.push(`status = $${idx++}`);
      params.push(req.query.status);
    }
    if (req.query.wallet) {
      conditions.push(`wallet_address = $${idx++}`);
      params.push(req.query.wallet);
    }
    if (req.query.namespace) {
      conditions.push(`namespace = $${idx++}`);
      params.push(req.query.namespace);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM payment_channels ${where}`,
      params,
    );

    const { rows } = await pool.query(
      `SELECT channel_id, wallet_address, namespace, status,
              deposited_amount, spent_amount, sequence,
              created_at, updated_at
       FROM payment_channels
       ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    return reply.send({
      channels: rows,
      total: countResult.rows[0].total,
      limit,
      offset,
    });
  });

  // =========================================================================
  // Webhook delivery monitor
  // =========================================================================
  app.get<{
    Querystring: {
      subscription_id?: string;
      status?: string;
      event?: string;
      limit?: string;
      offset?: string;
    };
  }>("/admin/webhooks/deliveries", async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit ?? "50", 10), 200);
    const offset = parseInt(req.query.offset ?? "0", 10);

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (req.query.subscription_id) {
      conditions.push(`d.subscription_id = $${idx++}`);
      params.push(req.query.subscription_id);
    }
    if (req.query.status) {
      conditions.push(`d.status = $${idx++}`);
      params.push(req.query.status);
    }
    if (req.query.event) {
      conditions.push(`d.event_type = $${idx++}`);
      params.push(req.query.event);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countResult, dataResult, statsResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total FROM webhook_deliveries d ${where}`,
        params,
      ),
      pool.query(
        `SELECT d.id, d.subscription_id, d.event_type, d.status,
                d.attempts, d.response_code, d.response_body,
                d.created_at, d.last_attempt_at,
                s.url, s.wallet_address
         FROM webhook_deliveries d
         LEFT JOIN webhook_subscriptions s ON s.id = d.subscription_id
         ${where}
         ORDER BY d.created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset],
      ),
      pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
        FROM webhook_deliveries
      `),
    ]);

    return reply.send({
      deliveries: dataResult.rows,
      total: countResult.rows[0].total,
      stats: statsResult.rows[0],
      limit,
      offset,
    });
  });

  // =========================================================================
  // Verification failures / replay attempts
  // =========================================================================
  app.get<{
    Querystring: {
      limit?: string;
      since?: string;
    };
  }>("/admin/verifications/failures", async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit ?? "50", 10), 200);
    const since = req.query.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Pull invoices that were attempted but ended up expired or have
    // receipts with error_code (replay attempts show as re-used nonce)
    const { rows: failedInvoices } = await pool.query(
      `SELECT invoice_id, resource, namespace, asset, amount, status,
              created_at, expires_at
       FROM invoices
       WHERE status IN ('expired', 'cancelled')
         AND created_at >= $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [since, limit],
    );

    // Rate limit log entries (blocked requests)
    const { rows: rateLimited } = await pool.query(
      `SELECT wallet_address, namespace, created_at
       FROM rate_limit_log
       WHERE created_at >= $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [since, limit],
    );

    // Replay detection: invoices that are 'paid' but got second verify attempt
    // (these show as extra credit_transactions with type 'refund' or audit trail)
    const { rows: replayAttempts } = await pool.query(
      `SELECT i.invoice_id, i.resource, i.namespace, i.amount,
              r.receipt_id, r.payer, r.created_at AS receipt_at
       FROM invoices i
       JOIN receipts r ON r.invoice_id = i.invoice_id
       WHERE i.status = 'paid'
         AND i.created_at >= $1
       GROUP BY i.invoice_id, i.resource, i.namespace, i.amount,
                r.receipt_id, r.payer, r.created_at
       HAVING COUNT(r.receipt_id) = 1
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [since, limit],
    );

    return reply.send({
      since,
      failed_invoices: failedInvoices,
      rate_limited: rateLimited,
      successful_with_receipt: replayAttempts.length,
      summary: {
        failed_count: failedInvoices.length,
        rate_limited_count: rateLimited.length,
      },
    });
  });

  // =========================================================================
  // Invoices overview — for operator monitoring
  // =========================================================================
  app.get<{
    Querystring: {
      status?: string;
      namespace?: string;
      limit?: string;
      offset?: string;
    };
  }>("/admin/invoices", async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit ?? "50", 10), 200);
    const offset = parseInt(req.query.offset ?? "0", 10);

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (req.query.status) {
      conditions.push(`status = $${idx++}`);
      params.push(req.query.status);
    }
    if (req.query.namespace) {
      conditions.push(`namespace = $${idx++}`);
      params.push(req.query.namespace);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM invoices ${where}`,
      params,
    );

    const { rows } = await pool.query(
      `SELECT invoice_id, resource, namespace, asset, amount, receiver,
              status, created_at, expires_at
       FROM invoices
       ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    return reply.send({
      invoices: rows,
      total: countResult.rows[0].total,
      limit,
      offset,
    });
  });

  // =========================================================================
  // Accounts overview — credit balances
  // =========================================================================
  app.get<{
    Querystring: {
      frozen?: string;
      limit?: string;
      offset?: string;
    };
  }>("/admin/accounts", async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit ?? "50", 10), 200);
    const offset = parseInt(req.query.offset ?? "0", 10);

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (req.query.frozen === "true") {
      conditions.push(`frozen = true`);
    } else if (req.query.frozen === "false") {
      conditions.push(`frozen = false`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM credit_accounts ${where}`,
      params,
    );

    const { rows } = await pool.query(
      `SELECT wallet_address, balance, rail, namespace, kyc_level,
              frozen, created_at
       FROM credit_accounts
       ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    return reply.send({
      accounts: rows,
      total: countResult.rows[0].total,
      limit,
      offset,
    });
  });

  // =========================================================================
  // L1 anchoring status
  // =========================================================================
  app.get("/admin/anchoring", async (_req, reply) => {
    const { rows } = await pool.query(`
      SELECT batch_id, merkle_root, item_count, anchor_tx_hash,
             anchored_at, created_at
      FROM receipt_roots
      ORDER BY created_at DESC
      LIMIT 50
    `);

    const summary = await pool.query(`
      SELECT
        COUNT(*)::int AS total_batches,
        COUNT(*) FILTER (WHERE anchor_tx_hash IS NOT NULL)::int AS anchored,
        COUNT(*) FILTER (WHERE anchor_tx_hash IS NULL)::int AS pending,
        COALESCE(SUM(item_count), 0)::int AS total_receipts_batched
      FROM receipt_roots
    `);

    return reply.send({
      batches: rows,
      summary: summary.rows[0],
    });
  });

  // =========================================================================
  // Treasury exposure + refill visibility
  // =========================================================================
  app.get("/admin/treasury", async (_req, reply) => {
    return reply.send(await getTreasuryStatus());
  });

  app.get("/admin/treasury/status", async (_req, reply) => {
    return reply.send(await getTreasuryStatus());
  });

  app.get("/admin/treasury/exposure", async (_req, reply) => {
    return reply.send(await getTreasuryExposure());
  });

  app.get<{
    Querystring: {
      status?: string;
      agent_id?: string;
      limit?: string;
      offset?: string;
    };
  }>("/admin/treasury/refills", async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit ?? "50", 10), 200);
    const offset = parseInt(req.query.offset ?? "0", 10);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (req.query.status) {
      conditions.push(`status = $${idx++}`);
      params.push(req.query.status);
    }
    if (req.query.agent_id) {
      conditions.push(`agent_id = $${idx++}`);
      params.push(req.query.agent_id);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM treasury_refills ${where}`,
      params,
    );

    const { rows } = await pool.query(
      `SELECT refill_id, agent_id, wallet_address, amount, asset, funding_mode,
              reference, anchor_tx_hash, status, metadata,
              created_at, completed_at
       FROM treasury_refills
       ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    return reply.send({
      refills: rows,
      total: countResult.rows[0]?.total ?? 0,
      limit,
      offset,
    });
  });
}
