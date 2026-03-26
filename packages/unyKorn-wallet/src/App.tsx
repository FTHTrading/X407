/**
 * src/App.tsx — UnyKorn main application
 * Full landing page + DApp with hero, stats, pools, ecosystem, community, and wallet.
 */

import { SiteHeader }       from "./components/SiteHeader";
import { Hero }              from "./components/Hero";
import { TokenStats }        from "./components/TokenStats";
import { WhyUnyKorn }        from "./components/WhyUnyKorn";
import { PoolInfo }          from "./components/PoolInfo";
import { Ecosystem }         from "./components/Ecosystem";
import { Roadmap }           from "./components/Roadmap";
import { CommunityBanner }   from "./components/CommunityBanner";
import { FAQ }               from "./components/FAQ";
import { TokenBalance }      from "./components/TokenBalance";
import { SwapWidget }        from "./components/SwapWidget";
import { RegistryView }      from "./components/RegistryView";
import { SiteFooter }        from "./components/SiteFooter";
import { ScrollToTop }       from "./components/ScrollToTop";
import { useReveal }         from "./hooks/useReveal";

/** Wrapper that applies scroll-triggered reveal animation */
function Reveal({ children }: { children: React.ReactNode }) {
  const ref = useReveal<HTMLDivElement>();
  return <div ref={ref} className="reveal">{children}</div>;
}

export default function App() {
  return (
    <>
      {/* ── Skip to content (accessibility) ────────────────────────────────── */}
      <a href="#stats" className="skip-to-content">Skip to content</a>

      {/* ── Fixed navigation ──────────────────────────────────────────────── */}
      <SiteHeader />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <Hero />

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main>

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <hr className="divider" />

      {/* ── Token stats ───────────────────────────────────────────────────── */}
      <Reveal>
        <TokenStats />
      </Reveal>

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <hr className="divider" />

      {/* ── Why UnyKorn ───────────────────────────────────────────────────── */}
      <Reveal>
        <WhyUnyKorn />
      </Reveal>

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <hr className="divider" />

      {/* ── Pool info ─────────────────────────────────────────────────────── */}
      <Reveal>
        <PoolInfo />
      </Reveal>

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <hr className="divider" />

      {/* ── Ecosystem ─────────────────────────────────────────────────────── */}
      <Reveal>
        <Ecosystem />
      </Reveal>

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <hr className="divider" />

      {/* ── Roadmap ───────────────────────────────────────────────────────── */}
      <Reveal>
        <Roadmap />
      </Reveal>

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <hr className="divider" />

      {/* ── Community ─────────────────────────────────────────────────────── */}
      <Reveal>
        <CommunityBanner />
      </Reveal>

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <hr className="divider" />

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <Reveal>
        <FAQ />
      </Reveal>

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <hr className="divider" />

      {/* ── Wallet section ────────────────────────────────────────────────── */}
      <Reveal>
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
      </Reveal>

      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <SiteFooter />

      {/* ── Scroll to top ─────────────────────────────────────────────────── */}
      <ScrollToTop />
    </>
  );
}
