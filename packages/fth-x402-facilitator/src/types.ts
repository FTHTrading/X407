/**
 * FTH x402 Facilitator — Shared Types
 *
 * Re-exports canonical protocol types from fth-x402-core.
 * All services import from this file — the indirection means
 * zero changes needed in services when the source moves to core.
 */

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
} from "../../fth-x402-core/src/types";

export {
  PROTOCOL_VERSION,
  HEADERS,
  DEFAULT_INVOICE_TTL_SECONDS,
  ACCEPTED_ASSETS,
  ALL_RAILS,
  ALL_PROOF_TYPES,
} from "../../fth-x402-core/src/types";
