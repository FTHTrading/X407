/**
 * Metrics Routes — Prometheus-compatible metrics & revenue reporting
 */

import type { FastifyInstance } from "fastify";

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  const { store, alerts } = (app as any).guardian;
  const { reaper } = (app as any).daemons;

  // Prometheus-compatible metrics endpoint
  app.get("/metrics", async (_, reply) => {
    reply.header("Content-Type", "text/plain; version=0.0.4");

    const reaperStatus = reaper.getStatus();
    const alertStats = alerts.getStats();

    const lines: string[] = [
      "# HELP guardian_revenue_uny_total Total UNY revenue collected",
      "# TYPE guardian_revenue_uny_total counter",
      `guardian_revenue_uny_total ${reaperStatus.total_uny}`,
      "",
      "# HELP guardian_revenue_uny_total Total UNY revenue collected",
      "# TYPE guardian_revenue_uny_total counter",
      `guardian_revenue_uny_total ${reaperStatus.total_uny}`,
      "",
      "# HELP guardian_collection_cycles Total revenue collection cycles",
      "# TYPE guardian_collection_cycles counter",
      `guardian_collection_cycles ${reaperStatus.collection_count}`,
      "",
      "# HELP guardian_alerts_active Number of active alerts",
      "# TYPE guardian_alerts_active gauge",
      `guardian_alerts_active ${alertStats.active}`,
      "",
      "# HELP guardian_alerts_critical Number of active critical alerts",
      "# TYPE guardian_alerts_critical gauge",
      `guardian_alerts_critical ${alertStats.critical}`,
      "",
      "# HELP guardian_alerts_emergency Number of active emergency alerts",
      "# TYPE guardian_alerts_emergency gauge",
      `guardian_alerts_emergency ${alertStats.emergency}`,
      "",
      "# HELP guardian_alerts_total Total alerts ever fired",
      "# TYPE guardian_alerts_total counter",
      `guardian_alerts_total ${alertStats.total}`,
    ];

    // Add per-stream metrics
    for (const stream of reaper.getStreams()) {
      const safeName = stream.name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
      lines.push("");
      lines.push(`# HELP guardian_revenue_stream_uny_${safeName} UNY from ${stream.name}`);
      lines.push(`# TYPE guardian_revenue_stream_uny_${safeName} counter`);
      lines.push(`guardian_revenue_stream_uny_${safeName} ${stream.total_collected_uny}`);
      lines.push(`guardian_revenue_stream_uny_${safeName} ${stream.total_collected}`);
    }

    return lines.join("\n") + "\n";
  });

  // JSON revenue dashboard
  app.get("/api/metrics/revenue", async () => {
    const reaperStatus = reaper.getStatus();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRevenue = await store.getRevenueTotal(today.toISOString());
    const allTimeRevenue = await store.getRevenueTotal();

    return {
      today: {
        uny: todayRevenue.total_uny,
        alt: todayRevenue.total_alt,
        transactions: todayRevenue.count,
      },
      all_time: {
        uny: allTimeRevenue.total_uny,
        alt: allTimeRevenue.total_alt,
        transactions: allTimeRevenue.count,
      },
      streams: reaperStatus.streams,
      collection_count: reaperStatus.collection_count,
    };
  });

  // Historical metrics query
  app.get("/api/metrics/:name", async (req) => {
    const { name } = req.params as { name: string };
    const metrics = await store.getMetrics(name, 100);
    return { metric: name, data: metrics };
  });
}
