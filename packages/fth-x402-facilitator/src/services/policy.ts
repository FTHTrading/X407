/**
 * FTH x402 Facilitator — Policy Engine
 *
 * Route policy checks: PASS tier requirements, KYC level, rate limits.
 * Called by the verifier before settlement to enforce access rules.
 */

import type { PassTier, RoutePolicy } from "../types";

const PASS_TIER_ORDER: PassTier[] = ["basic", "pro", "institutional", "kyc-enhanced"];

/**
 * Check if a payer's PASS tier satisfies the route's minimum requirement.
 */
export function checkPassTier(
  payer_tier: PassTier | null,
  required: PassTier,
): boolean {
  if (!payer_tier) return required === "basic"; // No PASS = basic access only
  const payerLevel = PASS_TIER_ORDER.indexOf(payer_tier);
  const requiredLevel = PASS_TIER_ORDER.indexOf(required);
  return payerLevel >= requiredLevel;
}

/**
 * Validate a route policy against payer state (stub for MVP).
 */
export function validatePolicy(
  _policy: RoutePolicy,
  _payer: { tier: PassTier | null; kyc_level: string },
): { allowed: boolean; reason?: string } {
  // For MVP, allow all requests
  // TODO: Implement real policy checks in Phase 2
  return { allowed: true };
}
