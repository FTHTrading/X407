/**
 * FTH x402 Core — Helpers
 *
 * Pure utility functions used across the x402 stack.
 * No external dependencies allowed in this module.
 */

import type { PaymentProof, ProofType } from "./types";
import { ALL_PROOF_TYPES } from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// Proof validation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Type-guard: checks whether a value is a valid ProofType string.
 */
export function isValidProofType(v: unknown): v is ProofType {
  return typeof v === "string" && ALL_PROOF_TYPES.includes(v as ProofType);
}

/**
 * Structurally validate a payment proof object.
 * Returns null if valid, or an error message describing the issue.
 */
export function validateProofStructure(proof: PaymentProof): string | null {
  if (!proof || typeof proof !== "object") {
    return "Proof must be a non-null object";
  }
  if (!isValidProofType(proof.proof_type)) {
    return `Invalid proof_type: ${(proof as any).proof_type}`;
  }
  if (!proof.invoice_id) {
    return "Missing invoice_id in proof";
  }

  switch (proof.proof_type) {
    case "prepaid_credit":
      if (!proof.credit_id || !proof.payer || !proof.signature || !proof.nonce) {
        return "prepaid_credit proof requires: credit_id, payer, signature, nonce";
      }
      break;
    case "channel_spend":
      if (
        !proof.channel_id ||
        proof.sequence == null ||
        !proof.payer ||
        !proof.signature ||
        !proof.nonce
      ) {
        return "channel_spend proof requires: channel_id, sequence, payer, signature, nonce";
      }
      break;
    case "signed_auth":
      if (!proof.auth_entry || !proof.payer) {
        return "signed_auth proof requires: auth_entry, payer";
      }
      break;
    case "tx_hash":
      if (!proof.tx_hash || !proof.payer || !proof.nonce) {
        return "tx_hash proof requires: tx_hash, payer, nonce";
      }
      break;
  }

  return null; // valid
}

// ═══════════════════════════════════════════════════════════════════════════
// Encoding helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Base64-encode a JSON-serializable value.
 * Uses btoa (available in Node 18+ and Cloudflare Workers).
 */
export function encodeHeader(value: unknown): string {
  const json = JSON.stringify(value);
  return btoa(json);
}

/**
 * Decode a base64 (or raw JSON) header value.
 * Uses atob (available in Node 18+ and Cloudflare Workers).
 */
export function decodeHeader<T = unknown>(header: string): T {
  let decoded: string;
  try {
    decoded = atob(header);
  } catch {
    // Assume raw JSON
    decoded = header;
  }
  return JSON.parse(decoded) as T;
}

// ═══════════════════════════════════════════════════════════════════════════
// Interpolation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Replace `:param` tokens in a URL pattern with values from a params map.
 * E.g. interpolatePattern("/api/:id", { id: "42" }) → "/api/42"
 */
export function interpolatePattern(
  pattern: string,
  params: Record<string, string>,
): string {
  return pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_m, name) => {
    return params[name] ?? `:${name}`;
  });
}

/**
 * Replace `{param}` tokens in a string with values from a params map.
 * E.g. interpolateBraces("genesis/{suite}", { suite: "alpha" }) → "genesis/alpha"
 */
export function interpolateBraces(
  template: string,
  params: Record<string, string>,
): string {
  return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_m, name) => {
    return params[name] ?? "";
  });
}
