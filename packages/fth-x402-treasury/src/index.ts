import Fastify from "fastify";
import cors from "@fastify/cors";

import healthRoutes from "./routes/health";
import treasuryRoutes from "./routes/treasury";
import { startTreasuryWorker, stopTreasuryWorker } from "./services/treasury";

const PORT = Number(process.env.TREASURY_PORT ?? 3200);
const HOST = process.env.TREASURY_HOST ?? "0.0.0.0";

if (!process.env.DATABASE_URL && !process.env.PGHOST) {
  console.error("[FATAL] DATABASE_URL or PGHOST-based PostgreSQL configuration is required.");
  process.exit(1);
}

async function main() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  app.get("/", async () => ({
    service: "fth-x402-treasury",
    status: "ok",
    description: "Treasury policy and automated refill service for the UnyKorn-first x402 stack.",
    endpoints: [
      "/health",
      "/treasury/agents/register",
      "/treasury/agents",
      "/treasury/refills",
      "/treasury/exposure",
      "/treasury/status",
      "/treasury/halt",
    ],
  }));

  app.setErrorHandler((error, req, reply) => {
    const err = error as { statusCode?: number; message?: string };
    const statusCode = err.statusCode ?? 500;
    const message = err.message ?? "Unknown error";
    app.log.error({ method: req.method, url: req.url, error: message }, "Treasury request failed");
    return reply.status(statusCode).send({
      error: statusCode >= 500 ? "Internal server error" : message,
      error_code: statusCode >= 500 ? "internal_error" : "request_error",
    });
  });

  await app.register(healthRoutes);
  await app.register(treasuryRoutes);

  startTreasuryWorker(app.log);

  const shutdown = async () => {
    app.log.info("Shutting down treasury service");
    stopTreasuryWorker();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    await app.listen({ host: HOST, port: PORT });
    app.log.info(`FTH x402 Treasury listening on ${HOST}:${PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

main();