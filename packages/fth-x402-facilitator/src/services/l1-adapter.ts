/**
 * FTH x402 Facilitator — UnyKorn L1 Adapter
 *
 * RPC client for the UnyKorn L1 devnet. Handles:
 *   1. Merkle root anchoring (receipt batches → on-chain)
 *   2. Transaction status polling
 *   3. Block height monitoring
 *   4. Trade-finance module interaction
 *
 * The L1 devnet runs a trade-finance module with the anchor_receipt_root
 * extrinsic for committing Merkle roots. Each anchor is a permanent proof
 * that a batch of receipts existed at a specific block height.
 */

import pool from "../db";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const L1_RPC_URL = process.env.UNYKORN_RPC_URL ?? process.env.L1_RPC_URL ?? "https://rpc.l1.unykorn.org";
const L1_RPC_FALLBACK_URL = process.env.UNYKORN_RPC_FALLBACK_URL ?? process.env.L1_RPC_FALLBACK_URL ?? "";
const L1_CHAIN_ID = Number(process.env.UNYKORN_CHAIN_ID ?? process.env.L1_CHAIN_ID ?? 7331);
const L1_ANCHOR_WALLET = process.env.UNYKORN_TREASURY_ADDRESS ?? process.env.L1_ANCHOR_WALLET ?? "uny1_DEMO_TREASURY";
const L1_MODULE = process.env.L1_MODULE ?? "trade-finance";

// Max retries for RPC calls
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Circuit breaker: stop hammering L1 if it's down
let circuitOpen = false;
let circuitOpenedAt = 0;
const CIRCUIT_RESET_MS = 60_000; // retry after 1 min

function isCircuitOpen(): boolean {
  if (!circuitOpen) return false;
  if (Date.now() - circuitOpenedAt > CIRCUIT_RESET_MS) {
    circuitOpen = false; // half-open: allow one attempt
    return false;
  }
  return true;
}

function tripCircuit(): void {
  circuitOpen = true;
  circuitOpenedAt = Date.now();
  console.warn("[L1] Circuit breaker tripped — L1 RPC unreachable, will retry in 60s");
}

function resetCircuit(): void {
  if (circuitOpen) {
    circuitOpen = false;
    console.info("[L1] Circuit breaker reset — L1 RPC recovered");
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface L1BlockInfo {
  height: number;
  hash: string;
  timestamp: string;
  chain_id: number;
}

export interface L1TransactionResult {
  tx_hash: string;
  status: "pending" | "committed" | "failed";
  block_height?: number;
  block_hash?: string;
  gas_used?: string;
  error?: string;
}

export interface L1AnchorResult {
  batch_id: string;
  tx_hash: string;
  block_height: number;
  merkle_root: string;
  item_count: number;
  anchored_at: string;
}

export interface L1HealthStatus {
  reachable: boolean;
  chain_id: number;
  block_height: number;
  block_hash: string;
  latency_ms: number;
  synced: boolean;
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

let rpcId = 0;

async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  if (isCircuitOpen()) {
    throw new L1RpcError(-1, "L1 circuit breaker open — RPC unavailable");
  }

  rpcId++;
  const body = {
    jsonrpc: "2.0",
    id: rpcId,
    method,
    params,
  };

  const endpoints = [L1_RPC_URL];
  if (L1_RPC_FALLBACK_URL) endpoints.push(L1_RPC_FALLBACK_URL);

  let lastError: Error | null = null;
  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
          throw new Error(`L1 RPC HTTP ${res.status}: ${await res.text()}`);
        }

        const json = (await res.json()) as {
          result?: T;
          error?: { code: number; message: string };
        };

        if (json.error) {
          throw new L1RpcError(json.error.code, json.error.message);
        }

        resetCircuit();
        return json.result as T;
      } catch (err) {
        lastError = err as Error;
        if (attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }
  }

  if (lastError instanceof L1RpcError && lastError.code === -32601) {
    throw lastError;
  }

  tripCircuit();
  throw lastError;
}

// ---------------------------------------------------------------------------
// Block / Chain queries
// ---------------------------------------------------------------------------

/**
 * Get the latest block from the L1 chain.
 */
export async function getLatestBlock(): Promise<L1BlockInfo> {
  try {
    return await rpcCall<L1BlockInfo>("chain_getLatestBlock");
  } catch {
    const status = await fetchHttpStatus();

    return {
      height: Number.isFinite(status.blockHeight) ? status.blockHeight : 0,
      hash: "",
      timestamp: new Date().toISOString(),
      chain_id: Number(status.chainId ?? L1_CHAIN_ID),
    };
  }
}

/**
 * Get block by height.
 */
export async function getBlockByHeight(height: number): Promise<L1BlockInfo> {
  return rpcCall<L1BlockInfo>("chain_getBlockByHeight", [height]);
}

/**
 * Get the current chain status (health check).
 */
export async function getL1Health(): Promise<L1HealthStatus> {
  const start = Date.now();
  try {
    const [httpHealth, httpStatus] = await Promise.all([
      fetchHttpHealth().catch(() => null),
      fetchHttpStatus().catch(() => null),
    ]);
    const latency = Date.now() - start;

    return {
      reachable: true,
      chain_id: Number(httpStatus?.chainId ?? L1_CHAIN_ID),
      block_height: Number.isFinite(httpStatus?.blockHeight) ? Number(httpStatus?.blockHeight) : 0,
      block_hash: httpHealth?.status ?? "OK",
      latency_ms: latency,
      synced: true, // TODO: compare timestamp to now for drift detection
    };
  } catch {
    return {
      reachable: false,
      chain_id: L1_CHAIN_ID,
      block_height: 0,
      block_hash: "",
      latency_ms: Date.now() - start,
      synced: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Transaction queries
// ---------------------------------------------------------------------------

/**
 * Get transaction status by hash.
 */
export async function getTransactionStatus(txHash: string): Promise<L1TransactionResult> {
  return rpcCall<L1TransactionResult>("tx_getStatus", [txHash]);
}

// ---------------------------------------------------------------------------
// Receipt Root Anchoring (trade-finance module)
// ---------------------------------------------------------------------------

/**
 * Submit a Merkle root to the UnyKorn L1 trade-finance module.
 *
 * Calls: trade-finance.anchor_receipt_root(batch_id, merkle_root, item_count)
 *
 * This creates a permanent on-chain record that the given Merkle root
 * (covering item_count receipts) was committed at a specific block height.
 */
export async function anchorMerkleRoot(
  batchId: string,
  merkleRoot: string,
  itemCount: number,
): Promise<L1AnchorResult> {
  const result = await rpcCall<{
    tx_hash: string;
    block_height: number;
    timestamp: string;
  }>(`${L1_MODULE}.anchor_receipt_root`, [
    {
      batch_id: batchId,
      merkle_root: merkleRoot,
      item_count: itemCount,
      anchor_wallet: L1_ANCHOR_WALLET,
    },
  ]);

  return {
    batch_id: batchId,
    tx_hash: result.tx_hash,
    block_height: result.block_height,
    merkle_root: merkleRoot,
    item_count: itemCount,
    anchored_at: normalizeAnchorTimestamp(result.timestamp),
  };
}

/**
 * Anchor a batch and update the database record.
 * This is the main entry point called by the receipt batcher.
 */
export async function anchorBatchOnChain(batchId: string): Promise<L1AnchorResult | null> {
  // 1. Load batch info from DB
  const { rows } = await pool.query(
    `SELECT batch_id, merkle_root, item_count, anchor_tx_hash
     FROM receipt_roots
     WHERE batch_id = $1`,
    [batchId],
  );

  if (!rows[0]) {
    console.error(`Batch not found: ${batchId}`);
    return null;
  }

  // Already anchored?
  if (rows[0].anchor_tx_hash) {
    console.log(`Batch ${batchId} already anchored: ${rows[0].anchor_tx_hash}`);
    return null;
  }

  // 2. Submit to L1
  const result = await anchorMerkleRoot(
    batchId,
    rows[0].merkle_root,
    rows[0].item_count,
  );

  // 3. Update DB with anchor result
  await pool.query(
    `UPDATE receipt_roots
     SET anchor_tx_hash = $2, anchored_at = $3, rail = 'unykorn-l1'
     WHERE batch_id = $1`,
    [batchId, result.tx_hash, result.anchored_at],
  );

  console.log(
    `Batch ${batchId} anchored on L1: tx=${result.tx_hash} block=${result.block_height}`,
  );

  return result;
}

/**
 * Anchor all unanchored batches. Called periodically.
 */
export async function anchorPendingBatches(): Promise<number> {
  // Fail-safe: if L1 is known-down, skip the entire sweep
  if (isCircuitOpen()) {
    return 0;
  }

  const { rows } = await pool.query(
    `SELECT batch_id FROM receipt_roots
     WHERE anchor_tx_hash IS NULL
     ORDER BY created_at ASC
     LIMIT 10`,
  );

  let anchored = 0;
  for (const row of rows) {
    try {
      const result = await anchorBatchOnChain(row.batch_id);
      if (result) anchored++;
    } catch (err) {
      // Log once but never crash the facilitator
      console.error(`[L1] Failed to anchor batch ${row.batch_id}:`, (err as Error).message ?? err);
      // If circuit just tripped, stop trying the rest of this sweep
      if (isCircuitOpen()) break;
    }
  }

  return anchored;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHttpHealth(): Promise<{ status: string }> {
  const endpoints = [L1_RPC_URL];
  if (L1_RPC_FALLBACK_URL) endpoints.push(L1_RPC_FALLBACK_URL);

  for (const endpoint of endpoints) {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/health`, {
      method: "GET",
      headers: { Accept: "text/plain" },
    });

    if (res.ok) {
      return { status: await res.text() };
    }
  }

  throw new Error("L1 health endpoint unavailable");
}

async function fetchHttpStatus(): Promise<{ blockHeight: number; chainId?: number }> {
  const endpoints = [L1_RPC_URL];
  if (L1_RPC_FALLBACK_URL) endpoints.push(L1_RPC_FALLBACK_URL);

  for (const endpoint of endpoints) {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/status`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      return (await res.json()) as { blockHeight: number; chainId?: number };
    }
  }

  throw new Error("L1 status endpoint unavailable");
}

export class L1RpcError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(`L1 RPC Error ${code}: ${message}`);
    this.name = "L1RpcError";
    this.code = code;
  }
}

function normalizeAnchorTimestamp(value: string): string {
  const trimmed = String(value ?? "").trim();

  if (/^\d+$/.test(trimmed)) {
    const millis = Number(trimmed);
    if (Number.isFinite(millis) && millis > 0) {
      return new Date(millis).toISOString();
    }
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }

  return new Date().toISOString();
}
