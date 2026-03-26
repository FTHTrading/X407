import type { Invoice, PaymentProof } from "../types";

type TxHashProof = Extract<PaymentProof, { proof_type: "tx_hash" }>;

interface VerifyResult {
  verified: boolean;
  error?: string;
  error_code?: string;
}

interface JsonRpcResponse<T> {
  result?: T | null;
  error?: { code?: number; message?: string };
}

interface EthReceipt {
  status?: string;
  blockNumber?: string;
}

interface EthTx {
  from?: string;
  to?: string;
  value?: string;
  input?: string;
}

interface L1TxStatus {
  tx_hash: string;
  status: "pending" | "committed" | "failed";
  block_height?: number;
  error?: string;
  from?: string;
  to?: string;
  amount?: string;
  value?: string;
  memo?: string;
  reference?: string;
  asset?: string;
}

const UNYKORN_RPC_URL = process.env.UNYKORN_RPC_URL ?? process.env.L1_RPC_URL ?? "https://rpc.l1.unykorn.org";
const UNYKORN_CONFIRMATIONS = Number(process.env.UNYKORN_CONFIRMATIONS ?? 1);

export async function verifyUnykornTxHash(
  proof: TxHashProof,
  invoice: Invoice,
): Promise<VerifyResult> {
  if (proof.rail !== "unykorn-l1") {
    return { verified: false, error: "Rail mismatch", error_code: "rail_not_allowed" };
  }

  const [status, ethReceipt, ethTx, latestBlock] = await Promise.all([
    callRpc<L1TxStatus>("tx_getStatus", [proof.tx_hash]).catch(() => null),
    callRpc<EthReceipt>("eth_getTransactionReceipt", [proof.tx_hash]).catch(() => null),
    callRpc<EthTx>("eth_getTransactionByHash", [proof.tx_hash]).catch(() => null),
    callRpc<{ height?: number; number?: string; blockHeight?: number }>("chain_getLatestBlock", [])
      .catch(() => callRpc<string>("eth_blockNumber", []).then((number) => ({ number })).catch(() => null)),
  ]);

  if (!status && !ethReceipt && !ethTx) {
    return { verified: false, error: "Transaction lookup is not yet exposed by the live UnyKorn RPC", error_code: "tx_lookup_unavailable" };
  }

  if (status?.status === "failed" || ethReceipt?.status === "0x0") {
    return { verified: false, error: status?.error ?? "Transaction failed on-chain", error_code: "tx_failed" };
  }

  const latestBlockObject = latestBlock as { height?: number; blockHeight?: number; number?: string | null } | null;
  const currentHeight =
    latestBlockObject?.height ??
    latestBlockObject?.blockHeight ??
    (latestBlockObject?.number ? Number.parseInt(latestBlockObject.number, 16) : undefined);

  const txBlockHeight =
    status?.block_height ??
    (ethReceipt?.blockNumber ? Number.parseInt(ethReceipt.blockNumber, 16) : undefined);

  if (currentHeight !== undefined && txBlockHeight !== undefined) {
    const confirmations = Math.max(currentHeight - txBlockHeight + 1, 0);
    if (confirmations < UNYKORN_CONFIRMATIONS) {
      return {
        verified: false,
        error: `Waiting for confirmations (${confirmations}/${UNYKORN_CONFIRMATIONS})`,
        error_code: "tx_pending",
      };
    }
  }

  const txFrom = (ethTx?.from ?? status?.from ?? "").toLowerCase();
  const txTo = (ethTx?.to ?? status?.to ?? "").toLowerCase();
  const txReference = [status?.reference, status?.memo, ethTx?.input, proof.invoice_id]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(" ");

  if (txFrom && txFrom !== proof.payer.toLowerCase()) {
    return { verified: false, error: "Sender does not match funded agent wallet", error_code: "tx_mismatch" };
  }

  if (txTo && txTo !== invoice.receiver.toLowerCase()) {
    return { verified: false, error: "Receiver does not match invoice receiver", error_code: "tx_mismatch" };
  }

  const amountMatches = matchesInvoiceAmount(invoice.asset, invoice.amount, ethTx?.value ?? status?.value ?? status?.amount);
  if (!amountMatches) {
    return { verified: false, error: "Amount does not satisfy invoice", error_code: "tx_mismatch" };
  }

  if (txReference && !txReference.includes(proof.invoice_id.toLowerCase())) {
    return { verified: false, error: "Invoice reference missing from transaction", error_code: "tx_mismatch" };
  }

  return { verified: true };
}

async function callRpc<T>(method: string, params: unknown[]): Promise<T | null> {
  const res = await fetch(UNYKORN_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  if (!res.ok) {
    throw new Error(`UnyKorn RPC HTTP ${res.status}`);
  }

  const json = (await res.json()) as JsonRpcResponse<T>;
  if (json.error) {
    throw new Error(json.error.message ?? "UnyKorn RPC error");
  }

  return json.result ?? null;
}

function matchesInvoiceAmount(asset: string, invoiceAmount: string, observedValue?: string): boolean {
  if (!observedValue) return false;

  try {
    const invoiceUnits = parseUnits(invoiceAmount, asset === "UNY" ? 18 : 6);
    const observedUnits = observedValue.startsWith("0x") ? BigInt(observedValue) : parseUnits(observedValue, asset === "UNY" ? 18 : 6);
    return observedUnits >= invoiceUnits;
  } catch {
    return false;
  }
}

function parseUnits(value: string, decimals: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  const padded = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals);
  return BigInt(`${whole || "0"}${padded}`);
}