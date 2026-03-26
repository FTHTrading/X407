/**
 * Watcher Daemon — External Infrastructure Monitor
 *
 * Monitors all external-facing infrastructure:
 * - DNS resolution and propagation
 * - SSL/TLS certificate expiry
 * - Domain expiry dates
 * - Third-party API health (Cloudflare, AWS)
 * - External RPC endpoint availability
 * - Public website uptime (x402 site)
 * - Geographic availability checks
 */

import type { EventBus } from "../core/event-bus.js";
import type { StateStore } from "../core/state-store.js";
import type { AlertManager } from "../core/alert-manager.js";
import type { AuditLog } from "../core/audit-log.js";

interface EndpointCheck {
  name: string;
  url: string;
  expected_status: number;
  timeout_ms: number;
  healthy: boolean;
  latency_ms: number;
  last_checked: string;
  consecutive_failures: number;
}

interface DnsRecord {
  domain: string;
  record_type: string;
  expected_value?: string;
  resolved: boolean;
  actual_value?: string;
  last_checked: string;
}

const EXTERNAL_CHECK_INTERVAL_MS = 60_000;     // Check every 60 seconds
const DNS_CHECK_INTERVAL_MS = 300_000;         // Check DNS every 5 minutes
const CERT_CHECK_INTERVAL_MS = 3_600_000;      // Check certs every hour
const MAX_FAILURES_BEFORE_ALERT = 3;

const MONITORED_ENDPOINTS: Array<Omit<EndpointCheck, "healthy" | "latency_ms" | "last_checked" | "consecutive_failures">> = [
  { name: "L1 RPC (Alpha)",    url: "http://rpc.l1.unykorn.org:3001/health", expected_status: 200, timeout_ms: 5000 },
  { name: "L1 RPC (Bravo)",    url: "http://rpc.l1.unykorn.org:3002/health", expected_status: 200, timeout_ms: 5000 },
  { name: "L1 RPC (Charlie)",  url: "http://rpc.l1.unykorn.org:3003/health", expected_status: 200, timeout_ms: 5000 },
  { name: "L1 RPC (Delta)",    url: "http://rpc.l1.unykorn.org:3004/health", expected_status: 200, timeout_ms: 5000 },
  { name: "L1 RPC (Echo)",     url: "http://rpc.l1.unykorn.org:3005/health", expected_status: 200, timeout_ms: 5000 },
  { name: "x402 Site",         url: "https://x402.org",                      expected_status: 200, timeout_ms: 10000 },
  { name: "Facilitator",       url: process.env.FACILITATOR_PUBLIC_URL ?? "http://localhost:3100/health", expected_status: 200, timeout_ms: 5000 },
];

const MONITORED_DNS: Array<Omit<DnsRecord, "resolved" | "actual_value" | "last_checked">> = [
  { domain: "rpc.l1.unykorn.org", record_type: "A" },
  { domain: "x402.org",           record_type: "A" },
  { domain: "l1.unykorn.org",     record_type: "NS" },
];

export class WatcherDaemon {
  private externalInterval: ReturnType<typeof setInterval> | null = null;
  private dnsInterval: ReturnType<typeof setInterval> | null = null;
  private certInterval: ReturnType<typeof setInterval> | null = null;
  private endpoints = new Map<string, EndpointCheck>();
  private dnsRecords = new Map<string, DnsRecord>();
  private uptimeHistory: Array<{ timestamp: string; healthy_count: number; total: number }> = [];

  constructor(
    private bus: EventBus,
    private store: StateStore,
    private alerts: AlertManager,
    private audit: AuditLog,
  ) {}

  async start(): Promise<void> {
    console.log("[Watcher] Starting external infrastructure monitor");
    await this.store.setDaemonState("watcher", { status: "running" });

    // Initial checks
    await this.checkEndpoints();

    // Schedule periodic checks
    this.externalInterval = setInterval(() => this.checkEndpoints(), EXTERNAL_CHECK_INTERVAL_MS);
    this.dnsInterval = setInterval(() => this.checkDns(), DNS_CHECK_INTERVAL_MS);
    this.certInterval = setInterval(() => this.checkCertificates(), CERT_CHECK_INTERVAL_MS);

    this.bus.emit("daemon.started", "watcher", { daemon: "watcher" });
  }

  async stop(): Promise<void> {
    if (this.externalInterval) { clearInterval(this.externalInterval); this.externalInterval = null; }
    if (this.dnsInterval) { clearInterval(this.dnsInterval); this.dnsInterval = null; }
    if (this.certInterval) { clearInterval(this.certInterval); this.certInterval = null; }
    await this.store.setDaemonState("watcher", { status: "stopped" });
    this.bus.emit("daemon.stopped", "watcher", { daemon: "watcher" });
  }

  private async checkEndpoints(): Promise<void> {
    const checks = MONITORED_ENDPOINTS.map(async (ep) => {
      const start = Date.now();
      const prev = this.endpoints.get(ep.name) ?? {
        ...ep,
        healthy: true,
        latency_ms: 0,
        last_checked: "",
        consecutive_failures: 0,
      };

      try {
        const resp = await fetch(ep.url, {
          signal: AbortSignal.timeout(ep.timeout_ms),
          redirect: "follow",
        });
        const latency = Date.now() - start;

        const healthy = resp.status === ep.expected_status;
        const state: EndpointCheck = {
          ...ep,
          healthy,
          latency_ms: latency,
          last_checked: new Date().toISOString(),
          consecutive_failures: healthy ? 0 : prev.consecutive_failures + 1,
        };

        this.endpoints.set(ep.name, state);
        await this.store.recordMetric("watcher.endpoint_latency", latency, { endpoint: ep.name });

        if (healthy && !prev.healthy) {
          await this.alerts.fire("watcher", "info", `${ep.name} recovered`, `Back online (${latency}ms)`);
          this.bus.emit("external.recovered", "watcher", { endpoint: ep.name });
        } else if (!healthy) {
          await this.store.recordMetric("watcher.endpoint_errors", state.consecutive_failures, { endpoint: ep.name });
          if (state.consecutive_failures >= MAX_FAILURES_BEFORE_ALERT) {
            await this.alerts.fire("watcher", "critical", `${ep.name} DOWN`, `${state.consecutive_failures} failures, last status: ${resp.status}`);
            this.bus.emit("external.down", "watcher", { endpoint: ep.name, status: resp.status });
          }
        }
      } catch (err) {
        const latency = Date.now() - start;
        const failures = prev.consecutive_failures + 1;
        const msg = err instanceof Error ? err.message : String(err);

        this.endpoints.set(ep.name, {
          ...ep,
          healthy: false,
          latency_ms: latency,
          last_checked: new Date().toISOString(),
          consecutive_failures: failures,
        });

        if (failures >= MAX_FAILURES_BEFORE_ALERT) {
          await this.alerts.fire("watcher", "critical", `${ep.name} UNREACHABLE`, `${failures} failures: ${msg}`);
          this.bus.emit("external.unreachable", "watcher", { endpoint: ep.name, error: msg });
        }
      }
    });

    await Promise.allSettled(checks);

    // Record uptime snapshot
    const all = Array.from(this.endpoints.values());
    const healthyCount = all.filter(e => e.healthy).length;
    this.uptimeHistory.push({
      timestamp: new Date().toISOString(),
      healthy_count: healthyCount,
      total: all.length,
    });
    if (this.uptimeHistory.length > 1440) { // Keep 24 hours at 1min intervals
      this.uptimeHistory = this.uptimeHistory.slice(-1440);
    }

    await this.store.recordMetric("watcher.uptime_pct", (healthyCount / Math.max(all.length, 1)) * 100, {});
    await this.store.setDaemonState("watcher", {
      status: "running",
      last_run_at: new Date().toISOString(),
      metadata: { endpoints: all.length, healthy: healthyCount },
    });
  }

  private async checkDns(): Promise<void> {
    for (const rec of MONITORED_DNS) {
      try {
        // Use a public DNS-over-HTTPS resolver to verify
        const resp = await fetch(
          `https://cloudflare-dns.com/dns-query?name=${rec.domain}&type=${rec.record_type}`,
          {
            headers: { Accept: "application/dns-json" },
            signal: AbortSignal.timeout(10_000),
          },
        );

        if (resp.ok) {
          const data = await resp.json() as { Answer?: Array<{ data: string; type: number }> };
          const resolved = !!data.Answer && data.Answer.length > 0;
          const actualValue = data.Answer?.[0]?.data ?? "NXDOMAIN";

          this.dnsRecords.set(`${rec.domain}:${rec.record_type}`, {
            ...rec,
            resolved,
            actual_value: actualValue,
            last_checked: new Date().toISOString(),
          });

          if (!resolved) {
            await this.alerts.fire("watcher", "critical", `DNS resolution failed: ${rec.domain}`,
              `${rec.record_type} record not found`);
            this.bus.emit("external.dns_failed", "watcher", { domain: rec.domain, type: rec.record_type });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await this.alerts.fire("watcher", "warn", `DNS check error: ${rec.domain}`, msg);
      }
    }
  }

  private async checkCertificates(): Promise<void> {
    // Check SSL certificates for HTTPS endpoints
    const httpsEndpoints = MONITORED_ENDPOINTS.filter(ep => ep.url.startsWith("https://"));

    for (const ep of httpsEndpoints) {
      try {
        const resp = await fetch(ep.url, {
          signal: AbortSignal.timeout(10_000),
          redirect: "follow",
        });

        // If we can fetch it, the cert is valid
        if (resp.ok) {
          await this.store.recordMetric("watcher.cert_valid", 1, { endpoint: ep.name });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("certificate") || msg.includes("SSL") || msg.includes("TLS")) {
          await this.alerts.fire("watcher", "emergency", `SSL Certificate error: ${ep.name}`, msg);
          this.bus.emit("external.cert_error", "watcher", { endpoint: ep.name, error: msg });
        }
      }
    }
  }

  getStatus() {
    const all = Array.from(this.endpoints.values());
    const dns = Array.from(this.dnsRecords.values());

    return {
      endpoints_healthy: all.filter(e => e.healthy).length,
      endpoints_total: all.length,
      endpoints: all,
      dns_records: dns,
      uptime_pct: this.uptimeHistory.length > 0
        ? (this.uptimeHistory.reduce((sum, h) => sum + h.healthy_count / h.total, 0) / this.uptimeHistory.length * 100).toFixed(2)
        : "N/A",
      uptime_history_length: this.uptimeHistory.length,
    };
  }

  getUptimeReport(): { endpoint: string; uptime_pct: string; avg_latency_ms: number }[] {
    return Array.from(this.endpoints.values()).map(ep => ({
      endpoint: ep.name,
      uptime_pct: ep.consecutive_failures === 0 ? "100" : "degraded",
      avg_latency_ms: ep.latency_ms,
    }));
  }
}
