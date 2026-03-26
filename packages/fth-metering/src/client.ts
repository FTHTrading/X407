/**
 * FTH Metering — OpenMeter Client
 *
 * Lightweight wrapper around the OpenMeter Cloud Events ingest API.
 * Features:
 *   - Event buffering with periodic flush
 *   - Graceful degradation when metering is disabled or endpoint unreachable
 *   - Quota checking against OpenMeter query API
 *   - Works in both Node.js (facilitator) and Cloudflare Workers (gateway)
 */

import type {
  MeterEvent,
  MeteringConfig,
  QuotaStatus,
  MeterEventType,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// Default configuration
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULTS: Required<Pick<MeteringConfig, "flush_interval_ms" | "max_buffer_size">> = {
  flush_interval_ms: 5_000,
  max_buffer_size: 100,
};

// ═══════════════════════════════════════════════════════════════════════════
// MeteringClient
// ═══════════════════════════════════════════════════════════════════════════

export class MeteringClient {
  private config: MeteringConfig;
  private buffer: MeterEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(config: MeteringConfig) {
    this.config = config;
    if (config.enabled) {
      this.startAutoFlush();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Event emission
  // ─────────────────────────────────────────────────────────────────

  /**
   * Buffer a meter event. Automatically flushed on interval or buffer cap.
   */
  emit(event: MeterEvent): void {
    if (!this.config.enabled) return;
    this.buffer.push(event);
    if (this.buffer.length >= (this.config.max_buffer_size ?? DEFAULTS.max_buffer_size)) {
      void this.flush();
    }
  }

  /**
   * Flush buffered events to OpenMeter. Safe to call multiple times —
   * concurrent flushes are serialised internally.
   */
  async flush(): Promise<number> {
    if (this.flushing || this.buffer.length === 0) return 0;
    this.flushing = true;

    const batch = this.buffer.splice(0);
    try {
      const cloudEvents = batch.map((e) => toCloudEvent(e));
      const res = await fetch(`${this.config.endpoint}/api/v1/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/cloudevents-batch+json",
          Authorization: `Bearer ${this.config.api_key}`,
        },
        body: JSON.stringify(cloudEvents),
      });

      if (!res.ok) {
        // Put events back for retry on next flush
        console.error(
          `[metering] OpenMeter ingest failed: ${res.status} ${res.statusText}`,
        );
        this.buffer.unshift(...batch);
        return 0;
      }

      return batch.length;
    } catch (err) {
      console.error("[metering] OpenMeter unreachable:", err);
      // Put events back — will retry on next flush
      this.buffer.unshift(...batch);
      return 0;
    } finally {
      this.flushing = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Quota checking
  // ─────────────────────────────────────────────────────────────────

  /**
   * Check quota for a subject on a specific meter.
   * Returns null if metering is disabled or the endpoint is unreachable.
   */
  async checkQuota(
    meter: MeterEventType,
    subject: string,
  ): Promise<QuotaStatus | null> {
    if (!this.config.enabled) return null;

    try {
      const res = await fetch(
        `${this.config.endpoint}/api/v1/meters/${meter}/subjects/${encodeURIComponent(subject)}/value`,
        {
          headers: {
            Authorization: `Bearer ${this.config.api_key}`,
          },
        },
      );

      if (!res.ok) {
        console.error(`[metering] Quota check failed: ${res.status}`);
        return null;
      }

      const data = (await res.json()) as {
        value: number;
        windowEnd: string;
      };

      // Default limits — in production these come from OpenMeter portal
      const limits: Record<MeterEventType, number> = {
        api_request: 10_000,
        ai_tokens: 1_000_000,
        compute_seconds: 3_600,
      };

      const limit = limits[meter];
      return {
        meter,
        subject,
        current_usage: data.value,
        limit,
        remaining: Math.max(0, limit - data.value),
        reset_at: data.windowEnd,
        exceeded: data.value >= limit,
      };
    } catch (err) {
      console.error("[metering] Quota check unreachable:", err);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────

  /** Start periodic auto-flush. */
  private startAutoFlush(): void {
    if (this.flushTimer) return;
    const interval = this.config.flush_interval_ms ?? DEFAULTS.flush_interval_ms;
    this.flushTimer = setInterval(() => void this.flush(), interval);
    // Don't let the timer keep the process alive
    if (typeof this.flushTimer === "object" && "unref" in this.flushTimer) {
      (this.flushTimer as { unref(): void }).unref();
    }
  }

  /** Flush remaining events and stop auto-flush. */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  /** Number of events currently buffered. */
  get pendingCount(): number {
    return this.buffer.length;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CloudEvents mapping
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert a MeterEvent to a CloudEvents v1.0 JSON envelope for OpenMeter.
 */
function toCloudEvent(event: MeterEvent): Record<string, unknown> {
  return {
    specversion: "1.0",
    id: generateEventId(),
    source: "fth-x402-gateway",
    type: `fth.metering.${event.type}`,
    subject: event.subject,
    time: event.timestamp,
    data: event.data,
  };
}

/**
 * Generate a unique event ID. Uses crypto.randomUUID if available,
 * otherwise falls back to a timestamp + random suffix.
 */
function generateEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
