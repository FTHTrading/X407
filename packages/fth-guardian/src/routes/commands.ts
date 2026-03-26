/**
 * Command Routes — Remote control and administration
 */

import type { FastifyInstance } from "fastify";

// Allowlisted commands that can be executed locally
const ALLOWED_COMMANDS = new Set([
  "docker ps",
  "docker stats --no-stream",
  "df -h",
  "free -m",
  "uptime",
]);

export async function commandRoutes(app: FastifyInstance): Promise<void> {
  const { eventBus: bus, store, audit, alerts } = (app as any).guardian;
  const { enforcer, upgrader, treasurer } = (app as any).daemons;

  // Emit an event to the bus
  app.post("/api/commands/emit", async (req) => {
    const { event, source, data } = req.body as { event: string; source: string; data?: Record<string, unknown> };
    if (!event) return { error: "event is required" };

    bus.emit(event, source ?? "api", data ?? {});
    audit.recordAction("api", "emit_event", event, "success", { source, data });
    return { ok: true, event };
  });

  // Get event history
  app.get("/api/commands/events", async (req) => {
    const query = req.query as { type?: string; limit?: string };
    const limit = parseInt(query.limit ?? "50", 10);
    let history = bus.getHistory();
    if (query.type) {
      history = history.filter((e: any) => e.type.includes(query.type!));
    }
    return { events: history.slice(0, limit) };
  });

  // Get alerts
  app.get("/api/commands/alerts", async (req) => {
    const query = req.query as { severity?: string; active?: string };
    if (query.active === "true") {
      return { alerts: alerts.getActive(query.severity) };
    }
    return { alerts: alerts.getRecent(50) };
  });

  // Acknowledge/resolve alert
  app.post("/api/commands/alerts/:id/acknowledge", async (req) => {
    const { id } = req.params as { id: string };
    const ok = alerts.acknowledge(id);
    return { ok, id };
  });

  app.post("/api/commands/alerts/:id/resolve", async (req) => {
    const { id } = req.params as { id: string };
    const ok = alerts.resolve(id);
    return { ok, id };
  });

  // Query audit log
  app.get("/api/commands/audit", async (req) => {
    const query = req.query as { source?: string; severity?: string; event_type?: string; since?: string; limit?: string };
    const entries = await audit.query({
      source: query.source,
      severity: query.severity,
      event_type: query.event_type,
      since: query.since,
      limit: parseInt(query.limit ?? "50", 10),
    });
    return { entries };
  });

  // Update security policy
  app.post("/api/commands/security/policy", async (req) => {
    const policy = req.body as Record<string, unknown>;
    enforcer.updatePolicy(policy);
    return { ok: true, policy: enforcer.getStatus().policy };
  });

  // Update treasury policy
  app.post("/api/commands/treasury/policy", async (req) => {
    const policy = req.body as Record<string, unknown>;
    treasurer.updatePolicy(policy);
    return { ok: true };
  });

  // Trigger upgrade
  app.post("/api/commands/upgrade", async (req) => {
    const { component, version } = req.body as { component: string; version: string };
    if (!component || !version) return { error: "component and version required" };
    const record = await upgrader.triggerUpgrade(component, version);
    return { ok: true, upgrade: record };
  });

  // Execute SSM command on EC2 instance (proxied)
  app.post("/api/commands/ssm", async (req) => {
    const { instance_id, command } = req.body as { instance_id: string; command: string };

    if (!instance_id || !command) {
      return { error: "instance_id and command required" };
    }

    audit.recordAction("api", "ssm_command", instance_id, "submitted", { command });

    // For safety, only allow certain commands
    const safeCommands = ["docker restart", "docker logs", "systemctl status", "systemctl restart", "cat /var/log"];
    const isSafe = safeCommands.some((prefix: string) => command.startsWith(prefix));
    if (!isSafe) {
      return { error: "Command not in allowlist", allowed_prefixes: safeCommands };
    }

    return { ok: true, instance_id, command, note: "SSM execution will be implemented via AWS SDK" };
  });

  // Execute local command (strict allowlist)
  app.post("/api/commands/exec", async (req) => {
    const { command } = req.body as { command: string };

    if (!command || !ALLOWED_COMMANDS.has(command)) {
      return { error: "Command not allowed", allowed: [...ALLOWED_COMMANDS] };
    }

    audit.recordAction("api", "local_exec", command, "submitted");
    return { ok: true, command, note: "Execution pending" };
  });

  // Emergency halt — stop all daemons
  app.post("/api/commands/halt", async (req) => {
    const { reason } = req.body as { reason?: string };
    bus.emit("system.halt", "api", { reason: reason ?? "Manual halt" });
    audit.recordAction("api", "emergency_halt", "all_daemons", "initiated", { reason });
    await alerts.fire("api", "emergency", "EMERGENCY HALT", reason ?? "Manual system halt");
    return { ok: true, action: "halt", reason };
  });

  // Resume after halt
  app.post("/api/commands/resume", async () => {
    bus.emit("system.resume", "api", {});
    audit.recordAction("api", "system_resume", "all_daemons", "initiated");
    return { ok: true, action: "resume" };
  });

  // System overview dashboard
  app.get("/api/dashboard", async () => {
    const revenueTotal = await store.getRevenueTotal();
    return {
      system: "guardian",
      version: "1.0.0",
      uptime: process.uptime(),
      alerts: alerts.getStats(),
      revenue: revenueTotal,
      timestamp: new Date().toISOString(),
    };
  });
}
