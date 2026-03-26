/**
 * FTH Metering — Types
 *
 * Defines the event schema for OpenMeter integration.
 * Three event types drive billing, quotas, and AI cost control:
 *
 *   api_request     — every HTTP hit through a paid route
 *   ai_tokens       — LLM token consumption (prompt + completion)
 *   compute_seconds — CPU / GPU wall-clock for heavy tasks
 */

// ═══════════════════════════════════════════════════════════════════════════
// Meter event types
// ═══════════════════════════════════════════════════════════════════════════

/** Discriminant for all meter event kinds. */
export type MeterEventType = "api_request" | "ai_tokens" | "compute_seconds";

/** Base shape every emitted event must satisfy. */
export interface MeterEventBase {
  /** Which meter to increment. */
  type: MeterEventType;
  /** ISO-8601 timestamp of the event. */
  timestamp: string;
  /** Subject (wallet address, API key, or account ID). */
  subject: string;
  /** Additional dimensions for aggregation / filtering. */
  data: Record<string, string | number>;
}

/** An HTTP request hit a paid x402 route. */
export interface ApiRequestEvent extends MeterEventBase {
  type: "api_request";
  data: {
    route: string;
    namespace: string;
    method: string;
    status_code: number;
    amount: string;
    proof_type: string;
    latency_ms: number;
  };
}

/** LLM token consumption event. */
export interface AiTokensEvent extends MeterEventBase {
  type: "ai_tokens";
  data: {
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost: string;
    namespace: string;
  };
}

/** Compute wall-clock for heavy tasks. */
export interface ComputeSecondsEvent extends MeterEventBase {
  type: "compute_seconds";
  data: {
    task_type: string;
    seconds: number;
    cost: string;
    namespace: string;
  };
}

/** Union of all meter events. */
export type MeterEvent = ApiRequestEvent | AiTokensEvent | ComputeSecondsEvent;

// ═══════════════════════════════════════════════════════════════════════════
// Quota types
// ═══════════════════════════════════════════════════════════════════════════

/** Quota status for a subject on a given meter. */
export interface QuotaStatus {
  meter: MeterEventType;
  subject: string;
  current_usage: number;
  limit: number;
  remaining: number;
  reset_at: string; // ISO-8601
  exceeded: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Client configuration
// ═══════════════════════════════════════════════════════════════════════════

export interface MeteringConfig {
  /** OpenMeter ingest endpoint. */
  endpoint: string;
  /** OpenMeter API token. */
  api_key: string;
  /** Whether metering is enabled (kill switch). */
  enabled: boolean;
  /** Flush interval in ms (batch before sending). Default: 5000. */
  flush_interval_ms?: number;
  /** Max events to buffer before forced flush. Default: 100. */
  max_buffer_size?: number;
}
