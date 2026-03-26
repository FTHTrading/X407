/**
 * FTH x402 Facilitator — Auth Middleware
 *
 * Global Fastify onRequest hook that enforces authentication based on
 * route classification:
 *
 *   PUBLIC  — /health, GET /                     → no auth
 *   SERVICE — /verify, /invoices, /credits, etc. → HMAC-SHA256 service auth OR admin token
 *   ADMIN   — /admin/*                           → admin token (already handled by operator.ts hook)
 *
 * Service-to-service auth uses HMAC-SHA256 with FTH_SERVICE_SECRET.
 * Admin auth uses Bearer token / X-Admin-Token with ADMIN_API_TOKEN.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  AUTH_HEADERS,
  verifyServiceSignature,
  isValidAdminToken,
} from "../../../fth-x402-core/src/auth";

// ═══════════════════════════════════════════════════════════════════════════
// Route Classification
// ═══════════════════════════════════════════════════════════════════════════

/** Routes that require no authentication whatsoever. */
const PUBLIC_ROUTES = new Set([
  "/health",
  "/",
]);

/** Route prefixes that are fully public (health checks, root). */
const PUBLIC_PREFIXES: string[] = [];

/** Route prefixes handled by operator.ts's own admin hook. */
const ADMIN_PREFIXES = ["/admin/"];

function isPublicRoute(method: string, url: string): boolean {
  if (PUBLIC_ROUTES.has(url)) return true;
  if (PUBLIC_PREFIXES.some((p) => url.startsWith(p))) return true;
  // GET /admin/stats is in health.ts — but we want it protected.
  return false;
}

function isAdminRoute(url: string): boolean {
  return ADMIN_PREFIXES.some((p) => url.startsWith(p));
}

// ═══════════════════════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════════════════════

export function registerAuthMiddleware(app: FastifyInstance): void {
  const SIGNING_KEY = process.env.FTH_SERVICE_SECRET?.trim() ?? "";
  const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN?.trim() ?? "";

  // Log auth configuration on startup
  app.log.info({
    service_auth: SIGNING_KEY ? "enabled (HMAC-SHA256)" : "DISABLED (no FTH_SERVICE_SECRET)",
    admin_auth: ADMIN_TOKEN ? "enabled" : "DISABLED (no ADMIN_API_TOKEN)",
  }, "Auth middleware initialized");

  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    const url = req.url.split("?")[0]; // Strip query string
    const method = req.method;

    // 1. Public routes — always pass
    if (isPublicRoute(method, url)) return;

    // 2. Admin routes — handled by operator.ts's own hook (skip here to avoid double-check)
    if (isAdminRoute(url)) return;

    // 3. Service routes — require HMAC service auth OR admin token
    //    In dev mode (no SIGNING_KEY and no ADMIN_TOKEN), everything passes.
    if (!SIGNING_KEY && !ADMIN_TOKEN) return;

    const headers = req.headers as Record<string, string | string[] | undefined>;

    // Try HMAC service-to-service auth
    const serviceName = headers[AUTH_HEADERS.SERVICE_NAME];
    const timestamp = headers[AUTH_HEADERS.SERVICE_TIMESTAMP];
    const signature = headers[AUTH_HEADERS.SERVICE_SIGNATURE];

    if (
      typeof serviceName === "string" &&
      typeof timestamp === "string" &&
      typeof signature === "string" &&
      SIGNING_KEY
    ) {
      // Collect raw body — for Fastify, req.body is already parsed,
      // but we need the raw string for HMAC verification.
      const rawBody = req.body ? JSON.stringify(req.body) : "";

      const result = verifyServiceSignature(
        SIGNING_KEY,
        method,
        url,
        timestamp,
        rawBody,
        signature,
      );

      if (result.valid) {
        // Tag the request so downstream can check
        (req as any).serviceAuth = { service: serviceName, via: "hmac" };
        return;
      }

      // Service auth failed — don't fall through to admin, reject immediately
      req.log.warn({ service: serviceName, reason: (result as any).reason }, "Service auth rejected");
      return reply.code(401).send({
        error: "Service authentication failed",
        error_code: "service_auth_failed",
        detail: (result as any).reason,
      });
    }

    // Try admin token auth
    if (isValidAdminToken(headers, ADMIN_TOKEN)) {
      (req as any).serviceAuth = { service: "admin", via: "token" };
      return;
    }

    // No valid credentials
    return reply
      .code(401)
      .header("WWW-Authenticate", 'Bearer realm="fth-x402"')
      .send({
        error: "Authentication required",
        error_code: "auth_required",
        hint: "Provide X-Service-Signature (HMAC) or Authorization: Bearer <token>",
      });
  });
}
