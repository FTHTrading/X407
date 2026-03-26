/**
 * FTH x402 Pricing — Route Policies
 *
 * Defines access policies per route: KYC requirements, PASS tier minimums,
 * rate limits, and settlement preferences.
 */

export type PassTier = "basic" | "pro" | "institutional" | "kyc-enhanced";
export type CreditModel = "per-request" | "prepaid" | "session";
export type SettlementMode = "prepaid_channel" | "signed_auth" | "tx_hash";

export interface RoutePolicy {
  namespace: string;
  kyc_required: boolean;
  min_pass_level: PassTier;
  rate_limit: string;
  credit_model: CreditModel;
  settlement_mode: SettlementMode;
  primary_rail: "unykorn-l1" | "stellar" | "xrpl";
  receipt_mode: "offchain" | "anchored" | "onchain";
}

/**
 * Policy catalog — static for MVP.
 */
export const ROUTE_POLICIES: RoutePolicy[] = [
  {
    namespace: "fth.x402.route.genesis-repro",
    kyc_required: false,
    min_pass_level: "basic",
    rate_limit: "100/hour",
    credit_model: "prepaid",
    settlement_mode: "prepaid_channel",
    primary_rail: "unykorn-l1",
    receipt_mode: "anchored",
  },
  {
    namespace: "fth.x402.route.trade-verify",
    kyc_required: true,
    min_pass_level: "pro",
    rate_limit: "50/hour",
    credit_model: "prepaid",
    settlement_mode: "prepaid_channel",
    primary_rail: "unykorn-l1",
    receipt_mode: "anchored",
  },
  {
    namespace: "fth.x402.route.invoice-export",
    kyc_required: true,
    min_pass_level: "institutional",
    rate_limit: "20/hour",
    credit_model: "prepaid",
    settlement_mode: "prepaid_channel",
    primary_rail: "unykorn-l1",
    receipt_mode: "onchain",
  },
];

/**
 * Look up the policy for a namespace.
 */
export function getRoutePolicy(namespace: string): RoutePolicy | null {
  return ROUTE_POLICIES.find((p) => p.namespace === namespace) ?? null;
}
