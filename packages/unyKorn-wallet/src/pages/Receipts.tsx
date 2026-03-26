/**
 * RCPT Receipt Root Explorer
 *
 * Provides a searchable explorer for x402 payment receipts:
 *   - Browse receipt batches by Merkle root
 *   - Verify individual receipt inclusion proofs
 *   - View L1 anchoring status (tx_hash, block)
 *   - Download receipt data for audit trails
 */

import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3100";

interface ReceiptBatch {
  batch_id: string;
  merkle_root: string;
  receipt_count: number;
  anchored: boolean;
  anchor_tx_hash?: string;
  anchor_block?: number;
  created_at: string;
}

interface Receipt {
  receipt_id: string;
  invoice_id: string;
  payer: string;
  amount: string;
  asset: string;
  rail: string;
  proof_type: string;
  created_at: string;
  batch_id?: string;
  merkle_proof?: string[];
}

export default function ReceiptExplorer() {
  const [batches, setBatches] = useState<ReceiptBatch[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [searchId, setSearchId] = useState("");
  const [searchResult, setSearchResult] = useState<Receipt | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const headers: HeadersInit = {
    Authorization: `Bearer ${import.meta.env.VITE_ADMIN_TOKEN ?? ""}`,
    "Content-Type": "application/json",
  };

  useEffect(() => {
    async function loadBatches() {
      try {
        const res = await fetch(`${API_BASE}/admin/receipts?limit=50&sort=created_at:desc`, { headers });
        if (res.ok) {
          const data = await res.json();
          // Group receipts by batch/merkle root
          const receiptList = data.receipts ?? data ?? [];
          setReceipts(receiptList);

          // Extract unique batches
          const batchMap = new Map<string, ReceiptBatch>();
          for (const r of receiptList) {
            const batchKey = r.batch_id ?? r.merkle_root ?? "unbatched";
            if (!batchMap.has(batchKey)) {
              batchMap.set(batchKey, {
                batch_id: batchKey,
                merkle_root: r.merkle_root ?? "",
                receipt_count: 0,
                anchored: !!r.anchor_tx_hash,
                anchor_tx_hash: r.anchor_tx_hash,
                anchor_block: r.anchor_block,
                created_at: r.created_at,
              });
            }
            batchMap.get(batchKey)!.receipt_count++;
          }
          setBatches(Array.from(batchMap.values()));
        }
      } finally {
        setLoading(false);
      }
    }
    loadBatches();
  }, []);

  const handleSearch = async () => {
    if (!searchId.trim()) return;
    setVerifyStatus(null);
    try {
      const res = await fetch(`${API_BASE}/admin/receipts/${searchId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSearchResult(data);
      } else {
        setSearchResult(null);
        setVerifyStatus("Receipt not found");
      }
    } catch {
      setVerifyStatus("Search failed");
    }
  };

  const handleVerify = async (receiptId: string, merkleRoot: string) => {
    try {
      const res = await fetch(`${API_BASE}/receipts/${receiptId}/verify`, {
        method: "POST",
        headers,
        body: JSON.stringify({ merkle_root: merkleRoot }),
      });
      if (res.ok) {
        const data = await res.json();
        setVerifyStatus(data.valid ? "Inclusion proof VALID" : `Proof INVALID: ${data.error}`);
      } else {
        setVerifyStatus("Verification request failed");
      }
    } catch {
      setVerifyStatus("Verification error");
    }
  };

  const batchReceipts = selectedBatch
    ? receipts.filter((r) => (r.batch_id ?? r.receipt_id) === selectedBatch)
    : [];

  if (loading) return <div className="p-6 text-center">Loading receipts…</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">RCPT Receipt Root Explorer</h1>

      {/* Search */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Search Receipt</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            placeholder="Enter receipt ID…"
            className="flex-1 px-3 py-2 border rounded-lg font-mono text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Search
          </button>
        </div>
        {verifyStatus && (
          <div
            className={`mt-2 px-3 py-2 rounded text-sm ${
              verifyStatus.includes("VALID") && !verifyStatus.includes("INVALID")
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {verifyStatus}
          </div>
        )}
        {searchResult && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><strong>Receipt ID:</strong> <span className="font-mono">{searchResult.receipt_id}</span></div>
              <div><strong>Invoice:</strong> <span className="font-mono">{searchResult.invoice_id}</span></div>
              <div><strong>Payer:</strong> <span className="font-mono">{searchResult.payer}</span></div>
              <div><strong>Amount:</strong> {searchResult.amount} {searchResult.asset}</div>
              <div><strong>Rail:</strong> {searchResult.rail}</div>
              <div><strong>Proof Type:</strong> {searchResult.proof_type}</div>
              <div><strong>Created:</strong> {new Date(searchResult.created_at).toLocaleString()}</div>
              <div><strong>Batch:</strong> {searchResult.batch_id ?? "—"}</div>
            </div>
            {searchResult.merkle_proof && (
              <div className="mt-2">
                <strong className="text-sm">Merkle Proof:</strong>
                <pre className="text-xs bg-white p-2 rounded mt-1 overflow-x-auto">
                  {JSON.stringify(searchResult.merkle_proof, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Batches */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Receipt Batches</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 px-2">Batch / Root</th>
              <th className="py-2 px-2">Receipts</th>
              <th className="py-2 px-2">Anchored</th>
              <th className="py-2 px-2">L1 Tx</th>
              <th className="py-2 px-2">Created</th>
              <th className="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.batch_id} className="border-b hover:bg-gray-50">
                <td className="py-2 px-2 font-mono text-xs">
                  {b.merkle_root ? b.merkle_root.slice(0, 16) + "…" : b.batch_id.slice(0, 16) + "…"}
                </td>
                <td className="py-2 px-2">{b.receipt_count}</td>
                <td className="py-2 px-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${
                      b.anchored ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {b.anchored ? "Anchored" : "Pending"}
                  </span>
                </td>
                <td className="py-2 px-2 font-mono text-xs">
                  {b.anchor_tx_hash ? b.anchor_tx_hash.slice(0, 12) + "…" : "—"}
                </td>
                <td className="py-2 px-2 text-xs">{new Date(b.created_at).toLocaleString()}</td>
                <td className="py-2 px-2">
                  <button
                    onClick={() => setSelectedBatch(b.batch_id)}
                    className="text-blue-600 hover:underline text-xs"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Selected batch receipts */}
      {selectedBatch && (
        <section>
          <h2 className="text-lg font-semibold mb-2">
            Batch Receipts
            <button
              onClick={() => setSelectedBatch(null)}
              className="ml-2 text-sm text-gray-500 hover:underline"
            >
              (close)
            </button>
          </h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 px-2">Receipt</th>
                <th className="py-2 px-2">Payer</th>
                <th className="py-2 px-2">Amount</th>
                <th className="py-2 px-2">Proof</th>
                <th className="py-2 px-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batchReceipts.map((r) => (
                <tr key={r.receipt_id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-2 font-mono text-xs">{r.receipt_id.slice(0, 16)}…</td>
                  <td className="py-2 px-2 font-mono text-xs">{r.payer.slice(0, 16)}…</td>
                  <td className="py-2 px-2">{r.amount} {r.asset}</td>
                  <td className="py-2 px-2 text-xs">{r.proof_type}</td>
                  <td className="py-2 px-2">
                    <button
                      onClick={() => handleVerify(r.receipt_id, batches.find((b) => b.batch_id === selectedBatch)?.merkle_root ?? "")}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Verify
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
