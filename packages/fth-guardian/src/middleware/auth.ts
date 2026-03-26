/**
 * FTH Guardian — Auth Middleware
 *
 * Global Fastify onRequest hook for the Guardian service.
 *
 *   PUBLIC  — /health, /health/ready, /health/full, GET /   → no auth
 *   SERVICE — /api/daemons/*, /api/metrics/*                → HMAC-SHA256 or admin token
 *   ADMIN   — /api/commands/*                               → HMAC-SHA256 or admin token
 *                                                            (most dangerous — SSM, upgrade, policy)
 *
 * NOTE: Guardian uses Node16 module resolution — imports require .js extensions.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  AUTH_HEADERS,
  verifyServiceSignature,
  isValidAdminToken,
} from "../../../fth-x402-core/src/auth.js";

/** Routes that require no authentication. */
const PUBLIC_ROUTES = new Set(["/health", "/health/ready", "/health/full", "/"]);

/** Route prefixes for metrics (read-only, lower sensitivity). */
const METRICS_PREFIXES = ["/metrics"];

export function registerAuthMiddleware(app: FastifyInstance): void {
  const SIGNING_KEY = process.env.FTH_SERVICE_SECRET?.trim() ?? "";
  const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN?.trim() ?? "";

  app.log.info({
    service_auth: SIGNING_KEY ? "enabled (HMAC-SHA256)" : "DISABLED (no FTH_SERVICE_SECRET)",
    admin_auth: ADMIN_TOKEN ? "enabled" : "DISABLED (no ADMIN_API_TOKEN)",
  }, "Guardian auth middleware initialized");

  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    const url = req.url.split("?")[0];

    // Public routes — always pass
    if (PUBLIC_ROUTES.has(url)) return;

    // Metrics — allow public read if explicitly exposed (Prometheus scrape)
    if (METRICS_PREFIXES.some((p) => url.startsWith(p))) return;

    // Dev mode — no keys configured, skip auth
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
      const rawBody = req.body ? JSON.stringify(req.body) : "";
      const result = verifyServiceSignature(
        SIGNING_KEY,
        req.method,
        url,
        timestamp,
        rawBody,
        signature,
      );

      if (result.valid) {
        (req as any).serviceAuth = { service: serviceName, via: "hmac" };
        return;
      }

      req.log.warn({ service: serviceName, reason: (result as any).reason }, "Service auth rejected");
      return reply.code(401).send({
        error: "Service authentication failed",
        error_code: "service_auth_failed",
        detail: (result as any).reason,
      });
    }

    // Fall back to admin token
    if (isValidAdminToken(headers, ADMIN_TOKEN)) {
      (req as any).serviceAuth = { service: "admin", via: "token" };
      return;
    }

    return reply
      .code(401)
      .header("WWW-Authenticate", 'Bearer realm="fth-guardian"')
      .send({
        error: "Authentication required",
        error_code: "auth_required",
        hint: "Provide X-Service-Signature (HMAC) or Authorization: Bearer <token>",
      });
  });
}
