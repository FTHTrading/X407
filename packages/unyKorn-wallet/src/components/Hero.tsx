/**
 * src/components/Hero.tsx
 * Full-screen hero section with animated background, particles, branding, and CTA buttons.
 */

import { useMemo } from "react";
import { UNYKORN_CHAIN } from "../wagmi";

// Generate random particles for the background
function useParticles(count: number) {
  return useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 15,
      duration: 8 + Math.random() * 12,
      size: 1 + Math.random() * 3,
      opacity: 0.2 + Math.random() * 0.5,
    }));
  }, [count]);
}

export function Hero() {
  const particles = useParticles(30);

  return (
    <section className="hero-bg" id="top">
      {/* Particle field */}
      <div className="hero-particles">
        {particles.map((p) => (
          <span
            key={p.id}
            className="particle"
            style={{
              left: `${p.left}%`,
              bottom: `-5%`,
              width: p.size,
              height: p.size,
              opacity: p.opacity,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        ))}
      </div>

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
            Live on UnyKorn L1
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
          Sovereign payment infrastructure on AWS-backed UnyKorn L1.
          Fund agents, issue invoices, verify settlement, and unlock paid APIs.
        </p>

        {/* CTA */}
        <div className="animate-fade-in-d3" style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 36, flexWrap: "wrap" }}>
          <a
            href={UNYKORN_CHAIN.blockExplorers.default.url}
            target="_blank"
            rel="noreferrer"
            className="btn-primary"
          >
            Open UnyKorn Explorer
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
          <QuickStat label="Network" value="UnyKorn L1" />
          <QuickStat label="Infra" value="AWS" />
          <QuickStat label="Asset" value="UNY" />
          <QuickStat label="Flow" value="x402" />
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
