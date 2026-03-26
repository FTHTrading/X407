/**
 * src/components/Roadmap.tsx
 * Visual roadmap showing past milestones and upcoming goals.
 * Builds credibility and draws in long-term holders.
 */

export function Roadmap() {
  return (
    <section className="section" id="roadmap">
      <div className="section-header">
        <span className="badge">Roadmap</span>
        <h2 style={{ marginTop: 16 }}>The Path Forward</h2>
        <p>From token launch to multichain DeFi — here's where we've been and where we're going.</p>
      </div>

      <div className="roadmap-timeline">
        <Phase
          phase="Phase 1"
          title="Foundation"
          status="completed"
          items={[
            "UNY token deployed on Avalanche C-Chain",
            "Verified on Snowtrace",
            "WAVAX/UNY pool live on TraderJoe",
            "USDC/UNY pool live on TraderJoe",
            "DexScreener listing + chart",
          ]}
        />
        <Phase
          phase="Phase 2"
          title="Infrastructure"
          status="completed"
          items={[
            "RAMM Protocol launched on Polygon",
            "VaultRegistry smart contract system",
            "On-chain registry for verified assets",
            "Cross-chain infrastructure (XRPL / Solana)",
            "Professional DApp + landing page",
          ]}
        />
        <Phase
          phase="Phase 3"
          title="Growth"
          status="active"
          items={[
            "Community expansion & social presence",
            "LP rewards & incentive programs",
            "CoinGecko & CoinMarketCap listings",
            "Partnership with Avalanche ecosystem projects",
            "Enhanced analytics dashboard",
          ]}
        />
        <Phase
          phase="Phase 4"
          title="Scale"
          status="upcoming"
          items={[
            "Cross-chain bridge (Avalanche ↔ Polygon ↔ BSC)",
            "Governance token utility",
            "Institutional-grade vault products",
            "Mobile app for portfolio tracking",
            "Layer 1 subnet exploration",
          ]}
        />
      </div>
    </section>
  );
}

function Phase({ phase, title, status, items }: {
  phase: string; title: string; status: "completed" | "active" | "upcoming"; items: string[];
}) {
  const badgeClass = status === "completed" ? "badge-green badge" :
                     status === "active" ? "badge-gold badge" : "badge";
  const statusLabel = status === "completed" ? "✅ Complete" :
                      status === "active" ? "🔥 In Progress" : "🔮 Upcoming";

  return (
    <div className={`card roadmap-phase ${status === "active" ? "animate-pulse-glow" : ""}`} style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <span className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em" }}>{phase}</span>
          <h3 style={{ marginTop: 4 }}>{title}</h3>
        </div>
        <span className={badgeClass}>{statusLabel}</span>
      </div>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {items.map((item, i) => (
          <li key={i} style={{
            padding: "8px 0",
            borderBottom: i < items.length - 1 ? "1px solid var(--color-border)" : "none",
            fontSize: 13,
            color: status === "upcoming" ? "var(--color-muted)" : "var(--color-text)",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}>
            <span style={{ fontSize: 14 }}>
              {status === "completed" ? "✓" : status === "active" ? "→" : "○"}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
