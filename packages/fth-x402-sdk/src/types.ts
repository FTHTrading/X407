/**
 * FTH x402 SDK — Type Definitions
 */

export type Rail = "unykorn-l1" | "stellar" | "xrpl";
export type ProofType = "prepaid_credit" | "channel_spend" | "signed_auth" | "tx_hash";

export interface PaymentRequirement {
  version: "fth-x402/2.0";
  resource: string;
  payment: {
    asset: string;
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
  policy: {
    kyc_required: boolean;
    min_pass_level: string;
    rate_limit: string;
  };
}

export interface PaymentResponse {
  version: "fth-x402/2.0";
  verified: boolean;
  receipt_id: string;
  rail: Rail;
}

export interface WalletConfig {
  address: string;
  rail: Rail;
  secretKey?: Uint8Array; // Ed25519 secret key (64 bytes)
  credit_id?: string; // prepaid credit account ID
  channel_id?: string; // active payment channel ID
  channel_sequence?: number; // current channel sequence
}

export interface FTHClientConfig {
  wallet: WalletConfig;
  preferredProof?: ProofType;
  autoRetry?: boolean; // default: true
  maxRetries?: number; // default: 1
}
