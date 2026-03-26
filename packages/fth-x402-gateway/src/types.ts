/**
 * FTH x402 Gateway — Protocol Types
 *
 * Re-exports canonical types from fth-x402-core and adds gateway-specific
 * types (Env, CF Worker bindings). All protocol types are sourced from core —
 * this file is a thin adapter layer.
 */

// Re-export everything from the canonical core package
export type {
  Rail,
  ProofType,
  PassTier,
  RoutePolicy,
  RouteConfig,
  PaymentRequirement,
  PrepaidCreditProof,
  ChannelSpendProof,
  SignedAuthProof,
  TxHashProof,
  PaymentProof,
  InvoiceCreateBody as InvoiceCreateRequest,
  InvoiceCreateResponse,
  VerifyBody as VerifyRequest,
  VerificationResult as VerifyResponse,
} from "../../fth-x402-core/src/types";

export {
  PROTOCOL_VERSION,
  HEADERS,
  ALL_RAILS,
  ALL_PROOF_TYPES,
  DEFAULT_INVOICE_TTL_SECONDS,
} from "../../fth-x402-core/src/types";

// ---------------------------------------------------------------------------
// Gateway-specific: Cloudflare Worker environment bindings
// ---------------------------------------------------------------------------

export interface Env {
  FACILITATOR_URL: string;
  ENVIRONMENT: string;
  UNYKORN_TREASURY_ADDRESS?: string;
  ASSETS?: R2Bucket;
  /** OpenMeter endpoint (optional — metering disabled if unset). */
  OPENMETER_ENDPOINT?: string;
  /** OpenMeter API key (optional). */
  OPENMETER_API_KEY?: string;
}
