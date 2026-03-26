/**
 * FTH x402 Facilitator — L1 Routes
 *
 * Endpoints for UnyKorn L1 interaction and monitoring.
 */

import type { FastifyPluginCallback } from "fastify";
import { getL1Health, anchorPendingBatches } from "../services/l1-adapter";
import pool from "../db";

const l1Routes: FastifyPluginCallback = (app, _opts, done) => {
  // GET /l1/health — L1 chain health
  app.get("/l1/health", async (_req, reply) => {
    const health = await getL1Health();
    return reply.status(health.reachable ? 200 : 503).send(health);
  });

  // GET /l1/batches — List recent anchor batches
  app.get("/l1/batches", async (_req, reply) => {
    const { rows } = await pool.query(
      `SELECT batch_id, merkle_root, rail, anchor_tx_hash, item_count, anchored_at, created_at
       FROM receipt_roots
       ORDER BY created_at DESC
       LIMIT 50`,
    );
    return reply.send({
      batches: rows,
      total: rows.length,
    });
  });

  // POST /l1/anchor — Trigger manual anchor of pending batches
  app.post("/l1/anchor", async (_req, reply) => {
    try {
      const anchored = await anchorPendingBatches();
      return reply.send({ anchored, message: `Anchored ${anchored} batch(es)` });
    } catch (err) {
      return reply.status(500).send({
        error: "Anchor failed",
        detail: String(err),
      });
    }
  });

  // GET /l1/batch/:batchId — Single batch detail
  app.get<{ Params: { batchId: string } }>("/l1/batch/:batchId", async (req, reply) => {
    const { rows: batches } = await pool.query(
      `SELECT * FROM receipt_roots WHERE batch_id = $1`,
      [req.params.batchId],
    );
    if (!batches[0]) {
      return reply.status(404).send({ error: "Batch not found" });
    }
    // Get receipts in this batch
    const { rows: receipts } = await pool.query(
      `SELECT receipt_id, invoice_id, payer, amount, asset, proof_type, created_at
       FROM receipts
       WHERE batch_id = $1
       ORDER BY created_at`,
      [req.params.batchId],
    );
    return reply.send({
      batch: batches[0],
      receipts,
    });
  });

  done();
};

export default l1Routes;
