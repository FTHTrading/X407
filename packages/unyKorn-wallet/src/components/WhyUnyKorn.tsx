/**
 * src/components/WhyUnyKorn.tsx
 * Value proposition section — explains why people should hold/use UNY.
 * Designed to convert visitors into holders.
 */

export function WhyUnyKorn() {
  return (
    <section className="section" id="why">
      <div className="section-header">
        <span className="badge-gold badge">Why UnyKorn?</span>
        <h2 style={{ marginTop: 16 }}>Built Different</h2>
        <p>Real contracts. Real utility. Real infrastructure. No hype — just substance.</p>
      </div>

      <div className="grid-3">
        <FeatureCard
          icon="⚡"
          title="Avalanche Speed"
          description="Sub-second finality on Avalanche C-Chain. Swap UNY in under 2 seconds with minimal gas fees."
          highlight="< 2s finality"
          delay={0}
        />
        <FeatureCard
          icon="🔐"
          title="Verified & Transparent"
          description="Fully verified contract on Snowtrace. Open-source registry. Every transaction on-chain and auditable."
          highlight="100% on-chain"
          delay={1}
        />
        <FeatureCard
          icon="💧"
          title="Dual Liquidity Pools"
          description="Two active pools on TraderJoe V1 — AVAX/UNY and USDC/UNY — giving traders multiple on-ramps to UNY."
          highlight="2 active pools"
          delay={2}
        />
        <FeatureCard
          icon="🌐"
          title="Cross-Chain Ready"
          description="Multi-chain architecture spanning Avalanche, Polygon, Solana, and XRPL. More bridges coming."
          highlight="4 chains"
          delay={3}
        />
        <FeatureCard
          icon="🏗️"
          title="Real Infrastructure"
          description="RAMM Protocol, VaultRegistry, LP management — not a meme coin. Real DeFi building blocks."
          highlight="Live protocols"
          delay={4}
        />
        <FeatureCard
          icon="🦄"
          title="Community First"
          description="Based in Norcross, GA. Real team. Real roadmap. Growing community of DeFi builders and holders."
          highlight="US-based"
          delay={3}
        />
      </div>
    </section>
  );
}

function FeatureCard({ icon, title, description, highlight, delay }: {
  icon: string; title: string; description: string; highlight: string; delay: number;
}) {
  const cls = delay === 0 ? "animate-fade-in" :
              delay === 1 ? "animate-fade-in-d1" :
              delay === 2 ? "animate-fade-in-d2" :
              delay === 3 ? "animate-fade-in-d3" : "animate-fade-in-d4";
  return (
    <div className={`card ${cls}`}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>{icon}</div>
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>{description}</p>
      <span className="badge-green badge">{highlight}</span>
    </div>
  );
}
