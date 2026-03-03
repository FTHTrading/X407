/**
 * src/components/CommunityBanner.tsx
 * Social-proof + viral community CTA section.
 * Includes share buttons, social links, and a joining incentive.
 */

import { useState } from "react";

export function CommunityBanner() {
  return (
    <section className="section" id="community">
      <div className="community-banner">
        {/* Left: messaging */}
        <div style={{ flex: 1, minWidth: 280 }}>
          <span className="badge" style={{ marginBottom: 16 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--color-green)", boxShadow: "0 0 8px var(--color-green)" }} />
            Growing Community
          </span>
          <h2 style={{ marginTop: 16, marginBottom: 12 }}>
            Join the <span className="gradient-text">UnyKorn Herd</span>
          </h2>
          <p className="muted" style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 24, maxWidth: 440 }}>
            Be part of the Avalanche DeFi movement. Share UnyKorn with your network,
            earn rewards, and help build the future of decentralized finance.
          </p>

          {/* Social links */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
            <SocialButton
              icon="🐦"
              label="Twitter"
              href="https://twitter.com/intent/tweet?text=Just%20discovered%20%24UNY%20%E2%80%94%20the%20unicorn%20of%20Avalanche%20DeFi!%20Real%20liquidity%2C%20real%20contracts%2C%20real%20utility.%20Trade%20on%20TraderJoe%20%F0%9F%A6%84&url=https%3A%2F%2Favax.unykorn.org"
            />
            <SocialButton
              icon="💬"
              label="Telegram"
              href="https://t.me/share/url?url=https%3A%2F%2Favax.unykorn.org&text=Check%20out%20UnyKorn%20(UNY)%20on%20Avalanche!%20Real%20DeFi%20with%20live%20pools%20on%20TraderJoe."
            />
            <SocialButton
              icon="📋"
              label="Copy Link"
              onClick={() => {
                navigator.clipboard.writeText("https://avax.unykorn.org");
              }}
            />
          </div>

          {/* Quick share stats */}
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <MiniStat value="1B" label="Total Supply" />
            <MiniStat value="2" label="Active Pools" />
            <MiniStat value="3+" label="Chains" />
            <MiniStat value="24/7" label="Live Trading" />
          </div>
        </div>

        {/* Right: quick-action card */}
        <div style={{ flex: "0 0 340px", minWidth: 280 }}>
          <QuickStartCard />
        </div>
      </div>
    </section>
  );
}

/* ── Social button ─────────────────────────────────────────────────── */

function SocialButton({ icon, label, href, onClick }: {
  icon: string; label: string; href?: string; onClick?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    if (onClick) {
      onClick();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="social-btn"
      >
        <span>{icon}</span>
        <span>{label}</span>
      </a>
    );
  }

  return (
    <button onClick={handleClick} className="social-btn">
      <span>{copied ? "✅" : icon}</span>
      <span>{copied ? "Copied!" : label}</span>
    </button>
  );
}

/* ── Mini stat ─────────────────────────────────────────────────────── */

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <p style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 11, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{label}</p>
    </div>
  );
}

/* ── Quick-start card ──────────────────────────────────────────────── */

function QuickStartCard() {
  return (
    <div className="card animate-pulse-glow" style={{ padding: 28 }}>
      <h3 style={{ marginBottom: 16, textAlign: "center" }}>
        <span className="gold-text">Get Started in 3 Steps</span>
      </h3>

      <Step n={1} title="Get a Wallet" desc="Install MetaMask or Core Wallet and add Avalanche C-Chain." />
      <Step n={2} title="Fund with AVAX" desc="Buy AVAX on any exchange and send to your Avalanche wallet." />
      <Step n={3} title="Swap for UNY" desc="Go to TraderJoe and swap your AVAX for UNY tokens." />

      <a
        href="https://traderjoexyz.com/avalanche/trade?inputCurrency=AVAX&outputCurrency=0xc09003213b34c7bec8d2eddfad4b43e51d007d66"
        target="_blank"
        rel="noreferrer"
        className="btn-primary"
        style={{ width: "100%", textAlign: "center", marginTop: 20, display: "block" }}
      >
        Buy UNY Now →
      </a>

      <p className="muted" style={{ fontSize: 11, textAlign: "center", marginTop: 12 }}>
        Contract: 0xc090…d66 · Avalanche C-Chain
      </p>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "flex-start" }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: "var(--grad-brand)", display: "flex",
        alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 800, flexShrink: 0,
      }}>
        {n}
      </div>
      <div>
        <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{title}</p>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{desc}</p>
      </div>
    </div>
  );
}
