/**
 * FTH x402 Core — Canonical Protocol Types
 *
 * THIS IS THE SOURCE OF TRUTH for every type shared across the x402 stack.
 * Gateway, facilitator, SDK, and metering all import from here.
 *
 * Naming convention: snake_case for all field names (matches PG columns and
 * on-wire JSON). Once locked, these interfaces are versioned — breaking
 * changes bump the protocol version.
 *
 * Protocol version: fth-x402/2.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// Enums / Literal Unions
// ═══════════════════════════════════════════════════════════════════════════

/** Settlement rail identifier. */
export type Rail = "unykorn-l1" | "stellar" | "xrpl" | "base";

/** Accepted payment asset symbols. */
export type AssetSymbol = "USDF" | "sUSDF" | "xUSDF" | "USDC" | "UNY";

/** Accepted payment proof mechanisms. */
export type ProofType =
  | "prepaid_credit"
  | "channel_spend"
  | "signed_auth"
  | "tx_hash";

/** KYC/access tier for gated routes. */
export type PassTier = "basic" | "pro" | "institutional" | "kyc-enhanced";

/** Invoice lifecycle state. */
export type InvoiceStatus = "pending" | "paid" | "expired" | "cancelled";

/** Payment channel lifecycle state. */
export type ChannelStatus = "open" | "closing" | "closed" | "disputed";

/** Credit ledger transaction type. */
export type CreditTxType = "deposit" | "charge" | "refund" | "withdrawal";

/** Webhook event kinds. */
export type WebhookEvent =
  | "invoice.created"
  | "invoice.paid"
  | "invoice.expired"
  | "channel.opened"
  | "channel.closed"
  | "credit.deposited"
  | "receipt.created";

// ═══════════════════════════════════════════════════════════════════════════
// Route & Policy
// ═══════════════════════════════════════════════════════════════════════════

/** Policy assigned to a paid route. Drives gating and rate limiting. */
export interface RoutePolicy {
  kyc_required: boolean;
  min_pass_level: PassTier;
  rate_limit: string; // e.g. "100/hour"
}

/** Full configuration for a paid route in the gateway. */
export interface RouteConfig {
  path: string; // URL pattern, e.g. "/api/v1/genesis/repro-pack/:suite"
  namespace: string; // e.g. "fth.x402.route.genesis-repro"
  payment: {
    asset: AssetSymbol;
    amount: string;
    receiver: string;
    memo_prefix: string;
    rail?: Rail;
  };
  policy: RoutePolicy;
  origin?: string; // origin URL to proxy after payment
  r2_key_pattern?: string; // R2 object key pattern
}

// ═══════════════════════════════════════════════════════════════════════════
// 402 Payment Requirement (gateway → client)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The 402 body returned by the gateway.
 * Encodes everything a client needs to construct a valid proof.
 */
export interface PaymentRequirement {
  version: "fth-x402/2.0";
  resource: string;
  payment: {
    asset: AssetSymbol;
    amount: string;
    receiver: string;
    memo: string;
    invoice_id: string;
    nonce: string;
    expires_at: string;
    accepted_rails: Rail[];
    accepted_proofs: ProofType[];
  };
  namespace: string;
  policy: RoutePolicy;
}

// ═══════════════════════════════════════════════════════════════════════════
// Payment Proofs (client → gateway → facilitator)
// ═══════════════════════════════════════════════════════════════════════════

export interface PrepaidCreditProof {
  proof_type: "prepaid_credit";
  credit_id: string;
  payer: string;
  signature: string;
  invoice_id: string;
  nonce: string;
}

export interface ChannelSpendProof {
  proof_type: "channel_spend";
  channel_id: string;
  sequence: number;
  payer: string;
  signature: string;
  invoice_id: string;
  nonce: string;
}

export interface SignedAuthProof {
  proof_type: "signed_auth";
  rail: "stellar";
  auth_entry: string;
  payer: string;
  invoice_id: string;
}

export interface TxHashProof {
  proof_type: "tx_hash";
  rail: Rail;
  tx_hash: string;
  invoice_id: string;
  nonce: string;
  payer: string;
  timestamp: string;
}

export type PaymentProof =
  | PrepaidCreditProof
  | ChannelSpendProof
  | SignedAuthProof
  | TxHashProof;

// ═══════════════════════════════════════════════════════════════════════════
// Verification & Settlement (facilitator responses)
// ═══════════════════════════════════════════════════════════════════════════

/** Result of facilitator /verify. */
export interface VerificationResult {
  verified: boolean;
  receipt_id?: string;
  error?: string;
  error_code?: string;
}

/** Result of an L1 settlement anchor. */
export interface SettlementResult {
  batch_id: string;
  tx_hash: string;
  block_height: number;
  merkle_root: string;
  item_count: number;
  anchored_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Facilitator API payloads
// ═══════════════════════════════════════════════════════════════════════════

export interface InvoiceCreateBody {
  resource: string;
  namespace: string;
  asset: AssetSymbol;
  amount: string;
  receiver: string;
  memo: string;
  policy: RoutePolicy;
  rail?: Rail;
  ttl_seconds?: number;
}

export interface InvoiceCreateResponse {
  invoice_id: string;
  nonce: string;
  expires_at: string;
}

export interface VerifyBody {
  invoice_id: string;
  nonce: string;
  proof: PaymentProof;
  resource: string;
  namespace: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Domain Models (DB-backed entities)
// ═══════════════════════════════════════════════════════════════════════════

export interface CreditAccount {
  id: string;
  wallet_address: string;
  rail: Rail;
  namespace: string | null;
  asset: string;
  balance: string;
  frozen: boolean;
  kyc_level: string;
  pubkey: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreditTransaction {
  id: string;
  account_id: string;
  type: CreditTxType;
  amount: string;
  balance_after: string;
  reference: string | null;
  rail: Rail | null;
  tx_hash: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export interface Invoice {
  id: string;
  invoice_id: string;
  nonce: string;
  resource: string;
  namespace: string | null;
  asset: string;
  amount: string;
  receiver: string;
  rail: Rail;
  status: InvoiceStatus;
  policy_version: string | null;
  payer: string | null;
  proof_type: ProofType | null;
  proof_data: Record<string, unknown> | null;
  expires_at: Date;
  paid_at: Date | null;
  created_at: Date;
}

export interface PaymentChannel {
  id: string;
  channel_id: string;
  wallet_address: string;
  namespace: string | null;
  rail: Rail;
  asset: string;
  deposited_amount: string;
  available_amount: string;
  spent_amount: string;
  sequence: number;
  status: ChannelStatus;
  opened_tx_hash: string | null;
  closed_tx_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Receipt {
  id: string;
  receipt_id: string;
  invoice_id: string;
  channel_id: string | null;
  payer: string;
  amount: string;
  asset: string;
  rail: Rail;
  proof_type: ProofType;
  batch_id: string | null;
  merkle_index: number | null;
  facilitator_sig: string;
  created_at: Date;
}

export interface ReceiptRoot {
  id: string;
  batch_id: string;
  merkle_root: string;
  rail: Rail;
  anchor_tx_hash: string | null;
  item_count: number;
  anchored_at: Date | null;
  created_at: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Protocol version string. */
export const PROTOCOL_VERSION = "fth-x402/2.0" as const;

/** Header names used in the x402 protocol. */
export const HEADERS = {
  /** Gateway → client: encoded PaymentRequirement. */
  PAYMENT_REQUIRED: "X-PAYMENT-REQUIRED",
  /** Client → gateway: encoded PaymentProof. */
  PAYMENT_SIGNATURE: "X-PAYMENT-SIGNATURE",
  /** Gateway → client: encoded receipt / verification result. */
  PAYMENT_RESPONSE: "X-PAYMENT-RESPONSE",
} as const;

/** Default TTL for invoices, in seconds. */
export const DEFAULT_INVOICE_TTL_SECONDS = 300;

/** Accepted asset symbols. */
export const ACCEPTED_ASSETS = ["USDF", "sUSDF", "xUSDF", "USDC", "UNY"] as const;

/** All settlement rails. */
export const ALL_RAILS: Rail[] = ["unykorn-l1", "stellar", "xrpl", "base"];

/** All accepted proof types. */
export const ALL_PROOF_TYPES: ProofType[] = [
  "prepaid_credit",
  "channel_spend",
  "signed_auth",
  "tx_hash",
];
