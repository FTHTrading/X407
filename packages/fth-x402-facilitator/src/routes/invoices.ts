/**
 * FTH x402 Facilitator — Invoice Routes
 *
 * POST /invoices   — create an invoice (called by Worker on 402)
 * GET  /invoices/:id — lookup invoice
 */

import type { FastifyInstance } from "fastify";
import { createInvoice, getInvoice } from "../services/invoices";
import type { InvoiceCreateBody } from "../types";

export default async function invoiceRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: InvoiceCreateBody }>("/invoices", async (req, reply) => {
    const body = req.body;

    if (!body.resource || !body.asset || !body.amount || !body.receiver) {
      return reply.status(400).send({
        error: "Missing required fields: resource, asset, amount, receiver",
      });
    }

    const result = await createInvoice(body);
    return reply.status(201).send(result);
  });

  app.get<{ Params: { id: string } }>("/invoices/:id", async (req, reply) => {
    const invoice = await getInvoice(req.params.id);
    if (!invoice) {
      return reply.status(404).send({ error: "Invoice not found" });
    }
    return reply.send(invoice);
  });
}
