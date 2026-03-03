/**
 * src/components/Ecosystem.tsx
 * Links to related UnyKorn ecosystem projects and tools.
 */

export function Ecosystem() {
  return (
    <section className="section" id="ecosystem">
      <div className="section-header">
        <span className="badge">Ecosystem</span>
        <h2 style={{ marginTop: 16 }}>Explore the UnyKorn Universe</h2>
        <p>From DeFi pools to cross-chain vaults, UnyKorn spans the multichain landscape.</p>
      </div>

      <div className="grid-3">
        <EcoCard
          icon="🔀"
          title="TraderJoe"
          description="Swap UNY on Avalanche's leading DEX with AVAX or USDC pools."
          href="https://traderjoexyz.com/avalanche/trade?inputCurrency=AVAX&outputCurrency=0xc09003213b34c7bec8d2eddfad4b43e51d007d66"
          delay={0}
        />
        <EcoCard
          icon="📊"
          title="DexScreener"
          description="Real-time charts, price history, and trading volume analytics."
          href="https://dexscreener.com/avalanche/0xC6F5273D74571d91CBcBA0A2900ed5F7C800F5d0"
          delay={1}
        />
        <EcoCard
          icon="🔍"
          title="Snowtrace"
          description="Verified contract, holder data, and transaction history on Avalanche."
          href="https://snowtrace.io/token/0xc09003213b34c7bec8d2eddfad4b43e51d007d66"
          delay={2}
        />
        <EcoCard
          icon="🐏"
          title="RAMM Protocol"
          description="Multi-token DeFi system on Polygon — stablecoins, bonds, and vault NFTs."
          href="https://ram.unykorn.org"
          delay={3}
        />
        <EcoCard
          icon="🌉"
          title="Cross-Chain"
          description="UnyKorn infrastructure spans Avalanche, Polygon, and THORChain."
          href="#pools"
          delay={4}
        />
        <EcoCard
          icon="🏛️"
          title="Registry"
          description="On-chain VaultRegistry for verified contract and asset tracking."
          href="#wallet"
          delay={3}
        />
      </div>
    </section>
  );
}

function EcoCard({ icon, title, description, href, delay }: {
  icon: string; title: string; description: string; href: string; delay: number;
}) {
  const cls = delay === 0 ? "animate-fade-in" :
              delay === 1 ? "animate-fade-in-d1" :
              delay === 2 ? "animate-fade-in-d2" :
              delay === 3 ? "animate-fade-in-d3" : "animate-fade-in-d4";
  return (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className={`eco-card ${cls}`}>
      <div className="eco-card-icon">{icon}</div>
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{description}</p>
    </a>
  );
}
