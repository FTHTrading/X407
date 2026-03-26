/**
 * Daemon Routes — Individual daemon status and control
 */

import type { FastifyInstance } from "fastify";

export async function daemonRoutes(app: FastifyInstance): Promise<void> {
  const daemons = (app as any).daemons as Record<string, any>;

  // List all daemons and their status
  app.get("/api/daemons", async () => {
    return {
      daemons: [
        { name: "sentinel",   role: "Infrastructure Health Monitor",  status: daemons.sentinel.getStatus() },
        { name: "enforcer",   role: "Security Guardian",              status: daemons.enforcer.getStatus() },
        { name: "healer",     role: "Auto-Repair & Self-Healing",     status: daemons.healer.getStatus() },
        { name: "reaper",     role: "Revenue Collection",             status: daemons.reaper.getStatus() },
        { name: "upgrader",   role: "Self-Upgrade & Deploy",          status: daemons.upgrader.getStatus() },
        { name: "treasurer",  role: "Treasury & Fund Management",     status: daemons.treasurer.getStatus() },
        { name: "anchor",     role: "L1 Chain Anchoring",             status: daemons.anchor.getStatus() },
        { name: "watcher",    role: "External Monitor",               status: daemons.watcher.getStatus() },
      ],
    };
  });

  // Individual daemon status
  app.get("/api/daemons/:name", async (req) => {
    const { name } = req.params as { name: string };
    const daemon = daemons[name];
    if (!daemon?.getStatus) {
      return { error: "Unknown daemon", name };
    }
    return { name, status: daemon.getStatus() };
  });

  // Sentinel specifics
  app.get("/api/daemons/sentinel/nodes", async () => {
    return { nodes: daemons.sentinel.getNodeHealths() };
  });

  app.get("/api/daemons/sentinel/services", async () => {
    return { services: daemons.sentinel.getServiceHealths() };
  });

  // Enforcer specifics
  app.get("/api/daemons/enforcer/blocked", async () => {
    return { blocked: daemons.enforcer.getStatus().blocked_ips };
  });

  app.post("/api/daemons/enforcer/block", async (req) => {
    const { ip, reason } = req.body as { ip: string; reason: string };
    await daemons.enforcer.blockIp(ip, reason ?? "Manual block");
    return { ok: true, ip };
  });

  app.post("/api/daemons/enforcer/unblock", async (req) => {
    const { ip } = req.body as { ip: string };
    const result = daemons.enforcer.unblockIp(ip);
    return { ok: result, ip };
  });

  // Healer specifics
  app.get("/api/daemons/healer/queue", async () => {
    return daemons.healer.getStatus();
  });

  // Reaper specifics
  app.get("/api/daemons/reaper/revenue", async () => {
    return daemons.reaper.getStatus();
  });

  app.get("/api/daemons/reaper/streams", async () => {
    return { streams: daemons.reaper.getStreams() };
  });

  // Upgrader specifics
  app.get("/api/daemons/upgrader/history", async () => {
    return daemons.upgrader.getStatus();
  });

  app.post("/api/daemons/upgrader/trigger", async (req) => {
    const { component, version } = req.body as { component: string; version: string };
    const record = await daemons.upgrader.triggerUpgrade(component, version);
    return { ok: true, upgrade: record };
  });

  // Treasurer specifics
  app.get("/api/daemons/treasurer/wallets", async () => {
    return daemons.treasurer.getStatus();
  });

  app.post("/api/daemons/treasurer/fund", async (req) => {
    const { address, amount, currency } = req.body as { address: string; amount: string; currency: string };
    const result = await daemons.treasurer.fundWallet(address, amount, currency);
    return { ok: result, address, amount, currency };
  });

  // Anchor specifics
  app.get("/api/daemons/anchor/batches", async () => {
    return daemons.anchor.getStatus();
  });

  // Watcher specifics
  app.get("/api/daemons/watcher/uptime", async () => {
    return daemons.watcher.getUptimeReport();
  });
}
