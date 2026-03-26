/**
 * FTH x402 Facilitator — Rate Limiter
 *
 * Sliding-window rate limiter backed by PostgreSQL.
 * Tracks per-wallet request counts within configurable windows.
 *
 * Supports:
 *   - Per-wallet rate limits (e.g., "100/hour")
 *   - Global route rate limits
 *   - Burst allowance (short window multiplier)
 *   - Tier-based scaling (pro gets 2x, institutional gets 5x)
 */

import pool from "../db";
import type { PassTier } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  /** e.g., "100/hour", "10/minute", "1000/day" */
  limit: string;
  /** Optional burst multiplier for short 10s windows (default: 3x) */
  burst_multiplier?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  window_seconds: number;
  retry_after_seconds?: number;
}

// ---------------------------------------------------------------------------
// Tier multipliers — higher tiers get more generous limits
// ---------------------------------------------------------------------------

const TIER_MULTIPLIERS: Record<PassTier, number> = {
  basic: 1,
  pro: 2,
  institutional: 5,
  "kyc-enhanced": 10,
};

// ---------------------------------------------------------------------------
// Parse rate limit string
// ---------------------------------------------------------------------------

function parseRateLimit(limit: string): { count: number; window_seconds: number } {
  const match = limit.match(/^(\d+)\/(second|minute|hour|day)$/);
  if (!match) {
    throw new Error(`Invalid rate limit format: "${limit}" — expected "N/unit"`);
  }
  const count = parseInt(match[1], 10);
  const unit = match[2];
  const windows: Record<string, number> = {
    second: 1,
    minute: 60,
    hour: 3600,
    day: 86400,
  };
  return { count, window_seconds: windows[unit] };
}

// ---------------------------------------------------------------------------
// Core limiter — uses PG for distributed state
// ---------------------------------------------------------------------------

/**
 * Check rate limit for a wallet on a namespace/route.
 * Records the request if allowed.
 *
 * Uses a sliding window: counts requests in the last N seconds.
 */
export async function checkRateLimit(
  wallet_address: string,
  namespace: string,
  config: RateLimitConfig,
  tier: PassTier = "basic",
): Promise<RateLimitResult> {
  const { count: baseLimit, window_seconds } = parseRateLimit(config.limit);
  const multiplier = TIER_MULTIPLIERS[tier] ?? 1;
  const effectiveLimit = baseLimit * multiplier;

  const cutoff = new Date(Date.now() - window_seconds * 1000).toISOString();

  // Count recent requests in window
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS request_count
     FROM rate_limit_log
     WHERE wallet_address = $1
       AND namespace = $2
       AND created_at > $3`,
    [wallet_address, namespace, cutoff],
  );

  const currentCount = rows[0]?.request_count ?? 0;

  if (currentCount >= effectiveLimit) {
    // Over limit — compute retry-after
    const oldestInWindow = await pool.query(
      `SELECT created_at
       FROM rate_limit_log
       WHERE wallet_address = $1 AND namespace = $2 AND created_at > $3
       ORDER BY created_at ASC
       LIMIT 1`,
      [wallet_address, namespace, cutoff],
    );

    const retryAfter = oldestInWindow.rows[0]
      ? Math.ceil(
          (new Date(oldestInWindow.rows[0].created_at).getTime() +
            window_seconds * 1000 -
            Date.now()) /
            1000,
        )
      : window_seconds;

    return {
      allowed: false,
      remaining: 0,
      limit: effectiveLimit,
      window_seconds,
      retry_after_seconds: Math.max(retryAfter, 1),
    };
  }

  // Under limit — record this request
  await pool.query(
    `INSERT INTO rate_limit_log (wallet_address, namespace) VALUES ($1, $2)`,
    [wallet_address, namespace],
  );

  return {
    allowed: true,
    remaining: effectiveLimit - currentCount - 1,
    limit: effectiveLimit,
    window_seconds,
  };
}

/**
 * Cleanup old rate limit entries (call periodically).
 * Removes entries older than 24 hours.
 */
export async function cleanupRateLimitLog(): Promise<number> {
  const cutoff = new Date(Date.now() - 86400 * 1000).toISOString();
  const result = await pool.query(
    `DELETE FROM rate_limit_log WHERE created_at < $1`,
    [cutoff],
  );
  return result.rowCount ?? 0;
}
