/**
 * FTH x402 SDK — Public API
 */

export { FTHClient } from "./client";
export { X402Interceptor } from "./x402";
export { sign, signCreditProof, signChannelSpend, generateKeypair } from "./wallet";
export { createChannelSpendProof, type ChannelState } from "./channels";
export type {
  FTHClientConfig,
  WalletConfig,
  PaymentRequirement,
  PaymentResponse,
  Rail,
  ProofType,
} from "./types";
