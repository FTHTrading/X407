/**
 * FTH x402 Facilitator — Verify Route
 *
 * POST /verify — called by the Cloudflare Worker to verify payment proofs.
 */

import type { FastifyInstance } from "fastify";
import { verifyPayment } from "../services/verify";
import type { VerifyBody } from "../types";

export default async function verifyRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: VerifyBody }>("/verify", async (req, reply) => {
    const body = req.body;

    if (!body.invoice_id || !body.proof) {
      return reply.status(400).send({
        error: "Missing required fields: invoice_id, proof",
      });
    }

    try {
      const result = await verifyPayment(body);
      return reply.status(result.verified ? 200 : 402).send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      req.log.error({ err, body: { invoice_id: body.invoice_id, proof_type: body.proof?.proof_type } }, "Verify error");
      return reply.status(500).send({
        error: "Internal server error",
        error_code: "internal_error",
        detail: process.env.NODE_ENV !== "production" ? message : undefined,
      });
    }
  });
}
