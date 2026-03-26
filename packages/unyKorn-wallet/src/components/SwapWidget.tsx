/**
 * src/components/SwapWidget.tsx
 *
 * Swap card for UNY ↔ USDC.
 * Direct on-chain swapping via LFJ SDK requires complex quoting logic;
 * this widget links out to the LFJ UI pre-filled with UNY as output
 * and shows the pool address for reference.
 *
 * Phase 3 will integrate a direct quote + swap using the LFJ LB Router.
 */

import { useAccount, useChainId } from "wagmi";
import { avalanche }              from "wagmi/chains";
import {
  LFJ_ROUTER_URL_USDC,
  LFJ_ROUTER_URL_AVAX,
  UNY_TOKEN_ADDRESS,
  UNY_USDC_POOL_ADDRESS,
} from "../wagmi";
import { CopyButton } from "./CopyButton";

export function SwapWidget() {
  const { isConnected } = useAccount();
  const chainId         = useChainId();
  const isAvalanche     = chainId === avalanche.id;

  const dexScreenerUrl = `https://dexscreener.com/avalanche/${UNY_USDC_POOL_ADDRESS}`;

  return (
    <div className="card">
      <h2 style={{ marginBottom: 4, fontSize: 16, fontWeight: 600 }}>Swap UNY ↔ USDC</h2>
      <p className="muted" style={{ marginBottom: 20 }}>
        Liquidity pool: LFJ (Trader Joe V1) on Avalanche C-Chain
      </p>

      {/* Pool info */}
      <div style={{ background: "var(--color-bg)", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span className="muted">Pool address</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <a href={dexScreenerUrl} target="_blank" rel="noreferrer" style={{ fontFamily: "monospace", fontSize: 12 }}>
              {UNY_USDC_POOL_ADDRESS.slice(0, 10)}…{UNY_USDC_POOL_ADDRESS.slice(-6)}
            </a>
            <CopyButton text={UNY_USDC_POOL_ADDRESS} label="" />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span className="muted">UNY token</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <a
              href={`https://snowtrace.io/token/${UNY_TOKEN_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontFamily: "monospace", fontSize: 12 }}
            >
              {UNY_TOKEN_ADDRESS.slice(0, 10)}…{UNY_TOKEN_ADDRESS.slice(-6)}
            </a>
            <CopyButton text={UNY_TOKEN_ADDRESS} label="" />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span className="muted">DEX</span>
          <span>LFJ (Trader Joe V1)</span>
        </div>
      </div>

      {/* Warning: thin LP */}
      <div style={{ background: "#2a1800", border: "1px solid #6b3800", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "#f5a623" }}>
        ⚠ LP liquidity is currently thin. Expect high price impact on large trades.
        Monitor <a href={dexScreenerUrl} target="_blank" rel="noreferrer">DexScreener</a> before trading.
      </div>

      {/* CTA */}
      {!isConnected ? (
        <p className="muted" style={{ textAlign: "center" }}>Connect wallet first.</p>
      ) : !isAvalanche ? (
        <p className="muted" style={{ textAlign: "center" }}>Switch to Avalanche C-Chain to trade.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <a
            href={LFJ_ROUTER_URL_AVAX}
            target="_blank"
            rel="noreferrer"
            style={{
              display:        "block",
              background:     "var(--color-primary)",
              color:          "#fff",
              textAlign:      "center",
              padding:        "13px 0",
              borderRadius:   8,
              fontWeight:     600,
              fontSize:       15,
              textDecoration: "none",
            }}
          >
            Swap AVAX → UNY on LFJ →
          </a>
          <a
            href={LFJ_ROUTER_URL_USDC}
            target="_blank"
            rel="noreferrer"
            style={{
              display:        "block",
              background:     "var(--color-surface)",
              border:         "1px solid var(--color-border)",
              color:          "var(--color-text)",
              textAlign:      "center",
              padding:        "13px 0",
              borderRadius:   8,
              fontWeight:     600,
              fontSize:       15,
              textDecoration: "none",
            }}
          >
            Swap USDC → UNY on LFJ →
          </a>
        </div>
      )}

      <p className="muted" style={{ textAlign: "center", marginTop: 12, fontSize: 12 }}>
        Direct in-wallet swap coming in Phase 3.
      </p>
    </div>
  );
}
