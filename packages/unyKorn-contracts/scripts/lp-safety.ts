/**
 * lp-safety.ts
 * Shared LP safety enforcement layer.
 *
 * Three protection systems:
 *   1. Global kill switch    — LP_GLOBAL_DISABLE=true blocks all tx execution
 *   2. Safety thresholds     — Max wallet %, max USD exposure, slippage ceiling
 *   3. Position diff preview — Before/after balance projection
 *
 * All LP scripts import and call these guards before executing live transactions.
 */

import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const ROOT = resolve(__dirname, "../../..");

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SafetyLimits {
  max_wallet_percent:        number;  // Max % of token balance deployable per operation
  max_usd_exposure:          number;  // Max USD value per single LP operation
  max_slippage_bps:          number;  // Hard ceiling on slippage (bps)
  min_remaining_avax:        number;  // Min AVAX to always keep for gas
  require_dry_run_first:     boolean; // Must run DRY_RUN=true before live
}

export interface PositionDiff {
  tokenX: { symbol: string; before: string; after: string; change: string; percentDeployed: string };
  tokenY: { symbol: string; before: string; after: string; change: string; percentDeployed: string };
  totalUsdEstimate: string;
  gasCostEstimate:  string;
  withinLimits:     boolean;
  violations:       string[];
}

// ── Kill Switch ───────────────────────────────────────────────────────────────
export function checkKillSwitch(): void {
  if (process.env.LP_GLOBAL_DISABLE === "true") {
    console.error("\n🛑  LP_GLOBAL_DISABLE=true — ALL LP transaction execution is blocked.");
    console.error("    Set LP_GLOBAL_DISABLE=false or remove the variable to re-enable.\n");
    process.exit(2);
  }
}

// ── Load Safety Limits ────────────────────────────────────────────────────────
export function loadSafetyLimits(): SafetyLimits {
  try {
    const config = JSON.parse(readFileSync(join(ROOT, "registry/lp-config.json"), "utf8"));
    const limits = config.safety_limits;
    if (!limits) {
      console.warn("    ⚠ No safety_limits in lp-config.json — using conservative defaults");
      return defaultLimits();
    }
    return {
      max_wallet_percent:    limits.max_wallet_percent    ?? 25,
      max_usd_exposure:      limits.max_usd_exposure      ?? 500,
      max_slippage_bps:      limits.max_slippage_bps      ?? 300,
      min_remaining_avax:    limits.min_remaining_avax    ?? 0.1,
      require_dry_run_first: limits.require_dry_run_first ?? true,
    };
  } catch {
    return defaultLimits();
  }
}

function defaultLimits(): SafetyLimits {
  return {
    max_wallet_percent:    25,
    max_usd_exposure:      500,
    max_slippage_bps:      300,
    min_remaining_avax:    0.1,
    require_dry_run_first: true,
  };
}

// ── Enforce Safety Thresholds ─────────────────────────────────────────────────
export async function enforceSafetyThresholds(params: {
  slippageBps:  number;
  amtX:         bigint;
  amtY:         bigint;
  balX:         bigint;
  balY:         bigint;
  decX:         number;
  decY:         number;
  symX:         string;
  symY:         string;
  priceY_usd?:  number;   // USD price of tokenY (USDC=1, AVAX=market)
  priceX_usd?:  number;   // USD price of tokenX (UNY=market)
  isDryRun:     boolean;
}): Promise<{ pass: boolean; violations: string[] }> {

  const limits = loadSafetyLimits();
  const violations: string[] = [];

  // 1. Slippage ceiling
  if (params.slippageBps > limits.max_slippage_bps) {
    violations.push(
      `Slippage ${params.slippageBps} bps exceeds max ${limits.max_slippage_bps} bps`
    );
  }

  // 2. Max wallet % for tokenX
  if (params.balX > 0n) {
    const pctX = Number((params.amtX * 10000n) / params.balX) / 100;
    if (pctX > limits.max_wallet_percent) {
      violations.push(
        `${params.symX} deployment ${pctX.toFixed(1)}% exceeds max ${limits.max_wallet_percent}% of wallet`
      );
    }
  }

  // 3. Max wallet % for tokenY
  if (params.balY > 0n) {
    const pctY = Number((params.amtY * 10000n) / params.balY) / 100;
    if (pctY > limits.max_wallet_percent) {
      violations.push(
        `${params.symY} deployment ${pctY.toFixed(1)}% exceeds max ${limits.max_wallet_percent}% of wallet`
      );
    }
  }

  // 4. USD exposure check
  if (params.priceY_usd !== undefined && params.priceX_usd !== undefined) {
    const usdX = Number(ethers.formatUnits(params.amtX, params.decX)) * params.priceX_usd;
    const usdY = Number(ethers.formatUnits(params.amtY, params.decY)) * params.priceY_usd;
    const totalUsd = usdX + usdY;
    if (totalUsd > limits.max_usd_exposure) {
      violations.push(
        `Total USD exposure $${totalUsd.toFixed(2)} exceeds max $${limits.max_usd_exposure}`
      );
    }
  }

  // 5. Min remaining AVAX for gas
  const [signer] = await ethers.getSigners();
  const avaxBal = await ethers.provider.getBalance(signer.address);
  const avaxAfter = params.symY === "WAVAX" || params.symY === "AVAX"
    ? avaxBal - params.amtY
    : avaxBal;
  const minAvax = ethers.parseEther(limits.min_remaining_avax.toString());
  if (avaxAfter < minAvax) {
    violations.push(
      `Would leave only ${ethers.formatEther(avaxAfter)} AVAX — below min ${limits.min_remaining_avax} AVAX gas reserve`
    );
  }

  // Print results
  if (violations.length > 0) {
    console.log("\n  🛡️  SAFETY THRESHOLD VIOLATIONS:");
    violations.forEach(v => console.log(`      ✗ ${v}`));
    if (!params.isDryRun) {
      console.log("\n      Transaction BLOCKED. Fix violations or adjust safety_limits in lp-config.json.\n");
    }
  } else {
    console.log("\n  🛡️  Safety checks: ALL PASSED ✓");
  }

  return { pass: violations.length === 0, violations };
}

// ── Position Diff Preview ─────────────────────────────────────────────────────
export function printPositionDiff(params: {
  action:      "add" | "remove";
  symX:        string;
  symY:        string;
  decX:        number;
  decY:        number;
  balX:        bigint;
  balY:        bigint;
  amtX:        bigint;
  amtY:        bigint;
  avaxBal:     bigint;
  isNative:    boolean;
  numBins:     number;
  binStep:     number;
  priceY_usd?: number;
  priceX_usd?: number;
}): void {

  const beforeX = Number(ethers.formatUnits(params.balX, params.decX));
  const beforeY = Number(ethers.formatUnits(params.balY, params.decY));
  const deplX   = Number(ethers.formatUnits(params.amtX, params.decX));
  const deplY   = Number(ethers.formatUnits(params.amtY, params.decY));

  const afterX = params.action === "add" ? beforeX - deplX : beforeX + deplX;
  const afterY = params.action === "add" ? beforeY - deplY : beforeY + deplY;

  const pctX = beforeX > 0 ? (deplX / beforeX * 100) : 0;
  const pctY = beforeY > 0 ? (deplY / beforeY * 100) : 0;

  console.log("\n  ┌─────────────────────────────────────────────────────┐");
  console.log(`  │  POSITION DIFF PREVIEW — ${params.action.toUpperCase()}`.padEnd(54) + "│");
  console.log("  ├─────────────────────────────────────────────────────┤");

  // Token X
  const xArrow = params.action === "add" ? "→" : "←";
  console.log(`  │  ${params.symX.padEnd(6)} Before : ${beforeX.toFixed(4).padStart(16)}`.padEnd(54) + "│");
  console.log(`  │  ${" ".repeat(6)} ${params.action === "add" ? "Deploy" : "Recvd"} : ${(params.action === "add" ? "-" : "+") + deplX.toFixed(4).padStart(15)}`.padEnd(54) + "│");
  console.log(`  │  ${" ".repeat(6)} After  : ${afterX.toFixed(4).padStart(16)}  (${pctX.toFixed(1)}%)`.padEnd(54) + "│");
  console.log("  │" + " ".repeat(53) + "│");

  // Token Y
  console.log(`  │  ${params.symY.padEnd(6)} Before : ${beforeY.toFixed(4).padStart(16)}`.padEnd(54) + "│");
  console.log(`  │  ${" ".repeat(6)} ${params.action === "add" ? "Deploy" : "Recvd"} : ${(params.action === "add" ? "-" : "+") + deplY.toFixed(4).padStart(15)}`.padEnd(54) + "│");
  console.log(`  │  ${" ".repeat(6)} After  : ${afterY.toFixed(4).padStart(16)}  (${pctY.toFixed(1)}%)`.padEnd(54) + "│");
  console.log("  │" + " ".repeat(53) + "│");

  // AVAX gas reserve
  const avaxBefore = Number(ethers.formatEther(params.avaxBal));
  const avaxAfterEst = params.isNative ? avaxBefore - deplY - 0.01 : avaxBefore - 0.01;
  console.log(`  │  AVAX   Remaining: ~${avaxAfterEst.toFixed(4)} (gas reserve)`.padEnd(54) + "│");
  console.log("  │" + " ".repeat(53) + "│");

  // USD estimates if prices available
  if (params.priceX_usd !== undefined && params.priceY_usd !== undefined) {
    const usdX = deplX * params.priceX_usd;
    const usdY = deplY * params.priceY_usd;
    const totalUsd = usdX + usdY;
    console.log(`  │  USD Value: ~$${totalUsd.toFixed(2)} ($${usdX.toFixed(2)} + $${usdY.toFixed(2)})`.padEnd(54) + "│");

    // Rough APR estimate based on LB fee structure
    // LB V2.1 base fee ~0.2% per swap, concentrated in active bins
    const baseFeePercent = params.binStep / 100;  // bin step = basis point fee
    // Very rough: assume some volume relative to position size
    // This is illustrative, not predictive
    console.log(`  │  Bin Step Fee: ${baseFeePercent.toFixed(2)}% per swap`.padEnd(54) + "│");
    console.log(`  │  ⚠ APR depends on volume — check analytics`.padEnd(54) + "│");
  }

  // IL warning band
  const binRange = params.numBins * params.binStep;
  const priceMoveForIL = (1 + params.binStep / 10000) ** params.numBins;
  const ilAtEdge = ((2 * Math.sqrt(priceMoveForIL)) / (1 + priceMoveForIL) - 1) * 100;
  console.log("  │" + " ".repeat(53) + "│");
  console.log(`  │  IL if price moves to edge of range:`.padEnd(54) + "│");
  console.log(`  │    ${params.numBins} bins × ${params.binStep}bp = ~${Math.abs(ilAtEdge).toFixed(2)}% impermanent loss`.padEnd(54) + "│");

  console.log("  └─────────────────────────────────────────────────────┘");
}

// ── Position Diff Preview — V1 Classic AMM ────────────────────────────────────
export function printPositionDiffV1(params: {
  action:      "add" | "remove";
  symUNY:      string;
  symQuote:    string;
  decUNY:      number;
  decQuote:    number;
  balUNY:      bigint;
  balQuote:    bigint;
  amtUNY:      bigint;
  amtQuote:    bigint;
  avaxBal:     bigint;
  isNative:    boolean;
  lpBefore:    bigint;
  lpSupply:    bigint;
  reserve0:    bigint;
  reserve1:    bigint;
  dec0:        number;
  dec1:        number;
  priceY_usd?: number;
}): void {

  const beforeUNY = Number(ethers.formatUnits(params.balUNY, params.decUNY));
  const beforeQ   = Number(ethers.formatUnits(params.balQuote, params.decQuote));
  const deplUNY   = Number(ethers.formatUnits(params.amtUNY, params.decUNY));
  const deplQ     = Number(ethers.formatUnits(params.amtQuote, params.decQuote));

  const afterUNY = params.action === "add" ? beforeUNY - deplUNY : beforeUNY + deplUNY;
  const afterQ   = params.action === "add" ? beforeQ - deplQ : beforeQ + deplQ;

  const pctUNY = beforeUNY > 0 ? (deplUNY / beforeUNY * 100) : 0;
  const pctQ   = beforeQ > 0   ? (deplQ / beforeQ * 100) : 0;

  // Pool share from LP token
  const lpBef = Number(ethers.formatUnits(params.lpBefore, 18));
  const lpSup = Number(ethers.formatUnits(params.lpSupply, 18));
  const sharePercent = lpSup > 0 ? (lpBef / lpSup * 100) : 0;

  // Reserve values
  const r0 = Number(ethers.formatUnits(params.reserve0, params.dec0));
  const r1 = Number(ethers.formatUnits(params.reserve1, params.dec1));
  const k  = r0 * r1;

  console.log("\n  ┌─────────────────────────────────────────────────────┐");
  console.log(`  │  POSITION DIFF — V1 CLASSIC AMM — ${params.action.toUpperCase()}`.padEnd(54) + "│");
  console.log("  ├─────────────────────────────────────────────────────┤");

  // UNY
  console.log(`  │  ${params.symUNY.padEnd(6)} Before : ${beforeUNY.toFixed(4).padStart(16)}`.padEnd(54) + "│");
  console.log(`  │  ${" ".repeat(6)} ${params.action === "add" ? "Deploy" : "Recvd"} : ${(params.action === "add" ? "-" : "+") + deplUNY.toFixed(4).padStart(15)}`.padEnd(54) + "│");
  console.log(`  │  ${" ".repeat(6)} After  : ${afterUNY.toFixed(4).padStart(16)}  (${pctUNY.toFixed(1)}%)`.padEnd(54) + "│");
  console.log("  │" + " ".repeat(53) + "│");

  // Quote token
  console.log(`  │  ${params.symQuote.padEnd(6)} Before : ${beforeQ.toFixed(4).padStart(16)}`.padEnd(54) + "│");
  console.log(`  │  ${" ".repeat(6)} ${params.action === "add" ? "Deploy" : "Recvd"} : ${(params.action === "add" ? "-" : "+") + deplQ.toFixed(4).padStart(15)}`.padEnd(54) + "│");
  console.log(`  │  ${" ".repeat(6)} After  : ${afterQ.toFixed(4).padStart(16)}  (${pctQ.toFixed(1)}%)`.padEnd(54) + "│");
  console.log("  │" + " ".repeat(53) + "│");

  // LP token info
  console.log(`  │  LP Token Balance : ${lpBef.toFixed(6).padStart(16)}`.padEnd(54) + "│");
  console.log(`  │  LP Total Supply  : ${lpSup.toFixed(6).padStart(16)}`.padEnd(54) + "│");
  console.log(`  │  Pool Share       : ${sharePercent.toFixed(4).padStart(16)}%`.padEnd(54) + "│");
  console.log("  │" + " ".repeat(53) + "│");

  // Pool state
  console.log(`  │  Pool k (x*y) : ${k.toFixed(2)}`.padEnd(54) + "│");
  console.log("  │" + " ".repeat(53) + "│");

  // AVAX gas reserve
  const avaxBefore = Number(ethers.formatEther(params.avaxBal));
  const avaxAfterEst = params.isNative ? avaxBefore - deplQ - 0.01 : avaxBefore - 0.01;
  console.log(`  │  AVAX   Remaining: ~${avaxAfterEst.toFixed(4)} (gas reserve)`.padEnd(54) + "│");
  console.log("  │" + " ".repeat(53) + "│");

  // USD estimates
  if (params.priceY_usd !== undefined) {
    // For V1 classic AMM, UNY price derived from reserves
    const unyPrice = r0 > 0 && r1 > 0 ? r0 / r1 * (params.priceY_usd || 1) : 0;
    const usdUNY = deplUNY * unyPrice;
    const usdQ   = deplQ * (params.priceY_usd || 1);
    const totalUsd = usdUNY + usdQ;
    console.log(`  │  USD Value: ~$${totalUsd.toFixed(2)} ($${usdUNY.toFixed(2)} + $${usdQ.toFixed(2)})`.padEnd(54) + "│");
    console.log(`  │  ⚠ V1 AMM: 0.3% swap fee, fees auto-compound`.padEnd(54) + "│");
  }

  console.log("  └─────────────────────────────────────────────────────┘");
}

// ── Shared: check if this is a "first run" (require dry-run before live) ──────
const DRY_RUN_MARKER_DIR = resolve(__dirname, "../.lp-runs");

export function markDryRunComplete(scriptName: string, pool: string): void {
  const fs = require("fs");
  if (!fs.existsSync(DRY_RUN_MARKER_DIR)) fs.mkdirSync(DRY_RUN_MARKER_DIR, { recursive: true });
  const marker = join(DRY_RUN_MARKER_DIR, `${scriptName}-${pool}.last-dry-run`);
  fs.writeFileSync(marker, new Date().toISOString());
}

export function checkDryRunRequired(scriptName: string, pool: string): boolean {
  const limits = loadSafetyLimits();
  if (!limits.require_dry_run_first) return false;

  const fs = require("fs");
  const marker = join(DRY_RUN_MARKER_DIR, `${scriptName}-${pool}.last-dry-run`);
  if (!fs.existsSync(marker)) {
    console.error(`\n🛡️  Safety: require_dry_run_first is enabled.`);
    console.error(`    You must run this script with DRY_RUN=true at least once before live execution.`);
    console.error(`    Run again with DRY_RUN=true first.\n`);
    return true;
  }

  // Check marker age — require fresh dry-run within 1 hour
  const lastRun = new Date(fs.readFileSync(marker, "utf8").trim());
  const ageMs = Date.now() - lastRun.getTime();
  const maxAge = 60 * 60 * 1000; // 1 hour
  if (ageMs > maxAge) {
    console.error(`\n🛡️  Safety: Last dry-run was ${Math.floor(ageMs / 60000)} minutes ago (max: 60 min).`);
    console.error(`    Re-run with DRY_RUN=true to get a fresh preview.\n`);
    return true;
  }

  return false;
}
