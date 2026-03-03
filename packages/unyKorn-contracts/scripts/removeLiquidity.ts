/**
 * removeLiquidity.ts
 * Remove liquidity from UNY LP pools on TraderJoe V1 Classic AMM.
 * V1 LP tokens are ERC-20 — approve pair to router, then call removeLiquidity.
 *
 * Safety layers:
 *   - LP_GLOBAL_DISABLE=true → hard kill switch
 *   - Safety thresholds: slippage ceiling
 *   - Position diff preview on every run
 *   - require_dry_run_first enforcement
 *
 * Usage:
 *   npx hardhat run scripts/removeLiquidity.ts --network avalanche
 *
 * Environment:
 *   POOL=usdc|wavax          (default: usdc)
 *   PERCENT=100              (% of LP tokens to remove, default: 100)
 *   SLIPPAGE=100             (basis points, default: 100 = 1%)
 *   DRY_RUN=true|false       (default: true)
 *   LP_GLOBAL_DISABLE=true   (emergency kill switch)
 */

import hre, { ethers } from "hardhat";
import { readFileSync } from "fs";
import { resolve, join } from "path";
import {
  checkKillSwitch,
  enforceSafetyThresholds,
  printPositionDiffV1,
  markDryRunComplete,
  checkDryRunRequired,
} from "./lp-safety";

const ROOT = resolve(__dirname, "../../..");

const POOL      = process.env.POOL?.toLowerCase() === "wavax" ? "wavax" : "usdc";
const PERCENT   = parseInt(process.env.PERCENT || "100");
const SLIPPAGE  = parseInt(process.env.SLIPPAGE || "100");
const DRY_RUN   = process.env.DRY_RUN !== "false";

const V1_ROUTER_ABI = [
  "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)",
  "function removeLiquidityAVAX(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountAVAXMin, address to, uint256 deadline) external returns (uint256 amountToken, uint256 amountAVAX)",
];

const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112, uint112, uint32)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function allowance(address, address) view returns (uint256)",
];

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
];

async function main() {
  // ── Kill switch ──
  checkKillSwitch();

  const [signer] = await ethers.getSigners();

  const poolFile = POOL === "wavax"
    ? "avalanche-lfj-uny-wavax.json"
    : "avalanche-lfj-uny-usdc.json";
  const poolConfig = JSON.parse(readFileSync(join(ROOT, "registry/pools", poolFile), "utf8"));

  const routerAddr = poolConfig.v1_router;
  const pairAddr   = poolConfig.pair_address;

  // Identify tokens (on-chain order matches registry now)
  const unyIsToken1 = poolConfig.token1.symbol === "UNY";
  const unyAddr     = unyIsToken1 ? poolConfig.token1.address : poolConfig.token0.address;
  const quoteAddr   = unyIsToken1 ? poolConfig.token0.address : poolConfig.token1.address;
  const decUNY      = unyIsToken1 ? poolConfig.token1.decimals : poolConfig.token0.decimals;
  const decQuote    = unyIsToken1 ? poolConfig.token0.decimals : poolConfig.token1.decimals;
  const quoteSym    = POOL.toUpperCase();

  console.log("\n🔥  Remove Liquidity from UNY Pool (V1 Classic AMM)");
  console.log(`    Pool     : UNY/${quoteSym}`);
  console.log(`    Pair     : ${pairAddr}`);
  console.log(`    Router   : ${routerAddr}`);
  console.log(`    Signer   : ${signer.address}`);
  console.log(`    Remove   : ${PERCENT}%`);
  console.log(`    Slippage : ${SLIPPAGE} bps`);
  console.log(`    Mode     : ${DRY_RUN ? "DRY RUN" : "⚡ LIVE"}\n`);

  const pair = new ethers.Contract(pairAddr, PAIR_ABI, signer);
  const [reserve0, reserve1, lastTs] = await pair.getReserves();
  const lpTotalSupply = await pair.totalSupply();
  const lpBalance = await pair.balanceOf(signer.address);

  const dec0 = poolConfig.token0.decimals;
  const dec1 = poolConfig.token1.decimals;

  console.log(`    Reserve0 : ${ethers.formatUnits(reserve0, dec0)} ${poolConfig.token0.symbol}`);
  console.log(`    Reserve1 : ${ethers.formatUnits(reserve1, dec1)} ${poolConfig.token1.symbol}`);
  console.log(`    LP Supply: ${ethers.formatEther(lpTotalSupply)}`);
  console.log(`    Your LP  : ${ethers.formatEther(lpBalance)}`);

  if (lpBalance === 0n) {
    console.log("\n    No LP tokens found — nothing to remove.\n");
    return;
  }

  const sharePercent = Number((lpBalance * 10000n) / lpTotalSupply) / 100;
  console.log(`    Pool Share: ${sharePercent.toFixed(4)}%`);

  // Calculate what we'd get back
  const lpToRemove = lpBalance * BigInt(PERCENT) / 100n;
  const estToken0 = (reserve0 * lpToRemove) / lpTotalSupply;
  const estToken1 = (reserve1 * lpToRemove) / lpTotalSupply;

  // Map back to UNY / quote
  const estUNY   = unyIsToken1 ? estToken1 : estToken0;
  const estQuote = unyIsToken1 ? estToken0 : estToken1;

  const minUNY   = estUNY * BigInt(10000 - SLIPPAGE) / 10000n;
  const minQuote = estQuote * BigInt(10000 - SLIPPAGE) / 10000n;

  console.log(`\n    Removing ${PERCENT}% (${ethers.formatEther(lpToRemove)} LP tokens):`);
  console.log(`    Expected : ~${ethers.formatUnits(estUNY, decUNY)} UNY + ~${ethers.formatUnits(estQuote, decQuote)} ${quoteSym}`);
  console.log(`    Min out  : ~${ethers.formatUnits(minUNY, decUNY)} UNY + ~${ethers.formatUnits(minQuote, decQuote)} ${quoteSym}`);

  // ── Safety thresholds ──
  const unyToken = new ethers.Contract(unyAddr, ERC20_ABI, signer);
  const unyWalletBal = await unyToken.balanceOf(signer.address);
  const quoteWalletBal = POOL === "wavax"
    ? await ethers.provider.getBalance(signer.address)
    : await (new ethers.Contract(quoteAddr, ERC20_ABI, signer)).balanceOf(signer.address);

  const safetyResult = await enforceSafetyThresholds({
    slippageBps: SLIPPAGE,
    amtX: estUNY,
    amtY: estQuote,
    balX: unyWalletBal,
    balY: quoteWalletBal,
    decX: decUNY,
    decY: decQuote,
    symX: "UNY",
    symY: quoteSym,
    isDryRun: DRY_RUN,
  });

  // ── Position diff preview ──
  const avaxBal = await ethers.provider.getBalance(signer.address);
  printPositionDiffV1({
    action:   "remove",
    symUNY:   "UNY",
    symQuote: quoteSym,
    decUNY,
    decQuote,
    balUNY:   unyWalletBal,
    balQuote: quoteWalletBal,
    amtUNY:   estUNY,
    amtQuote: estQuote,
    avaxBal,
    isNative: POOL === "wavax",
    lpBefore: lpBalance,
    lpSupply: lpTotalSupply,
    reserve0,
    reserve1,
    dec0,
    dec1,
    priceY_usd: POOL === "usdc" ? 1.0 : undefined,
  });

  if (DRY_RUN) {
    markDryRunComplete("removeLiquidity", POOL);
    console.log("\n🔍  DRY RUN — no transactions sent");
    console.log("    Would approve LP tokens for V1 Router");
    console.log(`    Would call removeLiquidity${POOL === "wavax" ? "AVAX" : ""}`);
    console.log("\n    Re-run with DRY_RUN=false to execute.\n");
    return;
  }

  // ── Live execution guards ──
  if (!safetyResult.pass) {
    console.error("\n✗ Safety thresholds violated — transaction blocked.");
    console.error("  Adjust amounts or update safety_limits in registry/lp-config.json\n");
    process.exit(1);
  }

  if (checkDryRunRequired("removeLiquidity", POOL)) {
    process.exit(1);
  }

  // Approve LP tokens to router
  console.log("\n    Approving LP tokens for Router...");
  const appTx = await pair.approve(routerAddr, lpToRemove);
  await appTx.wait();
  console.log(`    ✓ LP tokens approved (tx: ${appTx.hash})`);

  const router = new ethers.Contract(routerAddr, V1_ROUTER_ABI, signer);
  const deadline = Math.floor(Date.now() / 1000) + 300;

  console.log("\n    Removing liquidity...");
  let tx;
  if (POOL === "wavax") {
    // removeLiquidityAVAX — UNY is the token, receive native AVAX
    tx = await router.removeLiquidityAVAX(
      unyAddr,         // token (non-AVAX)
      lpToRemove,      // liquidity
      minUNY,          // amountTokenMin
      minQuote,        // amountAVAXMin
      signer.address,  // to
      deadline         // deadline
    );
  } else {
    tx = await router.removeLiquidity(
      unyAddr,         // tokenA
      quoteAddr,       // tokenB
      lpToRemove,      // liquidity
      minUNY,          // amountAMin
      minQuote,        // amountBMin
      signer.address,  // to
      deadline         // deadline
    );
  }

  const receipt = await tx.wait();
  console.log(`\n✅  Liquidity removed! (V1 Classic AMM)`);
  console.log(`    TX   : ${tx.hash}`);
  console.log(`    Block: ${receipt.blockNumber}`);
  console.log(`    Gas  : ${receipt.gasUsed.toString()}`);

  // Show new balances
  const unyAfter = await unyToken.balanceOf(signer.address);
  const lpAfter = await pair.balanceOf(signer.address);
  console.log(`    UNY balance  : ${ethers.formatUnits(unyAfter, decUNY)}`);
  console.log(`    LP remaining : ${ethers.formatEther(lpAfter)}\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
