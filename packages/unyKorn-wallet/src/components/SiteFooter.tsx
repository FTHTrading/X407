/**
 * src/components/SiteFooter.tsx
 * Professional footer with links, branding, and contract info.
 */

import { UNY_TOKEN_ADDRESS } from "../wagmi";

export function SiteFooter() {
  const year = new Date().getFullYear();
  const short = `${UNY_TOKEN_ADDRESS.slice(0, 6)}…${UNY_TOKEN_ADDRESS.slice(-4)}`;

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        {/* Top row */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 32, marginBottom: 32 }}>

          {/* Brand */}
          <div style={{ maxWidth: 280 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <img src="/favicon.svg" alt="UnyKorn" style={{ width: 28, height: 28 }} />
              <span style={{ fontSize: 18, fontWeight: 800 }} className="gradient-text">UnyKorn</span>
            </div>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
              The unicorn of Avalanche DeFi. Building decentralized infrastructure
              across Avalanche, Polygon, and beyond.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-muted)", marginBottom: 12 }}>
              Resources
            </h4>
            <FooterLink href={`https://snowtrace.io/token/${UNY_TOKEN_ADDRESS}`} label="Snowtrace" />
            <FooterLink href="https://dexscreener.com/avalanche/0xC6F5273D74571d91CBcBA0A2900ed5F7C800F5d0" label="DexScreener" />
            <FooterLink href="https://traderjoexyz.com/avalanche" label="TraderJoe" />
            <FooterLink href="https://ram.unykorn.org" label="RAMM Protocol" />
          </div>

          {/* Contract info */}
          <div>
            <h4 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-muted)", marginBottom: 12 }}>
              Contract
            </h4>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <span className="muted">UNY Token: </span>
              <a
                href={`https://snowtrace.io/token/${UNY_TOKEN_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}
              >
                {short}
              </a>
            </div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <span className="muted">Chain: </span>
              <span style={{ fontWeight: 600 }}>Avalanche C-Chain (43114)</span>
            </div>
            <div style={{ fontSize: 13 }}>
              <span className="muted">Standard: </span>
              <span style={{ fontWeight: 600 }}>ERC-20</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <hr className="divider" style={{ marginBottom: 24 }} />

        {/* Bottom */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <p className="muted" style={{ fontSize: 12 }}>
            &copy; {year} UnyKorn. Built on Avalanche.
          </p>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <a
              href="https://snowtrace.io/token/0xc09003213b34c7bec8d2eddfad4b43e51d007d66"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--color-muted)", fontSize: 12 }}
            >
              Snowtrace
            </a>
            <a
              href="https://traderjoexyz.com/avalanche"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--color-muted)", fontSize: 12 }}
            >
              TraderJoe
            </a>
            <a
              href="https://ram.unykorn.org"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--color-muted)", fontSize: 12 }}
            >
              RAMM
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        style={{ color: "var(--color-text)", fontSize: 13, fontWeight: 500 }}
      >
        {label}
      </a>
    </div>
  );
}
