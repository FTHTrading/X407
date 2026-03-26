/**
 * src/components/PoolInfo.tsx
 * Displays TraderJoe V1 pool reserves, pricing, and TVL info.
 */

import { useReadContracts } from "wagmi";
import { formatUnits }      from "viem";
import {
  UNY_WAVAX_POOL_ADDRESS,
  UNY_USDC_POOL_ADDRESS,
  LFJ_ROUTER_URL_AVAX,
  LFJ_ROUTER_URL_USDC,
} from "../wagmi";
import { CopyButton } from "./CopyButton";

const PAIR_ABI = [
  { name: "getReserves", type: "function", stateMutability: "view", inputs: [], outputs: [
    { name: "_reserve0", type: "uint112" },
    { name: "_reserve1", type: "uint112" },
    { name: "_blockTimestampLast", type: "uint32" },
  ]},
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const WAVAX_UNY_PAIR = UNY_WAVAX_POOL_ADDRESS;
const USDC_UNY_PAIR  = UNY_USDC_POOL_ADDRESS;

export function PoolInfo() {
  // Batch read reserves for both pools
  const { data, isLoading, isError } = useReadContracts({
    contracts: [
      { address: WAVAX_UNY_PAIR, abi: PAIR_ABI, functionName: "getReserves" },
      { address: USDC_UNY_PAIR,  abi: PAIR_ABI, functionName: "getReserves" },
      { address: WAVAX_UNY_PAIR, abi: PAIR_ABI, functionName: "totalSupply" },
      { address: USDC_UNY_PAIR,  abi: PAIR_ABI, functionName: "totalSupply" },
    ],
  });

  // WAVAX/UNY: token0 = WAVAX (18 dec), token1 = UNY (18 dec)
  let wavaxReserve = "—", wavaxUny = "—", wavaxPrice = "—";
  if (data?.[0]?.result) {
    const [r0, r1] = data[0].result as [bigint, bigint, number];
    wavaxReserve = parseFloat(formatUnits(r0, 18)).toFixed(4);
    wavaxUny     = fmtK(parseFloat(formatUnits(r1, 18)));
    const price  = parseFloat(formatUnits(r0, 18)) / parseFloat(formatUnits(r1, 18));
    wavaxPrice   = price.toFixed(8);
  }

  // USDC/UNY: token0 = USDC (6 dec), token1 = UNY (18 dec)
  let usdcReserve = "—", usdcUny = "—", usdcPrice = "—", usdcTvl = "—";
  if (data?.[1]?.result) {
    const [r0, r1] = data[1].result as [bigint, bigint, number];
    const usdcVal = parseFloat(formatUnits(r0, 6));
    usdcReserve = usdcVal.toFixed(2);
    usdcUny     = fmtK(parseFloat(formatUnits(r1, 18)));
    const price = usdcVal / parseFloat(formatUnits(r1, 18));
    usdcPrice   = "$" + price.toFixed(6);
    // TVL estimate: USDC side * 2 (standard AMM TVL calc)
    usdcTvl = "$" + (usdcVal * 2).toFixed(2);
  }

  return (
    <section className="section" id="pools">
      <div className="section-header">
        <span className="badge-green badge">Liquidity</span>
        <h2 style={{ marginTop: 16 }}>Trading Pools</h2>
        <p>TraderJoe V1 classic AMM pools on Avalanche. Live reserves from on-chain data.</p>
      </div>

      <div className="grid-2">
        {/* WAVAX / UNY */}
        <div className="card animate-fade-in">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <h3 style={{ marginBottom: 4 }}>WAVAX / UNY</h3>
              <span className="muted" style={{ fontSize: 12 }}>TraderJoe V1</span>
            </div>
            <span className="badge-green badge" style={{ fontSize: 10 }}>Active</span>
          </div>
          {isError ? (
            <p className="muted" style={{ fontSize: 13, color: "var(--color-accent)", textAlign: "center", padding: "20px 0" }}>
              Unable to load pool data. RPC may be temporarily unavailable.
            </p>
          ) : isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span className="skeleton skeleton--wide" />
              <span className="skeleton skeleton--wide" />
              <span className="skeleton skeleton--wide" />
            </div>
          ) : (
            <>
              <PoolDetail label="WAVAX Reserve" value={wavaxReserve} />
              <PoolDetail label="UNY Reserve"   value={wavaxUny} />
              <PoolDetail label="UNY Price"     value={`${wavaxPrice} WAVAX`} highlight />
            </>
          )}
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <a
              href={LFJ_ROUTER_URL_AVAX}
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
              style={{ flex: 1, textAlign: "center", padding: "10px 0", fontSize: 13 }}
            >
              Trade
            </a>
            <a
              href={`https://dexscreener.com/avalanche/${WAVAX_UNY_PAIR}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
              style={{ flex: 1, textAlign: "center", padding: "10px 0", fontSize: 13 }}
            >
              Chart
            </a>
          </div>
          {/* Pool address with copy */}
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span className="muted" style={{ fontSize: 11, fontFamily: "monospace" }}>
              {WAVAX_UNY_PAIR.slice(0, 8)}…{WAVAX_UNY_PAIR.slice(-6)}
            </span>
            <CopyButton text={WAVAX_UNY_PAIR} label="" />
          </div>
        </div>

        {/* USDC / UNY */}
        <div className="card animate-fade-in-d1">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <h3 style={{ marginBottom: 4 }}>USDC / UNY</h3>
              <span className="muted" style={{ fontSize: 12 }}>TraderJoe V1</span>
            </div>
            <span className="badge-green badge" style={{ fontSize: 10 }}>Active</span>
          </div>
          {isError ? (
            <p className="muted" style={{ fontSize: 13, color: "var(--color-accent)", textAlign: "center", padding: "20px 0" }}>
              Unable to load pool data. RPC may be temporarily unavailable.
            </p>
          ) : isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span className="skeleton skeleton--wide" />
              <span className="skeleton skeleton--wide" />
              <span className="skeleton skeleton--wide" />
            </div>
          ) : (
            <>
              <PoolDetail label="USDC Reserve" value={`$${usdcReserve}`} />
              <PoolDetail label="UNY Reserve"  value={usdcUny} />
              <PoolDetail label="UNY Price"    value={usdcPrice} highlight />
              {usdcTvl !== "—" && (
                <PoolDetail label="Est. TVL" value={usdcTvl} />
              )}
            </>
          )}
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <a
              href={LFJ_ROUTER_URL_USDC}
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
              style={{ flex: 1, textAlign: "center", padding: "10px 0", fontSize: 13 }}
            >
              Trade
            </a>
            <a
              href={`https://dexscreener.com/avalanche/${USDC_UNY_PAIR}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
              style={{ flex: 1, textAlign: "center", padding: "10px 0", fontSize: 13 }}
            >
              Chart
            </a>
          </div>
          {/* Pool address with copy */}
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span className="muted" style={{ fontSize: 11, fontFamily: "monospace" }}>
              {USDC_UNY_PAIR.slice(0, 8)}…{USDC_UNY_PAIR.slice(-6)}
            </span>
            <CopyButton text={USDC_UNY_PAIR} label="" />
          </div>
        </div>
      </div>

      {/* LP Warning */}
      <div className="card" style={{ marginTop: 20, padding: "16px 24px", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "var(--color-accent)" }}>
          ⚠ Liquidity is currently thin. Use small trades and check{" "}
          <a href={`https://dexscreener.com/avalanche/${UNY_WAVAX_POOL_ADDRESS}`} target="_blank" rel="noreferrer">
            DexScreener
          </a>{" "}
          for live depth before swapping.
        </p>
      </div>
    </section>
  );
}

function PoolDetail({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "10px 0",
      borderBottom: "1px solid var(--color-border)",
    }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      <span style={{
        fontWeight: 600,
        fontSize: 14,
        fontFamily: "'JetBrains Mono','Fira Code',monospace",
        ...(highlight ? { color: "var(--color-green)" } : {}),
      }}>
        {value}
      </span>
    </div>
  );
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(2);
}
