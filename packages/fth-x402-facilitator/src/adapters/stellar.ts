/**
 * FTH x402 Facilitator — Stellar Bridge Adapter
 *
 * Handles:
 *   1. Stellar `signed_auth` verification (auth_entry flow)
 *   2. sUSDF bridge representation management
 *   3. Stellar → L1 bridging (lock/unlock pattern)
 *   4. Testnet + mainnet support
 *
 * The bridge uses a lock/mint model:
 *   - Bridge in:  lock USDF on L1 → mint sUSDF on Stellar
 *   - Bridge out: burn sUSDF on Stellar → unlock USDF on L1
 *
 * Auth entry flow (x402-compatible):
 *   1. Client signs a Soroban auth entry with their Stellar keypair
 *   2. Entry encodes: invoiceId, nonce, amount, asset
 *   3. Facilitator verifies signature against the entry's address
 */

import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const STELLAR_NETWORK = process.env.STELLAR_NETWORK ?? "testnet";
const STELLAR_HORIZON_URL = process.env.STELLAR_HORIZON_URL
  ?? (STELLAR_NETWORK === "mainnet"
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org");
const STELLAR_ISSUER_ADDRESS = process.env.STELLAR_ISSUER_ADDRESS ?? "";
const SUSDF_ASSET_CODE = "sUSDF";

// Circuit breaker for Stellar network
let circuitOpen = false;
let circuitOpenedAt = 0;
const CIRCUIT_RESET_MS = 60_000;

function isCircuitOpen(): boolean {
  if (!circuitOpen) return false;
  if (Date.now() - circuitOpenedAt > CIRCUIT_RESET_MS) {
    circuitOpen = false;
    return false;
  }
  return true;
}

function tripCircuit(): void {
  circuitOpen = true;
  circuitOpenedAt = Date.now();
  console.warn("[Stellar] Circuit breaker tripped — Horizon unreachable");
}

function resetCircuit(): void {
  if (circuitOpen) {
    circuitOpen = false;
    console.info("[Stellar] Circuit breaker reset");
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StellarAuthEntry {
  /** Base64-encoded Soroban auth entry */
  auth_entry: string;
  /** Stellar public key (G...) */
  source_address: string;
  /** Invoice being paid */
  invoice_id: string;
  /** Payment amount */
  amount: string;
  /** Asset code */
  asset: string;
}

export interface StellarVerifyResult {
  valid: boolean;
  source_address?: string;
  error?: string;
}

export interface StellarAccountInfo {
  address: string;
  sequence: string;
  balances: Array<{
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
    balance: string;
  }>;
}

export interface StellarBridgeResult {
  direction: "in" | "out";
  stellar_tx_hash?: string;
  l1_tx_hash?: string;
  amount: string;
  asset: string;
  status: "pending" | "completed" | "failed";
  error?: string;
}

// ---------------------------------------------------------------------------
// signed_auth verification
// ---------------------------------------------------------------------------

/**
 * Verify a Stellar signed_auth entry for x402 payment.
 *
 * The auth entry is a base64-encoded Soroban authorization envelope that
 * the client signed with their Stellar keypair. We verify:
 *   1. The signature is valid for the claimed source address
 *   2. The encoded invoice_id and amount match our records
 *   3. The entry hasn't expired
 */
export async function verifyStellarSignedAuth(
  entry: StellarAuthEntry,
): Promise<StellarVerifyResult> {
  try {
    // Decode the auth entry
    const decoded = decodeAuthEntry(entry.auth_entry);
    if (!decoded) {
      return { valid: false, error: "Failed to decode auth entry" };
    }

    // Verify the source address matches
    if (decoded.source !== entry.source_address) {
      return { valid: false, error: "Source address mismatch" };
    }

    // Verify the signature
    const sigValid = verifyEd25519Stellar(
      decoded.source,
      decoded.payload,
      decoded.signature,
    );
    if (!sigValid) {
      return { valid: false, error: "Invalid Stellar Ed25519 signature" };
    }

    // Verify the payment parameters in the auth entry
    if (decoded.invoice_id !== entry.invoice_id) {
      return { valid: false, error: "Invoice ID mismatch in auth entry" };
    }

    if (decoded.amount !== entry.amount) {
      return { valid: false, error: "Amount mismatch in auth entry" };
    }

    // Check entry expiration
    if (decoded.expiration && decoded.expiration < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: "Auth entry expired" };
    }

    return {
      valid: true,
      source_address: decoded.source,
    };
  } catch (err) {
    return { valid: false, error: `Stellar auth verification failed: ${(err as Error).message}` };
  }
}

// ---------------------------------------------------------------------------
// Account queries
// ---------------------------------------------------------------------------

/**
 * Fetch a Stellar account's info from Horizon.
 */
export async function getStellarAccount(address: string): Promise<StellarAccountInfo | null> {
  if (isCircuitOpen()) {
    throw new StellarAdapterError("Stellar circuit breaker open");
  }

  try {
    const res = await fetch(`${STELLAR_HORIZON_URL}/accounts/${address}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Horizon HTTP ${res.status}`);
    }

    const data = await res.json() as any;
    resetCircuit();

    return {
      address: data.account_id,
      sequence: data.sequence,
      balances: data.balances.map((b: any) => ({
        asset_type: b.asset_type,
        asset_code: b.asset_code,
        asset_issuer: b.asset_issuer,
        balance: b.balance,
      })),
    };
  } catch (err) {
    tripCircuit();
    throw new StellarAdapterError(`Horizon unreachable: ${(err as Error).message}`);
  }
}

/**
 * Get the sUSDF balance for a Stellar address.
 */
export async function getStellarSudfBalance(address: string): Promise<string> {
  const account = await getStellarAccount(address);
  if (!account) return "0";

  const sudf = account.balances.find(
    (b) => b.asset_code === SUSDF_ASSET_CODE && b.asset_issuer === STELLAR_ISSUER_ADDRESS,
  );
  return sudf?.balance ?? "0";
}

/**
 * Get the total sUSDF supply on Stellar (issuer's liability).
 */
export async function getStellarSudfSupply(): Promise<string> {
  if (!STELLAR_ISSUER_ADDRESS) return "0";

  try {
    const res = await fetch(
      `${STELLAR_HORIZON_URL}/assets?asset_code=${SUSDF_ASSET_CODE}&asset_issuer=${STELLAR_ISSUER_ADDRESS}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!res.ok) return "0";
    const data = await res.json() as any;
    const record = data._embedded?.records?.[0];
    return record?.amount ?? "0";
  } catch {
    return "0";
  }
}

// ---------------------------------------------------------------------------
// Bridge operations (lock/mint and burn/unlock)
// ---------------------------------------------------------------------------

/**
 * Bridge USDF from L1 → Stellar (lock on L1, mint sUSDF on Stellar).
 * This is called when a user wants to move USDF to Stellar for use
 * with x402-compatible services.
 */
export async function bridgeToStellar(
  l1WalletAddress: string,
  stellarAddress: string,
  amount: string,
): Promise<StellarBridgeResult> {
  // Phase 2: Validate the L1 lock transaction first
  // Phase 4: Full atomic bridge with 2-phase commit

  console.log(`[Stellar Bridge] L1→Stellar: ${amount} USDF from ${l1WalletAddress} to ${stellarAddress}`);

  // For now, record the intent and let the operator process it
  return {
    direction: "in",
    amount,
    asset: SUSDF_ASSET_CODE,
    status: "pending",
  };
}

/**
 * Bridge sUSDF from Stellar → L1 (burn sUSDF on Stellar, unlock USDF on L1).
 */
export async function bridgeFromStellar(
  stellarAddress: string,
  l1WalletAddress: string,
  amount: string,
): Promise<StellarBridgeResult> {
  console.log(`[Stellar Bridge] Stellar→L1: ${amount} sUSDF from ${stellarAddress} to ${l1WalletAddress}`);

  return {
    direction: "out",
    amount,
    asset: "USDF",
    status: "pending",
  };
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface StellarHealthStatus {
  reachable: boolean;
  network: string;
  horizon_url: string;
  issuer_configured: boolean;
  latency_ms: number;
}

export async function getStellarHealth(): Promise<StellarHealthStatus> {
  const start = Date.now();
  try {
    const res = await fetch(`${STELLAR_HORIZON_URL}/`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    const latency = Date.now() - start;

    return {
      reachable: res.ok,
      network: STELLAR_NETWORK,
      horizon_url: STELLAR_HORIZON_URL,
      issuer_configured: !!STELLAR_ISSUER_ADDRESS,
      latency_ms: latency,
    };
  } catch {
    return {
      reachable: false,
      network: STELLAR_NETWORK,
      horizon_url: STELLAR_HORIZON_URL,
      issuer_configured: !!STELLAR_ISSUER_ADDRESS,
      latency_ms: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// Stellar Ed25519 helpers
// ---------------------------------------------------------------------------

interface DecodedAuthEntry {
  source: string;
  payload: Uint8Array;
  signature: Uint8Array;
  invoice_id: string;
  amount: string;
  expiration?: number;
}

/**
 * Decode a base64 auth entry into its components.
 * Auth entry format: JSON envelope { source, sig, payload: { invoice_id, amount, ts } }
 */
function decodeAuthEntry(b64: string): DecodedAuthEntry | null {
  try {
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    const payload = Buffer.from(JSON.stringify(json.payload), "utf8");
    return {
      source: json.source,
      payload: new Uint8Array(payload),
      signature: new Uint8Array(Buffer.from(json.signature, "base64")),
      invoice_id: json.payload?.invoice_id ?? "",
      amount: json.payload?.amount ?? "",
      expiration: json.payload?.expiration,
    };
  } catch {
    return null;
  }
}

/**
 * Verify a Stellar Ed25519 signature.
 * Stellar uses raw Ed25519 (same as tweetnacl), but addresses are StrKey-encoded.
 * For verification, we extract the raw 32-byte public key from the G... address.
 */
function verifyEd25519Stellar(
  stellarAddress: string,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  try {
    // Stellar G... addresses use StrKey encoding:
    // version_byte (1) + payload (32) + checksum (2) = 35 bytes, base32-encoded
    const decoded = decodeStrKey(stellarAddress);
    if (!decoded || decoded.length !== 32) return false;

    // Use Node.js crypto for Ed25519 verification
    const { createPublicKey, verify } = require("crypto");
    const key = createPublicKey({
      key: Buffer.concat([
        // Ed25519 public key DER prefix
        Buffer.from("302a300506032b6570032100", "hex"),
        Buffer.from(decoded),
      ]),
      format: "der",
      type: "spki",
    });

    return verify(null, Buffer.from(message), key, Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Decode a Stellar StrKey (G... address) to raw 32-byte public key.
 */
function decodeStrKey(strKey: string): Uint8Array | null {
  try {
    // StrKey uses custom base32 (RFC 4648 without padding)
    const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const decoded: number[] = [];
    let bits = 0;
    let value = 0;

    for (const c of strKey) {
      const idx = ALPHABET.indexOf(c);
      if (idx === -1) return null;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        decoded.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }

    // First byte = version (6 = ed25519 public key)
    // Next 32 bytes = key payload
    // Last 2 bytes = CRC16 checksum
    if (decoded.length < 35) return null;
    return new Uint8Array(decoded.slice(1, 33));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class StellarAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StellarAdapterError";
  }
}
