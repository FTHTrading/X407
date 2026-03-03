/**
 * collectFees.ts
 * Collect accrued trading fees from UNY LP positions on TraderJoe LFJ V2.1.
 *
 * Usage:
 *   npx hardhat run scripts/collectFees.ts --network avalanche
 *
 * Environment:
 *   POOL=usdc|wavax   (default: both)
 *   DRY_RUN=true|false (default: true)
 */

import hre, { ethers } from "hardhat";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const ROOT = resolve(__dirname, "../../..");
const DRY_RUN = process.env.DRY_RUN !== "false";
const POOL_FILTER = process.env.POOL?.toLowerCase();

const PAIR_ABI = [
  "function getActiveId() view returns (uint24)",
  "function getBinStep() view returns (uint16)",
  "function balanceOf(address, uint256) view returns (uint256)",
  "function pendingFees(address, uint256[]) view returns (uint256, uint256)",
  "function collectFees(address, uint256[]) returns (uint256, uint256)",
];

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
];

interface PoolConfig {
  name: string;
  pair_address: string;
  token0: { address: string; decimals: number; symbol: string };
  token1: { address: string; decimals: number; symbol: string };
}

async function collectForPool(signer: any, pool: PoolConfig) {
  console.log(`\n──── ${pool.name} ────`);
  console.log(`    Pair: ${pool.pair_address}`);

  const pair = new ethers.Contract(pool.pair_address, PAIR_ABI, signer);
  const activeId = Number(await pair.getActiveId());

  // Scan for bins with LP positions
  const scanRange = 50;
  const binIds: number[] = [];

  for (let id = activeId - scanRange; id <= activeId + scanRange; id++) {
    const bal = await pair.balanceOf(signer.address, id);
    if (bal > 0n) binIds.push(id);
  }

  if (binIds.length === 0) {
    console.log("    No LP positions found.");
    return;
  }

  console.log(`    Positions in ${binIds.length} bins: ${binIds.join(", ")}`);

  // Check pending fees
  const [pendingX, pendingY] = await pair.pendingFees(signer.address, binIds);
  const decX = pool.token0.decimals;
  const decY = pool.token1.decimals;

  console.log(`    Pending fees:`);
  console.log(`      ${pool.token0.symbol}: ${ethers.formatUnits(pendingX, decX)}`);
  console.log(`      ${pool.token1.symbol}: ${ethers.formatUnits(pendingY, decY)}`);

  if (pendingX === 0n && pendingY === 0n) {
    console.log("    No fees to collect.");
    return;
  }

  if (DRY_RUN) {
    console.log(`    🔍 DRY RUN — would collect fees.`);
    return;
  }

  console.log("    Collecting fees...");
  const tx = await pair.collectFees(signer.address, binIds);
  const receipt = await tx.wait();
  console.log(`    ✅ Collected! TX: ${tx.hash} (gas: ${receipt.gasUsed})`);
}

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("\n💰  Collect LP Trading Fees");
  console.log(`    Signer: ${signer.address}`);
  console.log(`    Mode  : ${DRY_RUN ? "DRY RUN" : "⚡ LIVE"}`);

  const pools: PoolConfig[] = [];

  if (!POOL_FILTER || POOL_FILTER === "usdc") {
    const cfg = JSON.parse(readFileSync(join(ROOT, "registry/pools/avalanche-lfj-uny-usdc.json"), "utf8"));
    pools.push({
      name: "UNY/USDC",
      pair_address: cfg.pair_address,
      token0: cfg.token0,
      token1: cfg.token1,
    });
  }

  if (!POOL_FILTER || POOL_FILTER === "wavax") {
    const cfg = JSON.parse(readFileSync(join(ROOT, "registry/pools/avalanche-lfj-uny-wavax.json"), "utf8"));
    pools.push({
      name: "UNY/WAVAX",
      pair_address: cfg.pair_address,
      token0: cfg.token0,
      token1: cfg.token1,
    });
  }

  // Collect balances before
  const unyToken = new ethers.Contract(pools[0].token0.address, ERC20_ABI, signer);
  const unyBefore = await unyToken.balanceOf(signer.address);

  for (const pool of pools) {
    await collectForPool(signer, pool);
  }

  // Show balance change
  const unyAfter = await unyToken.balanceOf(signer.address);
  if (unyAfter > unyBefore) {
    console.log(`\n    UNY balance change: +${ethers.formatUnits(unyAfter - unyBefore, 18)}`);
  }

  console.log();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
