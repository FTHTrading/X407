/**
 * FTH x402 Facilitator — Fastify Entry Point
 *
 * Settlement brain for the FTH x402 payment protocol.
 * Handles: invoice creation, payment verification, credit ledger,
 * payment channels, receipt batching, namespace resolution.
 *
 * Runs on port 3100 by default. All state in PostgreSQL.
 */

import Fastify from "fastify";
import cors from "@fastify/cors";

// Routes
import healthRoutes from "./routes/health";
import verifyRoutes from "./routes/verify";
import invoiceRoutes from "./routes/invoices";
import creditRoutes from "./routes/credits";
import channelRoutes from "./routes/channels";
import receiptRoutes from "./routes/receipts";
import namespaceRoutes from "./routes/namespaces";
import l1Routes from "./routes/l1";
import webhookRoutes from "./routes/webhooks";
import operatorRoutes from "./routes/operator";

// Services
import { startBatcher, stopBatcher } from "./services/receipts";
import { expireInvoices } from "./services/invoices";
import { anchorPendingBatches } from "./services/l1-adapter";
import { cleanupRateLimitLog } from "./services/rate-limiter";
import { retryFailedDeliveries, cleanupDeliveries } from "./services/webhooks";

const PORT = Number(process.env.PORT ?? 3100);
const HOST = process.env.HOST ?? "0.0.0.0";
const ADMIN_AUTH_ENABLED = Boolean(process.env.ADMIN_API_TOKEN?.trim());

// ---------------------------------------------------------------------------
// Startup validation — fail fast if critical env vars are missing
// ---------------------------------------------------------------------------
const REQUIRED_ENV = ["DATABASE_URL", "FTH_SIGNING_KEY"] as const;
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[FATAL] Missing required environment variables: ${missing.join(", ")}`);
  console.error("Set them in .env or via your deployment secrets manager.");
  process.exit(1);
}

async function main() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport:
        process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty" }
          : undefined,
    },
  });

  // CORS
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  });

  app.get("/", async (_req, reply) => {
    return reply.send({
      service: "fth-x402-facilitator",
      status: "ok",
      description: "Settlement and verification service for the UnyKorn-first x402 stack.",
      admin_auth: {
        enabled: ADMIN_AUTH_ENABLED,
        methods: ADMIN_AUTH_ENABLED ? ["Authorization: Bearer <token>", "X-Admin-Token: <token>"] : [],
      },
      endpoints: [
        "/health",
        "/verify",
        "/invoices",
        "/credits/register",
        "/credits/deposit",
        "/admin/invoices",
        "/admin/receipts",
        "/admin/anchoring",
        "/admin/treasury",
        "/admin/treasury/refills",
        "/l1/health",
        "/l1/batches",
      ],
    });
  });

  // Request logging — structured latency + status tracking
  app.addHook("onResponse", async (req, reply) => {
    const url = req.url;
    // Skip health checks from log noise
    if (url === "/health") return;
    app.log.info({
      method: req.method,
      url,
      status: reply.statusCode,
      duration_ms: Math.round(reply.elapsedTime),
      ip: req.ip,
    }, `${req.method} ${url} → ${reply.statusCode} (${Math.round(reply.elapsedTime)}ms)`);
  });

  // Global error handler
  app.setErrorHandler((error, req, reply) => {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    const message = err.message ?? "Unknown error";
    app.log.error({
      method: req.method,
      url: req.url,
      status,
      error: message,
    }, `Error: ${req.method} ${req.url} → ${status}`);

    return reply.status(status).send({
      error: status >= 500 ? "Internal server error" : message,
      error_code: status >= 500 ? "internal_error" : "request_error",
    });
  });

  // Register routes
  await app.register(healthRoutes);
  await app.register(verifyRoutes);
  await app.register(invoiceRoutes);
  await app.register(creditRoutes);
  await app.register(channelRoutes);
  await app.register(receiptRoutes);
  await app.register(namespaceRoutes);
  await app.register(l1Routes);
  await app.register(webhookRoutes);
  await app.register(operatorRoutes);

  // Start receipt batcher
  startBatcher();

  // Periodic invoice expiry (every 60s)
  const expiryTimer = setInterval(async () => {
    try {
      const expired = await expireInvoices();
      if (expired > 0) {
        app.log.info(`Expired ${expired} invoices`);
      }
    } catch (err) {
      app.log.error("Invoice expiry error: %s", String(err));
    }
  }, 60_000);

  // Periodic L1 anchor check (every 60s — pick up any missed batches)
  const anchorTimer = setInterval(async () => {
    try {
      const anchored = await anchorPendingBatches();
      if (anchored > 0) {
        app.log.info(`Anchored ${anchored} batch(es) on L1`);
      }
    } catch (err) {
      app.log.error("L1 anchor sweep error: %s", String(err));
    }
  }, 60_000);

  // Rate limit log cleanup (every 15 min)
  const rateLimitTimer = setInterval(async () => {
    try {
      const cleaned = await cleanupRateLimitLog();
      if (cleaned > 0) {
        app.log.info(`Cleaned ${cleaned} rate limit entries`);
      }
    } catch (err) {
      app.log.error("Rate limit cleanup error: %s", String(err));
    }
  }, 900_000);

  // Webhook retry + cleanup (every 5 min)
  const webhookTimer = setInterval(async () => {
    try {
      const retried = await retryFailedDeliveries();
      if (retried > 0) app.log.info(`Retried ${retried} webhook deliveries`);
      const cleaned = await cleanupDeliveries();
      if (cleaned > 0) app.log.info(`Cleaned ${cleaned} old webhook deliveries`);
    } catch (err) {
      app.log.error("Webhook maintenance error: %s", String(err));
    }
  }, 300_000);

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info("Shutting down...");
    stopBatcher();
    clearInterval(expiryTimer);
    clearInterval(anchorTimer);
    clearInterval(rateLimitTimer);
    clearInterval(webhookTimer);
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start server
  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`FTH x402 Facilitator listening on ${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
