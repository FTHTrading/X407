/**
 * src/components/PoolInfo.tsx
 * Displays TraderJoe V1 pool reserves and pricing info.
 */

import { useReadContracts } from "wagmi";
import { formatUnits }      from "viem";

const PAIR_ABI = [
  { name: "getReserves", type: "function", stateMutability: "view", inputs: [], outputs: [
    { name: "_reserve0", type: "uint112" },
    { name: "_reserve1", type: "uint112" },
    { name: "_blockTimestampLast", type: "uint32" },
  ]},
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const WAVAX_UNY_PAIR = "0xC6F5273D74571d91CBcBA0A2900ed5F7C800F5d0" as const;
const USDC_UNY_PAIR  = "0x9ff923a83B3d12DB280Ff65D69AE37819a743f83" as const;

export function PoolInfo() {
  // Batch read reserves for both pools
  const { data } = useReadContracts({
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
    wavaxReserve = parseFloat(formatUnits(r0, 18)).toFixed(3);
    wavaxUny     = fmtK(parseFloat(formatUnits(r1, 18)));
    const price  = parseFloat(formatUnits(r0, 18)) / parseFloat(formatUnits(r1, 18));
    wavaxPrice   = price.toFixed(8);
  }

  // USDC/UNY: token0 = USDC (6 dec), token1 = UNY (18 dec)
  let usdcReserve = "—", usdcUny = "—", usdcPrice = "—";
  if (data?.[1]?.result) {
    const [r0, r1] = data[1].result as [bigint, bigint, number];
    usdcReserve = parseFloat(formatUnits(r0, 6)).toFixed(2);
    usdcUny     = fmtK(parseFloat(formatUnits(r1, 18)));
    const price = parseFloat(formatUnits(r0, 6)) / parseFloat(formatUnits(r1, 18));
    usdcPrice   = "$" + price.toFixed(6);
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
          <PoolDetail label="WAVAX Reserve" value={wavaxReserve} />
          <PoolDetail label="UNY Reserve"   value={wavaxUny} />
          <PoolDetail label="UNY Price"     value={`${wavaxPrice} WAVAX`} highlight />
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <a
              href="https://traderjoexyz.com/avalanche/trade?inputCurrency=AVAX&outputCurrency=0xc09003213b34c7bec8d2eddfad4b43e51d007d66"
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
          <PoolDetail label="USDC Reserve" value={`$${usdcReserve}`} />
          <PoolDetail label="UNY Reserve"  value={usdcUny} />
          <PoolDetail label="UNY Price"    value={usdcPrice} highlight />
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <a
              href="https://traderjoexyz.com/avalanche/trade?inputCurrency=0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e&outputCurrency=0xc09003213b34c7bec8d2eddfad4b43e51d007d66"
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
        </div>
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
