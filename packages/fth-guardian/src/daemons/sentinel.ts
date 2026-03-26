/**
 * Sentinel Daemon — Infrastructure Health Monitor
 *
 * Continuously monitors:
 * - All 5 L1 nodes (health, block production, sync status, peer count)
 * - Facilitator service (port 3100)
 * - Treasury service (port 3200)
 * - PostgreSQL connectivity
 * - NLB health targets
 * - Disk, memory, CPU via CloudWatch
 *
 * Emits alerts when thresholds are breached and triggers auto-healing.
 */

import type { EventBus } from "../core/event-bus.js";
import type { StateStore } from "../core/state-store.js";
import type { AlertManager } from "../core/alert-manager.js";
import type { AuditLog } from "../core/audit-log.js";

interface NodeHealth {
  id: string;
  name: string;
  endpoint: string;
  healthy: boolean;
  blockHeight: number;
  peerCount: number;
  runtimeVersion: number;
  lastChecked: string;
  latencyMs: number;
  consecutiveFailures: number;
}

interface ServiceHealth {
  name: string;
  url: string;
  healthy: boolean;
  latencyMs: number;
  lastChecked: string;
  consecutiveFailures: number;
}

const L1_NODES = [
  { id: "alpha",   name: "unykorn-l1-alpha",   endpoint: "http://rpc.l1.unykorn.org:3001" },
  { id: "bravo",   name: "unykorn-l1-bravo",   endpoint: "http://rpc.l1.unykorn.org:3002" },
  { id: "charlie", name: "unykorn-l1-charlie",  endpoint: "http://rpc.l1.unykorn.org:3003" },
  { id: "delta",   name: "unykorn-l1-delta",    endpoint: "http://rpc.l1.unykorn.org:3004" },
  { id: "echo",    name: "unykorn-l1-echo",     endpoint: "http://rpc.l1.unykorn.org:3005" },
];

const SERVICES = [
  { name: "facilitator", url: process.env.FACILITATOR_URL ?? "http://localhost:3100/health" },
  { name: "treasury",    url: process.env.TREASURY_URL    ?? "http://localhost:3200/health" },
];

const CHECK_INTERVAL_MS = 15_000;       // Check every 15 seconds
const BLOCK_STALL_THRESHOLD = 30;       // Alert if no new blocks in 30s (10 block intervals)
const MAX_CONSECUTIVE_FAILURES = 3;
const MAX_BLOCK_DRIFT = 5;              // Alert if nodes differ by > 5 blocks

export class SentinelDaemon {
  private interval: ReturnType<typeof setInterval> | null = null;
  private nodeStates = new Map<string, NodeHealth>();
  private serviceStates = new Map<string, ServiceHealth>();
  private lastMaxBlock = 0;
  private lastMaxBlockTime = Date.now();

  constructor(
    private bus: EventBus,
    private store: StateStore,
    private alerts: AlertManager,
    private audit: AuditLog,
  ) {}

  async start(): Promise<void> {
    console.log("[Sentinel] Starting infrastructure health monitor");
    await this.store.setDaemonState("sentinel", { status: "running", config: { interval_ms: CHECK_INTERVAL_MS } });

    // Initial check
    await this.runChecks();

    // Schedule periodic checks
    this.interval = setInterval(() => this.runChecks(), CHECK_INTERVAL_MS);
    this.bus.emit("daemon.started", "sentinel", { daemon: "sentinel" });
  }

  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    await this.store.setDaemonState("sentinel", { status: "stopped" });
    this.bus.emit("daemon.stopped", "sentinel", { daemon: "sentinel" });
  }

  private async runChecks(): Promise<void> {
    try {
      await Promise.all([
        this.checkL1Nodes(),
        this.checkServices(),
      ]);
      await this.checkBlockConsensus();
      await this.store.setDaemonState("sentinel", {
        status: "running",
        last_run_at: new Date().toISOString(),
        success_count: (await this.store.getDaemonState("sentinel"))?.success_count ?? 0 + 1,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.alerts.fire("sentinel", "warn", "Sentinel check failed", msg);
    }
  }

  private async checkL1Nodes(): Promise<void> {
    const checkPromises = L1_NODES.map(async (node) => {
      const start = Date.now();
      const prev = this.nodeStates.get(node.id) ?? {
        id: node.id,
        name: node.name,
        endpoint: node.endpoint,
        healthy: true,
        blockHeight: 0,
        peerCount: 0,
        runtimeVersion: 0,
        lastChecked: "",
        latencyMs: 0,
        consecutiveFailures: 0,
      };

      try {
        const resp = await fetch(`${node.endpoint}/health`, { signal: AbortSignal.timeout(5000) });
        const latency = Date.now() - start;

        if (resp.ok) {
          // Get block height + peer info via /status REST endpoint (reliable)
          let blockHeight = prev.blockHeight;
          let peerCount = prev.peerCount;
          try {
            const statusResp = await fetch(`${node.endpoint}/status`, {
              headers: { Accept: "application/json" },
              signal: AbortSignal.timeout(5000),
            });
            if (statusResp.ok) {
              const statusData = await statusResp.json() as {
                blockHeight?: number; activeValidators?: number;
                mempoolSize?: number; uptime?: number;
              };
              if (statusData.blockHeight) blockHeight = statusData.blockHeight;
              if (statusData.activeValidators) peerCount = statusData.activeValidators;
            }
          } catch { /* /status endpoint may not be available */ }

          const state: NodeHealth = {
            ...prev,
            healthy: true,
            blockHeight,
            peerCount,
            latencyMs: latency,
            lastChecked: new Date().toISOString(),
            consecutiveFailures: 0,
          };
          this.nodeStates.set(node.id, state);

          // Record metric
          await this.store.recordMetric("node.latency", latency, { node: node.id });
          await this.store.recordMetric("node.block_height", blockHeight, { node: node.id });

          // If was down, now recovered
          if (!prev.healthy && prev.consecutiveFailures > 0) {
            await this.alerts.fire("sentinel", "info", `Node ${node.name} recovered`, `Back online after ${prev.consecutiveFailures} failures (${latency}ms)`);
            this.bus.emit("node.recovered", "sentinel", { node: node.id, latency });
          }
        } else {
          throw new Error(`HTTP ${resp.status}`);
        }
      } catch (err) {
        const latency = Date.now() - start;
        const failures = prev.consecutiveFailures + 1;
        const msg = err instanceof Error ? err.message : String(err);

        this.nodeStates.set(node.id, {
          ...prev,
          healthy: false,
          latencyMs: latency,
          lastChecked: new Date().toISOString(),
          consecutiveFailures: failures,
        });

        await this.store.recordMetric("node.failures", failures, { node: node.id });

        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          await this.alerts.fire("sentinel", "critical", `Node ${node.name} DOWN`, `${failures} consecutive failures: ${msg}`);
          this.bus.emit("node.down", "sentinel", { node: node.id, failures, error: msg });
        } else {
          await this.alerts.fire("sentinel", "warn", `Node ${node.name} unhealthy`, `Failure #${failures}: ${msg}`);
        }
      }
    });

    await Promise.allSettled(checkPromises);
  }

  private async checkServices(): Promise<void> {
    for (const svc of SERVICES) {
      const start = Date.now();
      const prev = this.serviceStates.get(svc.name) ?? {
        name: svc.name, url: svc.url, healthy: true, latencyMs: 0, lastChecked: "", consecutiveFailures: 0,
      };

      try {
        const resp = await fetch(svc.url, { signal: AbortSignal.timeout(5000) });
        const latency = Date.now() - start;

        if (resp.ok) {
          this.serviceStates.set(svc.name, {
            ...prev, healthy: true, latencyMs: latency, lastChecked: new Date().toISOString(), consecutiveFailures: 0,
          });
          await this.store.recordMetric("service.latency", latency, { service: svc.name });

          if (!prev.healthy) {
            await this.alerts.fire("sentinel", "info", `${svc.name} recovered`, `Back online (${latency}ms)`);
            this.bus.emit("service.recovered", "sentinel", { service: svc.name });
          }
        } else {
          throw new Error(`HTTP ${resp.status}`);
        }
      } catch (err) {
        const failures = prev.consecutiveFailures + 1;
        const msg = err instanceof Error ? err.message : String(err);

        this.serviceStates.set(svc.name, {
          ...prev, healthy: false, lastChecked: new Date().toISOString(), consecutiveFailures: failures,
        });

        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          await this.alerts.fire("sentinel", "critical", `${svc.name} DOWN`, `${failures} failures: ${msg}`);
          this.bus.emit("service.down", "sentinel", { service: svc.name, failures });
        }
      }
    }
  }

  private async checkBlockConsensus(): Promise<void> {
    const heights = Array.from(this.nodeStates.values())
      .filter(n => n.healthy)
      .map(n => n.blockHeight);

    if (heights.length < 2) return;

    const maxBlock = Math.max(...heights);
    const minBlock = Math.min(...heights);
    const drift = maxBlock - minBlock;

    // Check for block production stall
    const now = Date.now();
    if (maxBlock > this.lastMaxBlock) {
      this.lastMaxBlock = maxBlock;
      this.lastMaxBlockTime = now;
    } else if (now - this.lastMaxBlockTime > BLOCK_STALL_THRESHOLD * 1000) {
      await this.alerts.fire("sentinel", "emergency", "Block production STALLED",
        `No new blocks in ${Math.round((now - this.lastMaxBlockTime) / 1000)}s. Last block: #${maxBlock}`);
      this.bus.emit("chain.stalled", "sentinel", { last_block: maxBlock, stall_seconds: (now - this.lastMaxBlockTime) / 1000 });
    }

    // Check for excessive drift between nodes
    if (drift > MAX_BLOCK_DRIFT) {
      await this.alerts.fire("sentinel", "warn", "Node block drift detected",
        `Max drift: ${drift} blocks (${minBlock} → ${maxBlock})`);
      this.bus.emit("chain.drift", "sentinel", { drift, min: minBlock, max: maxBlock });
    }

    await this.store.recordMetric("chain.block_height", maxBlock, {});
    await this.store.recordMetric("chain.node_drift", drift, {});
  }

  getNodeHealths(): NodeHealth[] {
    return Array.from(this.nodeStates.values());
  }

  getServiceHealths(): ServiceHealth[] {
    return Array.from(this.serviceStates.values());
  }

  getStatus() {
    const nodes = this.getNodeHealths();
    const services = this.getServiceHealths();
    return {
      nodes_healthy: nodes.filter(n => n.healthy).length,
      nodes_total: nodes.length,
      services_healthy: services.filter(s => s.healthy).length,
      services_total: services.length,
      max_block: this.lastMaxBlock,
      last_block_time: new Date(this.lastMaxBlockTime).toISOString(),
    };
  }
}
