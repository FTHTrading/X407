/**
 * src/App.tsx — UnyKorn main application
 * Full landing page + DApp with hero, stats, pools, ecosystem, and wallet.
 */

import { SiteHeader }   from "./components/SiteHeader";
import { Hero }          from "./components/Hero";
import { TokenStats }    from "./components/TokenStats";
import { PoolInfo }      from "./components/PoolInfo";
import { Ecosystem }     from "./components/Ecosystem";
import { TokenBalance }  from "./components/TokenBalance";
import { SwapWidget }    from "./components/SwapWidget";
import { RegistryView }  from "./components/RegistryView";
import { SiteFooter }    from "./components/SiteFooter";

export default function App() {
  return (
    <>
      {/* ── Fixed navigation ──────────────────────────────────────────────── */}
      <SiteHeader />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <Hero />

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <hr className="divider" />

      {/* ── Token stats ───────────────────────────────────────────────────── */}
      <TokenStats />

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <hr className="divider" />

      {/* ── Pool info ─────────────────────────────────────────────────────── */}
      <PoolInfo />

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <hr className="divider" />

      {/* ── Ecosystem ─────────────────────────────────────────────────────── */}
      <Ecosystem />

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <hr className="divider" />

      {/* ── Wallet section ────────────────────────────────────────────────── */}
      <section className="section" id="wallet">
        <div className="section-header">
          <span className="badge-gold badge">DApp</span>
          <h2 style={{ marginTop: 16 }}>Your Wallet</h2>
          <p>Connect your wallet to view balances, swap tokens, and manage positions.</p>
        </div>

        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          {/* Balances */}
          <div style={{ marginBottom: 20 }}>
            <TokenBalance />
          </div>

          {/* Swap */}
          <div style={{ marginBottom: 20 }}>
            <SwapWidget />
          </div>

          {/* Registry */}
          <div>
            <RegistryView />
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <SiteFooter />
    </>
  );
}
