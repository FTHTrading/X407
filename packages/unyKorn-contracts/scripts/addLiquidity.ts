/**
 * addLiquidity.ts
 * Interactive script to add liquidity to a UNY LP pool via the LB Router directly.
 * For use BEFORE deploying UnyKornLPManager, or for direct operator deposits.
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
 *   BINS=5                   (number of bins to spread across, default: 5)
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
  printPositionDiff,
  markDryRunComplete,
  checkDryRunRequired,
} from "./lp-safety";

const ROOT = resolve(__dirname, "../../..");

// ── Config from env ───────────────────────────────────────────────────────────
const POOL       = process.env.POOL?.toLowerCase() === "wavax" ? "wavax" : "usdc";
const AMOUNT_UNY = process.env.AMOUNT_UNY || "1000";
const AMOUNT_Y   = process.env.AMOUNT_Y   || (POOL === "usdc" ? "10" : "1");
const NUM_BINS   = parseInt(process.env.BINS || "5");
const SLIPPAGE   = parseInt(process.env.SLIPPAGE || "100");
const DRY_RUN    = process.env.DRY_RUN !== "false";

// ── TraderJoe LB Router V2.1 ─────────────────────────────────────────────────
const LB_ROUTER = "0xb4315e873dBcf96Ffd0acd8EA43f689D8c20fB30";

const ROUTER_ABI = [
  "function addLiquidity((address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,int256[],uint256[],uint256[],address,address,uint256)) external returns (uint256,uint256,uint256,uint256,uint256[],uint256[])",
  "function addLiquidityNATIVE((address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,int256[],uint256[],uint256[],address,address,uint256)) external payable returns (uint256,uint256,uint256,uint256,uint256[],uint256[])",
];

const PAIR_ABI = [
  "function getActiveId() view returns (uint24)",
  "function getBinStep() view returns (uint16)",
  "function getReserves() view returns (uint128, uint128)",
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

  const unyAddr    = poolConfig.token0.address;
  const tokenYAddr = poolConfig.token1.address;
  const pairAddr   = poolConfig.pair_address;
  const decX       = poolConfig.token0.decimals;
  const decY       = poolConfig.token1.decimals;

  console.log("\n💧  Add Liquidity to UNY Pool");
  console.log(`    Pool     : UNY/${POOL.toUpperCase()}`);
  console.log(`    Pair     : ${pairAddr}`);
  console.log(`    Signer   : ${signer.address}`);
  console.log(`    Amount X : ${AMOUNT_UNY} UNY`);
  console.log(`    Amount Y : ${AMOUNT_Y} ${POOL.toUpperCase()}`);
  console.log(`    Bins     : ${NUM_BINS}`);
  console.log(`    Slippage : ${SLIPPAGE} bps (${SLIPPAGE / 100}%)`);
  console.log(`    Mode     : ${DRY_RUN ? "DRY RUN" : "⚡ LIVE"}\n`);

  // Read pair state
  const pair = new ethers.Contract(pairAddr, PAIR_ABI, signer);
  const activeId = Number(await pair.getActiveId());
  const binStep  = Number(await pair.getBinStep());
  const [resX, resY] = await pair.getReserves();

  console.log(`    Active ID: ${activeId}`);
  console.log(`    Bin Step : ${binStep}`);
  console.log(`    Reserves : ${ethers.formatUnits(resX, decX)} UNY / ${ethers.formatUnits(resY, decY)} ${POOL.toUpperCase()}`);

  // Check balances
  const unyToken = new ethers.Contract(unyAddr, ERC20_ABI, signer);
  const unyBal   = await unyToken.balanceOf(signer.address);
  const amtX     = ethers.parseUnits(AMOUNT_UNY, decX);

  if (unyBal < amtX) {
    console.error(`\n✗ Insufficient UNY: have ${ethers.formatUnits(unyBal, decX)}, need ${AMOUNT_UNY}`);
    process.exit(1);
  }

  let amtY: bigint;
  if (POOL === "wavax") {
    const avaxBal = await ethers.provider.getBalance(signer.address);
    amtY = ethers.parseUnits(AMOUNT_Y, 18);
    if (avaxBal < amtY) {
      console.error(`\n✗ Insufficient AVAX: have ${ethers.formatEther(avaxBal)}, need ${AMOUNT_Y}`);
      process.exit(1);
    }
  } else {
    const yToken = new ethers.Contract(tokenYAddr, ERC20_ABI, signer);
    const yBal   = await yToken.balanceOf(signer.address);
    amtY = ethers.parseUnits(AMOUNT_Y, decY);
    if (yBal < amtY) {
      console.error(`\n✗ Insufficient ${POOL.toUpperCase()}: have ${ethers.formatUnits(yBal, decY)}, need ${AMOUNT_Y}`);
      process.exit(1);
    }
  }

  // Build bin distribution — spread evenly around active bin
  const halfBins = Math.floor(NUM_BINS / 2);
  const deltaIds: number[] = [];
  const distX: bigint[]    = [];
  const distY: bigint[]    = [];

  const oneShare = ethers.parseEther("1") / BigInt(NUM_BINS);

  for (let i = -halfBins; i <= halfBins; i++) {
    deltaIds.push(i);
    // X tokens go to bins above active price, Y tokens below
    distX.push(i >= 0 ? oneShare : 0n);
    distY.push(i <= 0 ? oneShare : 0n);
  }

  console.log(`\n    Bins    : ${deltaIds.map(d => `${d >= 0 ? "+" : ""}${d}`).join(", ")}`);
  console.log(`    Bin IDs : ${deltaIds.map(d => activeId + d).join(", ")}`);

  // ── Safety thresholds ──
  const yBal = POOL === "wavax"
    ? await ethers.provider.getBalance(signer.address)
    : await (new ethers.Contract(tokenYAddr, ERC20_ABI, signer)).balanceOf(signer.address);

  const safetyResult = await enforceSafetyThresholds({
    slippageBps: SLIPPAGE,
    amtX: amtX,
    amtY: amtY,
    balX: unyBal,
    balY: yBal,
    decX,
    decY,
    symX: "UNY",
    symY: POOL.toUpperCase(),
    priceX_usd: undefined,  // set if you have a price feed
    priceY_usd: POOL === "usdc" ? 1.0 : undefined,
    isDryRun: DRY_RUN,
  });

  // ── Position diff preview ──
  const avaxBal = await ethers.provider.getBalance(signer.address);
  printPositionDiff({
    action:      "add",
    symX:        "UNY",
    symY:        POOL.toUpperCase(),
    decX,
    decY,
    balX:        unyBal,
    balY:        yBal,
    amtX,
    amtY,
    avaxBal,
    isNative:    POOL === "wavax",
    numBins:     NUM_BINS,
    binStep,
    priceX_usd:  undefined,
    priceY_usd:  POOL === "usdc" ? 1.0 : undefined,
  });

  if (DRY_RUN) {
    markDryRunComplete("addLiquidity", POOL);
    console.log("\n🔍  DRY RUN — no transactions sent");
    console.log("    Would approve UNY for LB Router");
    if (POOL !== "wavax") console.log(`    Would approve ${POOL.toUpperCase()} for LB Router`);
    console.log("    Would call addLiquidity" + (POOL === "wavax" ? "NATIVE" : ""));
    console.log(`    Depositing ${AMOUNT_UNY} UNY + ${AMOUNT_Y} ${POOL.toUpperCase()} across ${NUM_BINS} bins`);
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

  // Approve tokens
  console.log("\n    Approving UNY...");
  const approveTx = await unyToken.approve(LB_ROUTER, amtX);
  await approveTx.wait();
  console.log(`    ✓ UNY approved (tx: ${approveTx.hash})`);

  if (POOL !== "wavax") {
    const yToken = new ethers.Contract(tokenYAddr, ERC20_ABI, signer);
    console.log(`    Approving ${POOL.toUpperCase()}...`);
    const appTx = await yToken.approve(LB_ROUTER, amtY);
    await appTx.wait();
    console.log(`    ✓ ${POOL.toUpperCase()} approved (tx: ${appTx.hash})`);
  }

  // Build params tuple
  const params = [
    unyAddr,                                       // tokenX
    tokenYAddr,                                    // tokenY
    binStep,                                       // binStep
    amtX,                                          // amountX
    amtY,                                          // amountY
    amtX * BigInt(10000 - SLIPPAGE) / 10000n,      // amountXMin
    amtY * BigInt(10000 - SLIPPAGE) / 10000n,      // amountYMin
    activeId,                                      // activeIdDesired
    5,                                             // idSlippage
    deltaIds,                                      // deltaIds
    distX,                                         // distributionX
    distY,                                         // distributionY
    signer.address,                                // to
    signer.address,                                // refundTo
    Math.floor(Date.now() / 1000) + 300,           // deadline
  ];

  const router = new ethers.Contract(LB_ROUTER, ROUTER_ABI, signer);

  console.log("\n    Adding liquidity...");
  let tx;
  if (POOL === "wavax") {
    tx = await router.addLiquidityNATIVE(params, { value: amtY });
  } else {
    tx = await router.addLiquidity(params);
  }
  const receipt = await tx.wait();
  console.log(`\n✅  Liquidity added!`);
  console.log(`    TX   : ${tx.hash}`);
  console.log(`    Block: ${receipt.blockNumber}`);
  console.log(`    Gas  : ${receipt.gasUsed.toString()}\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
