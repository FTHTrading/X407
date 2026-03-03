/**
 * src/components/Hero.tsx
 * Full-screen hero section with animated background, branding, and CTA buttons.
 */

export function Hero() {
  return (
    <section className="hero-bg" id="top">
      <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "0 24px", maxWidth: 800 }}>

        {/* Floating unicorn */}
        <div className="animate-float" style={{ marginBottom: 24 }}>
          <img
            src="/favicon.svg"
            alt="UnyKorn"
            style={{ width: 96, height: 96, filter: "drop-shadow(0 0 30px rgba(168,85,247,0.5))" }}
          />
        </div>

        {/* Badge */}
        <div className="animate-fade-in" style={{ marginBottom: 20 }}>
          <span className="badge">
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--color-green)", boxShadow: "0 0 8px var(--color-green)" }} />
            Live on Avalanche C-Chain
          </span>
        </div>

        {/* Title */}
        <h1 className="animate-fade-in-d1">
          <span className="gradient-text">UnyKorn</span>
        </h1>
        <p className="animate-fade-in-d2" style={{
          fontSize: "clamp(1rem, 2.5vw, 1.35rem)",
          color: "var(--color-muted)",
          maxWidth: 520,
          margin: "16px auto 0",
          lineHeight: 1.5,
        }}>
          The unicorn of Avalanche DeFi. An ERC-20 token powering
          decentralized pools, vaults, and cross-chain infrastructure.
        </p>

        {/* CTA */}
        <div className="animate-fade-in-d3" style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 36, flexWrap: "wrap" }}>
          <a
            href="https://traderjoexyz.com/avalanche/trade?inputCurrency=AVAX&outputCurrency=0xc09003213b34c7bec8d2eddfad4b43e51d007d66"
            target="_blank"
            rel="noreferrer"
            className="btn-primary"
          >
            Buy UNY on TraderJoe
          </a>
          <a href="#wallet" className="btn-secondary">
            Connect Wallet
          </a>
        </div>

        {/* Quick stats bar */}
        <div className="animate-fade-in-d4" style={{
          display: "flex",
          gap: 32,
          justifyContent: "center",
          marginTop: 48,
          flexWrap: "wrap",
        }}>
          <QuickStat label="Network" value="Avalanche" />
          <QuickStat label="Standard" value="ERC-20" />
          <QuickStat label="Supply" value="1B UNY" />
          <QuickStat label="DEX" value="TraderJoe" />
        </div>

        {/* Scroll indicator */}
        <div style={{ marginTop: 48, opacity: 0.4 }} className="animate-float">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </div>
      </div>
    </section>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-muted)", marginBottom: 2 }}>
        {label}
      </p>
      <p style={{ fontSize: 16, fontWeight: 700 }}>{value}</p>
    </div>
  );
}
