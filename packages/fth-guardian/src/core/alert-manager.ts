/**
 * AlertManager — Alert routing, escalation, and notification
 *
 * Handles alert deduplication, throttling, and multi-channel delivery.
 * Persists alerts to DB and optionally routes to external endpoints.
 */

import type { EventBus } from "./event-bus.js";
import type { StateStore } from "./state-store.js";

export type AlertSeverity = "info" | "warn" | "critical" | "emergency";

export interface Alert {
  id: string;
  source: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  details?: Record<string, unknown>;
  created_at: string;
  acknowledged?: boolean;
  resolved?: boolean;
  resolved_at?: string;
}

interface AlertRule {
  pattern: RegExp;
  min_severity: AlertSeverity;
  cooldown_ms: number;
  channels: string[];
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  info: 0,
  warn: 1,
  critical: 2,
  emergency: 3,
};

export class AlertManager {
  private alerts: Alert[] = [];
  private lastFired = new Map<string, number>();
  private rules: AlertRule[] = [];
  private webhookUrls: string[] = [];
  private maxAlerts = 5000;

  constructor(
    private bus: EventBus,
    private store: StateStore,
  ) {
    // Default rules
    this.rules = [
      { pattern: /node.*down/i, min_severity: "critical", cooldown_ms: 60_000, channels: ["log", "webhook"] },
      { pattern: /security|attack|breach/i, min_severity: "warn", cooldown_ms: 30_000, channels: ["log", "webhook"] },
      { pattern: /revenue|payment/i, min_severity: "info", cooldown_ms: 300_000, channels: ["log"] },
      { pattern: /upgrade|deploy/i, min_severity: "info", cooldown_ms: 60_000, channels: ["log"] },
      { pattern: /.*/, min_severity: "info", cooldown_ms: 10_000, channels: ["log"] },
    ];

    // Listen for bus events that should become alerts
    this.bus.on("alert.*", (event) => {
      const sev = (event.data?.severity as AlertSeverity) ?? "info";
      this.fire(event.source, sev, event.data?.title as string ?? event.type, event.data?.message as string ?? "");
    });
  }

  setWebhooks(urls: string[]): void {
    this.webhookUrls = urls;
  }

  async fire(source: string, severity: AlertSeverity, title: string, message: string, details?: Record<string, unknown>): Promise<Alert | null> {
    const dedupKey = `${source}:${title}`;
    const now = Date.now();

    // Find matching rule for cooldown
    const rule = this.rules.find(r => r.pattern.test(title));
    const cooldown = rule?.cooldown_ms ?? 10_000;

    // Throttle: skip if same alert fired within cooldown
    const lastTime = this.lastFired.get(dedupKey);
    if (lastTime && now - lastTime < cooldown) {
      return null;
    }
    this.lastFired.set(dedupKey, now);

    const alert: Alert = {
      id: `alert-${now}-${Math.random().toString(36).slice(2, 8)}`,
      source,
      severity,
      title,
      message,
      details,
      created_at: new Date().toISOString(),
      acknowledged: false,
      resolved: false,
    };

    this.alerts.push(alert);
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(-this.maxAlerts);
    }

    // Persist to DB
    try {
      const pool = await this.store.getPool();
      await pool.query(
        `INSERT INTO guardian_audit_log (event_type, source, severity, message, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [`alert:${title}`, source, severity, message, JSON.stringify(details ?? {})],
      );
    } catch {
      // DB might be temporarily unavailable — alerts still live in memory
    }

    // Emit to event bus
    this.bus.emit(`alert.fired`, source, { alert });

    // If critical or emergency, also emit to emergency channel
    if (SEVERITY_ORDER[severity] >= SEVERITY_ORDER["critical"]) {
      this.bus.emit("emergency", source, { alert });
      await this.notifyWebhooks(alert);
    }

    console.log(`[ALERT] [${severity.toUpperCase()}] [${source}] ${title}: ${message}`);
    return alert;
  }

  acknowledge(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  resolve(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolved_at = new Date().toISOString();
      this.bus.emit("alert.resolved", "alert-manager", { alert });
      return true;
    }
    return false;
  }

  getActive(severity?: AlertSeverity): Alert[] {
    let active = this.alerts.filter(a => !a.resolved);
    if (severity) {
      active = active.filter(a => SEVERITY_ORDER[a.severity] >= SEVERITY_ORDER[severity]);
    }
    return active.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);
  }

  getRecent(count = 50): Alert[] {
    return this.alerts.slice(-count).reverse();
  }

  getStats(): { total: number; active: number; critical: number; emergency: number } {
    const active = this.alerts.filter(a => !a.resolved);
    return {
      total: this.alerts.length,
      active: active.length,
      critical: active.filter(a => a.severity === "critical").length,
      emergency: active.filter(a => a.severity === "emergency").length,
    };
  }

  private async notifyWebhooks(alert: Alert): Promise<void> {
    for (const url of this.webhookUrls) {
      try {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "guardian_alert",
            alert,
            timestamp: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // Webhook delivery is best-effort
      }
    }
  }
}
