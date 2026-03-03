/**
 * src/components/TokenStats.tsx
 * Live on-chain token statistics pulled from Avalanche via wagmi.
 */

import { useReadContract } from "wagmi";
import { formatUnits }     from "viem";
import { UNY_TOKEN_ABI }   from "../abis/unyToken";
import { UNY_TOKEN_ADDRESS } from "../wagmi";

const DEAD_ADDRESS   = "0x000000000000000000000000000000000000dEaD" as const;
const DEPLOYER       = "0x95989eB2AD1bF8036d23B53db4d587455a322022" as const;

function fmtCompact(value: bigint, decimals: number): string {
  const n = parseFloat(formatUnits(value, decimals));
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function TokenStats() {
  const { data: totalSupply } = useReadContract({
    address: UNY_TOKEN_ADDRESS,
    abi: UNY_TOKEN_ABI,
    functionName: "totalSupply",
  });

  const { data: burnedRaw } = useReadContract({
    address: UNY_TOKEN_ADDRESS,
    abi: UNY_TOKEN_ABI,
    functionName: "balanceOf",
    args: [DEAD_ADDRESS],
  });

  const { data: deployerBal } = useReadContract({
    address: UNY_TOKEN_ADDRESS,
    abi: UNY_TOKEN_ABI,
    functionName: "balanceOf",
    args: [DEPLOYER],
  });

  const supply  = totalSupply ? fmtCompact(totalSupply as bigint, 18) : "—";
  const burned  = burnedRaw  ? fmtCompact(burnedRaw as bigint, 18)  : "0";
  const holder  = deployerBal ? fmtCompact(deployerBal as bigint, 18) : "—";

  // Calculate circulating (total - burned - deployer)
  let circulating = "—";
  if (totalSupply && deployerBal) {
    const t = totalSupply as bigint;
    const b = (burnedRaw as bigint) ?? 0n;
    const d = deployerBal as bigint;
    circulating = fmtCompact(t - b - d, 18);
  }

  return (
    <section className="section" id="stats">
      <div className="section-header">
        <span className="badge-gold badge">Token Metrics</span>
        <h2 style={{ marginTop: 16 }}>UNY at a Glance</h2>
        <p>Real-time on-chain data from Avalanche C-Chain</p>
      </div>

      <div className="grid-4">
        <StatCard
          label="Total Supply"
          value={supply}
          sub="Fixed cap, no minting"
          icon="📊"
          delay={0}
        />
        <StatCard
          label="Circulating"
          value={circulating}
          sub="Excludes deployer & burned"
          icon="🔄"
          delay={1}
        />
        <StatCard
          label="Burned"
          value={burned}
          sub="Sent to 0xdead"
          icon="🔥"
          delay={2}
        />
        <StatCard
          label="Deployer Held"
          value={holder}
          sub="Treasury / operations"
          icon="🏦"
          delay={3}
        />
      </div>

      {/* Token details strip */}
      <div className="card" style={{ marginTop: 24, padding: "20px 28px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 40px", justifyContent: "center", fontSize: 13 }}>
          <Detail label="Contract" value={UNY_TOKEN_ADDRESS} mono link={`https://snowtrace.io/token/${UNY_TOKEN_ADDRESS}`} />
          <Detail label="Decimals" value="18" />
          <Detail label="Symbol" value="UNY" />
          <Detail label="Chain" value="Avalanche (43114)" />
          <Detail label="Standard" value="ERC-20" />
        </div>
      </div>
    </section>
  );
}

function StatCard({ label, value, sub, icon, delay }: {
  label: string; value: string; sub: string; icon: string; delay: number;
}) {
  const cls = delay === 0 ? "animate-fade-in" :
              delay === 1 ? "animate-fade-in-d1" :
              delay === 2 ? "animate-fade-in-d2" : "animate-fade-in-d3";
  return (
    <div className={`card ${cls}`} style={{ textAlign: "center" }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <p className="label">{label}</p>
      <p className="stat-value">{value}</p>
      <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>{sub}</p>
    </div>
  );
}

function Detail({ label, value, mono, link }: {
  label: string; value: string; mono?: boolean; link?: string;
}) {
  const valStyle: React.CSSProperties = {
    fontWeight: 600,
    ...(mono ? { fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 12 } : {}),
  };
  const shortened = mono && value.length > 16
    ? `${value.slice(0, 8)}…${value.slice(-6)}`
    : value;

  return (
    <div>
      <span className="muted" style={{ marginRight: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      {link ? (
        <a href={link} target="_blank" rel="noreferrer" style={valStyle}>{shortened}</a>
      ) : (
        <span style={valStyle}>{shortened}</span>
      )}
    </div>
  );
}
