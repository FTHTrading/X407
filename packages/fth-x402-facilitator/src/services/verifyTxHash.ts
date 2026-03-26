import type { Invoice, PaymentProof } from "../types";

type TxHashProof = Extract<PaymentProof, { proof_type: "tx_hash" }>;

const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

interface VerifyResult {
  verified: boolean;
  error?: string;
  error_code?: string;
}

interface JsonRpcReceiptLog {
  address: string;
  topics: string[];
  data: string;
}

interface JsonRpcReceipt {
  status?: string;
  blockNumber?: string;
  logs: JsonRpcReceiptLog[];
}

export async function verifyTxHashPayment(
  proof: TxHashProof,
  invoice: Invoice,
): Promise<VerifyResult> {
  if (proof.rail !== invoice.rail) {
    return { verified: false, error: "Rail mismatch", error_code: "rail_not_allowed" };
  }

  switch (proof.rail) {
    case "base":
      return verifyBaseUsdcTransfer(proof, invoice);
    default:
      return {
        verified: false,
        error: `${proof.rail} tx_hash verification not supported`,
        error_code: "rail_not_allowed",
      };
  }
}

async function verifyBaseUsdcTransfer(
  proof: TxHashProof,
  invoice: Invoice,
): Promise<VerifyResult> {
  if (invoice.asset !== "USDC") {
    return { verified: false, error: "Only USDC tx_hash settlement is supported on Base", error_code: "asset_not_allowed" };
  }

  const rpcUrl = process.env.BASE_RPC_URL;
  const tokenAddress = process.env.BASE_USDC_ADDRESS?.toLowerCase();
  const expectedReceiver = invoice.receiver.toLowerCase();

  if (!rpcUrl || !tokenAddress) {
    return { verified: false, error: "Base RPC or token configuration missing", error_code: "server_misconfigured" };
  }

  if (!isAddress(proof.payer) || !isAddress(expectedReceiver)) {
    return { verified: false, error: "Payer or receiver is not a valid EVM address", error_code: "invalid_proof" };
  }

  const receipt = await getTransactionReceipt(rpcUrl, proof.tx_hash);
  if (!receipt) {
    return { verified: false, error: "Transaction receipt not found", error_code: "tx_not_found" };
  }

  if (receipt.status !== "0x1") {
    return { verified: false, error: "Transaction failed on-chain", error_code: "tx_failed" };
  }

  const expectedAmount = parseUnits(invoice.amount, 6);
  const payerTopic = toTopicAddress(proof.payer);
  const receiverTopic = toTopicAddress(expectedReceiver);

  const matchingTransfer = receipt.logs.find((log) => {
    if (log.address.toLowerCase() !== tokenAddress) return false;
    if (log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) return false;
    if (log.topics[1]?.toLowerCase() !== payerTopic) return false;
    if (log.topics[2]?.toLowerCase() !== receiverTopic) return false;
    try {
      return BigInt(log.data) >= expectedAmount;
    } catch {
      return false;
    }
  });

  if (!matchingTransfer) {
    return {
      verified: false,
      error: "No matching Base USDC transfer found for invoice",
      error_code: "tx_mismatch",
    };
  }

  if (!isRecentProofTimestamp(proof.timestamp)) {
    return {
      verified: false,
      error: "Payment proof timestamp is outside allowed window",
      error_code: "invalid_proof",
    };
  }

  return { verified: true };
}

async function getTransactionReceipt(rpcUrl: string, txHash: string): Promise<JsonRpcReceipt | null> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionReceipt",
      params: [txHash],
    }),
  });

  if (!res.ok) {
    throw new Error(`Base RPC error: ${res.status}`);
  }

  const json = (await res.json()) as {
    result?: JsonRpcReceipt | null;
    error?: { message?: string };
  };

  if (json.error) {
    throw new Error(json.error.message ?? "Unknown Base RPC error");
  }

  return json.result ?? null;
}

function parseUnits(value: string, decimals: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  const normalizedFraction = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals);
  return BigInt(`${whole || "0"}${normalizedFraction}`);
}

function toTopicAddress(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isRecentProofTimestamp(timestamp: string): boolean {
  const ts = Date.parse(timestamp);
  if (Number.isNaN(ts)) return false;
  return Math.abs(Date.now() - ts) <= 15 * 60 * 1000;
}