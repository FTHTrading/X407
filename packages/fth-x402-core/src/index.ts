/**
 * FTH x402 Core — Public API
 *
 * Re-exports every type, constant, and helper from the core package.
 * Import from "fth-x402-core" in gateway, facilitator, SDK, and metering.
 */

// Types
export type {
  Rail,
  ProofType,
  PassTier,
  InvoiceStatus,
  ChannelStatus,
  CreditTxType,
  WebhookEvent,
  RoutePolicy,
  RouteConfig,
  PaymentRequirement,
  PrepaidCreditProof,
  ChannelSpendProof,
  SignedAuthProof,
  TxHashProof,
  PaymentProof,
  VerificationResult,
  SettlementResult,
  InvoiceCreateBody,
  InvoiceCreateResponse,
  VerifyBody,
  CreditAccount,
  CreditTransaction,
  Invoice,
  PaymentChannel,
  Receipt,
  ReceiptRoot,
} from "./types";

// Constants
export {
  PROTOCOL_VERSION,
  HEADERS,
  DEFAULT_INVOICE_TTL_SECONDS,
  ACCEPTED_ASSETS,
  ALL_RAILS,
  ALL_PROOF_TYPES,
} from "./types";

// Helpers
export {
  isValidProofType,
  validateProofStructure,
  encodeHeader,
  decodeHeader,
  interpolatePattern,
  interpolateBraces,
} from "./helpers";

// Auth
export {
  AUTH_HEADERS,
  SERVICE_NAMES,
  MAX_REQUEST_AGE_MS,
  createServiceSignature,
  verifyServiceSignature,
  createServiceFetch,
  getBearerToken,
  isValidAdminToken,
  isAuthorizedRequest,
} from "./auth";

export type { ServiceName, AuthLevel, ServiceFetchOptions } from "./auth";
