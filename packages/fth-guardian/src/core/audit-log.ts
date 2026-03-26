/**
 * AuditLog — Immutable audit trail for all guardian actions
 *
 * Every action taken by any daemon (restarts, deployments, security blocks,
 * revenue collections, config changes) is recorded here for compliance
 * and forensic analysis.
 */

import type { EventBus } from "./event-bus.js";
import type { StateStore } from "./state-store.js";

export interface AuditEntry {
  id?: string;
  event_type: string;
  source: string;
  severity: string;
  message: string;
  details: Record<string, unknown>;
  created_at: string;
}

export class AuditLog {
  private buffer: AuditEntry[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private bus: EventBus,
    private store: StateStore,
  ) {
    // Auto-capture all bus events into audit log
    this.bus.on("*", (event) => {
      this.record(event.type, event.source, event.data?.severity as string ?? "info", `Bus event: ${event.type}`, event.data ?? {});
    });
  }

  start(): void {
    // Flush buffer to DB every 5 seconds
    this.flushInterval = setInterval(() => this.flush(), 5_000);
  }

  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    // Final flush
    this.flush();
  }

  record(eventType: string, source: string, severity: string, message: string, details: Record<string, unknown> = {}): void {
    this.buffer.push({
      event_type: eventType,
      source,
      severity,
      message,
      details,
      created_at: new Date().toISOString(),
    });

    // If buffer gets too large, flush immediately
    if (this.buffer.length > 200) {
      this.flush();
    }
  }

  recordAction(source: string, action: string, target: string, result: string, details: Record<string, unknown> = {}): void {
    this.record(
      `action:${action}`,
      source,
      "info",
      `${source} performed ${action} on ${target}: ${result}`,
      { target, result, ...details },
    );
  }

  recordSecurity(source: string, event: string, severity: string, details: Record<string, unknown> = {}): void {
    this.record(`security:${event}`, source, severity, `Security event: ${event}`, details);
  }

  recordRevenue(source: string, amount: string, currency: string, details: Record<string, unknown> = {}): void {
    this.record("revenue:collected", source, "info", `Revenue: ${amount} ${currency}`, { amount, currency, ...details });
  }

  recordUpgrade(component: string, fromVersion: string, toVersion: string, status: string): void {
    this.record("upgrade:executed", "upgrader", "warn", `Upgrade ${component}: ${fromVersion} → ${toVersion} [${status}]`, {
      component,
      from_version: fromVersion,
      to_version: toVersion,
      status,
    });
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const entries = this.buffer.splice(0, this.buffer.length);

    try {
      const pool = await this.store.getPool();
      // Batch insert for performance
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      for (const entry of entries) {
        placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`);
        values.push(entry.event_type, entry.source, entry.severity, entry.message, JSON.stringify(entry.details));
        idx += 5;
      }

      await pool.query(
        `INSERT INTO guardian_audit_log (event_type, source, severity, message, details)
         VALUES ${placeholders.join(", ")}`,
        values,
      );
    } catch {
      // Put entries back if DB write fails — they'll be retried on next flush
      this.buffer.unshift(...entries);
    }
  }

  async query(options: {
    source?: string;
    severity?: string;
    event_type?: string;
    since?: string;
    limit?: number;
  }): Promise<AuditEntry[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (options.source) {
      conditions.push(`source = $${idx++}`);
      params.push(options.source);
    }
    if (options.severity) {
      conditions.push(`severity = $${idx++}`);
      params.push(options.severity);
    }
    if (options.event_type) {
      conditions.push(`event_type LIKE $${idx++}`);
      params.push(`%${options.event_type}%`);
    }
    if (options.since) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(options.since);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = options.limit ?? 100;

    try {
      const pool = await this.store.getPool();
      const { rows } = await pool.query(
        `SELECT * FROM guardian_audit_log ${where} ORDER BY created_at DESC LIMIT ${limit}`,
        params,
      );
      return rows as AuditEntry[];
    } catch {
      return [];
    }
  }
}
