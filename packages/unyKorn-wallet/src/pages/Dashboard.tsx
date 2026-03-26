/**
 * Operator Dashboard v1 — Balances, Invoices, Receipts
 *
 * Provides operators a unified view of:
 *   - Credit account balances (per wallet, per rail)
 *   - Active and recent invoices
 *   - Receipt history with Merkle root anchoring status
 *   - System health (L1, Stellar, XRPL)
 */

import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3100";

interface BalanceSummary {
  total_accounts: number;
  total_balance: string;
  rails: { rail: string; count: number; balance: string }[];
}

interface Invoice {
  invoice_id: string;
  amount: string;
  asset: string;
  status: string;
  created_at: string;
  expires_at: string;
}

interface Receipt {
  receipt_id: string;
  invoice_id: string;
  payer: string;
  amount: string;
  asset: string;
  proof_type: string;
  created_at: string;
  anchored: boolean;
}

interface HealthStatus {
  service: string;
  status: "ok" | "degraded" | "down";
  latency_ms?: number;
}

export default function Dashboard() {
  const [balances, setBalances] = useState<BalanceSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [health, setHealth] = useState<HealthStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headers: HeadersInit = {
    Authorization: `Bearer ${import.meta.env.VITE_ADMIN_TOKEN ?? ""}`,
    "Content-Type": "application/json",
  };

  useEffect(() => {
    async function load() {
      try {
        const [balRes, invRes, rcptRes, healthRes] = await Promise.allSettled([
          fetch(`${API_BASE}/admin/accounts?limit=100`, { headers }),
          fetch(`${API_BASE}/admin/invoices?limit=20&sort=created_at:desc`, { headers }),
          fetch(`${API_BASE}/admin/receipts?limit=20&sort=created_at:desc`, { headers }),
          fetch(`${API_BASE}/health`, { headers: { Accept: "application/json" } }),
        ]);

        // Process balances
        if (balRes.status === "fulfilled" && balRes.value.ok) {
          const data = await balRes.value.json();
          const accounts = data.accounts ?? data ?? [];
          const rails = new Map<string, { count: number; balance: number }>();
          let total = 0;
          for (const a of accounts) {
            const bal = parseFloat(a.balance ?? "0");
            total += bal;
            const r = rails.get(a.rail ?? "unykorn-l1") ?? { count: 0, balance: 0 };
            r.count++;
            r.balance += bal;
            rails.set(a.rail ?? "unykorn-l1", r);
          }
          setBalances({
            total_accounts: accounts.length,
            total_balance: total.toFixed(6),
            rails: Array.from(rails.entries()).map(([rail, v]) => ({
              rail,
              count: v.count,
              balance: v.balance.toFixed(6),
            })),
          });
        }

        // Process invoices
        if (invRes.status === "fulfilled" && invRes.value.ok) {
          const data = await invRes.value.json();
          setInvoices(data.invoices ?? data ?? []);
        }

        // Process receipts
        if (rcptRes.status === "fulfilled" && rcptRes.value.ok) {
          const data = await rcptRes.value.json();
          setReceipts(data.receipts ?? data ?? []);
        }

        // Process health
        if (healthRes.status === "fulfilled" && healthRes.value.ok) {
          const data = await healthRes.value.json();
          setHealth(
            (data.services ?? []).map((s: any) => ({
              service: s.name ?? s.service,
              status: s.status ?? "ok",
              latency_ms: s.latency_ms,
            })),
          );
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="p-6 text-center">Loading dashboard…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Operator Dashboard</h1>

      {/* Health Status */}
      <section>
        <h2 className="text-lg font-semibold mb-2">System Health</h2>
        <div className="flex gap-4">
          {health.map((h) => (
            <div
              key={h.service}
              className={`px-4 py-2 rounded-lg border ${
                h.status === "ok"
                  ? "bg-green-50 border-green-200"
                  : h.status === "degraded"
                    ? "bg-yellow-50 border-yellow-200"
                    : "bg-red-50 border-red-200"
              }`}
            >
              <div className="font-medium">{h.service}</div>
              <div className="text-sm">
                {h.status} {h.latency_ms != null && `(${h.latency_ms}ms)`}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Balances */}
      {balances && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Credit Accounts</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-sm text-blue-600">Total Accounts</div>
              <div className="text-2xl font-bold">{balances.total_accounts}</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-sm text-blue-600">Total Balance</div>
              <div className="text-2xl font-bold">{balances.total_balance} USDF</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-sm text-blue-600">Rails</div>
              <div className="text-sm mt-1">
                {balances.rails.map((r) => (
                  <div key={r.rail}>
                    {r.rail}: {r.count} accts / {r.balance}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Invoices */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Recent Invoices</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 px-2">ID</th>
              <th className="py-2 px-2">Amount</th>
              <th className="py-2 px-2">Asset</th>
              <th className="py-2 px-2">Status</th>
              <th className="py-2 px-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.invoice_id} className="border-b hover:bg-gray-50">
                <td className="py-2 px-2 font-mono text-xs">{inv.invoice_id.slice(0, 12)}…</td>
                <td className="py-2 px-2">{inv.amount}</td>
                <td className="py-2 px-2">{inv.asset}</td>
                <td className="py-2 px-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${
                      inv.status === "paid"
                        ? "bg-green-100 text-green-700"
                        : inv.status === "pending"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {inv.status}
                  </span>
                </td>
                <td className="py-2 px-2 text-xs">{new Date(inv.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Receipts */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Recent Receipts</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 px-2">Receipt</th>
              <th className="py-2 px-2">Invoice</th>
              <th className="py-2 px-2">Payer</th>
              <th className="py-2 px-2">Amount</th>
              <th className="py-2 px-2">Proof</th>
              <th className="py-2 px-2">Anchored</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((r) => (
              <tr key={r.receipt_id} className="border-b hover:bg-gray-50">
                <td className="py-2 px-2 font-mono text-xs">{r.receipt_id.slice(0, 12)}…</td>
                <td className="py-2 px-2 font-mono text-xs">{r.invoice_id.slice(0, 12)}…</td>
                <td className="py-2 px-2 font-mono text-xs">{r.payer.slice(0, 16)}…</td>
                <td className="py-2 px-2">{r.amount} {r.asset}</td>
                <td className="py-2 px-2 text-xs">{r.proof_type}</td>
                <td className="py-2 px-2">
                  {r.anchored ? "✓" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
