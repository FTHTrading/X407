/**
 * FTH x402 Gateway — 402 Response Builder
 *
 * Builds the HTTP 402 Payment Required response per the V2 spec.
 * Calls the facilitator to create an invoice, then encodes the
 * payment instructions into the X-PAYMENT-REQUIRED header and body.
 */

import type {
  Env,
  InvoiceCreateRequest,
  InvoiceCreateResponse,
  PaymentRequirement,
  RouteConfig,
} from "./types";
import {
  ALL_RAILS,
  ALL_PROOF_TYPES,
  PROTOCOL_VERSION,
  DEFAULT_INVOICE_TTL_SECONDS,
  HEADERS,
} from "./types";
import { interpolatePattern } from "../../fth-x402-core/src/helpers";

/**
 * Create a 402 response for a paid route.
 *
 * 1. Call facilitator /invoices to create an invoice (gets invoice_id + nonce)
 * 2. Build PaymentRequirement body per V2 spec
 * 3. Return 402 with X-PAYMENT-REQUIRED header
 */
export async function build402Response(
  route: RouteConfig,
  params: Record<string, string>,
  env: Env,
): Promise<Response> {
  const resource = interpolatePattern(route.path, params);
  const memo = `${route.payment.memo_prefix}:${Object.values(params).join(":")}`;
  const receiver = resolveReceiver(route, env);

  // --- Ask facilitator to create an invoice ---
  let invoice: InvoiceCreateResponse;
  try {
    const body: InvoiceCreateRequest = {
      resource,
      namespace: route.namespace,
      asset: route.payment.asset,
      amount: route.payment.amount,
      receiver,
      memo,
      policy: route.policy,
      rail: route.payment.rail,
      ttl_seconds: DEFAULT_INVOICE_TTL_SECONDS,
    };

    const res = await fetch(`${env.FACILITATOR_URL}/invoices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Cloudflare-Worker/fth-x402-gateway",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("Facilitator invoice creation failed:", res.status);
      return new Response("Internal payment error", { status: 500 });
    }

    invoice = (await res.json()) as InvoiceCreateResponse;
  } catch (err) {
    console.error("Facilitator unreachable:", err);
    return new Response("Payment service unavailable", { status: 503 });
  }

  // --- Build 402 body ---
  const requirement: PaymentRequirement = {
    version: PROTOCOL_VERSION,
    resource,
    payment: {
      asset: route.payment.asset,
      amount: route.payment.amount,
      receiver,
      memo,
      invoice_id: invoice.invoice_id,
      nonce: invoice.nonce,
      expires_at: invoice.expires_at,
      accepted_rails: [...ALL_RAILS],
      accepted_proofs: [...ALL_PROOF_TYPES],
    },
    namespace: route.namespace,
    policy: route.policy,
  };

  const encoded = btoa(JSON.stringify(requirement));

  return new Response(JSON.stringify(requirement, null, 2), {
    status: 402,
    headers: {
      "Content-Type": "application/json",
      [HEADERS.PAYMENT_REQUIRED]: encoded,
    },
  });
}

function resolveReceiver(route: RouteConfig, env: Env): string {
  if (route.payment.receiver === "$UNYKORN_TREASURY_ADDRESS") {
    return env.UNYKORN_TREASURY_ADDRESS ?? route.payment.receiver;
  }
  return route.payment.receiver;
}

// (interpolation now sourced from fth-x402-core/helpers)
