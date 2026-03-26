/**
 * FTH Guardian — Daemon Army Orchestrator
 *
 * Central nerve system for the UnyKorn L1 + x402 infrastructure.
 * Manages an army of specialized daemons that:
 *
 *   1. SENTINEL   — Monitor all nodes, services, and infrastructure health
 *   2. ENFORCER   — Security enforcement: rate limiting, anomaly detection, threat response
 *   3. HEALER     — Auto-restart failed services, repair state inconsistencies
 *   4. REAPER     — Revenue collection: gather fees, distribute rewards, compound earnings
 *   5. UPGRADER   — Self-upgrade: pull new images, rolling deploys, config hot-reload
 *   6. TREASURER  — Treasury management: auto-fund agents, balance monitoring, reserve policy
 *   7. ANCHOR     — L1 anchoring: batch receipts to chain, verify finality
 *   8. WATCHER    — External monitoring: DNS, SSL, domain expiry, third-party API health
 *
 * Runs on port 3300. All state in PostgreSQL.
 */

import Fastify from "fastify";
import cors from "@fastify/cors";

import { SentinelDaemon } from "./daemons/sentinel.js";
import { EnforcerDaemon } from "./daemons/enforcer.js";
import { HealerDaemon } from "./daemons/healer.js";
import { ReaperDaemon } from "./daemons/reaper.js";
import { UpgraderDaemon } from "./daemons/upgrader.js";
import { TreasurerDaemon } from "./daemons/treasurer.js";
import { AnchorDaemon } from "./daemons/anchor.js";
import { WatcherDaemon } from "./daemons/watcher.js";

import { healthRoutes } from "./routes/health.js";
import { daemonRoutes } from "./routes/daemons.js";
import { metricsRoutes } from "./routes/metrics.js";
import { commandRoutes } from "./routes/commands.js";

import { EventBus } from "./core/event-bus.js";
import { StateStore } from "./core/state-store.js";
import { AlertManager } from "./core/alert-manager.js";
import { AuditLog } from "./core/audit-log.js";

const PORT = Number(process.env.GUARDIAN_PORT ?? 3300);
const HOST = process.env.GUARDIAN_HOST ?? "0.0.0.0";

// ---------------------------------------------------------------------------
// Startup validation
// ---------------------------------------------------------------------------
const REQUIRED_ENV = ["DATABASE_URL"] as const;
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[GUARDIAN] FATAL — Missing env: ${missing.join(", ")}`);
  process.exit(1);
}

type DaemonInstance = SentinelDaemon | EnforcerDaemon | HealerDaemon | ReaperDaemon |
  UpgraderDaemon | TreasurerDaemon | AnchorDaemon | WatcherDaemon;

async function main() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
    },
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  });

  // ---------------------------------------------------------------------------
  // Core infrastructure
  // ---------------------------------------------------------------------------
  const eventBus = new EventBus();
  const state = new StateStore();
  const alerts = new AlertManager(eventBus, state);
  const audit = new AuditLog(eventBus, state);

  await state.initialize();
  await audit.start();

  // Decorate Fastify with shared context
  app.decorate("guardian", { eventBus, state, alerts, audit });

  // ---------------------------------------------------------------------------
  // Initialize all daemons
  // ---------------------------------------------------------------------------
  const daemons: Record<string, DaemonInstance> = {
    sentinel:  new SentinelDaemon(eventBus, state, alerts, audit),
    enforcer:  new EnforcerDaemon(eventBus, state, alerts, audit),
    healer:    new HealerDaemon(eventBus, state, alerts, audit),
    reaper:    new ReaperDaemon(eventBus, state, alerts, audit),
    upgrader:  new UpgraderDaemon(eventBus, state, alerts, audit),
    treasurer: new TreasurerDaemon(eventBus, state, alerts, audit),
    anchor:    new AnchorDaemon(eventBus, state, alerts, audit),
    watcher:   new WatcherDaemon(eventBus, state, alerts, audit),
  };

  app.decorate("daemons", daemons);

  // ---------------------------------------------------------------------------
  // Register routes
  // ---------------------------------------------------------------------------
  await app.register(healthRoutes);
  await app.register(daemonRoutes);
  await app.register(metricsRoutes);
  await app.register(commandRoutes);

  // Root endpoint — status overview
  app.get("/", async () => {
    const statuses = Object.entries(daemons).map(([name, d]) => ({
      name,
      status: "getStatus" in d ? "running" : "unknown",
    }));

    return {
      service: "fth-guardian",
      version: "1.0.0",
      status: "operational",
      daemon_count: Object.keys(daemons).length,
      daemons: statuses,
      started_at: new Date().toISOString(),
    };
  });

  // Error handler
  app.setErrorHandler((error: Error & { statusCode?: number }, req, reply) => {
    const status = error.statusCode ?? 500;
    app.log.error({ method: req.method, url: req.url, err: error.message }, "Guardian request failed");
    return reply.status(status).send({ error: error.message, code: "guardian_error" });
  });

  // ---------------------------------------------------------------------------
  // Start all daemons
  // ---------------------------------------------------------------------------
  app.log.info("=== FTH GUARDIAN — DAEMON ARMY INITIALIZING ===");

  for (const [name, daemon] of Object.entries(daemons)) {
    try {
      await daemon.start();
      app.log.info(`[${name.toUpperCase()}] daemon started`);
    } catch (err) {
      app.log.error(`[${name.toUpperCase()}] daemon failed to start: ${String(err)}`);
    }
  }

  app.log.info(`=== ALL ${Object.keys(daemons).length} DAEMONS ACTIVE ===`);

  // ---------------------------------------------------------------------------
  // Graceful shutdown
  // ---------------------------------------------------------------------------
  const shutdown = async () => {
    app.log.info("Guardian shutting down — stopping all daemons...");
    for (const [name, daemon] of Object.entries(daemons)) {
      try {
        daemon.stop();
        app.log.info(`[${name.toUpperCase()}] stopped`);
      } catch {
        // best effort
      }
    }
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // ---------------------------------------------------------------------------
  // Start HTTP server
  // ---------------------------------------------------------------------------
  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`FTH Guardian (${Object.keys(daemons).length} daemons) listening on ${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
