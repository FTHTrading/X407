-- ═══════════════════════════════════════════════════════════════════════
-- Migration 002: Rename _usdf columns to generic names (UNY migration)
-- Date: 2026-03-26
-- Description: Completes the USDF → UNY stablecoin migration by
--              renaming all _usdf column suffixes to match service code.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── credit_accounts ────────────────────────────────────────────────
ALTER TABLE credit_accounts RENAME COLUMN balance_usdf TO balance;

-- ─── treasury_agents ────────────────────────────────────────────────
ALTER TABLE treasury_agents RENAME COLUMN target_balance_usdf TO target_balance;
ALTER TABLE treasury_agents RENAME COLUMN min_balance_usdf TO min_balance;
ALTER TABLE treasury_agents RENAME COLUMN max_single_refill_usdf TO max_single_refill;
ALTER TABLE treasury_agents RENAME COLUMN max_daily_refill_usdf TO max_daily_refill;

-- Fix check constraint to use new column names
ALTER TABLE treasury_agents DROP CONSTRAINT IF EXISTS treasury_agents_check;
ALTER TABLE treasury_agents ADD CONSTRAINT treasury_agents_check
  CHECK (target_balance >= min_balance);

-- ─── treasury_refills ───────────────────────────────────────────────
ALTER TABLE treasury_refills RENAME COLUMN amount_usdf TO amount;

-- ─── treasury_limits ────────────────────────────────────────────────
ALTER TABLE treasury_limits RENAME COLUMN max_daily_refill_usdf TO max_daily_refill;
ALTER TABLE treasury_limits RENAME COLUMN max_hourly_refill_usdf TO max_hourly_refill;

-- ─── treasury_policies ──────────────────────────────────────────────
ALTER TABLE treasury_policies RENAME COLUMN default_max_daily_refill_usdf TO default_max_daily_refill;
ALTER TABLE treasury_policies RENAME COLUMN default_target_balance_usdf TO default_target_balance;
ALTER TABLE treasury_policies RENAME COLUMN default_min_balance_usdf TO default_min_balance;
ALTER TABLE treasury_policies RENAME COLUMN default_max_single_refill_usdf TO default_max_single_refill;

-- ─── guardian_revenue (has both old + new columns) ──────────────────
-- Drop the old column (amount_uny already exists)
ALTER TABLE guardian_revenue DROP COLUMN IF EXISTS amount_usdf;

COMMIT;
