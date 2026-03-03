/**
 * checkLP.ts
 * Queries the current state of UNY LP pools on TraderJoe LFJ V2.1.
 * Shows: active bin, reserves, price, and operator position info.
 *
 * Run:  npx hardhat run scripts/checkLP.ts --network avalanche
 */

import hre, { ethers } from "hardhat";
import { readFileSync } from "fs";
import { resolve, join } from "path";

// ── Pool configs from registry ────────────────────────────────────────────────
const ROOT = resolve(__dirname, "../../..");
const pools = [
  JSON.parse(readFileSync(join(ROOT, "registry/pools/avalanche-lfj-uny-usdc.json"), "utf8")),
  JSON.parse(readFileSync(join(ROOT, "registry/pools/avalanche-lfj-uny-wavax.json"), "utf8")),
];

// ── Minimal ABIs ──────────────────────────────────────────────────────────────
const PAIR_ABI = [
  "function getActiveId() view returns (uint24)",
  "function getReserves() view returns (uint128, uint128)",
  "function getTokenX() view returns (address)",
  "function getTokenY() view returns (address)",
  "function getBinStep() view returns (uint16)",
  "function getBin(uint24 id) view returns (uint128, uint128)",
  "function totalSupply(uint256 id) view returns (uint256)",
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("\n📊  UNY LP Pool Status");
  console.log(`    Network : ${hre.network.name}`);
  console.log(`    Signer  : ${signer.address}\n`);

  for (const pool of pools) {
    console.log(`── ${pool.token0.symbol}/${pool.token1.symbol} ──────────────────────────────────`);
    console.log(`   Pair     : ${pool.pair_address}`);
    console.log(`   DEX      : ${pool.dex}`);

    try {
      const pair = new ethers.Contract(pool.pair_address, PAIR_ABI, signer);

      const activeId = await pair.getActiveId();
      const [reserveX, reserveY] = await pair.getReserves();
      const binStep = await pair.getBinStep();

      const tokenX = new ethers.Contract(pool.token0.address, ERC20_ABI, signer);
      const tokenY = new ethers.Contract(pool.token1.address, ERC20_ABI, signer);

      const decX = pool.token0.decimals;
      const decY = pool.token1.decimals;

      const fmtX = ethers.formatUnits(reserveX, decX);
      const fmtY = ethers.formatUnits(reserveY, decY);

      // LB price formula: price = (1 + binStep/10000)^(activeId - 2^23)
      const priceExp = Number(activeId) - (1 << 23);
      const price = Math.pow(1 + Number(binStep) / 10000, priceExp);

      console.log(`   Bin Step : ${binStep}`);
      console.log(`   Active ID: ${activeId}`);
      console.log(`   Price    : 1 ${pool.token0.symbol} ≈ ${price.toFixed(6)} ${pool.token1.symbol}`);
      console.log(`   Reserve X: ${fmtX} ${pool.token0.symbol}`);
      console.log(`   Reserve Y: ${fmtY} ${pool.token1.symbol}`);

      // Get active bin depth
      const [binX, binY] = await pair.getBin(activeId);
      console.log(`   Active bin: ${ethers.formatUnits(binX, decX)} ${pool.token0.symbol} / ${ethers.formatUnits(binY, decY)} ${pool.token1.symbol}`);

      // Check operator UNY balance
      const unyBal = await tokenX.balanceOf(signer.address);
      console.log(`   Operator UNY: ${ethers.formatUnits(unyBal, decX)}`);

    } catch (err: any) {
      console.log(`   ⚠ Error reading pool: ${err.message?.slice(0, 100) ?? err}`);
    }

    console.log();
  }

  // Native AVAX balance
  const avaxBal = await ethers.provider.getBalance(signer.address);
  console.log(`── Operator AVAX balance: ${ethers.formatEther(avaxBal)} AVAX ──\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
