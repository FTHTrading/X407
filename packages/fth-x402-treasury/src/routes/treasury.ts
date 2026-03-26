import type { FastifyInstance } from "fastify";
import {
  evaluateAgent,
  fundAgent,
  getAgentById,
  getAgentByWallet,
  getExposure,
  getTreasuryStatus,
  listAgents,
  listRefills,
  registerAgent,
  setTreasuryHalt,
  triggerRecommendedRefill,
} from "../services/treasury";

export default async function treasuryRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: {
      wallet_address: string;
      namespace?: string;
      rail?: string;
      pubkey?: string;
      asset?: string;
      target_balance?: string;
      min_balance?: string;
      max_single_refill?: string;
      max_daily_refill?: string;
      metadata?: Record<string, unknown>;
    };
  }>("/treasury/agents/register", async (req, reply) => {
    const agent = await registerAgent(req.body);
    return reply.status(201).send(agent);
  });

  app.get<{
    Querystring: { status?: string; namespace?: string; limit?: string; offset?: string };
  }>("/treasury/agents", async (req) => {
    return listAgents({
      status: req.query.status,
      namespace: req.query.namespace,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : 50,
      offset: req.query.offset ? parseInt(req.query.offset, 10) : 0,
    });
  });

  app.get<{ Params: { id: string } }>("/treasury/agents/:id", async (req, reply) => {
    const agent = await getAgentById(req.params.id);
    if (!agent) {
      return reply.status(404).send({ error: "Treasury agent not found" });
    }
    return reply.send(agent);
  });

  app.post<{
    Params: { id: string };
    Body: {
      amount: string;
      asset?: string;
      funding_mode?: "credit" | "uny" | "mixed";
      reference?: string;
      anchor_tx_hash?: string;
      metadata?: Record<string, unknown>;
    };
  }>("/treasury/agents/:id/fund", async (req, reply) => {
    const result = await fundAgent(req.params.id, req.body);
    return reply.status(200).send(result);
  });

  app.post<{
    Params: { id: string };
    Body: { dry_run?: boolean; reference?: string; metadata?: Record<string, unknown> };
  }>("/treasury/agents/:id/refill", async (req, reply) => {
    const result = await triggerRecommendedRefill(req.params.id, req.body);
    return reply.status(200).send(result);
  });

  app.post<{
    Body: { agent_id?: string; wallet_address?: string };
  }>("/treasury/policy/evaluate", async (req, reply) => {
    let agentId = req.body.agent_id;

    if (!agentId && req.body.wallet_address) {
      const agent = await getAgentByWallet(req.body.wallet_address);
      agentId = agent?.agent_id;
    }

    if (!agentId) {
      return reply.status(400).send({ error: "agent_id or wallet_address is required" });
    }

    return reply.send(await evaluateAgent(agentId));
  });

  app.get<{
    Querystring: { status?: string; agent_id?: string; limit?: string; offset?: string };
  }>("/treasury/refills", async (req) => {
    return listRefills({
      status: req.query.status,
      agent_id: req.query.agent_id,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : 50,
      offset: req.query.offset ? parseInt(req.query.offset, 10) : 0,
    });
  });

  app.get("/treasury/exposure", async () => getExposure());
  app.get("/treasury/status", async () => getTreasuryStatus());

  app.post<{
    Body: {
      scope_type: "global" | "namespace" | "agent";
      scope_key?: string;
      active?: boolean;
      reason?: string;
      metadata?: Record<string, unknown>;
    };
  }>("/treasury/halt", async (req) => {
    return setTreasuryHalt(req.body);
  });
}