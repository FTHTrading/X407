/**
 * checkLP.ts
 * Queries the current state of UNY LP pools on TraderJoe V1 Classic AMM.
 * Shows: reserves, price, LP token balance, and operator position share.
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

// ── Minimal ABIs (UniswapV2 / TraderJoe V1) ──────────────────────────────────
const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112, uint112, uint32)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function name() view returns (string)",
  "function factory() view returns (address)",
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("\n📊  UNY LP Pool Status (TraderJoe V1)");
  console.log(`    Network : ${hre.network.name}`);
  console.log(`    Signer  : ${signer.address}\n`);

  for (const pool of pools) {
    const sym0 = pool.token0.symbol;
    const sym1 = pool.token1.symbol;
    console.log(`── ${sym0}/${sym1} ──────────────────────────────────`);
    console.log(`   Pair     : ${pool.pair_address}`);
    console.log(`   Type     : ${pool.pair_type} Classic AMM`);
    console.log(`   DEX      : ${pool.dex}`);

    try {
      const pair = new ethers.Contract(pool.pair_address, PAIR_ABI, signer);

      // Verify on-chain token order matches registry
      const onChainToken0 = await pair.token0();
      const onChainToken1 = await pair.token1();
      const orderOk = onChainToken0.toLowerCase() === pool.token0.address.toLowerCase()
                   && onChainToken1.toLowerCase() === pool.token1.address.toLowerCase();
      console.log(`   Token0   : ${onChainToken0} (${sym0}) ${orderOk ? "✓" : "⚠ MISMATCH"}`);
      console.log(`   Token1   : ${onChainToken1} (${sym1}) ${orderOk ? "✓" : "⚠ MISMATCH"}`);

      // getReserves() → (reserve0, reserve1, blockTimestampLast)
      const [reserve0, reserve1, lastTs] = await pair.getReserves();
      const dec0 = pool.token0.decimals;
      const dec1 = pool.token1.decimals;

      const fmt0 = ethers.formatUnits(reserve0, dec0);
      const fmt1 = ethers.formatUnits(reserve1, dec1);

      // Price calc: price of token0 in terms of token1
      const r0 = Number(ethers.formatUnits(reserve0, dec0));
      const r1 = Number(ethers.formatUnits(reserve1, dec1));
      const priceT0inT1 = r0 > 0 ? r1 / r0 : 0; // how many token1 per token0
      const priceT1inT0 = r1 > 0 ? r0 / r1 : 0; // how many token0 per token1

      // Find which token is UNY to show UNY price
      const unyIsToken1 = sym1 === "UNY";
      const unyPrice = unyIsToken1 ? priceT1inT0 : priceT0inT1;
      const quoteSymbol = unyIsToken1 ? sym0 : sym1;

      console.log(`   Reserve0 : ${fmt0} ${sym0}`);
      console.log(`   Reserve1 : ${fmt1} ${sym1}`);
      console.log(`   Price    : 1 UNY ≈ ${unyPrice.toFixed(8)} ${quoteSymbol}`);
      console.log(`   Last swap: ${new Date(Number(lastTs) * 1000).toISOString()}`);

      // LP token info
      const lpTotalSupply = await pair.totalSupply();
      const lpBalance = await pair.balanceOf(signer.address);
      console.log(`   LP Supply : ${ethers.formatEther(lpTotalSupply)}`);
      console.log(`   Operator LP: ${ethers.formatEther(lpBalance)}`);

      if (lpBalance > 0n && lpTotalSupply > 0n) {
        const sharePercent = Number((lpBalance * 10000n) / lpTotalSupply) / 100;
        const myReserve0 = (reserve0 * lpBalance) / lpTotalSupply;
        const myReserve1 = (reserve1 * lpBalance) / lpTotalSupply;
        console.log(`   Share    : ${sharePercent.toFixed(4)}%`);
        console.log(`   My ${sym0.padEnd(5)}: ${ethers.formatUnits(myReserve0, dec0)}`);
        console.log(`   My ${sym1.padEnd(5)}: ${ethers.formatUnits(myReserve1, dec1)}`);
      } else {
        console.log(`   Share    : 0% (no LP position)`);
      }

      // Constant product (k)
      const k = r0 * r1;
      console.log(`   k (x*y)  : ${k.toFixed(2)}`);

    } catch (err: any) {
      console.log(`   ⚠ Error reading pool: ${err.message?.slice(0, 120) ?? err}`);
    }

    console.log();
  }

  // Native AVAX balance
  const avaxBal = await ethers.provider.getBalance(signer.address);
  console.log(`── Operator AVAX balance: ${ethers.formatEther(avaxBal)} AVAX ──`);

  // UNY balance
  const unyAddr = "0xc09003213b34c7bec8d2eddfad4b43e51d007d66";
  const uny = new ethers.Contract(unyAddr, ERC20_ABI, signer);
  const unyBal = await uny.balanceOf(signer.address);
  console.log(`── Operator UNY balance : ${ethers.formatUnits(unyBal, 18)} UNY ──\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
