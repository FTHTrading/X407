/**
 * FTH x402 Pricing — Entitlements (PASS tier logic)
 *
 * Determines what a wallet is entitled to based on their PASS tier.
 * Phase 1: tier-based access. Phase 2: token-gated entitlements.
 */

import type { PassTier } from "./policies";

export interface Entitlement {
  tier: PassTier;
  label: string;
  max_rate_multiplier: number;
  max_channel_deposit: string;
  allowed_routes: "all" | string[]; // namespace prefixes
  features: string[];
}

export const ENTITLEMENTS: Record<PassTier, Entitlement> = {
  basic: {
    tier: "basic",
    label: "Basic Access",
    max_rate_multiplier: 1,
    max_channel_deposit: "100.00",
    allowed_routes: ["fth.x402.route.genesis-repro"],
    features: ["x402-pay", "credit-deposit"],
  },
  pro: {
    tier: "pro",
    label: "Pro Access",
    max_rate_multiplier: 5,
    max_channel_deposit: "10000.00",
    allowed_routes: "all",
    features: ["x402-pay", "credit-deposit", "channel-open", "batch-export"],
  },
  institutional: {
    tier: "institutional",
    label: "Institutional",
    max_rate_multiplier: 100,
    max_channel_deposit: "1000000.00",
    allowed_routes: "all",
    features: [
      "x402-pay",
      "credit-deposit",
      "channel-open",
      "batch-export",
      "dedicated-channel",
      "sla-contract",
    ],
  },
  "kyc-enhanced": {
    tier: "kyc-enhanced",
    label: "KYC-Enhanced",
    max_rate_multiplier: 100,
    max_channel_deposit: "1000000.00",
    allowed_routes: "all",
    features: [
      "x402-pay",
      "credit-deposit",
      "channel-open",
      "batch-export",
      "dedicated-channel",
      "sla-contract",
      "regulated-endpoints",
      "cross-border-trade",
    ],
  },
};

/**
 * Check if a tier can access a namespace.
 */
export function canAccess(tier: PassTier, namespace: string): boolean {
  const ent = ENTITLEMENTS[tier];
  if (ent.allowed_routes === "all") return true;
  return ent.allowed_routes.some((prefix) => namespace.startsWith(prefix));
}

/**
 * Get entitlement for a tier.
 */
export function getEntitlement(tier: PassTier): Entitlement {
  return ENTITLEMENTS[tier];
}
