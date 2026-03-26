/**
 * Health Routes — Guardian system health endpoints
 */

import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const { alerts, state } = (app as any).guardian;
  const daemons = (app as any).daemons;

  // Basic liveness probe
  app.get("/health", async () => {
    return { status: "ok", service: "guardian", timestamp: new Date().toISOString() };
  });

  // Detailed readiness check
  app.get("/health/ready", async () => {
    const sentinel = daemons.sentinel.getStatus();
    const alertStats = alerts.getStats();

    const ready = sentinel.nodes_healthy > 0 && alertStats.emergency === 0;

    return {
      ready,
      sentinel: {
        nodes: `${sentinel.nodes_healthy}/${sentinel.nodes_total}`,
        services: `${sentinel.services_healthy}/${sentinel.services_total}`,
        max_block: sentinel.max_block,
      },
      alerts: alertStats,
      timestamp: new Date().toISOString(),
    };
  });

  // Complete system status
  app.get("/health/full", async () => {
    return {
      guardian: "operational",
      sentinel: daemons.sentinel.getStatus(),
      enforcer: { blocked_ips: daemons.enforcer.getStatus().blocked_count },
      reaper: {
        total_uny: daemons.reaper.getStatus().total_uny,
        total_alt: daemons.reaper.getStatus().total_alt,
      },
      treasurer: { wallet_count: daemons.treasurer.getStatus().wallet_count },
      anchor: daemons.anchor.getStatus(),
      watcher: daemons.watcher.getStatus(),
      alerts: alerts.getStats(),
      timestamp: new Date().toISOString(),
    };
  });
}
