/**
 * Channels Management — Full Operator Dashboard
 *
 * Manages x402 payment channels:
 *   - View all open channels with balances
 *   - Monitor channel spend sequences
 *   - View channel dispute/settlement status
 *   - Close/extend channels
 */

import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3100";

interface Channel {
  channel_id: string;
  payer: string;
  payee: string;
  deposit: string;
  spent: string;
  remaining: string;
  sequence: number;
  asset: string;
  rail: string;
  status: "open" | "closing" | "closed" | "disputed";
  expires_at: string;
  created_at: string;
  updated_at: string;
}

interface ChannelStats {
  total_open: number;
  total_deposited: string;
  total_spent: string;
  total_remaining: string;
}

export default function Channels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [stats, setStats] = useState<ChannelStats | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "closing" | "closed">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headers: HeadersInit = {
    Authorization: `Bearer ${import.meta.env.VITE_ADMIN_TOKEN ?? ""}`,
    "Content-Type": "application/json",
  };

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/admin/channels?limit=100`, { headers });
        if (res.ok) {
          const data = await res.json();
          const channelList: Channel[] = data.channels ?? data ?? [];
          setChannels(channelList);

          // Compute stats
          let totalDeposited = 0;
          let totalSpent = 0;
          let totalRemaining = 0;
          let openCount = 0;
          for (const ch of channelList) {
            totalDeposited += parseFloat(ch.deposit ?? "0");
            totalSpent += parseFloat(ch.spent ?? "0");
            totalRemaining += parseFloat(ch.remaining ?? "0");
            if (ch.status === "open") openCount++;
          }
          setStats({
            total_open: openCount,
            total_deposited: totalDeposited.toFixed(6),
            total_spent: totalSpent.toFixed(6),
            total_remaining: totalRemaining.toFixed(6),
          });
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = filter === "all" ? channels : channels.filter((ch) => ch.status === filter);

  if (loading) return <div className="p-6 text-center">Loading channels…</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Payment Channels</h1>

      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-700 rounded-lg">{error}</div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-sm text-blue-600">Open Channels</div>
            <div className="text-2xl font-bold">{stats.total_open}</div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="text-sm text-green-600">Total Deposited</div>
            <div className="text-2xl font-bold">{stats.total_deposited}</div>
          </div>
          <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="text-sm text-yellow-600">Total Spent</div>
            <div className="text-2xl font-bold">{stats.total_spent}</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
            <div className="text-sm text-purple-600">Remaining</div>
            <div className="text-2xl font-bold">{stats.total_remaining}</div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["all", "open", "closing", "closed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-sm ${
              filter === f
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Channel list */}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 px-2">Channel</th>
            <th className="py-2 px-2">Payer</th>
            <th className="py-2 px-2">Payee</th>
            <th className="py-2 px-2">Deposit</th>
            <th className="py-2 px-2">Spent</th>
            <th className="py-2 px-2">Remaining</th>
            <th className="py-2 px-2">Seq</th>
            <th className="py-2 px-2">Status</th>
            <th className="py-2 px-2">Expires</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={9} className="py-8 text-center text-gray-500">
                No channels found
              </td>
            </tr>
          )}
          {filtered.map((ch) => (
            <tr key={ch.channel_id} className="border-b hover:bg-gray-50">
              <td className="py-2 px-2 font-mono text-xs">{ch.channel_id.slice(0, 12)}…</td>
              <td className="py-2 px-2 font-mono text-xs">{ch.payer.slice(0, 12)}…</td>
              <td className="py-2 px-2 font-mono text-xs">{ch.payee.slice(0, 12)}…</td>
              <td className="py-2 px-2">{ch.deposit}</td>
              <td className="py-2 px-2">{ch.spent}</td>
              <td className="py-2 px-2 font-medium">{ch.remaining}</td>
              <td className="py-2 px-2">{ch.sequence}</td>
              <td className="py-2 px-2">
                <span
                  className={`px-2 py-0.5 rounded text-xs ${
                    ch.status === "open"
                      ? "bg-green-100 text-green-700"
                      : ch.status === "closing"
                        ? "bg-yellow-100 text-yellow-700"
                        : ch.status === "disputed"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {ch.status}
                </span>
              </td>
              <td className="py-2 px-2 text-xs">
                {new Date(ch.expires_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
