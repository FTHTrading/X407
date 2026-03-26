/**
 * FTH x402 Facilitator — Namespace Routes
 *
 * GET  /namespaces/:fqn   — resolve a namespace
 * GET  /namespaces?prefix= — list namespaces under prefix
 * PUT  /namespaces/:fqn   — upsert a namespace record
 */

import type { FastifyInstance } from "fastify";
import {
  resolveNamespace,
  listNamespaces,
  upsertNamespace,
} from "../services/namespace";

export default async function namespaceRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { fqn: string } }>("/namespaces/:fqn", async (req, reply) => {
    const record = await resolveNamespace(req.params.fqn);
    if (!record) {
      return reply.status(404).send({ error: "Namespace not found" });
    }
    return reply.send(record);
  });

  app.get<{ Querystring: { prefix?: string } }>("/namespaces", async (req, reply) => {
    const prefix = req.query.prefix ?? "fth.";
    const records = await listNamespaces(prefix);
    return reply.send(records);
  });

  app.put<{
    Params: { fqn: string };
    Body: {
      owner?: string;
      resolve_type?: string;
      resolve_network?: string | null;
      resolve_value?: string;
      visibility?: string;
      payment_required?: boolean;
      payment_config?: Record<string, unknown> | null;
    };
  }>("/namespaces/:fqn", async (req, reply) => {
    const record = {
      fqn: req.params.fqn,
      owner: req.body.owner ?? "fth-ops",
      resolve_type: req.body.resolve_type ?? "endpoint",
      resolve_network: req.body.resolve_network ?? null,
      resolve_value: req.body.resolve_value ?? "",
      visibility: req.body.visibility ?? "public",
      payment_required: req.body.payment_required ?? false,
      payment_config: req.body.payment_config ?? null,
    };

    await upsertNamespace(record);
    return reply.status(200).send({ fqn: record.fqn, status: "ok" });
  });
}
