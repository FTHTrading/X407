import type { FastifyInstance } from "fastify";

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    ok: true,
    service: "fth-x402-treasury",
    timestamp: new Date().toISOString(),
  }));
}