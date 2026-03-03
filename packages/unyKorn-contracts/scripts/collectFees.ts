/**
 * collectFees.ts → Fee Estimation Tool (V1 Classic AMM)
 *
 * TraderJoe V1 (x*y=k) Difference from LB V2.1:
 *   V1 fees auto-compound into LP token value — there is NO separate collectFees().
 *   The 0.3% swap fee increases reserves, which increases each LP token's share.
 *
 * This script estimates accrued fee value by:
 *   1. Reading current reserves & LP share
 *   2. Calculating your proportional share of reserves
 *   3. Comparing to initial deposit (if snapshot exists)
 *
 * Usage:
 *   npx hardhat run scripts/collectFees.ts --network avalanche
 *
 * Environment:
 *   POOL=usdc|wavax   (default: both)
 *   INITIAL_UNY=0     (your initial UNY deposit — for fee estimation)
 *   INITIAL_QUOTE=0   (your initial USDC/AVAX deposit)
 */

import hre, { ethers } from "hardhat";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { checkKillSwitch } from "./lp-safety";

const ROOT = resolve(__dirname, "../../..");
const POOL_FILTER = process.env.POOL?.toLowerCase();
const SNAPSHOT_DIR = resolve(__dirname, "../.lp-runs");

const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112, uint112, uint32)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function kLast() view returns (uint256)",
];

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
];

interface PoolConfig {
  pair_address: string;
  token0: { address: string; decimals: number; symbol: string };
  token1: { address: string; decimals: number; symbol: string };
  dex: string;
  pair_type: string;
}

interface FeeSnapshot {
  timestamp: string;
  lpBalance: string;
  reserve0: string;
  reserve1: string;
  totalSupply: string;
  shareValue0: string;
  shareValue1: string;
}

async function estimateForPool(signer: any, pool: PoolConfig, poolName: string) {
  const sym0 = pool.token0.symbol;
  const sym1 = pool.token1.symbol;
  const dec0 = pool.token0.decimals;
  const dec1 = pool.token1.decimals;

  console.log(`\n──── ${poolName} (${pool.pair_type} AMM) ────`);
  console.log(`    Pair: ${pool.pair_address}`);

  const pair = new ethers.Contract(pool.pair_address, PAIR_ABI, signer);
  const [reserve0, reserve1, lastTs] = await pair.getReserves();
  const lpTotalSupply = await pair.totalSupply();
  const lpBalance = await pair.balanceOf(signer.address);

  console.log(`    Reserve0 : ${ethers.formatUnits(reserve0, dec0)} ${sym0}`);
  console.log(`    Reserve1 : ${ethers.formatUnits(reserve1, dec1)} ${sym1}`);
  console.log(`    LP Supply: ${ethers.formatEther(lpTotalSupply)}`);
  console.log(`    Your LP  : ${ethers.formatEther(lpBalance)}`);

  if (lpBalance === 0n) {
    console.log("    No LP position — no fees to estimate.");
    return;
  }

  const sharePercent = Number((lpBalance * 10000n) / lpTotalSupply) / 100;
  const myReserve0 = (reserve0 * lpBalance) / lpTotalSupply;
  const myReserve1 = (reserve1 * lpBalance) / lpTotalSupply;

  console.log(`    Share    : ${sharePercent.toFixed(4)}%`);
  console.log(`    My ${sym0.padEnd(5)}: ${ethers.formatUnits(myReserve0, dec0)}`);
  console.log(`    My ${sym1.padEnd(5)}: ${ethers.formatUnits(myReserve1, dec1)}`);

  // Try to read previous snapshot
  const snapshotFile = join(SNAPSHOT_DIR, `fee-snapshot-${poolName.replace("/", "-").toLowerCase()}.json`);

  if (existsSync(snapshotFile)) {
    try {
      const prev: FeeSnapshot = JSON.parse(readFileSync(snapshotFile, "utf8"));
      const prevValue0 = BigInt(prev.shareValue0);
      const prevValue1 = BigInt(prev.shareValue1);

      const gain0 = myReserve0 - prevValue0;
      const gain1 = myReserve1 - prevValue1;

      console.log(`\n    📈  Fee accrual since ${prev.timestamp.slice(0, 19)}:`);
      console.log(`      ${sym0}: ${gain0 >= 0n ? "+" : ""}${ethers.formatUnits(gain0, dec0)}`);
      console.log(`      ${sym1}: ${gain1 >= 0n ? "+" : ""}${ethers.formatUnits(gain1, dec1)}`);

      if (gain0 < 0n || gain1 < 0n) {
        console.log(`      ⚠ Negative change — likely impermanent loss exceeding fee accrual`);
      }

      // Rough APR estimate
      const prevTs = new Date(prev.timestamp).getTime();
      const nowTs  = Date.now();
      const daysSince = (nowTs - prevTs) / (1000 * 60 * 60 * 24);
      if (daysSince > 0.01 && prevValue0 > 0n) {
        const growthPct = Number((myReserve0 * 10000n) / prevValue0) / 100 - 100;
        const annualized = growthPct * (365 / daysSince);
        console.log(`      Est. APR (${sym0} basis): ~${annualized.toFixed(2)}% (${daysSince.toFixed(1)} days)`);
      }
    } catch {
      console.log(`    ⚠ Could not parse previous snapshot`);
    }
  } else {
    console.log(`\n    ℹ No previous snapshot — saving baseline now.`);
    console.log(`    Run again later to see fee accrual.`);
  }

  // Save current snapshot
  const { mkdirSync } = require("fs");
  if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });

  const snapshot: FeeSnapshot = {
    timestamp:   new Date().toISOString(),
    lpBalance:   lpBalance.toString(),
    reserve0:    reserve0.toString(),
    reserve1:    reserve1.toString(),
    totalSupply: lpTotalSupply.toString(),
    shareValue0: myReserve0.toString(),
    shareValue1: myReserve1.toString(),
  };
  writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));
  console.log(`    💾 Snapshot saved: ${snapshotFile}`);
}

async function main() {
  // ── Kill switch ──
  checkKillSwitch();

  const [signer] = await ethers.getSigners();

  console.log("\n💰  LP Fee Estimation (V1 Classic AMM)");
  console.log(`    Signer: ${signer.address}`);
  console.log(`    Note  : V1 fees auto-compound into LP token — no separate collection needed.`);
  console.log(`            This tool tracks your share value over time to estimate fee accrual.\n`);

  const pools: { name: string; config: PoolConfig }[] = [];

  if (!POOL_FILTER || POOL_FILTER === "usdc") {
    const cfg = JSON.parse(readFileSync(join(ROOT, "registry/pools/avalanche-lfj-uny-usdc.json"), "utf8"));
    pools.push({ name: "UNY/USDC", config: cfg });
  }

  if (!POOL_FILTER || POOL_FILTER === "wavax") {
    const cfg = JSON.parse(readFileSync(join(ROOT, "registry/pools/avalanche-lfj-uny-wavax.json"), "utf8"));
    pools.push({ name: "UNY/WAVAX", config: cfg });
  }

  for (const pool of pools) {
    await estimateForPool(signer, pool.config, pool.name);
  }

  console.log();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
