/**
 * removeLiquidity.ts
 * Script to remove liquidity from UNY LP pools on TraderJoe LFJ V2.1.
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
 *   PERCENT=100              (% of position to remove, default: 100)
 *   BIN_IDS=8388608,8388609  (comma-separated specific bins, or empty for all)
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

const POOL      = process.env.POOL?.toLowerCase() === "wavax" ? "wavax" : "usdc";
const PERCENT   = parseInt(process.env.PERCENT || "100");
const SLIPPAGE  = parseInt(process.env.SLIPPAGE || "100");
const DRY_RUN   = process.env.DRY_RUN !== "false";
const BIN_IDS   = process.env.BIN_IDS
  ? process.env.BIN_IDS.split(",").map(Number)
  : [];

const LB_ROUTER = "0xb4315e873dBcf96Ffd0acd8EA43f689D8c20fB30";

const ROUTER_ABI = [
  "function removeLiquidity(address tokenX, address tokenY, uint16 binStep, uint256 amountXMin, uint256 amountYMin, uint256[] ids, uint256[] amounts, address to, uint256 deadline) external returns (uint256, uint256)",
  "function removeLiquidityNATIVE(address token, uint16 binStep, uint256 amountTokenMin, uint256 amountNATIVEMin, uint256[] ids, uint256[] amounts, address to, uint256 deadline) external returns (uint256, uint256)",
];

const PAIR_ABI = [
  "function getActiveId() view returns (uint24)",
  "function getBinStep() view returns (uint16)",
  "function getReserves() view returns (uint128, uint128)",
  "function balanceOf(address, uint256) view returns (uint256)",
  "function totalSupply(uint256) view returns (uint256)",
  "function getBin(uint24) view returns (uint128, uint128)",
  "function approveForAll(address, bool) returns (bool)",
  "function isApprovedForAll(address, address) view returns (bool)",
];

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

async function main() {
  // ── Kill switch ──
  checkKillSwitch();

  const [signer] = await ethers.getSigners();

  const poolFile = POOL === "wavax"
    ? "avalanche-lfj-uny-wavax.json"
    : "avalanche-lfj-uny-usdc.json";
  const poolConfig = JSON.parse(readFileSync(join(ROOT, "registry/pools", poolFile), "utf8"));

  const unyAddr    = poolConfig.token0.address;
  const tokenYAddr = poolConfig.token1.address;
  const pairAddr   = poolConfig.pair_address;
  const decX       = poolConfig.token0.decimals;
  const decY       = poolConfig.token1.decimals;

  console.log("\n🔥  Remove Liquidity from UNY Pool");
  console.log(`    Pool     : UNY/${POOL.toUpperCase()}`);
  console.log(`    Pair     : ${pairAddr}`);
  console.log(`    Signer   : ${signer.address}`);
  console.log(`    Remove   : ${PERCENT}%`);
  console.log(`    Slippage : ${SLIPPAGE} bps`);
  console.log(`    Mode     : ${DRY_RUN ? "DRY RUN" : "⚡ LIVE"}\n`);

  const pair = new ethers.Contract(pairAddr, PAIR_ABI, signer);
  const activeId = Number(await pair.getActiveId());
  const binStep  = Number(await pair.getBinStep());

  console.log(`    Active ID: ${activeId}`);
  console.log(`    Bin Step : ${binStep}`);

  // Scan for bins where signer has liquidity
  const scanRange = 50;
  const startId   = activeId - scanRange;
  const endId     = activeId + scanRange;

  console.log(`\n    Scanning bins ${startId} – ${endId} for positions...`);

  const positionBins: { id: number; balance: bigint; supply: bigint; resX: bigint; resY: bigint }[] = [];

  for (let id = startId; id <= endId; id++) {
    const balance = await pair.balanceOf(signer.address, id);
    if (balance > 0n) {
      const supply = await pair.totalSupply(id);
      const [bResX, bResY] = await pair.getBin(id);
      positionBins.push({ id, balance, supply, resX: bResX, resY: bResY });
    }
  }

  if (positionBins.length === 0) {
    console.log("    No LP positions found in scanned range.\n");
    return;
  }

  console.log(`\n    Found ${positionBins.length} bins with liquidity:\n`);
  console.log("    Bin ID    | LP Balance        | Share %   | UNY Reserve        | Y Reserve");
  console.log("    ──────────┼───────────────────┼───────────┼────────────────────┼──────────────────");

  let totalShareX = 0n;
  let totalShareY = 0n;

  for (const pos of positionBins) {
    const sharePercent = (pos.balance * 10000n) / pos.supply;
    const myResX = (pos.resX * pos.balance) / pos.supply;
    const myResY = (pos.resY * pos.balance) / pos.supply;
    totalShareX += myResX;
    totalShareY += myResY;

    const selected = BIN_IDS.length === 0 || BIN_IDS.includes(pos.id);
    const marker   = selected ? "  ✓" : "   ";

    console.log(
      `${marker} ${pos.id.toString().padStart(8)} | ` +
      `${ethers.formatEther(pos.balance).padStart(17)} | ` +
      `${(Number(sharePercent) / 100).toFixed(2).padStart(7)}% | ` +
      `${ethers.formatUnits(myResX, decX).padStart(18)} | ` +
      `${ethers.formatUnits(myResY, decY).padStart(16)}`
    );
  }

  console.log(`\n    Total value: ~${ethers.formatUnits(totalShareX, decX)} UNY + ~${ethers.formatUnits(totalShareY, decY)} ${POOL.toUpperCase()}`);

  // Filter to selected bins
  const targetBins = BIN_IDS.length > 0
    ? positionBins.filter(p => BIN_IDS.includes(p.id))
    : positionBins;

  if (targetBins.length === 0) {
    console.log("    No matching bins to remove.\n");
    return;
  }

  // Build removal arrays
  const ids:     bigint[] = [];
  const amounts: bigint[] = [];
  let estX = 0n;
  let estY = 0n;

  for (const pos of targetBins) {
    ids.push(BigInt(pos.id));
    const removeAmt = pos.balance * BigInt(PERCENT) / 100n;
    amounts.push(removeAmt);

    const myResX = (pos.resX * removeAmt) / pos.supply;
    const myResY = (pos.resY * removeAmt) / pos.supply;
    estX += myResX;
    estY += myResY;
  }

  const minX = estX * BigInt(10000 - SLIPPAGE) / 10000n;
  const minY = estY * BigInt(10000 - SLIPPAGE) / 10000n;

  console.log(`\n    Removing ${PERCENT}% from ${targetBins.length} bins:`);
  console.log(`    Expected: ~${ethers.formatUnits(estX, decX)} UNY + ~${ethers.formatUnits(estY, decY)} ${POOL.toUpperCase()}`);
  console.log(`    Min out : ~${ethers.formatUnits(minX, decX)} UNY + ~${ethers.formatUnits(minY, decY)} ${POOL.toUpperCase()}`);

  // ── Safety thresholds (slippage check) ──
  const safetyResult = await enforceSafetyThresholds({
    slippageBps: SLIPPAGE,
    amtX: estX,
    amtY: estY,
    balX: totalShareX,
    balY: totalShareY,
    decX,
    decY,
    symX: "UNY",
    symY: POOL.toUpperCase(),
    isDryRun: DRY_RUN,
  });

  // ── Position diff preview ──
  const avaxBal = await ethers.provider.getBalance(signer.address);
  const unyToken = new ethers.Contract(unyAddr, ["function balanceOf(address) view returns (uint256)"], signer);
  const unyWalletBal = await unyToken.balanceOf(signer.address);
  const yWalletBal = POOL === "wavax"
    ? avaxBal
    : await (new ethers.Contract(tokenYAddr, ["function balanceOf(address) view returns (uint256)"], signer)).balanceOf(signer.address);

  printPositionDiff({
    action:    "remove",
    symX:      "UNY",
    symY:      POOL.toUpperCase(),
    decX,
    decY,
    balX:      unyWalletBal,
    balY:      yWalletBal,
    amtX:      estX,
    amtY:      estY,
    avaxBal,
    isNative:  POOL === "wavax",
    numBins:   targetBins.length,
    binStep,
    priceY_usd: POOL === "usdc" ? 1.0 : undefined,
  });

  if (DRY_RUN) {
    markDryRunComplete("removeLiquidity", POOL);
    console.log("\n🔍  DRY RUN — no transactions sent");
    console.log("    Would approveForAll on pair for LB Router");
    console.log(`    Would call removeLiquidity${POOL === "wavax" ? "NATIVE" : ""}`);
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

  // Approve pair for router
  const isApproved = await pair.isApprovedForAll(signer.address, LB_ROUTER);
  if (!isApproved) {
    console.log("\n    Approving pair for Router...");
    const appTx = await pair.approveForAll(LB_ROUTER, true);
    await appTx.wait();
    console.log(`    ✓ Approved (tx: ${appTx.hash})`);
  }

  const router = new ethers.Contract(LB_ROUTER, ROUTER_ABI, signer);
  const deadline = Math.floor(Date.now() / 1000) + 300;

  console.log("\n    Removing liquidity...");
  let tx;
  if (POOL === "wavax") {
    tx = await router.removeLiquidityNATIVE(
      unyAddr, binStep, minX, minY,
      ids, amounts, signer.address, deadline
    );
  } else {
    tx = await router.removeLiquidity(
      unyAddr, tokenYAddr, binStep, minX, minY,
      ids, amounts, signer.address, deadline
    );
  }
  const receipt = await tx.wait();

  console.log(`\n✅  Liquidity removed!`);
  console.log(`    TX   : ${tx.hash}`);
  console.log(`    Block: ${receipt.blockNumber}`);
  console.log(`    Gas  : ${receipt.gasUsed.toString()}\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
