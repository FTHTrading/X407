/**
 * FTH Guardian — Authenticated Service Fetch
 *
 * Centralized authenticated `fetch` wrapper used by all daemons
 * for cross-service calls. Automatically signs requests with
 * HMAC-SHA256 using FTH_SERVICE_SECRET.
 *
 * Exports a singleton `sfetch` that all daemon modules can import.
 * For L1 RPC calls (unauthenticated), daemons continue using plain `fetch`.
 */

import { createServiceFetch, SERVICE_NAMES } from "../../../fth-x402-core/src/auth.js";

const SIGNING_KEY = process.env.FTH_SERVICE_SECRET?.trim() ?? "";

/**
 * Authenticated fetch for Guardian → Facilitator/Treasury/Guardian calls.
 * Falls back to plain fetch if FTH_SERVICE_SECRET is not configured.
 */
export const sfetch: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal; timeoutMs?: number }) => Promise<Response> =
  SIGNING_KEY
    ? createServiceFetch(SERVICE_NAMES.GUARDIAN, SIGNING_KEY)
    : (url, init) => {
        const { timeoutMs: _t, ...rest } = init ?? {};
        return fetch(url, rest as RequestInit);
      };
