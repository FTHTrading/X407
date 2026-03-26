/**
 * FTH x402 Facilitator — Receipt Service
 *
 * Creates offchain receipts (signed by facilitator Ed25519 key) and batches
 * them into Merkle roots for periodic anchoring to UnyKorn L1.
 */

import { nanoid } from "nanoid";
import { createHash } from "crypto";
import nacl from "tweetnacl";
import { encodeBase64, decodeBase64, decodeUTF8 } from "tweetnacl-util";
import pool from "../db";
import type { Receipt, ProofType, Rail } from "../types";
import { anchorBatchOnChain } from "./l1-adapter";

// In-memory receipt queue for batching (production: use a queue service)
const receiptQueue: Receipt[] = [];
const BATCH_SIZE = 100;
const BATCH_INTERVAL_MS = 30_000;

// Facilitator signing key — loaded from FTH_SIGNING_KEY env (base64 Ed25519 secret)
let signingKey: Uint8Array | null = null;

function getSigningKey(): Uint8Array {
  if (!signingKey) {
    const b64 = process.env.FTH_SIGNING_KEY;
    if (!b64) {
      throw new Error("FTH_SIGNING_KEY not set — receipt signing unavailable");
    }
    const seed = decodeBase64(b64);
    // FTH_SIGNING_KEY is a 32-byte seed; derive full 64-byte Ed25519 secret key
    const keyPair = nacl.sign.keyPair.fromSeed(seed);
    signingKey = keyPair.secretKey;
  }
  return signingKey;
}

/**
 * Sign a receipt payload with the facilitator's Ed25519 key.
 * Message = receipt_id + "|" + invoice_id + "|" + payer + "|" + amount + "|" + asset
 */
function signReceipt(receiptId: string, invoiceId: string, payer: string, amount: string, asset: string): string {
  const message = `${receiptId}|${invoiceId}|${payer}|${amount}|${asset}`;
  const key = getSigningKey();
  const sig = nacl.sign.detached(decodeUTF8(message), key);
  return encodeBase64(sig);
}

interface CreateReceiptInput {
  invoice_id: string;
  channel_id: string | null;
  payer: string;
  amount: string;
  asset: string;
  rail: Rail;
  proof_type: ProofType;
}

/**
 * Create an offchain receipt for a verified payment.
 */
export async function createReceipt(input: CreateReceiptInput): Promise<Receipt> {
  const receipt_id = `rcpt_${nanoid(16)}`;

  // Sign receipt with facilitator Ed25519 key
  const facilitator_sig = signReceipt(
    receipt_id,
    input.invoice_id,
    input.payer,
    input.amount,
    input.asset,
  );

  const { rows } = await pool.query(
    `INSERT INTO receipts
       (receipt_id, invoice_id, channel_id, payer, amount, asset, rail, proof_type, facilitator_sig)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      receipt_id,
      input.invoice_id,
      input.channel_id,
      input.payer,
      input.amount,
      input.asset,
      input.rail,
      input.proof_type,
      facilitator_sig,
    ],
  );

  const receipt = rows[0] as Receipt;

  // Add to batch queue
  receiptQueue.push(receipt);

  // Auto-flush if batch full
  if (receiptQueue.length >= BATCH_SIZE) {
    // Fire and forget — batch anchoring is async
    flushBatch().catch((err) => console.error("Batch flush error:", err));
  }

  return receipt;
}

/**
 * Flush the receipt queue into a Merkle batch.
 * Creates a receipt_root entry (Merkle root computed from receipt_ids).
 *
 * The Merkle root is later anchored to UnyKorn L1 via the batcher adapter.
 */
export async function flushBatch(): Promise<string | null> {
  if (receiptQueue.length === 0) return null;

  const batch = receiptQueue.splice(0, BATCH_SIZE);
  const batch_id = `batch_${nanoid(12)}`;

  // Build proper Merkle tree from receipt IDs
  const leaves = batch.map((r) => sha512Hex(r.receipt_id));
  const merkle_root = computeMerkleRoot(leaves);

  // Store batch root
  await pool.query(
    `INSERT INTO receipt_roots (batch_id, merkle_root, rail, item_count)
     VALUES ($1, $2, 'unykorn-l1', $3)`,
    [batch_id, merkle_root, batch.length],
  );

  // Update receipts with batch reference
  const receiptIds = batch.map((r) => r.receipt_id);
  await pool.query(
    `UPDATE receipts SET batch_id = $1 WHERE receipt_id = ANY($2)`,
    [batch_id, receiptIds],
  );

  console.log(
    `Batch ${batch_id}: ${batch.length} receipts, root ${merkle_root.slice(0, 16)}...`,
  );

  // Anchor Merkle root on UnyKorn L1 (fire-and-forget, non-blocking)
  anchorBatchOnChain(batch_id).catch((err) =>
    console.error(`L1 anchor failed for batch ${batch_id}:`, err),
  );

  return batch_id;
}

/**
 * Lookup receipt by ID.
 */
export async function getReceipt(receipt_id: string): Promise<Receipt | null> {
  const { rows } = await pool.query(
    `SELECT * FROM receipts WHERE receipt_id = $1`,
    [receipt_id],
  );
  return (rows[0] as Receipt) ?? null;
}

// Start periodic flush timer
let batchTimer: ReturnType<typeof setInterval> | null = null;

export function startBatcher(): void {
  if (batchTimer) return;
  batchTimer = setInterval(() => {
    flushBatch().catch((err) => console.error("Periodic batch error:", err));
  }, BATCH_INTERVAL_MS);
  console.log(`Receipt batcher started (interval: ${BATCH_INTERVAL_MS}ms)`);
}

export function stopBatcher(): void {
  if (batchTimer) {
    clearInterval(batchTimer);
    batchTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Merkle Tree / Hashing
// ---------------------------------------------------------------------------

/**
 * SHA-512 hex digest (matching UnyKorn L1 hash function).
 */
function sha512Hex(input: string): string {
  return createHash("sha512").update(input).digest("hex");
}

/**
 * Compute Merkle root from an array of hex leaf hashes.
 * Uses SHA-512(left + right) at each level. Odd leaves are promoted.
 */
function computeMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return sha512Hex("");
  if (leaves.length === 1) return leaves[0];

  let level = [...leaves];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        next.push(sha512Hex(level[i] + level[i + 1]));
      } else {
        // Odd leaf — promote
        next.push(level[i]);
      }
    }
    level = next;
  }
  return level[0];
}
