/**
 * FTH x402 Gateway — Cloudflare Worker Entry
 *
 * This is the edge gateway for the FTH x402 protocol. It:
 *   1. Matches incoming requests against paid route catalog
 *   2. Returns 402 Payment Required with invoice if no proof
 *   3. Forwards proof to the UnyKorn Facilitator for verification
 *   4. On success, serves the protected resource (R2 or origin)
 *   5. Attaches X-PAYMENT-RESPONSE header with receipt info
 *
 * The gateway is intentionally thin — all settlement, replay, and receipt
 * logic lives in the facilitator.
 */

import type { Env, VerifyRequest, VerifyResponse } from "./types";
import { PROTOCOL_VERSION, HEADERS } from "./types";
import { matchRoute } from "./routes";
import { build402Response } from "./x402";
import { extractProof, ProofParseError } from "./proof";
import { emitApiRequest } from "./metering";
import { interpolateBraces } from "../../fth-x402-core/src/helpers";

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const start = Date.now();
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(
        request,
        new Response(null, { status: 204 }),
      );
    }

    if (url.pathname === "/") {
      return withCors(request, new Response(
        JSON.stringify({
          status: "ok",
          gateway: "fth-x402",
          version: "2.0",
          environment: env.ENVIRONMENT ?? "unknown",
          facilitator: env.FACILITATOR_URL,
          description: "Edge payment gateway for live x402 routes.",
          endpoints: [
            "/health",
            "/api/v1/agent/pay-api/demo",
            "/api/v1/genesis/repro-pack/alpha",
            "/api/v1/trade/verify/TRD-001",
            "/api/v1/invoices/export/pdf",
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ));
    }

    // --- Health check ---
    if (url.pathname === "/health") {
      return withCors(request, new Response(
        JSON.stringify({
          status: "ok",
          gateway: "fth-x402",
          version: "2.0",
          environment: env.ENVIRONMENT ?? "unknown",
          facilitator: env.FACILITATOR_URL,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ));
    }

    // --- Route matching ---
    const match = matchRoute(url.pathname);
    if (!match) {
      // Not a paid route — pass through (or 404 in edge-only mode)
      return withCors(request, new Response("Not Found", { status: 404 }));
    }

    const { route, params } = match;

    // --- Check for payment proof ---
    let proof;
    try {
      proof = extractProof(request);
    } catch (err) {
      if (err instanceof ProofParseError) {
        return withCors(request, new Response(
          JSON.stringify({ error: err.message, code: "invalid_proof" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ));
      }
      throw err;
    }

    // No proof → return 402
    if (!proof) {
      const resp = await build402Response(route, params, env);
      // Meter the 402 hit (subject is "anonymous" since no proof)
      emitApiRequest(env, {
        subject: "anonymous",
        route: route.path,
        namespace: route.namespace,
        method: request.method,
        status_code: 402,
        amount: route.payment.amount,
        proof_type: "none",
        latency_ms: Date.now() - start,
      });
      return withCors(request, resp);
    }

    // --- Verify proof with facilitator ---
    const verifyBody: VerifyRequest = {
      invoice_id: proof.invoice_id,
      nonce: "nonce" in proof ? proof.nonce : "",
      proof,
      resource: url.pathname,
      namespace: route.namespace,
    };

    let verification: VerifyResponse;
    try {
      const res = await fetch(`${env.FACILITATOR_URL}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(verifyBody),
      });

      if (!res.ok) {
        const body = await res.text();
        console.error("Facilitator verify failed:", res.status, body);
        return withCors(request, new Response(
          JSON.stringify({
            error: "Payment verification failed",
            code: "verification_error",
          }),
          { status: 402, headers: { "Content-Type": "application/json" } },
        ));
      }

      verification = (await res.json()) as VerifyResponse;
    } catch (err) {
      console.error("Facilitator unreachable:", err);
      return withCors(request, new Response("Payment service unavailable", { status: 503 }));
    }

    if (!verification.verified) {
      return withCors(request, new Response(
        JSON.stringify({
          error: verification.error ?? "Payment not verified",
          code: verification.error_code ?? "verification_failed",
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      ));
    }

    // --- Payment verified — serve resource ---
    const response = await serveResource(route, params, env);

    // Attach receipt header
    const paymentResponse = {
      version: PROTOCOL_VERSION,
      verified: true,
      receipt_id: verification.receipt_id,
      rail:
        proof.proof_type === "signed_auth"
          ? "stellar"
          : proof.proof_type === "tx_hash"
            ? proof.rail
            : "unykorn-l1",
    };

    response.headers.set(
      HEADERS.PAYMENT_RESPONSE,
      btoa(JSON.stringify(paymentResponse)),
    );

    // Meter the successful payment
    emitApiRequest(env, {
      subject: proof.payer,
      route: route.path,
      namespace: route.namespace,
      method: request.method,
      status_code: 200,
      amount: route.payment.amount,
      proof_type: proof.proof_type,
      latency_ms: Date.now() - start,
    });

    return withCors(request, response);
  },
};

function withCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("Origin");

  headers.set("Access-Control-Allow-Origin", origin ?? "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-PAYMENT-SIGNATURE, X-PAYMENT-REQUIRED, Accept");
  headers.set("Access-Control-Expose-Headers", `${HEADERS.PAYMENT_REQUIRED}, ${HEADERS.PAYMENT_RESPONSE}, Content-Type`);
  headers.set("Vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ---------------------------------------------------------------------------
// Resource serving
// ---------------------------------------------------------------------------

async function serveResource(
  route: typeof import("./routes").PAID_ROUTES[number],
  params: Record<string, string>,
  env: Env,
): Promise<Response> {
  // Try R2 first
  if (route.r2_key_pattern && env.ASSETS) {
    const key = interpolateBraces(route.r2_key_pattern, params);
    const object = await env.ASSETS.get(key);
    if (object) {
      const headers = new Headers();
      headers.set("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream");
      headers.set("Cache-Control", "private, max-age=3600");
      return new Response(object.body, { status: 200, headers });
    }
  }

  // Fallback: proxy to origin if configured
  if (route.origin) {
    const originUrl = interpolateBraces(route.origin, params);
    const originRes = await fetch(originUrl);
    return new Response(originRes.body, {
      status: originRes.status,
      headers: originRes.headers,
    });
  }

  // No resource source configured — return paid resource metadata
  return new Response(
    JSON.stringify({
      status: "delivered",
      message: "Payment accepted. Premium resource access granted.",
      resource: {
        route: route.path,
        namespace: route.namespace,
        params,
      },
      instructions: route.r2_key_pattern
        ? "Resource will be served from R2 once bucket is provisioned."
        : "Resource will be proxied from origin once backend is live.",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
