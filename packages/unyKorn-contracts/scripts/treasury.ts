/**
 * treasury.ts
 * Treasury dashboard — shows wallet balances, pool health, stablecoin
 * reserves, and actionable recommendations.
 *
 * Usage:
 *   npx hardhat run scripts/treasury.ts --network avalanche
 *
 * Output: prints a comprehensive dashboard + saves exports/treasury-<date>.json
 */

import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

const ROOT = path.resolve(__dirname, "../../..");

// ── ABIs ──────────────────────────────────────────────────────────────────────
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
];

const PAIR_ABI = [
  "function getReserves() view returns (uint112, uint112, uint32)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
];

// ── Token Registry ────────────────────────────────────────────────────────────
interface TokenDef {
  symbol: string;
  address: string;
  decimals: number;
  isStable: boolean;
  coingeckoId?: string;
}

const AVAX_TOKENS: TokenDef[] = [
  { symbol: "UNY",    address: "0xc09003213b34c7bec8d2eddfad4b43e51d007d66", decimals: 18, isStable: false },
  { symbol: "WAVAX",  address: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7", decimals: 18, isStable: false, coingeckoId: "avalanche-2" },
  { symbol: "USDC",   address: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", decimals: 6,  isStable: true },
  { symbol: "USDC.e", address: "0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664", decimals: 6,  isStable: true },
  { symbol: "USDt",   address: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", decimals: 6,  isStable: true },
  { symbol: "DAI.e",  address: "0xd586e7f844cea2f87f50152665bcbc2c279d8d70", decimals: 18, isStable: true },
  { symbol: "BTC.b",  address: "0x152b9d0fdc40c096de345c4ea95c83a3d837e38e", decimals: 8,  isStable: false, coingeckoId: "bitcoin" },
];

// ── Pool Registry ─────────────────────────────────────────────────────────────
interface PoolDef {
  name: string;
  pairAddress: string;
  registryFile: string;
  tokenXSymbol: string;
  tokenYSymbol: string;
}

const POOLS: PoolDef[] = [
  {
    name: "UNY/USDC",
    pairAddress: "0x9ff923a83B3d12DB280Ff65D69AE37819a743f83",
    registryFile: "avalanche-lfj-uny-usdc.json",
    tokenXSymbol: "USDC",
    tokenYSymbol: "UNY",
  },
  {
    name: "UNY/WAVAX",
    pairAddress: "0xC6F5273D74571d91CBcBA0A2900ed5F7C800F5d0",
    registryFile: "avalanche-lfj-uny-wavax.json",
    tokenXSymbol: "WAVAX",
    tokenYSymbol: "UNY",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(val: bigint, decimals: number, precision: number = 6): string {
  const f = Number(ethers.formatUnits(val, decimals));
  if (f === 0) return "0";
  if (f < 0.000001) return f.toExponential(2);
  return f.toFixed(precision).replace(/\.?0+$/, "");
}

function usdFmt(usd: number): string {
  if (usd < 0.01) return "$0.00";
  return "$" + usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function bar(percent: number, width: number = 30): string {
  const filled = Math.round((percent / 100) * width);
  return "█".repeat(Math.min(filled, width)) + "░".repeat(Math.max(0, width - filled));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const net = network.name;
  if (net !== "avalanche") {
    console.log("Treasury dashboard currently supports Avalanche only.");
    return;
  }

  const [signer] = await ethers.getSigners();
  const walletAddr = signer.address;

  console.log("\n╔═══════════════════════════════════════════════════════════════╗");
  console.log("║           UnyKorn Treasury Dashboard                        ║");
  console.log("║           Avalanche C-Chain · " + new Date().toISOString().slice(0, 10) + "                        ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");
  console.log(`\n  Operator : ${walletAddr}`);

  // ── 1. Wallet Balances ──────────────────────────────────────────────────────
  console.log("\n┌─── WALLET BALANCES ──────────────────────────────────────────┐");

  const nativeWei = await ethers.provider.getBalance(walletAddr);
  const nativeAvax = Number(ethers.formatEther(nativeWei));
  console.log(`  AVAX (native)  : ${nativeAvax.toFixed(6)} AVAX`);

  const balances: Record<string, { raw: bigint; formatted: number; usd: number }> = {};
  let totalStableUsd = 0;

  for (const token of AVAX_TOKENS) {
    try {
      const contract = new ethers.Contract(token.address, ERC20_ABI, signer);
      const bal: bigint = await contract.balanceOf(walletAddr);
      const formatted = Number(ethers.formatUnits(bal, token.decimals));
      const usd = token.isStable ? formatted : 0; // Stables assumed 1:1 USD
      balances[token.symbol] = { raw: bal, formatted, usd };

      if (formatted > 0) {
        const usdStr = token.isStable ? ` (${usdFmt(usd)})` : "";
        console.log(`  ${token.symbol.padEnd(12)} : ${fmt(bal, token.decimals)}${usdStr}`);
      } else {
        console.log(`  ${token.symbol.padEnd(12)} : 0`);
      }

      if (token.isStable) totalStableUsd += usd;
    } catch {
      console.log(`  ${token.symbol.padEnd(12)} : (error)`);
    }
    await new Promise(r => setTimeout(r, 100));
  }

  console.log("  ─────────────────────────────────────");
  console.log(`  Total Stables  : ${usdFmt(totalStableUsd)}`);
  console.log("└──────────────────────────────────────────────────────────────┘");

  // ── 2. Pool Health ──────────────────────────────────────────────────────────
  console.log("\n┌─── POOL HEALTH ──────────────────────────────────────────────┐");

  const poolResults: object[] = [];

  for (const pool of POOLS) {
    try {
      const pair = new ethers.Contract(pool.pairAddress, PAIR_ABI, signer);
      const [r0, r1] = await pair.getReserves();
      const lpSupply: bigint = await pair.totalSupply();

      // Load pool config for decimal info
      const poolConfig = JSON.parse(
        fs.readFileSync(path.join(ROOT, "registry/pools", pool.registryFile), "utf8")
      );

      const dec0 = poolConfig.token0.decimals;
      const dec1 = poolConfig.token1.decimals;
      const sym0 = poolConfig.token0.symbol;
      const sym1 = poolConfig.token1.symbol;

      const res0 = Number(ethers.formatUnits(r0, dec0));
      const res1 = Number(ethers.formatUnits(r1, dec1));

      // Determine which is the quote (non-UNY) side
      const unyIsToken1 = sym1 === "UNY";
      const resQuote = unyIsToken1 ? res0 : res1;
      const resUNY   = unyIsToken1 ? res1 : res0;
      const quoteSym = unyIsToken1 ? sym0 : sym1;
      const price    = resQuote / resUNY;

      // Estimate pool TVL
      const quoteTVL = quoteSym === "USDC" ? resQuote * 2 : resQuote * 2; // Simplified
      const isHealthy = resQuote > 10; // More than $10 or 10 AVAX quote-side

      // Check if operator has LP tokens
      const lpBal: bigint = await pair.balanceOf(walletAddr);
      const lpPercent = lpSupply > 0n ? (Number(lpBal) / Number(lpSupply)) * 100 : 0;

      console.log(`\n  ${pool.name}`);
      console.log(`    Pair     : ${pool.pairAddress}`);
      console.log(`    ${sym0.padEnd(8)} : ${res0.toFixed(6)}`);
      console.log(`    ${sym1.padEnd(8)} : ${res1.toFixed(6)}`);
      console.log(`    UNY Price: ${price.toFixed(8)} ${quoteSym}`);
      console.log(`    LP Tokens: ${fmt(lpBal, 18)} / ${fmt(lpSupply, 18)} (${lpPercent.toFixed(2)}%)`);
      console.log(`    Health   : ${isHealthy ? "✅ OK" : "⚠️  LOW LIQUIDITY"}`);
      if (!isHealthy) {
        console.log(`    Action   : Pool needs more ${quoteSym} liquidity`);
      }

      poolResults.push({
        name: pool.name,
        pair: pool.pairAddress,
        reserves: { [sym0]: res0, [sym1]: res1 },
        unyPrice: price,
        quoteSym,
        lpBalance: fmt(lpBal, 18),
        lpPercent,
        healthy: isHealthy,
      });
    } catch (e: any) {
      console.log(`\n  ${pool.name}: ERROR — ${e.message?.slice(0, 60)}`);
    }
  }
  console.log("\n└──────────────────────────────────────────────────────────────┘");

  // ── 3. Supply Analysis ──────────────────────────────────────────────────────
  console.log("\n┌─── UNY SUPPLY ANALYSIS ──────────────────────────────────────┐");

  const unyContract = new ethers.Contract(AVAX_TOKENS[0].address, ERC20_ABI, signer);
  const totalSupply: bigint = await unyContract.totalSupply();
  const walletUNY = balances["UNY"]?.raw ?? 0n;
  const circulatingApprox = totalSupply - walletUNY;
  const walletPercent = (Number(walletUNY) / Number(totalSupply)) * 100;

  console.log(`  Total Supply     : ${fmt(totalSupply, 18)} UNY`);
  console.log(`  Operator Wallet  : ${fmt(walletUNY, 18)} UNY (${walletPercent.toFixed(2)}%)`);
  console.log(`  In Circulation   : ~${fmt(circulatingApprox, 18)} UNY`);
  console.log(`  Supply Held      : ${bar(walletPercent)} ${walletPercent.toFixed(1)}%`);
  console.log("└──────────────────────────────────────────────────────────────┘");

  // ── 4. Gas Runway ───────────────────────────────────────────────────────────
  console.log("\n┌─── GAS RUNWAY ───────────────────────────────────────────────┐");
  const avgTxCostAvax = 0.003; // ~3M gas * 25 nAVAX
  const txRunway = Math.floor(nativeAvax / avgTxCostAvax);
  const runwayHealth = txRunway > 50 ? "✅" : txRunway > 10 ? "⚠️ " : "🔴";

  console.log(`  AVAX Balance     : ${nativeAvax.toFixed(6)} AVAX`);
  console.log(`  Est. Tx Cost     : ~${avgTxCostAvax} AVAX per tx`);
  console.log(`  Tx Runway        : ~${txRunway} transactions ${runwayHealth}`);
  if (txRunway < 50) {
    console.log(`  ⚠️  Low gas! Need AVAX for continued operations.`);
    console.log(`     Send AVAX to: ${walletAddr}`);
  }
  console.log("└──────────────────────────────────────────────────────────────┘");

  // ── 5. Recommendations ─────────────────────────────────────────────────────
  console.log("\n┌─── RECOMMENDATIONS ──────────────────────────────────────────┐");

  const recs: string[] = [];

  if (nativeAvax < 0.1) {
    recs.push("🔴 CRITICAL: Fund wallet with AVAX for gas. Current balance won't sustain operations.");
    recs.push("   → Send 1-5 AVAX to " + walletAddr);
    recs.push("   → Or sell small UNY for AVAX: POOL=wavax DIRECTION=sell AMOUNT=5000 DRY_RUN=false npm run swap:avax");
  } else if (nativeAvax < 1) {
    recs.push("⚠️  AVAX balance getting low (" + nativeAvax.toFixed(4) + "). Consider topping up.");
    recs.push("   → Send AVAX to " + walletAddr);
  }

  if (totalStableUsd < 10) {
    recs.push("⚠️  No stablecoins. To deepen USDC/UNY pool or build reserves:");
    recs.push("   → Bridge USDC to Avalanche via https://core.app/bridge");
    recs.push("   → Or sell small UNY: POOL=usdc DIRECTION=sell AMOUNT=5000 DRY_RUN=false npm run swap:usdc");
  }

  // Pool depth check
  for (const pool of poolResults as any[]) {
    if (!pool.healthy) {
      recs.push(`⚠️  ${pool.name} pool needs more ${pool.quoteSym} liquidity.`);
      recs.push(`   → Add liquidity once you have ${pool.quoteSym}: npm run lp:add`);
    }
  }

  if (walletPercent > 99) {
    recs.push("📊 99%+ of UNY still in operator wallet. Consider:");
    recs.push("   → Adding more to liquidity pools to build market depth");
    recs.push("   → Distributing to community / airdrop wallets");
    recs.push("   → Locking tokens in a vesting contract for credibility");
  }

  if (recs.length === 0) {
    recs.push("✅ All systems healthy. No immediate actions needed.");
  }

  for (const rec of recs) {
    console.log(`  ${rec}`);
  }
  console.log("└──────────────────────────────────────────────────────────────┘\n");

  // ── Save report ─────────────────────────────────────────────────────────────
  const report = {
    timestamp: new Date().toISOString(),
    network: net,
    operator: walletAddr,
    nativeAvax,
    txRunway,
    balances: Object.fromEntries(
      Object.entries(balances).map(([k, v]) => [k, { amount: v.formatted, usd: v.usd }])
    ),
    totalStableUsd,
    pools: poolResults,
    supply: {
      total: fmt(totalSupply, 18),
      operatorHeld: fmt(walletUNY, 18),
      operatorPercent: walletPercent,
    },
    recommendations: recs,
  };

  const exportDir = path.resolve(__dirname, "../exports");
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
  const exportFile = path.join(exportDir, `treasury-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(exportFile, JSON.stringify(report, null, 2));
  console.log(`  📄 Report saved → ${exportFile}\n`);
}

main().catch((err) => {
  console.error("Treasury error:", err);
  process.exitCode = 1;
});
