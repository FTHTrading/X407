/**
 * src/components/SiteHeader.tsx
 * Fixed navigation bar with logo, nav links, hamburger menu, and wallet connect.
 */

import { useState, useEffect } from "react";
import { ConnectWallet } from "./ConnectWallet";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Track scroll position for header visual state
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close menu when a link is clicked
  const closeMenu = () => setMenuOpen(false);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <header className={`site-header${scrolled ? " site-header--scrolled" : ""}`}>
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

        {/* Desktop Connect */}
        <div className="hide-mobile">
          <ConnectWallet />
        </div>

        {/* Mobile hamburger button */}
        <button
          className="hamburger show-mobile"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          <span className={`hamburger-line${menuOpen ? " open" : ""}`} />
          <span className={`hamburger-line${menuOpen ? " open" : ""}`} />
          <span className={`hamburger-line${menuOpen ? " open" : ""}`} />
        </button>
      </div>

      {/* Mobile slide-out menu */}
      <div className={`mobile-menu${menuOpen ? " mobile-menu--open" : ""}`}>
        <nav className="mobile-menu-nav">
          <MobileNavLink href="#stats" onClick={closeMenu}>Token</MobileNavLink>
          <MobileNavLink href="#why" onClick={closeMenu}>Why UNY</MobileNavLink>
          <MobileNavLink href="#pools" onClick={closeMenu}>Pools</MobileNavLink>
          <MobileNavLink href="#ecosystem" onClick={closeMenu}>Ecosystem</MobileNavLink>
          <MobileNavLink href="#roadmap" onClick={closeMenu}>Roadmap</MobileNavLink>
          <MobileNavLink href="#community" onClick={closeMenu}>Community</MobileNavLink>
          <MobileNavLink href="#wallet" onClick={closeMenu}>Wallet</MobileNavLink>
          <MobileNavLink href="#faq" onClick={closeMenu}>FAQ</MobileNavLink>
        </nav>
        <div style={{ padding: "16px 24px" }}>
          <ConnectWallet />
        </div>
      </div>

      {/* Backdrop overlay */}
      {menuOpen && <div className="mobile-menu-backdrop" onClick={closeMenu} />}
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

function MobileNavLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <a
      href={href}
      onClick={onClick}
      className="mobile-nav-link"
    >
      {children}
    </a>
  );
}
