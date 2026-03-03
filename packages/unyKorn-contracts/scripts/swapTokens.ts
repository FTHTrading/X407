/**
 * swapTokens.ts
 * Execute token swaps on TraderJoe V1 Router to create trading activity.
 *
 * Supports:
 *   - UNY → USDC / USDC → UNY
 *   - UNY → WAVAX / WAVAX → UNY (native AVAX)
 *   - Multi-swap mode: executes N buy/sell pairs to generate volume
 *
 * Safety layers:
 *   - LP_GLOBAL_DISABLE=true → hard kill switch
 *   - Slippage cap from lp-config.json
 *   - DRY_RUN=true (default) — preview only, no txns
 *
 * Usage:
 *   npx hardhat run scripts/swapTokens.ts --network avalanche
 *
 * Environment:
 *   POOL=usdc|wavax              (default: usdc)
 *   DIRECTION=buy|sell|round     (buy=quote→UNY, sell=UNY→quote, round=both)
 *   AMOUNT=100                   (amount of INPUT token to swap)
 *   SLIPPAGE=200                 (bps, default: 200 = 2%)
 *   ROUNDS=1                    (for round-trip mode: number of buy+sell pairs)
 *   DRY_RUN=true|false          (default: true)
 *   LP_GLOBAL_DISABLE=true      (emergency kill switch)
 */

import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { resolve, join } from "path";
import { checkKillSwitch } from "./lp-safety";

const ROOT = resolve(__dirname, "../../..");

// ── Config ────────────────────────────────────────────────────────────────────
const POOL      = process.env.POOL?.toLowerCase() === "wavax" ? "wavax" : "usdc";
const DIRECTION = (process.env.DIRECTION?.toLowerCase() || "round") as "buy" | "sell" | "round";
const AMOUNT    = process.env.AMOUNT || (POOL === "usdc" ? "1" : "0.05");
const SLIPPAGE  = parseInt(process.env.SLIPPAGE || "200");
const ROUNDS    = parseInt(process.env.ROUNDS || "1");
const DRY_RUN   = process.env.DRY_RUN !== "false";

// ── ABIs ──────────────────────────────────────────────────────────────────────
const V1_ROUTER_ABI = [
  // Swap exact tokens for tokens
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
  // Swap exact AVAX for tokens
  "function swapExactAVAXForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)",
  // Swap exact tokens for AVAX
  "function swapExactTokensForAVAX(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
  // Get expected output amounts
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)",
];

const PAIR_ABI = [
  "function getReserves() view returns (uint112, uint112, uint32)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

const ERC20_ABI = [
  "function approve(address, uint256) returns (bool)",
  "function allowance(address, address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function applySlippage(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10000 - slippageBps)) / 10000n;
}

function fmtAmount(val: bigint, decimals: number): string {
  return Number(ethers.formatUnits(val, decimals)).toFixed(decimals > 8 ? 8 : decimals);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  checkKillSwitch();

  const [signer] = await ethers.getSigners();

  // Load pool config
  const poolFile = POOL === "wavax"
    ? "avalanche-lfj-uny-wavax.json"
    : "avalanche-lfj-uny-usdc.json";
  const poolConfig = JSON.parse(readFileSync(join(ROOT, "registry/pools", poolFile), "utf8"));

  const routerAddr = poolConfig.v1_router;
  const pairAddr   = poolConfig.pair_address;
  const isNative   = POOL === "wavax";

  // Token addresses
  const unyIsToken1 = poolConfig.token1.symbol === "UNY";
  const unyAddr   = unyIsToken1 ? poolConfig.token1.address : poolConfig.token0.address;
  const quoteAddr = unyIsToken1 ? poolConfig.token0.address : poolConfig.token1.address;
  const decUNY    = unyIsToken1 ? poolConfig.token1.decimals : poolConfig.token0.decimals;
  const decQuote  = unyIsToken1 ? poolConfig.token0.decimals : poolConfig.token1.decimals;
  const quoteSym  = POOL.toUpperCase() === "WAVAX" ? "AVAX" : "USDC";

  const router = new ethers.Contract(routerAddr, V1_ROUTER_ABI, signer);
  const pair   = new ethers.Contract(pairAddr, PAIR_ABI, signer);
  const unyToken   = new ethers.Contract(unyAddr, ERC20_ABI, signer);
  const quoteToken = isNative ? null : new ethers.Contract(quoteAddr, ERC20_ABI, signer);

  // Current balances
  const balUNY   = await unyToken.balanceOf(signer.address);
  const balQuote = isNative
    ? await ethers.provider.getBalance(signer.address)
    : await quoteToken!.balanceOf(signer.address);
  const balAVAX  = await ethers.provider.getBalance(signer.address);

  // Current reserves & price
  const [r0, r1] = await pair.getReserves();
  const resQuote = unyIsToken1 ? r0 : r1;
  const resUNY   = unyIsToken1 ? r1 : r0;
  const price = Number(ethers.formatUnits(resQuote, decQuote)) /
                Number(ethers.formatUnits(resUNY, decUNY));

  console.log("\n🔄  UNY Swap (TraderJoe V1 Router)");
  console.log("    ─────────────────────────────────────────────");
  console.log(`    Pool       : UNY/${quoteSym}`);
  console.log(`    Pair       : ${pairAddr}`);
  console.log(`    Router     : ${routerAddr}`);
  console.log(`    Signer     : ${signer.address}`);
  console.log(`    Direction  : ${DIRECTION}`);
  console.log(`    Amount In  : ${AMOUNT} ${DIRECTION === "sell" ? "UNY" : quoteSym}`);
  console.log(`    Slippage   : ${SLIPPAGE} bps (${SLIPPAGE / 100}%)`);
  console.log(`    Rounds     : ${ROUNDS}`);
  console.log(`    Mode       : ${DRY_RUN ? "DRY RUN 🏜️" : "⚡ LIVE"}`);
  console.log("    ─────────────────────────────────────────────");
  console.log(`    UNY Price  : ${price.toFixed(8)} ${quoteSym}`);
  console.log(`    Reserve ${quoteSym.padEnd(5)}: ${fmtAmount(resQuote, decQuote)}`);
  console.log(`    Reserve UNY  : ${fmtAmount(resUNY, decUNY)}`);
  console.log(`    Wallet UNY   : ${fmtAmount(balUNY, decUNY)}`);
  console.log(`    Wallet ${quoteSym.padEnd(5)}: ${fmtAmount(balQuote, decQuote)}`);
  console.log(`    Wallet AVAX  : ${ethers.formatEther(balAVAX)}`);
  console.log();

  // ── Build swap list ─────────────────────────────────────────────────────────
  const swaps: { dir: "buy" | "sell"; label: string }[] = [];

  if (DIRECTION === "round") {
    for (let i = 0; i < ROUNDS; i++) {
      swaps.push({ dir: "sell", label: `Round ${i + 1} — Sell UNY → ${quoteSym}` });
      swaps.push({ dir: "buy",  label: `Round ${i + 1} — Buy  ${quoteSym} → UNY` });
    }
  } else {
    for (let i = 0; i < ROUNDS; i++) {
      swaps.push({
        dir: DIRECTION,
        label: DIRECTION === "buy"
          ? `Buy UNY with ${AMOUNT} ${quoteSym}`
          : `Sell ${AMOUNT} UNY for ${quoteSym}`
      });
    }
  }

  // ── Execute swaps ───────────────────────────────────────────────────────────
  let totalGasUsed = 0n;
  let swapCount = 0;

  for (const swap of swaps) {
    swapCount++;
    console.log(`  ── Swap ${swapCount}/${swaps.length}: ${swap.label} ──`);

    const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 minutes

    if (swap.dir === "sell") {
      // ── SELL: UNY → quote token ──────────────────────────────────────────
      const amountIn = ethers.parseUnits(AMOUNT, decUNY);

      // Check balance
      const currentBal = await unyToken.balanceOf(signer.address);
      if (currentBal < amountIn) {
        console.log(`    ✗ Insufficient UNY: have ${fmtAmount(currentBal, decUNY)}, need ${AMOUNT}`);
        continue;
      }

      // Get expected output
      const path = isNative ? [unyAddr, quoteAddr] : [unyAddr, quoteAddr];
      const amountsOut = await router.getAmountsOut(amountIn, path);
      const expectedOut = amountsOut[1];
      const minOut = applySlippage(expectedOut, SLIPPAGE);

      console.log(`    Input  : ${fmtAmount(amountIn, decUNY)} UNY`);
      console.log(`    Output : ~${fmtAmount(expectedOut, decQuote)} ${quoteSym}`);
      console.log(`    Min out: ${fmtAmount(minOut, decQuote)} ${quoteSym} (after ${SLIPPAGE}bp slippage)`);

      if (DRY_RUN) {
        console.log(`    ⏸️  DRY RUN — skipping execution\n`);
        continue;
      }

      // Approve router to spend UNY
      const allowance = await unyToken.allowance(signer.address, routerAddr);
      if (allowance < amountIn) {
        console.log(`    Approving router to spend UNY...`);
        const approveTx = await unyToken.approve(routerAddr, ethers.MaxUint256);
        await approveTx.wait();
        console.log(`    ✓ Approved`);
      }

      // Execute swap
      let tx;
      if (isNative) {
        tx = await router.swapExactTokensForAVAX(
          amountIn, minOut, path, signer.address, deadline
        );
      } else {
        tx = await router.swapExactTokensForTokens(
          amountIn, minOut, path, signer.address, deadline
        );
      }

      const receipt = await tx.wait();
      totalGasUsed += receipt!.gasUsed;
      console.log(`    ✓ Tx: ${receipt!.hash}`);
      console.log(`    ✓ Gas: ${receipt!.gasUsed.toString()}\n`);

    } else {
      // ── BUY: quote token → UNY ──────────────────────────────────────────
      const amountIn = ethers.parseUnits(AMOUNT, decQuote);
      const path = [quoteAddr, unyAddr];

      // Get expected output
      const amountsOut = await router.getAmountsOut(amountIn, path);
      const expectedOut = amountsOut[1];
      const minOut = applySlippage(expectedOut, SLIPPAGE);

      console.log(`    Input  : ${fmtAmount(amountIn, decQuote)} ${quoteSym}`);
      console.log(`    Output : ~${fmtAmount(expectedOut, decUNY)} UNY`);
      console.log(`    Min out: ${fmtAmount(minOut, decUNY)} UNY (after ${SLIPPAGE}bp slippage)`);

      if (DRY_RUN) {
        console.log(`    ⏸️  DRY RUN — skipping execution\n`);
        continue;
      }

      if (isNative) {
        // Buy UNY with AVAX
        const currentAVAX = await ethers.provider.getBalance(signer.address);
        if (currentAVAX < amountIn + ethers.parseEther("0.05")) {
          console.log(`    ✗ Insufficient AVAX: have ${ethers.formatEther(currentAVAX)}, need ${AMOUNT} + gas reserve`);
          continue;
        }

        const tx = await router.swapExactAVAXForTokens(
          minOut, path, signer.address, deadline,
          { value: amountIn }
        );
        const receipt = await tx.wait();
        totalGasUsed += receipt!.gasUsed;
        console.log(`    ✓ Tx: ${receipt!.hash}`);
        console.log(`    ✓ Gas: ${receipt!.gasUsed.toString()}\n`);
      } else {
        // Buy UNY with USDC
        const currentBal = await quoteToken!.balanceOf(signer.address);
        if (currentBal < amountIn) {
          console.log(`    ✗ Insufficient ${quoteSym}: have ${fmtAmount(currentBal, decQuote)}, need ${AMOUNT}`);
          continue;
        }

        // Approve router
        const allowance = await quoteToken!.allowance(signer.address, routerAddr);
        if (allowance < amountIn) {
          console.log(`    Approving router to spend ${quoteSym}...`);
          const approveTx = await quoteToken!.approve(routerAddr, ethers.MaxUint256);
          await approveTx.wait();
          console.log(`    ✓ Approved`);
        }

        const tx = await router.swapExactTokensForTokens(
          amountIn, minOut, path, signer.address, deadline
        );
        const receipt = await tx.wait();
        totalGasUsed += receipt!.gasUsed;
        console.log(`    ✓ Tx: ${receipt!.hash}`);
        console.log(`    ✓ Gas: ${receipt!.gasUsed.toString()}\n`);
      }
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log("  ══════════════════════════════════════════════════");
  console.log(`  Swaps executed : ${DRY_RUN ? "0 (dry run)" : `${swapCount}`}`);
  if (!DRY_RUN) {
    console.log(`  Total gas      : ${totalGasUsed.toString()}`);

    // Final balances
    const finalUNY   = await unyToken.balanceOf(signer.address);
    const finalQuote = isNative
      ? await ethers.provider.getBalance(signer.address)
      : await quoteToken!.balanceOf(signer.address);
    const finalAVAX  = await ethers.provider.getBalance(signer.address);

    // New price
    const [newR0, newR1] = await pair.getReserves();
    const newResQuote = unyIsToken1 ? newR0 : newR1;
    const newResUNY   = unyIsToken1 ? newR1 : newR0;
    const newPrice = Number(ethers.formatUnits(newResQuote, decQuote)) /
                     Number(ethers.formatUnits(newResUNY, decUNY));

    console.log(`  ── After swaps ──`);
    console.log(`  UNY balance  : ${fmtAmount(finalUNY, decUNY)}`);
    console.log(`  ${quoteSym} balance : ${fmtAmount(finalQuote, decQuote)}`);
    console.log(`  AVAX balance : ${ethers.formatEther(finalAVAX)}`);
    console.log(`  New UNY price: ${newPrice.toFixed(8)} ${quoteSym}`);
    console.log(`  Price change : ${((newPrice - price) / price * 100).toFixed(4)}%`);
  }
  console.log("  ══════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Swap error:", err);
  process.exitCode = 1;
});
