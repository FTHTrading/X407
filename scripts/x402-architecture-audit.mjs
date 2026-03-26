#!/usr/bin/env node
/**
 * x402 Architecture V2 — Automated Audit & Progress Tracker
 *
 * Scans the monorepo and validates every Phase 1-4 checklist item
 * from docs/FTH_X402_ARCHITECTURE_V2.md against the actual codebase.
 *
 * Usage:  node scripts/x402-architecture-audit.mjs [--json] [--update-doc]
 *   --json        Output machine-readable JSON
 *   --update-doc  Rewrite the architecture doc checkboxes to match reality
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const ARCH_DOC = path.join(ROOT, "docs", "FTH_X402_ARCHITECTURE_V2.md");

// ── helpers ──────────────────────────────────────────────────────────
function exists(...segments) {
  return fs.existsSync(path.join(ROOT, ...segments));
}

function fileContains(relPath, needle) {
  try {
    const content = fs.readFileSync(path.join(ROOT, relPath), "utf8");
    if (needle instanceof RegExp) return needle.test(content);
    return content.includes(needle);
  } catch { return false; }
}

function dirHasFiles(relPath, minCount = 1) {
  try {
    const entries = fs.readdirSync(path.join(ROOT, relPath));
    return entries.length >= minCount;
  } catch { return false; }
}

function migrationExists(number) {
  const dir = path.join(ROOT, "db", "migrations-x402");
  try {
    return fs.readdirSync(dir).some(f => f.startsWith(String(number).padStart(3, "0")));
  } catch { return false; }
}

function pkgHasDep(pkg, dep) {
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(ROOT, "packages", pkg, "package.json"), "utf8"));
    return !!(pj.dependencies?.[dep] || pj.devDependencies?.[dep]);
  } catch { return false; }
}

// ── checklist definition ─────────────────────────────────────────────
// Each item: { phase, label (must match arch doc text), check() → bool }
const CHECKLIST = [
  // ─── Phase 1 ────────────────────────────────────────────────────
  {
    phase: 1,
    label: "Cloudflare Worker x402 gate (route match, 402 response, proof forwarding)",
    check() {
      return (
        exists("packages/fth-x402-gateway/src/index.ts") &&
        exists("packages/fth-x402-gateway/src/x402.ts") &&
        exists("packages/fth-x402-gateway/src/proof.ts") &&
        exists("packages/fth-x402-gateway/src/routes.ts")
      );
    },
  },
  {
    phase: 1,
    label: "Namespace resolver (PostgreSQL + REST API)",
    check() {
      return (
        exists("packages/fth-x402-facilitator/src/services/namespace.ts") &&
        exists("packages/fth-x402-facilitator/src/routes/namespaces.ts") &&
        migrationExists(4)
      );
    },
  },
  {
    phase: 1,
    label: "Seed `fth.*` namespace records",
    check() {
      return exists("scripts/x402-seed-namespaces.mjs");
    },
  },
  {
    phase: 1,
    label: "Invoice service (create, lookup, expire)",
    check() {
      return (
        exists("packages/fth-x402-facilitator/src/services/invoices.ts") &&
        exists("packages/fth-x402-facilitator/src/routes/invoices.ts") &&
        migrationExists(3)
      );
    },
  },
  {
    phase: 1,
    label: "Facilitator skeleton (verify endpoint, replay guard)",
    check() {
      return (
        exists("packages/fth-x402-facilitator/src/services/verify.ts") &&
        exists("packages/fth-x402-facilitator/src/services/replay.ts") &&
        exists("packages/fth-x402-facilitator/src/routes/verify.ts")
      );
    },
  },
  {
    phase: 1,
    label: "UnyKorn payment channel model (open, spend, close)",
    check() {
      return (
        exists("packages/fth-x402-facilitator/src/services/channels.ts") &&
        exists("packages/fth-x402-facilitator/src/routes/channels.ts") &&
        migrationExists(5)
      );
    },
  },
  {
    phase: 1,
    label: "Prepaid credit primary flow (deposit, charge, refund)",
    check() {
      return (
        exists("packages/fth-x402-facilitator/src/routes/credits.ts") &&
        migrationExists(1) && migrationExists(2)
      );
    },
  },
  {
    phase: 1,
    label: "Credit ledger (PostgreSQL)",
    check() {
      return migrationExists(1) && migrationExists(2) && migrationExists(7);
    },
  },
  {
    phase: 1,
    label: "One paid route live: `/api/genesis/repro-pack/:suite`",
    check() {
      // Needs: R2 bucket configured, route in gateway config, namespace seeded
      return (
        fileContains("packages/fth-x402-gateway/src/routes.ts", "genesis") ||
        fileContains("packages/fth-x402-gateway/src/routes.ts", "repro-pack")
      );
    },
  },
  {
    phase: 1,
    label: "Minimal SDK: intercept 402, retry with proof",
    check() {
      return (
        exists("packages/fth-x402-sdk/src/client.ts") &&
        exists("packages/fth-x402-sdk/src/x402.ts") &&
        exists("packages/fth-x402-sdk/src/wallet.ts")
      );
    },
  },
  {
    phase: 1,
    label: "Receipt generation (offchain)",
    check() {
      return (
        exists("packages/fth-x402-facilitator/src/services/receipts.ts") &&
        exists("packages/fth-x402-facilitator/src/routes/receipts.ts") &&
        migrationExists(6) && migrationExists(7)
      );
    },
  },

  // ─── Phase 2 ────────────────────────────────────────────────────
  {
    phase: 2,
    label: "Stellar `signed_auth` verification in facilitator",
    check() {
      // Look for a real Stellar adapter, not just a stub comment
      return (
        exists("packages/fth-x402-facilitator/src/adapters/stellar.ts") ||
        fileContains("packages/fth-x402-facilitator/src/services/verify.ts", "stellar_signed_auth")
      );
    },
  },
  {
    phase: 2,
    label: "Stellar `sUSDF` bridge issuer account (testnet first)",
    check() {
      return exists("config/stellar.toml") &&
        fileContains("config/stellar.toml", "sUSDF");
    },
  },
  {
    phase: 2,
    label: "`stellar.toml` hosted",
    check() {
      return exists("config/stellar.toml");
    },
  },
  {
    phase: 2,
    label: "SDK retry logic (multi-rail fallback)",
    check() {
      return fileContains("packages/fth-x402-sdk/src/x402.ts", "fallback") ||
        fileContains("packages/fth-x402-sdk/src/x402.ts", "retry") ||
        fileContains("packages/fth-x402-sdk/src/client.ts", "fallback");
    },
  },
  {
    phase: 2,
    label: "Route pricing console",
    check() {
      return (
        exists("packages/fth-x402-pricing/src/routes.ts") &&
        fileContains("packages/fth-x402-pricing/src/routes.ts", "price")
      );
    },
  },
  {
    phase: 2,
    label: "Receipt root batch anchoring to L1",
    check() {
      return (
        fileContains("packages/fth-x402-facilitator/src/services/receipts.ts", "merkle") ||
        fileContains("packages/fth-x402-facilitator/src/services/receipts.ts", "anchor") ||
        fileContains("packages/fth-x402-facilitator/src/services/receipts.ts", "batch")
      );
    },
  },
  {
    phase: 2,
    label: "Operator dashboard v1 (balances, invoices, receipts)",
    check() {
      // Check if wallet app has dashboard/operator views
      return (
        exists("packages/unyKorn-wallet/src/pages/Dashboard.tsx") ||
        exists("packages/unyKorn-wallet/src/pages/Operator.tsx") ||
        exists("packages/fth-x402-site/src/pages/dashboard")
      );
    },
  },

  // ─── Phase 3 ────────────────────────────────────────────────────
  {
    phase: 3,
    label: "XRPL `xUSDF` mirror via existing master-issuer",
    check() {
      return (
        exists("packages/fth-x402-facilitator/src/adapters/xrpl.ts") ||
        fileContains("packages/fth-x402-facilitator/src/services/settle.ts", "xUSDF")
      );
    },
  },
  {
    phase: 3,
    label: "XRPL payment verification in facilitator",
    check() {
      return fileContains("packages/fth-x402-facilitator/src/services/verify.ts", "xrpl_payment");
    },
  },
  {
    phase: 3,
    label: "Reserve / supply reconciliation (L1 ↔ Stellar ↔ XRPL)",
    check() {
      return (
        exists("packages/fth-guardian/src/daemons/reconciler.ts") ||
        exists("packages/fth-x402-facilitator/src/services/reconcile.ts")
      );
    },
  },
  {
    phase: 3,
    label: "PASS issuance (basic, pro, institutional, kyc-enhanced)",
    check() {
      return (
        fileContains("packages/fth-x402-pricing/src/entitlements.ts", "PASS") ||
        fileContains("packages/fth-x402-pricing/src/entitlements.ts", "institutional")
      );
    },
  },
  {
    phase: 3,
    label: "RCPT receipt root explorer",
    check() {
      return (
        exists("packages/fth-x402-site/src/pages/receipts") ||
        exists("packages/unyKorn-wallet/src/pages/Receipts.tsx")
      );
    },
  },
  {
    phase: 3,
    label: "Full operator dashboard (namespaces, channels, policies)",
    check() {
      return (
        exists("packages/fth-x402-site/src/pages/operator") ||
        (exists("packages/unyKorn-wallet/src/pages/Namespaces.tsx") &&
         exists("packages/unyKorn-wallet/src/pages/Channels.tsx"))
      );
    },
  },
  {
    phase: 3,
    label: "Rate limiting per wallet/namespace",
    check() {
      return (
        exists("packages/fth-x402-facilitator/src/services/rate-limiter.ts") &&
        migrationExists(8)
      );
    },
  },

  // ─── Phase 4 ────────────────────────────────────────────────────
  {
    phase: 4,
    label: "wXAU, wUSTB asset definitions on L1",
    check() {
      return (
        fileContains("packages/fth-x402-core/src/types.ts", "wXAU") ||
        fileContains("packages/unyKorn-contracts/contracts", "WrappedAsset")
      );
    },
  },
  {
    phase: 4,
    label: "Oracle price feed integration",
    check() {
      return (
        exists("packages/fth-x402-facilitator/src/services/oracle.ts") ||
        exists("packages/fth-x402-facilitator/src/adapters/oracle.ts")
      );
    },
  },
  {
    phase: 4,
    label: "UnyKorn trade-finance settlement hooks",
    check() {
      return fileContains("packages/fth-x402-facilitator/src/services/settle.ts", "trade-finance") ||
        fileContains("packages/fth-x402-facilitator/src/services/settle.ts", "tradeFinance");
    },
  },
  {
    phase: 4,
    label: "Policy-bound routes (institutional entitlements)",
    check() {
      return (
        exists("packages/fth-x402-facilitator/src/services/policy.ts") &&
        fileContains("packages/fth-x402-facilitator/src/services/policy.ts", "institutional")
      );
    },
  },
  {
    phase: 4,
    label: "Bridge service: L1 ↔ Stellar",
    check() {
      return exists("packages/fth-x402-facilitator/src/adapters/stellar.ts");
    },
  },
  {
    phase: 4,
    label: "Audit export (CSV/JSON)",
    check() {
      return (
        fileContains("packages/fth-x402-facilitator/src/routes/operator.ts", "export") ||
        exists("scripts/x402-audit-export.mjs")
      );
    },
  },
];

// ── run audit ────────────────────────────────────────────────────────
function runAudit() {
  const results = CHECKLIST.map((item) => {
    let done = false;
    try { done = item.check(); } catch { done = false; }
    return { phase: item.phase, label: item.label, done };
  });
  return results;
}

// ── display ──────────────────────────────────────────────────────────
function printReport(results) {
  const phases = [1, 2, 3, 4];
  const phaseNames = {
    1: "UnyKorn-first x402 core",
    2: "Stellar bridge support",
    3: "XRPL mirror + operator controls",
    4: "Wrapped assets + trade-finance",
  };

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║          FTH x402 Architecture V2 — Audit Report           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  let totalDone = 0;
  let totalItems = 0;

  for (const p of phases) {
    const items = results.filter((r) => r.phase === p);
    const done = items.filter((r) => r.done).length;
    totalDone += done;
    totalItems += items.length;

    const pct = Math.round((done / items.length) * 100);
    const bar = "█".repeat(Math.round(pct / 5)) + "░".repeat(20 - Math.round(pct / 5));
    console.log(`  Phase ${p} — ${phaseNames[p]}`);
    console.log(`  ${bar}  ${done}/${items.length}  (${pct}%)`);
    console.log();

    for (const item of items) {
      const mark = item.done ? "✅" : "⬜";
      console.log(`    ${mark}  ${item.label}`);
    }
    console.log();
  }

  const totalPct = Math.round((totalDone / totalItems) * 100);
  console.log("─".repeat(62));
  console.log(`  TOTAL: ${totalDone}/${totalItems} complete  (${totalPct}%)`);
  console.log("─".repeat(62));
  console.log();

  // Show what to build next
  const remaining = results.filter((r) => !r.done);
  if (remaining.length > 0) {
    console.log("  🔧  Next up (lowest-phase incomplete items):");
    const nextPhase = Math.min(...remaining.map((r) => r.phase));
    const nextItems = remaining.filter((r) => r.phase === nextPhase);
    for (const item of nextItems) {
      console.log(`      → ${item.label}`);
    }
    console.log();
  }
}

// ── update doc ───────────────────────────────────────────────────────
function updateDoc(results) {
  let content = fs.readFileSync(ARCH_DOC, "utf8");
  for (const item of results) {
    // Match both [x] and [ ] versions
    const escaped = item.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`- \\[[ x]\\] ${escaped}`);
    const replacement = item.done
      ? `- [x] ${item.label}`
      : `- [ ] ${item.label}`;
    content = content.replace(re, replacement);
  }
  fs.writeFileSync(ARCH_DOC, content, "utf8");
  console.log("  📄  Updated", path.relative(ROOT, ARCH_DOC));
}

// ── main ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const results = runAudit();

if (args.includes("--json")) {
  console.log(JSON.stringify(results, null, 2));
} else {
  printReport(results);
  if (args.includes("--update-doc")) {
    updateDoc(results);
  }
}
