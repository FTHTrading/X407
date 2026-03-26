/**
 * Namespaces Management — Full Operator Dashboard
 *
 * Manages payment namespaces for the x402 protocol:
 *   - View all registered namespaces
 *   - Create new namespaces
 *   - Configure namespace policies (rate limits, max amounts)
 *   - View namespace usage statistics
 */

import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3100";

interface Namespace {
  id: string;
  name: string;
  description?: string;
  owner: string;
  policy: NamespacePolicy;
  stats: NamespaceStats;
  created_at: string;
  updated_at: string;
}

interface NamespacePolicy {
  rate_limit?: string;
  max_amount?: string;
  allowed_assets?: string[];
  allowed_rails?: string[];
  pass_tier_required?: string;
}

interface NamespaceStats {
  total_invoices: number;
  total_paid: number;
  total_volume: string;
}

export default function Namespaces() {
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headers: HeadersInit = {
    Authorization: `Bearer ${import.meta.env.VITE_ADMIN_TOKEN ?? ""}`,
    "Content-Type": "application/json",
  };

  const loadNamespaces = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/namespaces`, { headers });
      if (res.ok) {
        const data = await res.json();
        setNamespaces(data.namespaces ?? data ?? []);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNamespaces();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/admin/namespaces`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: newName,
          description: newDescription || undefined,
          policy: {},
        }),
      });
      if (res.ok) {
        setNewName("");
        setNewDescription("");
        setShowCreate(false);
        await loadNamespaces();
      } else {
        setError("Failed to create namespace");
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (loading) return <div className="p-6 text-center">Loading namespaces…</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Namespaces</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          {showCreate ? "Cancel" : "+ Create Namespace"}
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-700 rounded-lg">{error}</div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="p-4 bg-gray-50 rounded-lg border space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="e.g. api-v2, premium-content"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="Optional description"
            />
          </div>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
          >
            Create
          </button>
        </div>
      )}

      {/* Namespace list */}
      <div className="space-y-4">
        {namespaces.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            No namespaces configured. Create one to get started.
          </div>
        )}
        {namespaces.map((ns) => (
          <div key={ns.id} className="p-4 border rounded-lg hover:shadow-sm transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-lg">{ns.name}</h3>
                {ns.description && <p className="text-sm text-gray-600">{ns.description}</p>}
                <div className="text-xs text-gray-400 mt-1 font-mono">{ns.id}</div>
              </div>
              <div className="text-right text-sm">
                <div>{ns.stats?.total_invoices ?? 0} invoices</div>
                <div>{ns.stats?.total_paid ?? 0} paid</div>
                <div className="font-medium">{ns.stats?.total_volume ?? "0"} USDF</div>
              </div>
            </div>

            {/* Policy */}
            {ns.policy && (
              <div className="mt-3 flex flex-wrap gap-2">
                {ns.policy.rate_limit && (
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                    Rate: {ns.policy.rate_limit}
                  </span>
                )}
                {ns.policy.max_amount && (
                  <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">
                    Max: {ns.policy.max_amount}
                  </span>
                )}
                {ns.policy.allowed_assets && (
                  <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs">
                    Assets: {ns.policy.allowed_assets.join(", ")}
                  </span>
                )}
                {ns.policy.pass_tier_required && (
                  <span className="px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded text-xs">
                    PASS: {ns.policy.pass_tier_required}+
                  </span>
                )}
              </div>
            )}

            <div className="mt-2 text-xs text-gray-400">
              Created {new Date(ns.created_at).toLocaleDateString()} · Updated{" "}
              {new Date(ns.updated_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
