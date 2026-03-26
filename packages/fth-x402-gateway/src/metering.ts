/**
 * FTH x402 Gateway — Metering Integration
 *
 * Thin adapter that creates a MeteringClient from Worker env vars
 * and provides a helper to emit api_request events. Uses fth-metering
 * under the hood. Gracefully no-ops if metering is not configured.
 */

import type { Env } from "./types";
import { MeteringClient } from "../../fth-metering/src/client";
import type { ApiRequestEvent } from "../../fth-metering/src/types";

// Cache one client per isolate (Cloudflare Workers reuse isolates)
let _client: MeteringClient | null = null;

/**
 * Lazily create (or return cached) MeteringClient.
 * Returns null if metering is not configured.
 */
export function getMeteringClient(env: Env): MeteringClient | null {
  if (!env.OPENMETER_ENDPOINT || !env.OPENMETER_API_KEY) {
    return null;
  }
  if (_client) return _client;

  _client = new MeteringClient({
    endpoint: env.OPENMETER_ENDPOINT,
    api_key: env.OPENMETER_API_KEY,
    enabled: true,
    flush_interval_ms: 10_000, // 10s for edge
    max_buffer_size: 50,
  });
  return _client;
}

/**
 * Emit an api_request meter event. Fire-and-forget — never blocks the
 * response path and never throws.
 */
export function emitApiRequest(
  env: Env,
  opts: {
    subject: string;
    route: string;
    namespace: string;
    method: string;
    status_code: number;
    amount: string;
    proof_type: string;
    latency_ms: number;
  },
): void {
  try {
    const client = getMeteringClient(env);
    if (!client) return;

    const event: ApiRequestEvent = {
      type: "api_request",
      timestamp: new Date().toISOString(),
      subject: opts.subject,
      data: {
        route: opts.route,
        namespace: opts.namespace,
        method: opts.method,
        status_code: opts.status_code,
        amount: opts.amount,
        proof_type: opts.proof_type,
        latency_ms: opts.latency_ms,
      },
    };

    client.emit(event);
  } catch {
    // Never let metering failure affect the request path
  }
}
