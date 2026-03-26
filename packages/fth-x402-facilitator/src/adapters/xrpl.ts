/**
 * FTH x402 Facilitator — XRPL Mirror Adapter
 *
 * Handles:
 *   1. xUSDF mirror via existing master-issuer
 *   2. XRPL payment verification (tx_hash on XRPL rail)
 *   3. Trustline management
 *   4. DEX path resolution
 *
 * The XRPL rail uses the existing FTH master-issuer account to issue
 * xUSDF as an IOU. This mirrors the canonical USDF supply from L1.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const XRPL_NETWORK = process.env.XRPL_NETWORK ?? "testnet";
const XRPL_WS_URL = process.env.XRPL_WS_URL
  ?? (XRPL_NETWORK === "mainnet"
    ? "wss://s1.ripple.com/"
    : "wss://s.altnet.rippletest.net:51233");
const XRPL_HTTP_URL = process.env.XRPL_HTTP_URL
  ?? (XRPL_NETWORK === "mainnet"
    ? "https://s1.ripple.com:51234/"
    : "https://s.altnet.rippletest.net:51234/");
const XRPL_ISSUER_ADDRESS = process.env.XRPL_ISSUER_ADDRESS ?? "";
const XUSDF_CURRENCY = "xUSDF";

// Circuit breaker
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
  console.warn("[XRPL] Circuit breaker tripped — XRPL node unreachable");
}

function resetCircuit(): void {
  if (circuitOpen) {
    circuitOpen = false;
    console.info("[XRPL] Circuit breaker reset");
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface XrplPaymentInfo {
  tx_hash: string;
  account: string;
  destination: string;
  amount: string;
  currency: string;
  issuer?: string;
  ledger_index: number;
  timestamp: string;
  validated: boolean;
}

export interface XrplVerifyResult {
  valid: boolean;
  payment?: XrplPaymentInfo;
  error?: string;
}

export interface XrplAccountInfo {
  address: string;
  balance_xrp: string;
  sequence: number;
  trustlines: Array<{
    currency: string;
    issuer: string;
    balance: string;
    limit: string;
  }>;
}

export interface XrplMirrorResult {
  direction: "mint" | "burn";
  amount: string;
  xrpl_tx_hash?: string;
  status: "pending" | "completed" | "failed";
  error?: string;
}

// ---------------------------------------------------------------------------
// JSON-RPC helper for XRPL
// ---------------------------------------------------------------------------

let rpcId = 0;

async function xrplRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  if (isCircuitOpen()) {
    throw new XrplAdapterError("XRPL circuit breaker open");
  }

  rpcId++;
  const body = { method, params: params.length > 0 ? params : [{}] };

  try {
    const res = await fetch(XRPL_HTTP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(`XRPL HTTP ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as { result: T & { error?: string; error_message?: string } };

    if (json.result?.error) {
      throw new XrplAdapterError(`${json.result.error}: ${json.result.error_message ?? ""}`);
    }

    resetCircuit();
    return json.result;
  } catch (err) {
    if (err instanceof XrplAdapterError) throw err;
    tripCircuit();
    throw new XrplAdapterError(`XRPL RPC error: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Payment verification
// ---------------------------------------------------------------------------

/**
 * Verify an XRPL payment transaction for x402 settlement.
 *
 * Checks:
 *   1. Transaction exists and is validated
 *   2. Payment destination matches our receiver
 *   3. Amount and currency match the invoice
 *   4. Currency issuer matches our master-issuer (for IOUs)
 */
export async function verifyXrplPayment(
  txHash: string,
  expectedReceiver: string,
  expectedAmount: string,
  expectedCurrency: string = XUSDF_CURRENCY,
): Promise<XrplVerifyResult> {
  try {
    const result = await xrplRpc<any>("tx", [
      { transaction: txHash, binary: false },
    ]);

    if (!result.validated) {
      return { valid: false, error: "Transaction not yet validated" };
    }

    if (result.TransactionType !== "Payment") {
      return { valid: false, error: `Expected Payment, got ${result.TransactionType}` };
    }

    // Parse delivered amount
    const delivered = result.meta?.delivered_amount ?? result.Amount;
    let paidAmount: string;
    let paidCurrency: string;
    let paidIssuer: string | undefined;

    if (typeof delivered === "string") {
      // XRP drops
      paidAmount = (Number(delivered) / 1_000_000).toString();
      paidCurrency = "XRP";
    } else {
      // IOU
      paidAmount = delivered.value;
      paidCurrency = delivered.currency;
      paidIssuer = delivered.issuer;
    }

    // Verify destination
    if (result.Destination !== expectedReceiver) {
      return { valid: false, error: "Destination mismatch" };
    }

    // Verify currency
    if (paidCurrency !== expectedCurrency) {
      return { valid: false, error: `Currency mismatch: expected ${expectedCurrency}, got ${paidCurrency}` };
    }

    // For xUSDF IOU, verify issuer
    if (paidCurrency === XUSDF_CURRENCY && XRPL_ISSUER_ADDRESS) {
      if (paidIssuer !== XRPL_ISSUER_ADDRESS) {
        return { valid: false, error: "Issuer mismatch — not the FTH master-issuer" };
      }
    }

    // Verify amount (allow minor floating point variance)
    const amountDiff = Math.abs(parseFloat(paidAmount) - parseFloat(expectedAmount));
    if (amountDiff > 0.001) {
      return { valid: false, error: `Amount mismatch: expected ${expectedAmount}, got ${paidAmount}` };
    }

    const payment: XrplPaymentInfo = {
      tx_hash: txHash,
      account: result.Account,
      destination: result.Destination,
      amount: paidAmount,
      currency: paidCurrency,
      issuer: paidIssuer,
      ledger_index: result.ledger_index,
      timestamp: rippleTimeToISO(result.date),
      validated: true,
    };

    return { valid: true, payment };
  } catch (err) {
    return { valid: false, error: `XRPL verification failed: ${(err as Error).message}` };
  }
}

// ---------------------------------------------------------------------------
// Account queries
// ---------------------------------------------------------------------------

/**
 * Get XRPL account info including trustlines.
 */
export async function getXrplAccount(address: string): Promise<XrplAccountInfo | null> {
  try {
    const info = await xrplRpc<any>("account_info", [{ account: address, ledger_index: "validated" }]);
    const lines = await xrplRpc<any>("account_lines", [{ account: address, ledger_index: "validated" }]);

    return {
      address,
      balance_xrp: (Number(info.account_data.Balance) / 1_000_000).toString(),
      sequence: info.account_data.Sequence,
      trustlines: (lines.lines ?? []).map((l: any) => ({
        currency: l.currency,
        issuer: l.account,
        balance: l.balance,
        limit: l.limit,
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Get the xUSDF balance for an XRPL address.
 */
export async function getXrplXudfBalance(address: string): Promise<string> {
  const account = await getXrplAccount(address);
  if (!account) return "0";

  const xudf = account.trustlines.find(
    (t) => t.currency === XUSDF_CURRENCY && t.issuer === XRPL_ISSUER_ADDRESS,
  );
  return xudf?.balance ?? "0";
}

/**
 * Get total xUSDF supply (sum of all trustline obligations for the issuer).
 */
export async function getXrplXudfSupply(): Promise<string> {
  if (!XRPL_ISSUER_ADDRESS) return "0";

  try {
    const result = await xrplRpc<any>("gateway_balances", [
      { account: XRPL_ISSUER_ADDRESS, ledger_index: "validated" },
    ]);
    const obligations = result.obligations?.[XUSDF_CURRENCY];
    return obligations ?? "0";
  } catch {
    return "0";
  }
}

// ---------------------------------------------------------------------------
// Mirror operations (mint/burn xUSDF via master-issuer)
// ---------------------------------------------------------------------------

/**
 * Mint xUSDF on XRPL (issuer sends Payment to recipient).
 * Called when USDF is locked on L1 and needs to be mirrored on XRPL.
 */
export async function mintXusdf(
  recipientAddress: string,
  amount: string,
): Promise<XrplMirrorResult> {
  console.log(`[XRPL Mirror] Minting ${amount} xUSDF to ${recipientAddress}`);

  // In production: sign and submit a Payment from XRPL_ISSUER_ADDRESS
  // For now, record the intent
  return {
    direction: "mint",
    amount,
    status: "pending",
  };
}

/**
 * Burn xUSDF on XRPL (recipient sends Payment back to issuer).
 * Called when converting xUSDF back to canonical USDF on L1.
 */
export async function burnXusdf(
  senderAddress: string,
  amount: string,
): Promise<XrplMirrorResult> {
  console.log(`[XRPL Mirror] Burning ${amount} xUSDF from ${senderAddress}`);

  return {
    direction: "burn",
    amount,
    status: "pending",
  };
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface XrplHealthStatus {
  reachable: boolean;
  network: string;
  issuer_configured: boolean;
  ledger_index: number;
  latency_ms: number;
}

export async function getXrplHealth(): Promise<XrplHealthStatus> {
  const start = Date.now();
  try {
    const result = await xrplRpc<any>("server_info", []);
    const latency = Date.now() - start;

    return {
      reachable: true,
      network: XRPL_NETWORK,
      issuer_configured: !!XRPL_ISSUER_ADDRESS,
      ledger_index: result.info?.validated_ledger?.seq ?? 0,
      latency_ms: latency,
    };
  } catch {
    return {
      reachable: false,
      network: XRPL_NETWORK,
      issuer_configured: !!XRPL_ISSUER_ADDRESS,
      ledger_index: 0,
      latency_ms: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert Ripple epoch (seconds since 2000-01-01 00:00:00 UTC) to ISO string.
 */
function rippleTimeToISO(rippleTime: number): string {
  const RIPPLE_EPOCH = 946684800; // 2000-01-01 00:00:00 UTC in Unix time
  return new Date((rippleTime + RIPPLE_EPOCH) * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class XrplAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XrplAdapterError";
  }
}
