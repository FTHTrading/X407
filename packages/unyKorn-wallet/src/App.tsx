/**
 * src/App.tsx — Main application shell
 */

import { ConnectWallet  } from "./components/ConnectWallet";
import { TokenBalance   } from "./components/TokenBalance";
import { SwapWidget     } from "./components/SwapWidget";
import { RegistryView   } from "./components/RegistryView";

export default function App() {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
            🦄 UnyKorn
          </h1>
          <p style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 2 }}>
            Avalanche · Polygon
          </p>
        </div>
        <ConnectWallet />
      </header>

      {/* ── Balances ───────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 20 }}>
        <TokenBalance />
      </section>

      {/* ── Swap ───────────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 20 }}>
        <SwapWidget />
      </section>

      {/* ── Registry ──────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 20 }}>
        <RegistryView />
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer style={{ textAlign: "center", fontSize: 12, color: "var(--color-muted)", marginTop: 40 }}>
        <p>
          <a href="https://dexscreener.com/avalanche/0x9ff923a83b3d12db280ff65d69ae37819a743f83" target="_blank" rel="noreferrer">
            DexScreener
          </a>
          {" · "}
          <a href="https://snowtrace.io/token/0xc09003213b34c7bec8d2eddfad4b43e51d007d66" target="_blank" rel="noreferrer">
            Snowtrace
          </a>
          {" · "}
          <a href="https://traderjoexyz.com/avalanche" target="_blank" rel="noreferrer">
            LFJ
          </a>
        </p>
        <p style={{ marginTop: 8 }}>UNY · ERC-20 · Avalanche C-Chain</p>
      </footer>
    </div>
  );
}
