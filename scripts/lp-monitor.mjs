#!/usr/bin/env node
/**
 * lp-monitor.mjs
 * Root-level LP position monitor for TraderJoe V1 Classic AMM.
 * No Hardhat dependency — reads registry config, queries on-chain via JSON-RPC.
 *
 * V1 pairs are ERC-20 — LP tokens tracked via standard balanceOf().
 * Price derived from reserves ratio: price = reserve0/reserve1 adjusted for decimals.
 *
 * Usage:
 *   node scripts/lp-monitor.mjs                  # full report
 *   node scripts/lp-monitor.mjs --json            # JSON output
 *   node scripts/lp-monitor.mjs --pool usdc       # single pool
 */

import { readFileSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const jsonMode  = args.includes("--json");
const poolArg   = args.includes("--pool") ? args[args.indexOf("--pool") + 1] : null;

// ── Load config ───────────────────────────────────────────────────────────────
const lpConfig = JSON.parse(readFileSync(join(ROOT, "registry/lp-config.json"), "utf8"));
const wallets  = readFileSync(join(ROOT, "registry/wallets/wallets.yaml"), "utf8");

// Extract operator address — use avalanche_operator (LP deployer) if present,
// otherwise fall back to primary_operator.address
const avaxOpMatch = wallets.match(/avalanche_operator:\s*"?(0x[a-fA-F0-9]+)"?/);
const primaryMatch = wallets.match(/primary_operator[\s\S]*?address:\s*"?(0x[a-fA-F0-9]+)"?/);
const operatorAddr = avaxOpMatch ? avaxOpMatch[1] : (primaryMatch ? primaryMatch[1] : null);

if (!operatorAddr) {
  console.error("✗ Could not find primary_operator address in wallets.yaml");
  process.exit(1);
}

// ── Minimal JSON-RPC helper ───────────────────────────────────────────────────
const RPC_URL = "https://api.avax.network/ext/bc/C/rpc";

async function ethCall(to, data) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "eth_call",
      params: [{ to, data }, "latest"]
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return json.result;
}

// ── ABI encoding helpers ──────────────────────────────────────────────────────
// Known V1 pair function selectors
const SEL = {
  getReserves:  "0x0902f1ac",  // getReserves() → (uint112, uint112, uint32)
  totalSupply:  "0x18160ddd",  // totalSupply() → uint256  (ERC-20, no args)
  balanceOf:    "0x70a08231",  // balanceOf(address) → uint256
  token0:       "0x0dfe1681",  // token0() → address
  token1:       "0xd21220a7",  // token1() → address
};

function addrPad(addr) {
  return addr.replace("0x", "").toLowerCase().padStart(64, "0");
}

function decodeUint(hex, offset = 0) {
  const start = 2 + offset * 64;
  return BigInt("0x" + hex.slice(start, start + 64));
}

// ── Query pool state (V1 Classic AMM) ─────────────────────────────────────────
async function queryPool(poolEntry) {
  const poolData = JSON.parse(readFileSync(join(ROOT, "registry", poolEntry.file), "utf8"));
  const pair = poolData.pair_address;
  const dec0 = poolData.token0.decimals;
  const dec1 = poolData.token1.decimals;
  const sym0 = poolData.token0.symbol;
  const sym1 = poolData.token1.symbol;

  // getReserves() → (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)
  const resHex = await ethCall(pair, SEL.getReserves);
  const reserve0 = decodeUint(resHex, 0);
  const reserve1 = decodeUint(resHex, 1);
  const lastTs   = Number(decodeUint(resHex, 2));

  // totalSupply() for LP token (ERC-20, no args)
  const supplyHex = await ethCall(pair, SEL.totalSupply);
  const totalSupply = decodeUint(supplyHex);

  // balanceOf(operator) — ERC-20 LP token
  const balData = SEL.balanceOf + addrPad(operatorAddr);
  const balHex = await ethCall(pair, balData);
  const lpBalance = decodeUint(balHex);

  // Price: how many token0 per token1 (UNY price in quote terms)
  const r0 = Number(reserve0) / Math.pow(10, dec0);
  const r1 = Number(reserve1) / Math.pow(10, dec1);

  // Figure out which is UNY
  const unyIsToken1 = sym1 === "UNY";
  const unyPrice = unyIsToken1 ? (r1 > 0 ? r0 / r1 : 0) : (r0 > 0 ? r1 / r0 : 0);
  const quoteSym = unyIsToken1 ? sym0 : sym1;

  // Calculate operator share
  let sharePercent = 0;
  let myRes0 = 0n;
  let myRes1 = 0n;

  if (lpBalance > 0n && totalSupply > 0n) {
    sharePercent = Number((lpBalance * 10000n) / totalSupply) / 100;
    myRes0 = (reserve0 * lpBalance) / totalSupply;
    myRes1 = (reserve1 * lpBalance) / totalSupply;
  }

  // Constant product
  const k = r0 * r1;

  return {
    pool:         poolEntry.name,
    pair,
    pairType:     poolEntry.pair_type || "V1",
    reserve0:     formatDec(reserve0, dec0),
    reserve1:     formatDec(reserve1, dec1),
    sym0,
    sym1,
    unyPrice:     unyPrice,
    quoteSym,
    totalSupply:  formatDec(totalSupply, 18),
    lpBalance:    formatDec(lpBalance, 18),
    sharePercent,
    myReserve0:   formatDec(myRes0, dec0),
    myReserve1:   formatDec(myRes1, dec1),
    k:            k.toFixed(2),
    lastSwap:     new Date(lastTs * 1000).toISOString(),
    hasPosition:  lpBalance > 0n,
  };
}

function formatDec(val, decimals) {
  const s = val.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals) || "0";
  const frac  = s.slice(s.length - decimals);
  return `${whole}.${frac.slice(0, 6)}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const pools = lpConfig.pools.filter(p => {
    if (!p.monitor) return false;
    if (poolArg) return p.name.toLowerCase().includes(poolArg.toLowerCase());
    return true;
  });

  if (pools.length === 0) {
    console.log("No monitored pools found.");
    return;
  }

  const results = [];

  for (const pool of pools) {
    try {
      const data = await queryPool(pool);
      results.push(data);
    } catch (err) {
      results.push({ pool: pool.name, error: err.message });
    }
  }

  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Pretty print
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║      UnyKorn LP Monitor (V1 Classic AMM)        ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║  Operator: ${operatorAddr.slice(0, 10)}...${operatorAddr.slice(-8)}`.padEnd(51) + "║");
  console.log(`║  Chain:    Avalanche C-Chain (43114)`.padEnd(51) + "║");
  console.log(`║  Protocol: TraderJoe V1 (x*y=k)`.padEnd(51) + "║");
  console.log(`║  Time:     ${new Date().toISOString()}`.padEnd(51) + "║");
  console.log("╚══════════════════════════════════════════════════╝");

  for (const r of results) {
    if (r.error) {
      console.log(`\n  ✗ ${r.pool}: ${r.error}`);
      continue;
    }

    console.log(`\n  ── ${r.pool} ──────────────────────────────────────`);
    console.log(`    Pair      : ${r.pair}`);
    console.log(`    Type      : ${r.pairType} Classic AMM`);
    console.log(`    UNY Price : 1 UNY ≈ ${r.unyPrice.toFixed(8)} ${r.quoteSym}`);
    console.log(`    Reserve ${r.sym0.padEnd(5)}: ${r.reserve0}`);
    console.log(`    Reserve ${r.sym1.padEnd(5)}: ${r.reserve1}`);
    console.log(`    k (x*y)   : ${r.k}`);
    console.log(`    Last swap : ${r.lastSwap}`);
    console.log(`    LP Supply : ${r.totalSupply}`);
    console.log(`    Your LP   : ${r.lpBalance}`);

    if (r.hasPosition) {
      console.log(`    Share     : ${r.sharePercent.toFixed(4)}%`);
      console.log(`    My ${r.sym0.padEnd(6)}: ${r.myReserve0}`);
      console.log(`    My ${r.sym1.padEnd(6)}: ${r.myReserve1}`);
      console.log(`    ✓ Position active — fees auto-compounding`);
    } else {
      console.log(`    Position  : NONE`);
    }
  }

  // AVAX balance
  const balData = SEL.balanceOf + addrPad(operatorAddr);
  // For native AVAX we use eth_getBalance
  const avaxRes = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "eth_getBalance",
      params: [operatorAddr, "latest"]
    }),
  });
  const avaxJson = await avaxRes.json();
  const avaxBal = BigInt(avaxJson.result);
  console.log(`\n  ── Gas Reserve ──`);
  console.log(`    AVAX: ${formatDec(avaxBal, 18)}`);

  console.log();
}

main().catch(err => {
  console.error("Monitor error:", err);
  process.exit(1);
});
