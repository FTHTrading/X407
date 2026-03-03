/**
 * addLiquidity.ts
 * Add liquidity to a UNY LP pool via TraderJoe V1 Router (classic AMM).
 * For direct operator deposits — standard x*y=k full-range liquidity.
 *
 * Safety layers:
 *   - LP_GLOBAL_DISABLE=true → hard kill switch
 *   - Safety thresholds from lp-config.json (max wallet %, max USD, slippage cap)
 *   - Position diff preview on every run
 *   - require_dry_run_first: must DRY_RUN=true before live execution
 *
 * Usage:
 *   npx hardhat run scripts/addLiquidity.ts --network avalanche
 *
 * Environment:
 *   POOL=usdc|wavax          (default: usdc)
 *   AMOUNT_UNY=1000          (UNY tokens to deposit)
 *   AMOUNT_Y=50              (USDC or AVAX to deposit)
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

// ── Config from env ───────────────────────────────────────────────────────────
const POOL       = process.env.POOL?.toLowerCase() === "wavax" ? "wavax" : "usdc";
const AMOUNT_UNY = process.env.AMOUNT_UNY || "1000";
const AMOUNT_Y   = process.env.AMOUNT_Y   || (POOL === "usdc" ? "10" : "1");
const SLIPPAGE   = parseInt(process.env.SLIPPAGE || "100");
const DRY_RUN    = process.env.DRY_RUN !== "false";

// ── TraderJoe V1 Router ───────────────────────────────────────────────────────
const V1_ROUTER_ABI = [
  "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function addLiquidityAVAX(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountAVAXMin, address to, uint256 deadline) external payable returns (uint256 amountToken, uint256 amountAVAX, uint256 liquidity)",
];

const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112, uint112, uint32)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];

const ERC20_ABI = [
  "function approve(address, uint256) returns (bool)",
  "function allowance(address, address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

async function main() {
  // ── Kill switch ──
  checkKillSwitch();

  const [signer] = await ethers.getSigners();

  // Load pool config
  const poolFile = POOL === "wavax"
    ? "avalanche-lfj-uny-wavax.json"
    : "avalanche-lfj-uny-usdc.json";
  const poolConfig = JSON.parse(readFileSync(join(ROOT, "registry/pools", poolFile), "utf8"));

  const routerAddr = poolConfig.v1_router;
  const pairAddr   = poolConfig.pair_address;

  // Identify UNY and quote token from pool config (token order matches on-chain)
  // On-chain: USDC pool → token0=USDC, token1=UNY
  //           WAVAX pool → token0=WAVAX, token1=UNY
  const unyIsToken1 = poolConfig.token1.symbol === "UNY";
  const unyAddr     = unyIsToken1 ? poolConfig.token1.address : poolConfig.token0.address;
  const quoteAddr   = unyIsToken1 ? poolConfig.token0.address : poolConfig.token1.address;
  const decUNY      = unyIsToken1 ? poolConfig.token1.decimals : poolConfig.token0.decimals;
  const decQuote    = unyIsToken1 ? poolConfig.token0.decimals : poolConfig.token1.decimals;
  const quoteSym    = POOL.toUpperCase();

  console.log("\n💧  Add Liquidity to UNY Pool (V1 Classic AMM)");
  console.log(`    Pool     : UNY/${quoteSym}`);
  console.log(`    Pair     : ${pairAddr}`);
  console.log(`    Router   : ${routerAddr}`);
  console.log(`    Signer   : ${signer.address}`);
  console.log(`    Amount   : ${AMOUNT_UNY} UNY + ${AMOUNT_Y} ${quoteSym}`);
  console.log(`    Slippage : ${SLIPPAGE} bps (${SLIPPAGE / 100}%)`);
  console.log(`    Mode     : ${DRY_RUN ? "DRY RUN" : "⚡ LIVE"}\n`);

  // Read pair state
  const pair = new ethers.Contract(pairAddr, PAIR_ABI, signer);
  const [reserve0, reserve1, lastTs] = await pair.getReserves();
  const lpTotalSupply = await pair.totalSupply();
  const lpBalance = await pair.balanceOf(signer.address);

  const dec0 = poolConfig.token0.decimals;
  const dec1 = poolConfig.token1.decimals;
  const r0 = Number(ethers.formatUnits(reserve0, dec0));
  const r1 = Number(ethers.formatUnits(reserve1, dec1));
  const unyPrice = unyIsToken1 ? (r1 > 0 ? r0 / r1 : 0) : (r0 > 0 ? r1 / r0 : 0);

  console.log(`    Reserve0 : ${ethers.formatUnits(reserve0, dec0)} ${poolConfig.token0.symbol}`);
  console.log(`    Reserve1 : ${ethers.formatUnits(reserve1, dec1)} ${poolConfig.token1.symbol}`);
  console.log(`    Price    : 1 UNY ≈ ${unyPrice.toFixed(8)} ${quoteSym}`);
  console.log(`    LP Supply: ${ethers.formatEther(lpTotalSupply)}`);
  console.log(`    Your LP  : ${ethers.formatEther(lpBalance)}`);

  // Check balances
  const unyToken = new ethers.Contract(unyAddr, ERC20_ABI, signer);
  const unyBal   = await unyToken.balanceOf(signer.address);
  const amtUNY   = ethers.parseUnits(AMOUNT_UNY, decUNY);

  if (unyBal < amtUNY) {
    console.error(`\n✗ Insufficient UNY: have ${ethers.formatUnits(unyBal, decUNY)}, need ${AMOUNT_UNY}`);
    process.exit(1);
  }

  let amtQuote: bigint;
  let quoteBal: bigint;
  if (POOL === "wavax") {
    quoteBal = await ethers.provider.getBalance(signer.address);
    amtQuote = ethers.parseUnits(AMOUNT_Y, 18);
    if (quoteBal < amtQuote) {
      console.error(`\n✗ Insufficient AVAX: have ${ethers.formatEther(quoteBal)}, need ${AMOUNT_Y}`);
      process.exit(1);
    }
  } else {
    const quoteToken = new ethers.Contract(quoteAddr, ERC20_ABI, signer);
    quoteBal = await quoteToken.balanceOf(signer.address);
    amtQuote = ethers.parseUnits(AMOUNT_Y, decQuote);
    if (quoteBal < amtQuote) {
      console.error(`\n✗ Insufficient ${quoteSym}: have ${ethers.formatUnits(quoteBal, decQuote)}, need ${AMOUNT_Y}`);
      process.exit(1);
    }
  }

  // Min amounts (slippage)
  const amtUNYMin   = amtUNY * BigInt(10000 - SLIPPAGE) / 10000n;
  const amtQuoteMin = amtQuote * BigInt(10000 - SLIPPAGE) / 10000n;

  console.log(`\n    Min UNY  : ${ethers.formatUnits(amtUNYMin, decUNY)}`);
  console.log(`    Min ${quoteSym.padEnd(5)}: ${ethers.formatUnits(amtQuoteMin, decQuote)}`);

  // ── Safety thresholds ──
  const safetyResult = await enforceSafetyThresholds({
    slippageBps: SLIPPAGE,
    amtX: amtUNY,
    amtY: amtQuote,
    balX: unyBal,
    balY: quoteBal,
    decX: decUNY,
    decY: decQuote,
    symX: "UNY",
    symY: quoteSym,
    priceX_usd: undefined,
    priceY_usd: POOL === "usdc" ? 1.0 : undefined,
    isDryRun: DRY_RUN,
  });

  // ── Position diff preview ──
  const avaxBal = await ethers.provider.getBalance(signer.address);
  printPositionDiffV1({
    action:  "add",
    symUNY:  "UNY",
    symQuote: quoteSym,
    decUNY,
    decQuote,
    balUNY:   unyBal,
    balQuote: quoteBal,
    amtUNY,
    amtQuote,
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
    markDryRunComplete("addLiquidity", POOL);
    console.log("\n🔍  DRY RUN — no transactions sent");
    console.log("    Would approve UNY for V1 Router");
    if (POOL !== "wavax") console.log(`    Would approve ${quoteSym} for V1 Router`);
    console.log(`    Would call addLiquidity${POOL === "wavax" ? "AVAX" : ""}`);
    console.log(`    Depositing ${AMOUNT_UNY} UNY + ${AMOUNT_Y} ${quoteSym} (full-range V1 AMM)`);
    console.log("\n    Re-run with DRY_RUN=false to execute.\n");
    return;
  }

  // ── Live execution guards ──
  if (!safetyResult.pass) {
    console.error("\n✗ Safety thresholds violated — transaction blocked.");
    console.error("  Adjust amounts or update safety_limits in registry/lp-config.json\n");
    process.exit(1);
  }

  if (checkDryRunRequired("addLiquidity", POOL)) {
    process.exit(1);
  }

  // Approve UNY
  console.log("\n    Approving UNY...");
  const approveTx = await unyToken.approve(routerAddr, amtUNY);
  await approveTx.wait();
  console.log(`    ✓ UNY approved (tx: ${approveTx.hash})`);

  const router = new ethers.Contract(routerAddr, V1_ROUTER_ABI, signer);
  const deadline = Math.floor(Date.now() / 1000) + 300;

  let tx;
  if (POOL === "wavax") {
    // addLiquidityAVAX — UNY is the token, AVAX sent as msg.value
    console.log("\n    Adding liquidity (UNY/AVAX via V1 Router)...");
    tx = await router.addLiquidityAVAX(
      unyAddr,          // token
      amtUNY,           // amountTokenDesired
      amtUNYMin,        // amountTokenMin
      amtQuoteMin,      // amountAVAXMin
      signer.address,   // to
      deadline,         // deadline
      { value: amtQuote }
    );
  } else {
    // Approve quote token
    const quoteToken = new ethers.Contract(quoteAddr, ERC20_ABI, signer);
    console.log(`    Approving ${quoteSym}...`);
    const appTx = await quoteToken.approve(routerAddr, amtQuote);
    await appTx.wait();
    console.log(`    ✓ ${quoteSym} approved (tx: ${appTx.hash})`);

    console.log("\n    Adding liquidity (UNY/USDC via V1 Router)...");
    tx = await router.addLiquidity(
      unyAddr,          // tokenA
      quoteAddr,        // tokenB
      amtUNY,           // amountADesired
      amtQuote,         // amountBDesired
      amtUNYMin,        // amountAMin
      amtQuoteMin,      // amountBMin
      signer.address,   // to
      deadline          // deadline
    );
  }

  const receipt = await tx.wait();
  console.log(`\n✅  Liquidity added! (V1 Classic AMM)`);
  console.log(`    TX   : ${tx.hash}`);
  console.log(`    Block: ${receipt.blockNumber}`);
  console.log(`    Gas  : ${receipt.gasUsed.toString()}`);

  // Show new LP balance
  const lpAfter = await pair.balanceOf(signer.address);
  const lpGained = lpAfter - lpBalance;
  console.log(`    LP tokens received: ${ethers.formatEther(lpGained)}`);
  console.log(`    Total LP balance  : ${ethers.formatEther(lpAfter)}\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
