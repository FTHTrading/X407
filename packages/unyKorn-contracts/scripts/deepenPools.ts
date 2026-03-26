/**
 * deepenPools.ts
 * One-shot script to add liquidity to BOTH UNY pools (USDC & WAVAX)
 * in a single run, with balanced amounts based on current reserves.
 *
 * Use this after funding the operator wallet with AVAX and/or USDC.
 * The script auto-calculates optimal UNY amounts to match the quote
 * token deposit based on current pool prices.
 *
 * Safety:
 *   - LP_GLOBAL_DISABLE=true → hard kill switch
 *   - DRY_RUN=true (default) — preview only
 *   - Always keeps MIN_AVAX_RESERVE for gas
 *
 * Usage:
 *   npx hardhat run scripts/deepenPools.ts --network avalanche
 *
 * Environment:
 *   USDC_AMOUNT=100          Amount of USDC to add (default: all available)
 *   AVAX_AMOUNT=1            Amount of AVAX to add (default: available - gas reserve)
 *   SLIPPAGE=200             Basis points (default: 200 = 2%)
 *   DRY_RUN=true|false       (default: true)
 *   LP_GLOBAL_DISABLE=true   Emergency kill switch
 *   MIN_AVAX_RESERVE=0.1     AVAX to keep for gas (default: 0.1)
 */

import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { resolve, join } from "path";
import {
  checkKillSwitch,
  enforceSafetyThresholds,
  checkDryRunRequired,
  markDryRunComplete,
} from "./lp-safety";

const ROOT = resolve(__dirname, "../../..");

const V1_ROUTER_ABI = [
  "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function addLiquidityAVAX(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountAVAXMin, address to, uint256 deadline) external payable returns (uint256 amountToken, uint256 amountAVAX, uint256 liquidity)",
];

const PAIR_ABI = [
  "function getReserves() view returns (uint112, uint112, uint32)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];

const ERC20_ABI = [
  "function approve(address, uint256) returns (bool)",
  "function allowance(address, address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];

// ── Config ────────────────────────────────────────────────────────────────────
const SLIPPAGE          = parseInt(process.env.SLIPPAGE || "200");
const DRY_RUN           = process.env.DRY_RUN !== "false";
const MIN_AVAX_RESERVE  = parseFloat(process.env.MIN_AVAX_RESERVE || "0.1");

function applySlippage(amount: bigint, bps: number): bigint {
  return (amount * BigInt(10000 - bps)) / 10000n;
}

function fmt(val: bigint, decimals: number): string {
  return Number(ethers.formatUnits(val, decimals)).toFixed(decimals > 8 ? 8 : decimals);
}

interface PoolConfig {
  pair_address: string;
  v1_router: string;
  token0: { symbol: string; address: string; decimals: number };
  token1: { symbol: string; address: string; decimals: number };
}

async function addToPool(
  signer: any,
  poolConfig: PoolConfig,
  isNative: boolean,
  quoteAmount: bigint,
  label: string,
) {
  const routerAddr = poolConfig.v1_router;
  const pairAddr   = poolConfig.pair_address;
  const unyIsToken1 = poolConfig.token1.symbol === "UNY";
  const unyAddr   = unyIsToken1 ? poolConfig.token1.address : poolConfig.token0.address;
  const quoteAddr = unyIsToken1 ? poolConfig.token0.address : poolConfig.token1.address;
  const decUNY    = unyIsToken1 ? poolConfig.token1.decimals : poolConfig.token0.decimals;
  const decQuote  = unyIsToken1 ? poolConfig.token0.decimals : poolConfig.token1.decimals;
  const quoteSym  = unyIsToken1 ? poolConfig.token0.symbol : poolConfig.token1.symbol;

  const pair = new ethers.Contract(pairAddr, PAIR_ABI, signer);
  const [r0, r1] = await pair.getReserves();

  const resQuote = unyIsToken1 ? r0 : r1;
  const resUNY   = unyIsToken1 ? r1 : r0;

  // Calculate UNY amount to match quote at current ratio
  // UNY_needed = quoteAmount * resUNY / resQuote
  const unyNeeded = (quoteAmount * resUNY) / resQuote;

  const unyToken = new ethers.Contract(unyAddr, ERC20_ABI, signer);
  const walletUNY: bigint = await unyToken.balanceOf(signer.address);

  if (walletUNY < unyNeeded) {
    console.log(`  ✗ Not enough UNY. Need ${fmt(unyNeeded, decUNY)}, have ${fmt(walletUNY, decUNY)}`);
    return false;
  }

  const priceQuote = Number(ethers.formatUnits(resQuote, decQuote));
  const priceUNY = Number(ethers.formatUnits(resUNY, decUNY));
  const price = priceQuote / priceUNY;

  console.log(`\n  ┌─── ${label} ─────────────────────────────────────`);
  console.log(`  │  Pair     : ${pairAddr}`);
  console.log(`  │  Reserve  : ${fmt(resQuote, decQuote)} ${quoteSym} + ${fmt(resUNY, decUNY)} UNY`);
  console.log(`  │  Price    : ${price.toFixed(8)} ${quoteSym}/UNY`);
  console.log(`  │  Adding   : ${fmt(quoteAmount, decQuote)} ${quoteSym} + ${fmt(unyNeeded, decUNY)} UNY`);
  console.log(`  │  Slippage : ${SLIPPAGE} bps (${SLIPPAGE / 100}%)`);

  // After-deposit reserves estimate
  const newResQuote = Number(ethers.formatUnits(resQuote + quoteAmount, decQuote));
  const newResUNY = Number(ethers.formatUnits(resUNY + unyNeeded, decUNY));
  const depthIncrease = ((newResQuote - priceQuote) / priceQuote * 100).toFixed(1);
  console.log(`  │  New Res  : ~${newResQuote.toFixed(6)} ${quoteSym} + ~${newResUNY.toFixed(6)} UNY (+${depthIncrease}%)`);

  if (DRY_RUN) {
    console.log(`  │  ⏸️  DRY RUN — skipping execution`);
    console.log(`  └───────────────────────────────────────────────`);
    return true;
  }

  // Approve UNY
  const allowance = await unyToken.allowance(signer.address, routerAddr);
  if (allowance < unyNeeded) {
    console.log(`  │  Approving UNY...`);
    const approveTx = await unyToken.approve(routerAddr, unyNeeded);
    await approveTx.wait();
    console.log(`  │  ✓ Approved`);
  }

  const router = new ethers.Contract(routerAddr, V1_ROUTER_ABI, signer);
  const deadline = Math.floor(Date.now() / 1000) + 1200;
  const unyMin = applySlippage(unyNeeded, SLIPPAGE);
  const quoteMin = applySlippage(quoteAmount, SLIPPAGE);

  let tx;
  if (isNative) {
    tx = await router.addLiquidityAVAX(
      unyAddr,
      unyNeeded,
      unyMin,
      quoteMin,
      signer.address,
      deadline,
      { value: quoteAmount }
    );
  } else {
    // Approve quote token
    const quoteToken = new ethers.Contract(quoteAddr, ERC20_ABI, signer);
    const quoteAllow = await quoteToken.allowance(signer.address, routerAddr);
    if (quoteAllow < quoteAmount) {
      console.log(`  │  Approving ${quoteSym}...`);
      const appTx = await quoteToken.approve(routerAddr, quoteAmount);
      await appTx.wait();
      console.log(`  │  ✓ Approved`);
    }

    tx = await router.addLiquidity(
      unyAddr,
      quoteAddr,
      unyNeeded,
      quoteAmount,
      unyMin,
      quoteMin,
      signer.address,
      deadline,
    );
  }

  const receipt = await tx.wait();
  console.log(`  │  ✓ Tx: ${receipt!.hash}`);
  console.log(`  │  ✓ Gas: ${receipt!.gasUsed.toString()}`);
  console.log(`  └───────────────────────────────────────────────`);
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  checkKillSwitch();

  const [signer] = await ethers.getSigners();

  console.log("\n╔═══════════════════════════════════════════════════════════════╗");
  console.log("║           Deepen UNY Pools — TraderJoe V1                   ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");
  console.log(`  Operator : ${signer.address}`);
  console.log(`  Mode     : ${DRY_RUN ? "DRY RUN 🏜️" : "⚡ LIVE"}`);
  console.log(`  Slippage : ${SLIPPAGE} bps\n`);

  // Current balances
  const avaxBal = await ethers.provider.getBalance(signer.address);
  const avaxNum = Number(ethers.formatEther(avaxBal));
  console.log(`  AVAX Balance : ${avaxNum.toFixed(6)}`);
  console.log(`  Gas Reserve  : ${MIN_AVAX_RESERVE} AVAX`);

  // Load pool configs
  const usdcPoolConfig: PoolConfig = JSON.parse(
    readFileSync(join(ROOT, "registry/pools/avalanche-lfj-uny-usdc.json"), "utf8")
  );
  const wavaxPoolConfig: PoolConfig = JSON.parse(
    readFileSync(join(ROOT, "registry/pools/avalanche-lfj-uny-wavax.json"), "utf8")
  );

  // ── USDC Pool ───────────────────────────────────────────────────────────────
  const usdcAddr = "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e";
  const usdcToken = new ethers.Contract(usdcAddr, ERC20_ABI, signer);
  const usdcBal: bigint = await usdcToken.balanceOf(signer.address);
  const usdcNum = Number(ethers.formatUnits(usdcBal, 6));
  console.log(`  USDC Balance : ${usdcNum.toFixed(6)}`);

  // Determine how much USDC to add
  const usdcAmountEnv = process.env.USDC_AMOUNT
    ? ethers.parseUnits(process.env.USDC_AMOUNT, 6)
    : usdcBal; // Use all available USDC by default

  if (usdcAmountEnv > 0n && usdcBal >= usdcAmountEnv) {
    await addToPool(signer, usdcPoolConfig, false, usdcAmountEnv, "USDC/UNY Pool");
  } else if (usdcBal === 0n) {
    console.log("\n  ── USDC/UNY Pool: ⏭️  No USDC available — skipping");
  } else {
    console.log(`\n  ── USDC/UNY Pool: ⏭️  Insufficient USDC (have ${usdcNum}, want ${process.env.USDC_AMOUNT})`);
  }

  // ── WAVAX Pool ──────────────────────────────────────────────────────────────
  const availableAvax = avaxNum - MIN_AVAX_RESERVE;
  const avaxAmountEnv = process.env.AVAX_AMOUNT
    ? parseFloat(process.env.AVAX_AMOUNT)
    : Math.max(0, availableAvax);

  if (avaxAmountEnv > 0 && availableAvax >= avaxAmountEnv) {
    const avaxWei = ethers.parseEther(avaxAmountEnv.toFixed(18));
    await addToPool(signer, wavaxPoolConfig, true, avaxWei, "WAVAX/UNY Pool");
  } else if (availableAvax <= 0) {
    console.log("\n  ── WAVAX/UNY Pool: ⏭️  Not enough AVAX (need gas reserve)");
  } else {
    console.log(`\n  ── WAVAX/UNY Pool: ⏭️  Only ${availableAvax.toFixed(4)} AVAX available after gas reserve`);
  }

  // ── Safety thresholds ────────────────────────────────────────────────────────
  const unyAddr = usdcPoolConfig.token1?.symbol === "UNY"
    ? usdcPoolConfig.token1.address : usdcPoolConfig.token0.address;
  const unyToken = new ethers.Contract(unyAddr, ERC20_ABI, signer);
  const unyBal: bigint = await unyToken.balanceOf(signer.address);

  const safetyResult = await enforceSafetyThresholds({
    slippageBps: SLIPPAGE,
    amtX: unyBal,             // worst-case: full wallet
    amtY: usdcAmountEnv,
    balX: unyBal,
    balY: usdcBal,
    decX: 18,
    decY: 6,
    symX: "UNY",
    symY: "USDC",
    priceX_usd: undefined,
    priceY_usd: 1.0,
    isDryRun: DRY_RUN,
  });

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════════");
  if (DRY_RUN) {
    markDryRunComplete("deepenPools", "all");
    console.log("  DRY RUN complete. To execute live:");
    console.log("    DRY_RUN=false npx hardhat run scripts/deepenPools.ts --network avalanche");
  } else {
    if (!safetyResult.pass) {
      console.error("\n✗ Safety thresholds violated — transaction blocked.");
      console.error("  Adjust amounts or update safety_limits in registry/lp-config.json\n");
      process.exit(1);
    }
    if (checkDryRunRequired("deepenPools", "all")) {
      process.exit(1);
    }
    console.log("  ✅ Pool deepening complete.");
    // Show final balances
    const finalAvax = await ethers.provider.getBalance(signer.address);
    const finalUsdc = await usdcToken.balanceOf(signer.address);
    console.log(`  Final AVAX : ${ethers.formatEther(finalAvax)}`);
    console.log(`  Final USDC : ${ethers.formatUnits(finalUsdc, 6)}`);
  }
  console.log("═══════════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("deepenPools error:", err);
  process.exitCode = 1;
});
