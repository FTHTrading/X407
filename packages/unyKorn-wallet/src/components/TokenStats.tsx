/**
 * src/components/TokenStats.tsx
 * Live on-chain token statistics pulled from Avalanche via wagmi.
 */

import { useReadContract } from "wagmi";
import { formatUnits }     from "viem";
import { UNY_TOKEN_ABI }   from "../abis/unyToken";
import { UNY_TOKEN_ADDRESS, OPERATOR_ADDRESS } from "../wagmi";
import { CopyButton }      from "./CopyButton";

const DEAD_ADDRESS   = "0x000000000000000000000000000000000000dEaD" as const;
const DEPLOYER       = OPERATOR_ADDRESS;

function fmtCompact(value: bigint, decimals: number): string {
  const n = parseFloat(formatUnits(value, decimals));
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function TokenStats() {
  const { data: totalSupply, isError: supplyError } = useReadContract({
    address: UNY_TOKEN_ADDRESS,
    abi: UNY_TOKEN_ABI,
    functionName: "totalSupply",
  });

  const { data: burnedRaw, isError: burnedError } = useReadContract({
    address: UNY_TOKEN_ADDRESS,
    abi: UNY_TOKEN_ABI,
    functionName: "balanceOf",
    args: [DEAD_ADDRESS],
  });

  const { data: deployerBal, isError: deployerError } = useReadContract({
    address: UNY_TOKEN_ADDRESS,
    abi: UNY_TOKEN_ABI,
    functionName: "balanceOf",
    args: [DEPLOYER],
  });

  const rpcFailed = supplyError || burnedError || deployerError;

  const supply  = totalSupply ? fmtCompact(totalSupply as bigint, 18) : null;
  const burned  = burnedRaw  ? fmtCompact(burnedRaw as bigint, 18)  : "0";
  const holder  = deployerBal ? fmtCompact(deployerBal as bigint, 18) : null;

  // Calculate circulating (total - burned - deployer)
  let circulating: string | null = null;
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
          error={rpcFailed}
        />
        <StatCard
          label="Circulating"
          value={circulating}
          sub="Excludes deployer & burned"
          icon="🔄"
          delay={1}
          error={rpcFailed}
        />
        <StatCard
          label="Burned"
          value={burned}
          sub="Sent to 0xdead"
          icon="🔥"
          delay={2}
          error={rpcFailed}
        />
        <StatCard
          label="Deployer Held"
          value={holder}
          sub="Treasury / operations"
          icon="🏦"
          delay={3}
          error={rpcFailed}
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

function StatCard({ label, value, sub, icon, delay, error }: {
  label: string; value: string | null; sub: string; icon: string; delay: number; error?: boolean;
}) {
  const cls = delay === 0 ? "animate-fade-in" :
              delay === 1 ? "animate-fade-in-d1" :
              delay === 2 ? "animate-fade-in-d2" : "animate-fade-in-d3";
  return (
    <div className={`card ${cls}`} style={{ textAlign: "center" }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <p className="label">{label}</p>
      {error ? (
        <p className="muted" style={{ fontSize: 12, color: "var(--color-accent)" }}>RPC unavailable</p>
      ) : value !== null ? (
        <p className="stat-value stat-value-glow">{value}</p>
      ) : (
        <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
          <span className="skeleton skeleton--stat" />
        </div>
      )}
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
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span className="muted" style={{ marginRight: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      {link ? (
        <a href={link} target="_blank" rel="noreferrer" style={valStyle}>{shortened}</a>
      ) : (
        <span style={valStyle}>{shortened}</span>
      )}
      {mono && <CopyButton text={value} label="" />}
    </div>
  );
}
