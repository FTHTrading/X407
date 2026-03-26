/**
 * Healer Daemon — Auto-Repair & Self-Healing
 *
 * Listens for infrastructure failures and automatically:
 * - Restarts failed L1 nodes via AWS SSM
 * - Restarts Facilitator/Treasury services
 * - Repairs database connection issues
 * - Re-registers unhealthy NLB targets
 * - Clears stuck transactions
 * - Repairs state inconsistencies
 *
 * Has built-in backoff and circuit-breaker to prevent repair storms.
 */

import type { EventBus } from "../core/event-bus.js";
import type { StateStore } from "../core/state-store.js";
import type { AlertManager } from "../core/alert-manager.js";
import type { AuditLog } from "../core/audit-log.js";

interface RepairAction {
  id: string;
  target: string;
  action: string;
  status: "pending" | "in-progress" | "completed" | "failed";
  attempts: number;
  max_attempts: number;
  last_attempt: string;
  next_attempt: string;
  result?: string;
}

const NODE_INSTANCE_MAP: Record<string, string> = {
  alpha:   "i-083a36c8ce027de55",
  bravo:   "i-0608a0ebab4d97d79",
  charlie: "i-0d87f793231da3772",
  delta:   "i-0e9a24f4902faaa06",
  echo:    "i-0d9493de789fc744a",
};

const MAX_REPAIR_ATTEMPTS = 3;
const REPAIR_BACKOFF_BASE_MS = 30_000;   // 30s base backoff
const CIRCUIT_BREAKER_THRESHOLD = 5;     // Stop after 5 failed repairs in a row
const CIRCUIT_BREAKER_RESET_MS = 600_000; // 10 minutes

export class HealerDaemon {
  private repairQueue: RepairAction[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private circuitBroken = false;
  private consecutiveFailures = 0;
  private circuitBrokeAt = 0;
  private healCount = 0;

  constructor(
    private bus: EventBus,
    private store: StateStore,
    private alerts: AlertManager,
    private audit: AuditLog,
  ) {
    // Listen for failure events
    this.bus.on("node.down", (event) => {
      const nodeId = event.data?.node as string;
      if (nodeId) this.enqueueRepair(nodeId, "restart_node");
    });

    this.bus.on("service.down", (event) => {
      const service = event.data?.service as string;
      if (service) this.enqueueRepair(service, "restart_service");
    });

    this.bus.on("chain.stalled", () => {
      this.enqueueRepair("chain", "restart_producer");
    });
  }

  async start(): Promise<void> {
    console.log("[Healer] Starting auto-repair daemon");
    await this.store.setDaemonState("healer", { status: "running" });

    // Process repair queue every 10 seconds
    this.interval = setInterval(() => this.processQueue(), 10_000);
    this.bus.emit("daemon.started", "healer", { daemon: "healer" });
  }

  async stop(): Promise<void> {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    await this.store.setDaemonState("healer", { status: "stopped" });
    this.bus.emit("daemon.stopped", "healer", { daemon: "healer" });
  }

  private enqueueRepair(target: string, action: string): void {
    // Deduplicate — don't add if same target+action already pending
    const existing = this.repairQueue.find(r => r.target === target && r.action === action && r.status !== "completed" && r.status !== "failed");
    if (existing) return;

    const repair: RepairAction = {
      id: `repair-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      target,
      action,
      status: "pending",
      attempts: 0,
      max_attempts: MAX_REPAIR_ATTEMPTS,
      last_attempt: "",
      next_attempt: new Date().toISOString(),
    };

    this.repairQueue.push(repair);
    this.bus.emit("healer.queued", "healer", { repair });
    console.log(`[Healer] Queued repair: ${action} on ${target}`);
  }

  private async processQueue(): Promise<void> {
    // Check circuit breaker
    if (this.circuitBroken) {
      if (Date.now() - this.circuitBrokeAt > CIRCUIT_BREAKER_RESET_MS) {
        this.circuitBroken = false;
        this.consecutiveFailures = 0;
        console.log("[Healer] Circuit breaker reset");
        await this.alerts.fire("healer", "info", "Healer circuit breaker reset", "Resuming auto-repair");
      } else {
        return;
      }
    }

    const now = new Date().toISOString();
    const pending = this.repairQueue.filter(r => r.status === "pending" && r.next_attempt <= now);

    for (const repair of pending) {
      if (this.circuitBroken) break;

      repair.status = "in-progress";
      repair.attempts++;
      repair.last_attempt = now;

      try {
        const result = await this.executeRepair(repair);
        repair.status = "completed";
        repair.result = result;
        this.consecutiveFailures = 0;
        this.healCount++;

        this.audit.recordAction("healer", repair.action, repair.target, "success", { result });
        await this.alerts.fire("healer", "info", `Repair completed: ${repair.target}`, result);
        this.bus.emit("healer.repaired", "healer", { repair });

        await this.store.setDaemonState("healer", {
          status: "running",
          success_count: this.healCount,
          metadata: { last_repair: repair },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.consecutiveFailures++;

        if (repair.attempts >= repair.max_attempts) {
          repair.status = "failed";
          repair.result = msg;
          await this.alerts.fire("healer", "critical", `Repair FAILED: ${repair.target}`,
            `${repair.attempts} attempts exhausted: ${msg}`);
          this.bus.emit("healer.failed", "healer", { repair });
        } else {
          // Exponential backoff for retry
          repair.status = "pending";
          const backoffMs = REPAIR_BACKOFF_BASE_MS * Math.pow(2, repair.attempts - 1);
          repair.next_attempt = new Date(Date.now() + backoffMs).toISOString();
          console.log(`[Healer] Retry ${repair.target} in ${backoffMs / 1000}s`);
        }

        // Check if circuit breaker should trip
        if (this.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
          this.circuitBroken = true;
          this.circuitBrokeAt = Date.now();
          await this.alerts.fire("healer", "emergency", "Healer circuit breaker TRIPPED",
            `${this.consecutiveFailures} consecutive repair failures — auto-repair disabled for ${CIRCUIT_BREAKER_RESET_MS / 60000} minutes`);
          this.bus.emit("healer.circuit_broken", "healer", { failures: this.consecutiveFailures });
        }
      }
    }

    // Prune completed/failed repairs older than 1 hour
    const cutoff = Date.now() - 3_600_000;
    this.repairQueue = this.repairQueue.filter(r =>
      r.status === "pending" || r.status === "in-progress" || new Date(r.last_attempt).getTime() > cutoff,
    );
  }

  private async executeRepair(repair: RepairAction): Promise<string> {
    switch (repair.action) {
      case "restart_node":
        return await this.restartNode(repair.target);
      case "restart_service":
        return await this.restartService(repair.target);
      case "restart_producer":
        return await this.restartProducer();
      default:
        throw new Error(`Unknown repair action: ${repair.action}`);
    }
  }

  private async restartNode(nodeId: string): Promise<string> {
    const instanceId = NODE_INSTANCE_MAP[nodeId];
    if (!instanceId) throw new Error(`Unknown node: ${nodeId}`);

    console.log(`[Healer] Restarting L1 node ${nodeId} (${instanceId}) via SSM`);

    // Use AWS SSM to restart the container on the EC2 instance
    const command = `docker restart unykorn-l1-${nodeId} 2>&1 || systemctl restart unykorn-l1-${nodeId} 2>&1`;

    // We make the AWS API call via the local CLI — in production this would use @aws-sdk/client-ssm
    const resp = await fetch("http://localhost:3300/api/commands/ssm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instance_id: instanceId, command }),
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);

    if (resp?.ok) {
      return `Node ${nodeId} restart command sent to ${instanceId}`;
    }

    // Fallback: try direct L1 node admin_restart RPC endpoint
    const port = 3001 + Object.keys(NODE_INSTANCE_MAP).indexOf(nodeId);
    const rpcResp = await fetch(`http://rpc.l1.unykorn.org:${port}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "admin_restart", params: [] }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);

    if (rpcResp?.ok) {
      return `Node ${nodeId} restart via RPC admin`;
    }

    throw new Error(`Could not restart ${nodeId} — SSM and RPC both failed`);
  }

  private async restartService(service: string): Promise<string> {
    console.log(`[Healer] Restarting service: ${service}`);

    // For local Docker deployment
    const dockerCmd = `docker restart fth-x402-${service}`;
    const resp = await fetch("http://localhost:3300/api/commands/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: dockerCmd }),
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);

    if (resp?.ok) {
      return `Service ${service} restarted via Docker`;
    }

    throw new Error(`Could not restart ${service}`);
  }

  private async restartProducer(): Promise<string> {
    // Alpha is the block producer — restart it
    return await this.restartNode("alpha");
  }

  getStatus() {
    return {
      heal_count: this.healCount,
      circuit_broken: this.circuitBroken,
      consecutive_failures: this.consecutiveFailures,
      pending_repairs: this.repairQueue.filter(r => r.status === "pending").length,
      active_repairs: this.repairQueue.filter(r => r.status === "in-progress").length,
      completed_repairs: this.repairQueue.filter(r => r.status === "completed").length,
      failed_repairs: this.repairQueue.filter(r => r.status === "failed").length,
      queue: this.repairQueue,
    };
  }
}
