/**
 * src/components/SiteHeader.tsx
 * Fixed navigation bar with logo, nav links, and wallet connect.
 */

import { ConnectWallet } from "./ConnectWallet";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        {/* Logo */}
        <a href="#top" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <img src="/favicon.svg" alt="UnyKorn" style={{ width: 32, height: 32 }} />
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }} className="gradient-text">
            UnyKorn
          </span>
        </a>

        {/* Nav links - desktop */}
        <nav className="hide-mobile" style={{ display: "flex", gap: 28, alignItems: "center" }}>
          <NavLink href="#stats">Token</NavLink>
          <NavLink href="#why">Why UNY</NavLink>
          <NavLink href="#pools">Pools</NavLink>
          <NavLink href="#ecosystem">Ecosystem</NavLink>
          <NavLink href="#roadmap">Roadmap</NavLink>
          <NavLink href="#community">Community</NavLink>
          <NavLink href="#wallet">Wallet</NavLink>
        </nav>

        {/* Connect */}
        <ConnectWallet />
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{
        color: "var(--color-muted)",
        fontSize: 14,
        fontWeight: 500,
        transition: "color 0.2s",
        textDecoration: "none",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text)")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-muted)")}
    >
      {children}
    </a>
  );
}
