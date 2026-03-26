/**
 * FTH x402 Gateway — Proof Parser
 *
 * Extracts and validates the X-PAYMENT-SIGNATURE header from incoming
 * requests. Uses fth-x402-core for structural validation, then forwards
 * to the facilitator for cryptographic verification.
 */

import type { PaymentProof } from "./types";
import { HEADERS } from "./types";
import { isValidProofType, validateProofStructure } from "../../fth-x402-core/src/helpers";

/**
 * Extract payment proof from the request X-PAYMENT-SIGNATURE header.
 * Returns null if no proof header present. Throws on malformed proof.
 */
export function extractProof(request: Request): PaymentProof | null {
  const header = request.headers.get(HEADERS.PAYMENT_SIGNATURE);
  if (!header) return null;

  let proof: PaymentProof;
  try {
    // Try base64 first, then raw JSON
    let decoded: string;
    try {
      decoded = atob(header);
    } catch {
      decoded = header;
    }
    proof = JSON.parse(decoded) as PaymentProof;
  } catch {
    throw new ProofParseError("Malformed X-PAYMENT-SIGNATURE header");
  }

  // Structural validation via core
  const err = validateProofStructure(proof);
  if (err) {
    throw new ProofParseError(err);
  }

  return proof;
}

export class ProofParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProofParseError";
  }
}
