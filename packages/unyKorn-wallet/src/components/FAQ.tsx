/**
 * src/components/FAQ.tsx
 * FAQ section for SEO and user education.
 * Google rich results will consume the JSON-LD FAQ in index.html,
 * and this renders the same content visually.
 */

import { useState } from "react";
import { UNY_TOKEN_ADDRESS } from "../wagmi";

const FAQS = [
  {
    q: "What is UnyKorn (UNY)?",
    a: "UnyKorn (UNY) is an ERC-20 token deployed on Avalanche C-Chain with a total supply of 1 billion. It powers decentralized pools, vaults, and cross-chain infrastructure across multiple blockchains.",
  },
  {
    q: "How do I buy UNY tokens?",
    a: `You can buy UNY on TraderJoe DEX on Avalanche. Simply connect your wallet, select AVAX or USDC as the input currency, and swap for UNY. The token contract address is ${UNY_TOKEN_ADDRESS}.`,
  },
  {
    q: "What blockchain is UNY on?",
    a: "UNY is deployed on Avalanche C-Chain (Chain ID 43114). The contract is fully verified on Snowtrace. UnyKorn also has infrastructure on Polygon (RAMM Protocol), Solana, and XRPL for cross-chain operations.",
  },
  {
    q: "Is UnyKorn safe? Is the contract verified?",
    a: "Yes. The UNY token contract is fully verified and publicly readable on Snowtrace (Avalanche's block explorer). All transactions, holders, and contract code are transparent and on-chain.",
  },
  {
    q: "What are the UNY trading pools?",
    a: "UNY has two active liquidity pools on TraderJoe V1: WAVAX/UNY and USDC/UNY. Both pools support trading and earn fees for liquidity providers. LP depth is growing — check DexScreener for current reserves.",
  },
  {
    q: "Where is UnyKorn based?",
    a: "UnyKorn is based at 5655 Peachtree Pkwy, Norcross, GA 30092, United States. We are a US-based DeFi project building real infrastructure.",
  },
  {
    q: "What is the RAMM Protocol?",
    a: "RAMM is a multi-token DeFi system deployed on Polygon by the UnyKorn team. It includes stablecoins, bond mechanisms, vault NFTs, and a complete DeFi ecosystem at ram.unykorn.org.",
  },
  {
    q: "Can I provide liquidity for UNY?",
    a: "Yes! You can add liquidity to the WAVAX/UNY or USDC/UNY pools on TraderJoe and earn trading fees from every swap. Connect your wallet to this DApp to see your LP positions.",
  },
];

export function FAQ() {
  return (
    <section className="section" id="faq">
      <div className="section-header">
        <span className="badge">FAQ</span>
        <h2 style={{ marginTop: 16 }}>Frequently Asked Questions</h2>
        <p>Everything you need to know about UnyKorn and the UNY token.</p>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {FAQS.map((faq, i) => (
          <FAQItem key={i} question={faq.q} answer={faq.a} />
        ))}
      </div>
    </section>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="faq-item" style={{ marginBottom: 8 }}>
      <button
        onClick={() => setOpen(!open)}
        className="faq-toggle"
        aria-expanded={open}
      >
        <span style={{ fontWeight: 600, fontSize: 15, textAlign: "left" }}>{question}</span>
        <span style={{
          fontSize: 18,
          transition: "transform 0.2s",
          transform: open ? "rotate(45deg)" : "rotate(0deg)",
          flexShrink: 0,
        }}>
          +
        </span>
      </button>
      {open && (
        <div className="faq-answer">
          <p>{answer}</p>
        </div>
      )}
    </div>
  );
}
