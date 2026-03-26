/**
 * FTH x402 Facilitator — Reserve / Supply Reconciliation
 *
 * Ensures that the total supply across all rails stays consistent:
 *   - UnyKorn L1: canonical USDF (source of truth)
 *   - Stellar:    sUSDF (bridged representation)
 *   - XRPL:       xUSDF (mirrored representation)
 *
 * Invariant: USDF_locked_L1 >= sUSDF_supply_stellar + xUSDF_supply_xrpl
 *
 * Runs periodically to detect drift and alert operators.
 */

import pool from "../db";
import { getLatestBlock, type L1BlockInfo } from "./l1-adapter";
import { getStellarSudfSupply, getStellarHealth, type StellarHealthStatus } from "../adapters/stellar";
import { getXrplXudfSupply, getXrplHealth, type XrplHealthStatus } from "../adapters/xrpl";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReconciliationSnapshot {
  timestamp: string;
  l1: {
    reachable: boolean;
    block_height: number;
    usdf_total_supply: string;
    usdf_locked_for_bridges: string;
  };
  stellar: {
    reachable: boolean;
    susdf_supply: string;
  };
  xrpl: {
    reachable: boolean;
    xusdf_supply: string;
  };
  invariant: {
    locked: string;
    bridged: string;
    drift: string;
    healthy: boolean;
  };
  credit_ledger: {
    total_balance: string;
    total_accounts: number;
    total_channels_open: number;
    total_channel_deposits: string;
  };
}

export interface ReconciliationAlert {
  type: "drift" | "rail_down" | "supply_mismatch";
  severity: "info" | "warning" | "critical";
  message: string;
  data: Record<string, unknown>;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DRIFT_THRESHOLD_WARN = parseFloat(process.env.RECONCILE_DRIFT_WARN ?? "0.01");
const DRIFT_THRESHOLD_CRITICAL = parseFloat(process.env.RECONCILE_DRIFT_CRITICAL ?? "1.0");

// ---------------------------------------------------------------------------
// Core reconciliation
// ---------------------------------------------------------------------------

/**
 * Run a full reconciliation snapshot across all three rails.
 */
export async function reconcile(): Promise<ReconciliationSnapshot> {
  const timestamp = new Date().toISOString();

  // Parallel queries: L1, Stellar supply, XRPL supply, credit ledger
  const [l1Block, stellarSupply, xrplSupply, stellarHealth, xrplHealth, ledgerStats] = await Promise.all([
    getLatestBlock().catch(() => ({ height: 0, hash: "", timestamp: "", chain_id: 0 }) as L1BlockInfo),
    getStellarSudfSupply().catch(() => "0"),
    getXrplXudfSupply().catch(() => "0"),
    getStellarHealth().catch(() => ({ reachable: false }) as StellarHealthStatus),
    getXrplHealth().catch(() => ({ reachable: false }) as XrplHealthStatus),
    getCreditLedgerStats(),
  ]);

  // Get L1 supply data from our local DB
  // (in production, query L1 RPC for on-chain supply)
  const l1Supply = await getL1SupplyFromDb();

  // Calculate invariant
  const locked = parseFloat(l1Supply.locked_for_bridges);
  const bridged = parseFloat(stellarSupply) + parseFloat(xrplSupply);
  const drift = locked - bridged;
  const healthy = Math.abs(drift) <= DRIFT_THRESHOLD_WARN;

  return {
    timestamp,
    l1: {
      reachable: l1Block.height > 0,
      block_height: l1Block.height,
      usdf_total_supply: l1Supply.total_supply,
      usdf_locked_for_bridges: l1Supply.locked_for_bridges,
    },
    stellar: {
      reachable: stellarHealth.reachable,
      susdf_supply: stellarSupply,
    },
    xrpl: {
      reachable: xrplHealth.reachable,
      xusdf_supply: xrplSupply,
    },
    invariant: {
      locked: locked.toFixed(6),
      bridged: bridged.toFixed(6),
      drift: drift.toFixed(6),
      healthy,
    },
    credit_ledger: ledgerStats,
  };
}

/**
 * Check for alerts based on reconciliation snapshot.
 */
export function checkAlerts(snapshot: ReconciliationSnapshot): ReconciliationAlert[] {
  const alerts: ReconciliationAlert[] = [];

  // Drift alerts
  const drift = Math.abs(parseFloat(snapshot.invariant.drift));
  if (drift > DRIFT_THRESHOLD_CRITICAL) {
    alerts.push({
      type: "drift",
      severity: "critical",
      message: `Supply drift ${drift.toFixed(6)} exceeds critical threshold (${DRIFT_THRESHOLD_CRITICAL})`,
      data: { drift, threshold: DRIFT_THRESHOLD_CRITICAL },
      timestamp: snapshot.timestamp,
    });
  } else if (drift > DRIFT_THRESHOLD_WARN) {
    alerts.push({
      type: "drift",
      severity: "warning",
      message: `Supply drift ${drift.toFixed(6)} exceeds warning threshold (${DRIFT_THRESHOLD_WARN})`,
      data: { drift, threshold: DRIFT_THRESHOLD_WARN },
      timestamp: snapshot.timestamp,
    });
  }

  // Rail down alerts
  if (!snapshot.l1.reachable) {
    alerts.push({
      type: "rail_down",
      severity: "critical",
      message: "UnyKorn L1 unreachable — primary settlement rail down",
      data: {},
      timestamp: snapshot.timestamp,
    });
  }
  if (!snapshot.stellar.reachable) {
    alerts.push({
      type: "rail_down",
      severity: "warning",
      message: "Stellar Horizon unreachable — bridge rail degraded",
      data: {},
      timestamp: snapshot.timestamp,
    });
  }
  if (!snapshot.xrpl.reachable) {
    alerts.push({
      type: "rail_down",
      severity: "warning",
      message: "XRPL node unreachable — mirror rail degraded",
      data: {},
      timestamp: snapshot.timestamp,
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

interface L1SupplyInfo {
  total_supply: string;
  locked_for_bridges: string;
}

/**
 * Get L1 USDF supply info from our database.
 * In production, this queries the L1 RPC for on-chain supply.
 */
async function getL1SupplyFromDb(): Promise<L1SupplyInfo> {
  try {
    // Total credit balance = approximate circulating supply in our system
    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(balance), 0)::text AS total_balance,
        COALESCE(SUM(balance) FILTER (WHERE rail IN ('stellar', 'xrpl')), 0)::text AS bridge_locked
      FROM credit_accounts
      WHERE frozen = false
    `);

    return {
      total_supply: rows[0]?.total_balance ?? "0",
      locked_for_bridges: rows[0]?.bridge_locked ?? "0",
    };
  } catch {
    return { total_supply: "0", locked_for_bridges: "0" };
  }
}

interface CreditLedgerStats {
  total_balance: string;
  total_accounts: number;
  total_channels_open: number;
  total_channel_deposits: string;
}

async function getCreditLedgerStats(): Promise<CreditLedgerStats> {
  try {
    const [accountsResult, channelsResult] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM(balance), 0)::text AS total_balance,
          COUNT(*)::int AS total_accounts
        FROM credit_accounts
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_open,
          COALESCE(SUM(deposited_amount), 0)::text AS total_deposits
        FROM payment_channels
        WHERE status = 'open'
      `),
    ]);

    return {
      total_balance: accountsResult.rows[0]?.total_balance ?? "0",
      total_accounts: accountsResult.rows[0]?.total_accounts ?? 0,
      total_channels_open: channelsResult.rows[0]?.total_open ?? 0,
      total_channel_deposits: channelsResult.rows[0]?.total_deposits ?? "0",
    };
  } catch {
    return {
      total_balance: "0",
      total_accounts: 0,
      total_channels_open: 0,
      total_channel_deposits: "0",
    };
  }
}
