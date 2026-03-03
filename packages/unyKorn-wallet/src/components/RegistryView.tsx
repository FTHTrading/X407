/**
 * src/components/RegistryView.tsx
 *
 * Reads entries from the on-chain VaultRegistry contract and displays them.
 * Shows a "not deployed yet" state when VITE_VAULT_REGISTRY_ADDRESS is empty.
 */

import { useState } from "react";
import { useReadContract, useChainId } from "wagmi";
import { avalanche }                    from "wagmi/chains";
import { VAULT_REGISTRY_ABI, ENTRY_TYPE_LABEL } from "../abis/vaultRegistry";

const REGISTRY_ADDRESS =
  (import.meta.env.VITE_VAULT_REGISTRY_ADDRESS as `0x${string}` | undefined) ?? "";

type Entry = {
  label:        `0x${string}`;
  entryType:    number;
  contractAddr: `0x${string}`;
  chainId:      bigint;
  metadataUri:  string;
  verified:     boolean;
  addedAt:      bigint;
};

function shortAddr(a: string) {
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
}

export function RegistryView() {
  const chainId     = useChainId();
  const isAvalanche = chainId === avalanche.id;
  const [page]      = useState(0);
  const PAGE_SIZE   = 20;

  const { data: count } = useReadContract({
    address:      REGISTRY_ADDRESS as `0x${string}`,
    abi:          VAULT_REGISTRY_ABI,
    functionName: "entryCount",
    query:        { enabled: !!REGISTRY_ADDRESS && isAvalanche },
  });

  const { data: entries, isLoading } = useReadContract({
    address:      REGISTRY_ADDRESS as `0x${string}`,
    abi:          VAULT_REGISTRY_ABI,
    functionName: "getEntries",
    args:         [BigInt(page * PAGE_SIZE), BigInt((page + 1) * PAGE_SIZE)],
    query:        { enabled: !!REGISTRY_ADDRESS && isAvalanche && count !== undefined && count > 0n },
  });

  if (!REGISTRY_ADDRESS) {
    return (
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>On-chain Registry</h2>
        <p className="muted">
          VaultRegistry not deployed yet.{" "}
          <code style={{ fontSize: 12 }}>npm run deploy:registry:avalanche</code>{" "}
          then set <code style={{ fontSize: 12 }}>VITE_VAULT_REGISTRY_ADDRESS</code> in{" "}
          <code style={{ fontSize: 12 }}>.env</code>.
        </p>
      </div>
    );
  }

  if (!isAvalanche) {
    return (
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>On-chain Registry</h2>
        <p className="muted">Switch to Avalanche C-Chain to view the registry.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>On-chain Registry</h2>
        {count !== undefined && (
          <span className="muted" style={{ fontSize: 13 }}>{count.toString()} entries</span>
        )}
      </div>

      {isLoading && <p className="muted">Loading…</p>}

      {entries && (entries as Entry[]).length === 0 && (
        <p className="muted">No entries registered yet.</p>
      )}

      {entries && (entries as Entry[]).map((e, i) => (
        <div key={i} style={{
          padding: "12px 0",
          borderBottom: "1px solid var(--color-border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: 4,
                padding: "1px 6px",
                fontSize: 11,
                color: "var(--color-accent)",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}>
                {ENTRY_TYPE_LABEL[e.entryType] ?? "?"}
              </span>
              <span style={{ fontSize: 13, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {shortAddr(e.contractAddr)}
              </span>
              {e.verified && (
                <span style={{ color: "#4caf50", fontSize: 12 }} title="Verified on-chain">✓</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-muted)" }}>
              Chain {e.chainId.toString()}
              {e.metadataUri && (
                <>
                  {" · "}
                  <a href={e.metadataUri} target="_blank" rel="noreferrer">metadata ↗</a>
                </>
              )}
            </div>
          </div>
        </div>
      ))}

      <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
        Registry: <a href={`https://snowtrace.io/address/${REGISTRY_ADDRESS}`} target="_blank" rel="noreferrer">{shortAddr(REGISTRY_ADDRESS)}</a>
      </p>
    </div>
  );
}
