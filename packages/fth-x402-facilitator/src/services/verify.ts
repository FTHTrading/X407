/**
 * FTH x402 Facilitator — Payment Verification Service
 *
 * Core verification logic. Validates payment proofs per V2 spec:
 *   1. Invoice exists + not expired + not already paid
 *   2. Nonce matches
 *   3. Proof-type-specific checks
 *   4. Settlement (deduct balance or channel spend)
 *   5. Mark invoice paid
 *   6. Create receipt
 */

import type { VerifyBody, PaymentProof, Invoice } from "../types";
import { getInvoice, markInvoicePaid } from "./invoices";
import { charge, InsufficientBalanceError } from "./settle";
import { spendChannel, ChannelError } from "./channels";
import { createReceipt } from "./receipts";
import { checkReplay, recordNonce } from "./replay";
import { checkRateLimit } from "./rate-limiter";
import { dispatchEvent } from "./webhooks";
import { verifyUnykornTxHash } from "./verifyUnykornTxHash";
import { verifyTxHashPayment } from "./verifyTxHash";
import { verifyStellarSignedAuth } from "../adapters/stellar";
import { verifyXrplPayment } from "../adapters/xrpl";
import nacl from "tweetnacl";
import { decodeBase64, decodeUTF8 } from "tweetnacl-util";
import pool from "../db";

export interface VerifyResult {
  verified: boolean;
  receipt_id?: string;
  error?: string;
  error_code?: string;
}

export async function verifyPayment(body: VerifyBody): Promise<VerifyResult> {
  // 1. Lookup invoice
  const invoice = await getInvoice(body.invoice_id);
  if (!invoice) {
    return { verified: false, error: "Invoice not found", error_code: "invoice_not_found" };
  }

  // 2. Invoice status check
  if (invoice.status === "paid") {
    return { verified: false, error: "Invoice already redeemed", error_code: "invoice_redeemed" };
  }
  if (invoice.status === "expired") {
    return { verified: false, error: "Invoice expired", error_code: "invoice_expired" };
  }
  if (invoice.status !== "pending") {
    return { verified: false, error: "Invoice not payable", error_code: "invoice_invalid" };
  }

  // 3. Expiry check
  if (new Date(invoice.expires_at) < new Date()) {
    return { verified: false, error: "Invoice expired", error_code: "invoice_expired" };
  }

  // 4. Nonce match
  if ("nonce" in body.proof && body.proof.nonce !== invoice.nonce) {
    return { verified: false, error: "Nonce mismatch", error_code: "nonce_mismatch" };
  }

  // 5. Replay guard
  const isReplay = await checkReplay(body.invoice_id, body.nonce);
  if (isReplay) {
    return { verified: false, error: "Replay detected", error_code: "nonce_mismatch" };
  }

  // 5b. Rate limit check (if namespace specified)
  if (body.namespace && body.proof.payer) {
    try {
      const rateResult = await checkRateLimit(
        body.proof.payer,
        body.namespace,
        { limit: "100/hour" }, // Default; will be overridden by route policy later
      );
      if (!rateResult.allowed) {
        return {
          verified: false,
          error: `Rate limit exceeded. Retry after ${rateResult.retry_after_seconds}s`,
          error_code: "rate_limited",
        };
      }
    } catch {
      // Rate limiter failure is non-fatal — allow the request but log
      console.error("Rate limiter error (non-fatal), allowing request");
    }
  }

  // 6. Proof-type-specific verification + settlement
  let settlementResult: VerifyResult;
  try {
    switch (body.proof.proof_type) {
      case "prepaid_credit":
        settlementResult = await verifyPrepaidCredit(body.proof, invoice);
        break;
      case "channel_spend":
        settlementResult = await verifyChannelSpend(body.proof, invoice);
        break;
      case "signed_auth":
        settlementResult = await verifyStellarSignedAuthProof(body.proof as any, invoice);
        break;
      case "xrpl_payment":
        // XRPL payment proof — delegates to XRPL adapter for on-ledger tx verification
        settlementResult = await verifyXrplTxHashProof(body.proof as any, invoice);
        break;
      case "tx_hash":
        if (body.proof.rail === "unykorn-l1") {
          settlementResult = await verifyUnykornTxHash(body.proof, invoice);
        } else if (body.proof.rail === "xrpl") {
          settlementResult = await verifyXrplTxHashProof(body.proof, invoice);
        } else {
          settlementResult = await verifyTxHashPayment(body.proof, invoice);
        }
        break;
      default:
        settlementResult = {
          verified: false,
          error: "Unknown proof type",
          error_code: "invalid_proof",
        };
    }
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      return { verified: false, error: err.message, error_code: "insufficient_amount" };
    }
    if (err instanceof ChannelError) {
      return { verified: false, error: err.message, error_code: "channel_sequence_invalid" };
    }
    throw err;
  }

  if (!settlementResult.verified) return settlementResult;

  // 7. Record nonce
  await recordNonce(body.invoice_id, body.nonce);

  // 8. Mark invoice paid
  await markInvoicePaid(
    body.invoice_id,
    body.proof.payer,
    body.proof.proof_type,
    body.proof as unknown as Record<string, unknown>,
  );

  // 9. Create receipt
  const receipt = await createReceipt({
    invoice_id: body.invoice_id,
    channel_id: body.proof.proof_type === "channel_spend" ? body.proof.channel_id : null,
    payer: body.proof.payer,
    amount: invoice.amount,
    asset: invoice.asset,
    rail: invoice.rail,
    proof_type: body.proof.proof_type,
  });

  // 10. Dispatch webhook (fire-and-forget)
  dispatchEvent(body.proof.payer, "payment.received", {
    receipt_id: receipt.receipt_id,
    invoice_id: body.invoice_id,
    payer: body.proof.payer,
    amount: invoice.amount,
    asset: invoice.asset,
    proof_type: body.proof.proof_type,
    resource: body.resource,
    namespace: body.namespace,
  }).catch(() => { /* webhook failure is non-fatal */ });

  return {
    verified: true,
    receipt_id: receipt.receipt_id,
  };
}

// ---------------------------------------------------------------------------
// Proof-specific handlers
// ---------------------------------------------------------------------------

/**
 * Resolve public key for a wallet address.
 * Looks up the credit_accounts table for the stored pubkey,
 * or falls back to decoding the address directly (uny1_ prefix + base64 pubkey).
 */
async function resolvePublicKey(walletAddress: string): Promise<Uint8Array | null> {
  // Convention: uny1_ + base64(pubkey).slice(0,20) — but we store full pubkey in DB
  const { rows } = await pool.query(
    `SELECT pubkey FROM credit_accounts WHERE wallet_address = $1 LIMIT 1`,
    [walletAddress],
  );
  if (rows.length > 0 && rows[0].pubkey) {
    try {
      return decodeBase64(rows[0].pubkey);
    } catch {
      // Invalid base64 pubkey stored — treat as no pubkey
      return null;
    }
  }
  return null;
}

/**
 * Verify Ed25519 signature for a given message + payer address.
 */
async function verifyEd25519(payer: string, message: string, signatureB64: string): Promise<boolean> {
  const pubkey = await resolvePublicKey(payer);
  if (!pubkey || pubkey.length !== 32) {
    // No pubkey on file — cannot verify
    return false;
  }
  try {
    const sig = decodeBase64(signatureB64);
    const msg = decodeUTF8(message);
    return nacl.sign.detached.verify(msg, sig, pubkey);
  } catch {
    return false;
  }
}

async function verifyPrepaidCredit(
  proof: Extract<PaymentProof, { proof_type: "prepaid_credit" }>,
  invoice: Invoice,
): Promise<VerifyResult> {
  // Verify Ed25519 signature: message = invoice_id + "|" + nonce
  const message = `${proof.invoice_id}|${proof.nonce}`;
  const sigValid = await verifyEd25519(proof.payer, message, proof.signature);
  if (!sigValid) {
    return { verified: false, error: "Invalid Ed25519 signature", error_code: "invalid_proof" };
  }

  await charge(proof.payer, invoice.amount, invoice.invoice_id);

  return { verified: true };
}

async function verifyChannelSpend(
  proof: Extract<PaymentProof, { proof_type: "channel_spend" }>,
  invoice: Invoice,
): Promise<VerifyResult> {
  // Verify Ed25519 signature: message = channel_id + "|" + sequence + "|" + invoice_id
  const message = `${proof.channel_id}|${proof.sequence}|${proof.invoice_id}`;
  const sigValid = await verifyEd25519(proof.payer, message, proof.signature);
  if (!sigValid) {
    return { verified: false, error: "Invalid Ed25519 signature", error_code: "invalid_proof" };
  }

  await spendChannel(proof.channel_id, proof.sequence, invoice.amount, invoice.invoice_id);

  return { verified: true };
}

/**
 * Verify Stellar signed_auth proof. Bridges the adapter result into VerifyResult.
 */
async function verifyStellarSignedAuthProof(
  proof: { payer: string; auth_entry: string; source_address: string; invoice_id: string; amount: string; proof_type: string },
  invoice: Invoice,
): Promise<VerifyResult> {
  const result = await verifyStellarSignedAuth({
    auth_entry: proof.auth_entry,
    source_address: proof.source_address ?? proof.payer,
    invoice_id: invoice.invoice_id,
    amount: invoice.amount,
    asset: invoice.asset,
  });

  if (!result.valid) {
    return { verified: false, error: result.error ?? "Stellar auth failed", error_code: "invalid_proof" };
  }

  // Credit the payment via deposit (Stellar rail funds arrive via bridge)
  await charge(proof.payer, invoice.amount, invoice.invoice_id);

  return { verified: true };
}

/**
 * Verify XRPL tx_hash proof on the XRPL rail. Bridges adapter result into VerifyResult.
 */
async function verifyXrplTxHashProof(
  proof: { payer: string; tx_hash: string; rail: string; proof_type: string },
  invoice: Invoice,
): Promise<VerifyResult> {
  const result = await verifyXrplPayment(
    proof.tx_hash,
    invoice.receiver ?? "",
    invoice.amount,
    "xUSDF",
  );

  if (!result.valid) {
    return { verified: false, error: result.error ?? "XRPL payment verification failed", error_code: "invalid_proof" };
  }

  return { verified: true };
}
