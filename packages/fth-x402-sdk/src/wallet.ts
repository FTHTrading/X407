/**
 * FTH x402 SDK — Wallet Signing
 *
 * Ed25519 signing for payment proofs. Used by both prepaid credit
 * and channel spend flows.
 */

import nacl from "tweetnacl";
import { decodeUTF8, encodeBase64 } from "tweetnacl-util";

/**
 * Sign an arbitrary message with an Ed25519 secret key.
 * Returns base64-encoded signature.
 */
export function sign(message: string, secretKey: Uint8Array): string {
  const messageBytes = decodeUTF8(message);
  const signature = nacl.sign.detached(messageBytes, secretKey);
  return encodeBase64(signature);
}

/**
 * Sign a prepaid credit payment proof.
 * Message = invoice_id + "|" + nonce
 */
export function signCreditProof(
  invoiceId: string,
  nonce: string,
  secretKey: Uint8Array,
): string {
  return sign(`${invoiceId}|${nonce}`, secretKey);
}

/**
 * Sign a channel spend proof.
 * Message = channel_id + "|" + sequence + "|" + invoice_id
 */
export function signChannelSpend(
  channelId: string,
  sequence: number,
  invoiceId: string,
  secretKey: Uint8Array,
): string {
  return sign(`${channelId}|${sequence}|${invoiceId}`, secretKey);
}

/**
 * Generate a new Ed25519 keypair (for testing / new wallets).
 */
export function generateKeypair(): {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  address: string;
} {
  const pair = nacl.sign.keyPair();
  return {
    publicKey: pair.publicKey,
    secretKey: pair.secretKey,
    address: `uny1_${encodeBase64(pair.publicKey).slice(0, 20)}`,
  };
}
