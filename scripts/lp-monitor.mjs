#!/usr/bin/env node
/**
 * lp-monitor.mjs
 * Root-level LP position monitor — no Hardhat dependency.
 * Reads registry config, queries on-chain state, outputs position summary.
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

// Extract operator address from wallets.yaml
const operatorMatch = wallets.match(/primary_operator[\s\S]*?address:\s*(0x[a-fA-F0-9]+)/);
const operatorAddr  = operatorMatch ? operatorMatch[1] : null;

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

function encodeFnSig(sig) {
  // Simple keccak-like selector via Web Crypto + manual
  // For known selectors we just hardcode them
  const selectors = {
    "getActiveId()":       "0x44a185bb",
    "getBinStep()":        "0x17f11ecc",
    "getReserves()":       "0x0902f1ac",
    "totalSupply(uint256)":"0xbd85b039",
  };
  return selectors[sig] || null;
}

// balanceOf(address,uint256) selector
const BAL_OF_SEL = "0x00fdd58e";
// getBin(uint24)
const GET_BIN_SEL = "0x44a185bb";

function uint256Hex(n) {
  return BigInt(n).toString(16).padStart(64, "0");
}

function addrPad(addr) {
  return addr.replace("0x", "").padStart(64, "0");
}

function decodeUint(hex, offset = 0) {
  const start = 2 + offset * 64;
  return BigInt("0x" + hex.slice(start, start + 64));
}

// ── Query pool state ──────────────────────────────────────────────────────────
async function queryPool(poolEntry) {
  const poolData = JSON.parse(readFileSync(join(ROOT, "registry", poolEntry.file), "utf8"));
  const pair = poolData.pair_address;
  const decX = poolData.token0.decimals;
  const decY = poolData.token1.decimals;

  // getActiveId()
  const activeIdHex = await ethCall(pair, "0x44a185bb");
  const activeId = Number(decodeUint(activeIdHex));

  // getReserves()
  const resHex = await ethCall(pair, "0x0902f1ac");
  const resX = decodeUint(resHex, 0);
  const resY = decodeUint(resHex, 1);

  // getBinStep()
  const bsHex = await ethCall(pair, "0x17f11ecc");
  const binStep = Number(decodeUint(bsHex));

  // Price from LB formula: price = (1 + binStep/10000)^(activeId - 2^23)
  const exponent = activeId - 8388608;
  const base = 1 + binStep / 10000;
  const price = Math.pow(base, exponent);
  const adjustedPrice = price * Math.pow(10, decX - decY);

  // Scan for operator positions
  const scanRange = lpConfig.defaults.scan_range || 50;
  const positions = [];
  let totalMyX = 0n;
  let totalMyY = 0n;
  let totalBinsWithLP = 0;

  // Batch scan — check key bins around active
  for (let id = activeId - scanRange; id <= activeId + scanRange; id++) {
    // balanceOf(address, uint256) — ERC-1155 style
    const balData = "0x00fdd58e" + addrPad(operatorAddr) + uint256Hex(id);
    const balHex = await ethCall(pair, balData);
    const balance = decodeUint(balHex);

    if (balance > 0n) {
      // totalSupply(uint256)
      const supData = "0xbd85b039" + uint256Hex(id);
      const supHex = await ethCall(pair, supData);
      const supply = decodeUint(supHex);

      // getBin(uint24) — selector is 0x0abe8101
      const binData = "0x0abe8101" + uint256Hex(id);
      const binHex = await ethCall(pair, binData);
      const binResX = decodeUint(binHex, 0);
      const binResY = decodeUint(binHex, 1);

      const myX = supply > 0n ? (binResX * balance) / supply : 0n;
      const myY = supply > 0n ? (binResY * balance) / supply : 0n;
      const sharePercent = supply > 0n ? Number((balance * 10000n) / supply) / 100 : 0;

      totalMyX += myX;
      totalMyY += myY;
      totalBinsWithLP++;

      positions.push({
        binId: id,
        delta: id - activeId,
        balance: balance.toString(),
        supply: supply.toString(),
        sharePercent,
        myResX: formatDec(myX, decX),
        myResY: formatDec(myY, decY),
      });
    }
  }

  return {
    pool:       poolEntry.name,
    pair,
    activeId,
    binStep,
    price:      adjustedPrice,
    reserveX:   formatDec(resX, decX),
    reserveY:   formatDec(resY, decY),
    positions,
    totalBins:  totalBinsWithLP,
    totalMyX:   formatDec(totalMyX, decX),
    totalMyY:   formatDec(totalMyY, decY),
    needsRebalance: positions.length > 0
      ? Math.abs(positions[Math.floor(positions.length / 2)].delta) > (lpConfig.defaults.rebalance_bins || 10)
      : false,
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
  console.log("║          UnyKorn LP Position Monitor             ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║  Operator: ${operatorAddr.slice(0, 10)}...${operatorAddr.slice(-8)}`.padEnd(51) + "║");
  console.log(`║  Chain:    Avalanche C-Chain (43114)`.padEnd(51) + "║");
  console.log(`║  Time:     ${new Date().toISOString()}`.padEnd(51) + "║");
  console.log("╚══════════════════════════════════════════════════╝");

  for (const r of results) {
    if (r.error) {
      console.log(`\n  ✗ ${r.pool}: ${r.error}`);
      continue;
    }

    console.log(`\n  ── ${r.pool} ──────────────────────────────────────`);
    console.log(`    Pair      : ${r.pair}`);
    console.log(`    Active ID : ${r.activeId}`);
    console.log(`    Bin Step  : ${r.binStep}`);
    console.log(`    Price     : ${r.price.toFixed(8)}`);
    console.log(`    Reserves  : ${r.reserveX} / ${r.reserveY}`);

    if (r.totalBins === 0) {
      console.log(`    Positions : NONE`);
    } else {
      console.log(`    Positions : ${r.totalBins} bins`);
      console.log(`    My Value  : ${r.totalMyX} ${r.pool.split("/")[0]} + ${r.totalMyY} ${r.pool.split("/")[1]}`);

      if (r.needsRebalance) {
        console.log(`    ⚠ REBALANCE NEEDED — position center drifted >${lpConfig.defaults.rebalance_bins} bins`);
      } else if (r.totalBins > 0) {
        console.log(`    ✓ Position in range`);
      }

      console.log(`\n    Bin ID    | Δ  | Share %  | ${r.pool.split("/")[0].padEnd(10)} | ${r.pool.split("/")[1]}`);
      console.log(`    ──────────┼────┼──────────┼────────────┼──────────`);
      for (const pos of r.positions) {
        const delta = pos.delta >= 0 ? `+${pos.delta}` : `${pos.delta}`;
        console.log(
          `    ${pos.binId.toString().padStart(8)} | ${delta.padStart(2)} | ` +
          `${pos.sharePercent.toFixed(2).padStart(6)}%  | ` +
          `${pos.myResX.padStart(10)} | ${pos.myResY}`
        );
      }
    }
  }
  console.log();
}

main().catch(err => {
  console.error("Monitor error:", err);
  process.exit(1);
});
