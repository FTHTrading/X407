/**
 * FTH x402 Facilitator — Receipt Routes
 *
 * GET /receipts/:id — lookup a receipt
 * POST /receipts/flush — force flush receipt batch
 */

import type { FastifyInstance } from "fastify";
import { getReceipt, flushBatch } from "../services/receipts";

export default async function receiptRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/receipts/:id", async (req, reply) => {
    const receipt = await getReceipt(req.params.id);
    if (!receipt) {
      return reply.status(404).send({ error: "Receipt not found" });
    }
    return reply.send(receipt);
  });

  app.post("/receipts/flush", async (_req, reply) => {
    const batch_id = await flushBatch();
    if (!batch_id) {
      return reply.send({ message: "No receipts to flush" });
    }
    return reply.send({ batch_id });
  });
}
