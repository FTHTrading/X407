/**
 * FTH x402 Core — Authentication & Authorization
 *
 * Shared auth primitives for the x402 stack:
 *   - HMAC-SHA256 service-to-service signing / verification
 *   - Admin bearer-token helpers
 *   - Header constants & types
 *
 * Uses only Node.js built-in `crypto` module — no external deps.
 */

import { createHmac, timingSafeEqual } from "crypto";

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Header names used for FTH service authentication. */
export const AUTH_HEADERS = {
  /** Identifies the calling service (e.g. "fth-guardian"). */
  SERVICE_NAME: "x-service-name",
  /** Unix-ms timestamp of the request (for replay protection). */
  SERVICE_TIMESTAMP: "x-service-timestamp",
  /** HMAC-SHA256 hex signature. */
  SERVICE_SIGNATURE: "x-service-signature",
  /** Static admin token (legacy operator routes). */
  ADMIN_TOKEN: "x-admin-token",
  /** Standard HTTP Authorization header. */
  AUTHORIZATION: "authorization",
} as const;

/** Canonical service identifiers. */
export const SERVICE_NAMES = {
  FACILITATOR: "fth-x402-facilitator",
  TREASURY: "fth-x402-treasury",
  GUARDIAN: "fth-guardian",
  GATEWAY: "fth-x402-gateway",
} as const;

export type ServiceName = (typeof SERVICE_NAMES)[keyof typeof SERVICE_NAMES];

/** Auth level for route classification. */
export type AuthLevel = "public" | "service" | "admin";

/** Maximum age (in ms) for a service-to-service request before replay rejection. */
export const MAX_REQUEST_AGE_MS = 300_000; // 5 minutes

// ═══════════════════════════════════════════════════════════════════════════
// HMAC-SHA256 Service-to-Service Auth
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the canonical message that gets signed.
 *
 *   METHOD|PATH|TIMESTAMP|SHA256(BODY)
 *
 * Body is hashed separately to keep the message compact for large payloads.
 */
function buildSignatureMessage(
  method: string,
  path: string,
  timestamp: string,
  body: string,
): string {
  const bodyHash = createHmac("sha256", "fth-body")
    .update(body || "")
    .digest("hex");
  return `${method.toUpperCase()}|${path}|${timestamp}|${bodyHash}`;
}

/**
 * Create an HMAC-SHA256 hex signature for a service request.
 *
 * @param secret  - Shared secret (FTH_SERVICE_SECRET)
 * @param method  - HTTP method (GET, POST, etc.)
 * @param path    - URL pathname (e.g. "/verify")
 * @param timestamp - Unix-ms timestamp string
 * @param body    - Raw request body (empty string for GET)
 * @returns hex-encoded HMAC-SHA256 signature
 */
export function createServiceSignature(
  secret: string,
  method: string,
  path: string,
  timestamp: string,
  body: string,
): string {
  const message = buildSignatureMessage(method, path, timestamp, body);
  return createHmac("sha256", secret).update(message).digest("hex");
}

/**
 * Verify an HMAC-SHA256 service-to-service request signature.
 *
 * @param secret    - Shared secret
 * @param method    - HTTP method
 * @param path      - URL pathname
 * @param timestamp - Unix-ms timestamp string from the request header
 * @param body      - Raw request body
 * @param signature - Hex signature from the request header
 * @param maxAgeMs  - Max allowed age (default: 5 min)
 * @returns `{ valid: true }` or `{ valid: false, reason: string }`
 */
export function verifyServiceSignature(
  secret: string,
  method: string,
  path: string,
  timestamp: string,
  body: string,
  signature: string,
  maxAgeMs = MAX_REQUEST_AGE_MS,
): { valid: true } | { valid: false; reason: string } {
  // Replay protection
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) {
    return { valid: false, reason: "Invalid timestamp" };
  }
  const age = Date.now() - ts;
  if (age < -30_000) {
    // Allow 30s clock skew into the future
    return { valid: false, reason: "Timestamp is in the future" };
  }
  if (age > maxAgeMs) {
    return { valid: false, reason: `Request expired (age: ${Math.round(age / 1000)}s)` };
  }

  // Compute expected signature
  const expected = createServiceSignature(secret, method, path, timestamp, body);

  // Constant-time comparison
  if (expected.length !== signature.length) {
    return { valid: false, reason: "Signature length mismatch" };
  }
  try {
    const match = timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex"),
    );
    if (!match) {
      return { valid: false, reason: "Signature mismatch" };
    }
  } catch {
    return { valid: false, reason: "Signature comparison failed" };
  }

  return { valid: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Authenticated Fetch — wrapper for inter-service calls
// ═══════════════════════════════════════════════════════════════════════════

export interface ServiceFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  /** Override the timeout (default: 10s). */
  timeoutMs?: number;
}

/**
 * Create an authenticated `fetch` function that automatically signs requests
 * with HMAC-SHA256 service-to-service headers.
 *
 * Usage:
 *   const sfetch = createServiceFetch("fth-guardian", process.env.FTH_SERVICE_SECRET!);
 *   const res = await sfetch("http://localhost:3100/verify", { method: "POST", body: JSON.stringify(data) });
 */
export function createServiceFetch(
  serviceName: string,
  secret: string,
): (url: string, init?: ServiceFetchOptions) => Promise<Response> {
  return async function serviceFetch(
    url: string,
    init: ServiceFetchOptions = {},
  ): Promise<Response> {
    const parsed = new URL(url);
    const method = (init.method ?? "GET").toUpperCase();
    const body = init.body ?? "";
    const timestamp = String(Date.now());
    const signature = createServiceSignature(
      secret,
      method,
      parsed.pathname,
      timestamp,
      body,
    );

    const headers: Record<string, string> = {
      ...(init.headers ?? {}),
      [AUTH_HEADERS.SERVICE_NAME]: serviceName,
      [AUTH_HEADERS.SERVICE_TIMESTAMP]: timestamp,
      [AUTH_HEADERS.SERVICE_SIGNATURE]: signature,
    };
    if (!headers["content-type"] && body) {
      headers["content-type"] = "application/json";
    }

    const timeoutMs = init.timeoutMs ?? 10_000;

    return fetch(url, {
      method,
      headers,
      body: body || undefined,
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Admin Token Auth
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract a Bearer token from an Authorization header.
 */
export function getBearerToken(header?: string): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

/**
 * Check whether a request carries a valid admin token.
 *
 * Accepts either:
 *   - `Authorization: Bearer <token>`
 *   - `X-Admin-Token: <token>`
 *
 * If `adminToken` is empty/unset, all requests pass (dev mode).
 */
export function isValidAdminToken(
  headers: Record<string, string | string[] | undefined>,
  adminToken: string,
): boolean {
  if (!adminToken) return true; // No token configured → open (dev mode)

  const authorization =
    typeof headers.authorization === "string" ? headers.authorization : undefined;
  const xAdminToken =
    typeof headers["x-admin-token"] === "string"
      ? headers["x-admin-token"]
      : undefined;

  const bearer = getBearerToken(authorization);
  return bearer === adminToken || xAdminToken === adminToken;
}

/**
 * Check whether a request carries valid service-to-service OR admin credentials.
 * Service auth takes precedence (machines) — admin token is the fallback (humans).
 */
export function isAuthorizedRequest(
  headers: Record<string, string | string[] | undefined>,
  signingKey: string,
  adminToken: string,
  method: string,
  path: string,
  body: string,
): { authorized: true; via: "service" | "admin" } | { authorized: false; reason: string } {
  // 1. Try service-to-service HMAC auth
  const serviceName = headers[AUTH_HEADERS.SERVICE_NAME];
  const timestamp = headers[AUTH_HEADERS.SERVICE_TIMESTAMP];
  const signature = headers[AUTH_HEADERS.SERVICE_SIGNATURE];

  if (
    typeof serviceName === "string" &&
    typeof timestamp === "string" &&
    typeof signature === "string"
  ) {
    const result = verifyServiceSignature(
      signingKey,
      method,
      path,
      timestamp,
      body,
      signature,
    );
    if (result.valid) {
      return { authorized: true, via: "service" };
    }
    return { authorized: false, reason: `Service auth failed: ${result.reason}` };
  }

  // 2. Fall back to admin token
  if (isValidAdminToken(headers, adminToken)) {
    return { authorized: true, via: "admin" };
  }

  return { authorized: false, reason: "No valid credentials provided" };
}
