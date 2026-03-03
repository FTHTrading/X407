/**
 * scripts/checkBalance.ts
 *
 * Checks the native token balance of a single address on Avalanche or Polygon
 * using the Routescan Etherscan-compatible API (no API key required for basic queries).
 *
 * Usage:
 *   npx hardhat run scripts/checkBalance.ts --network avalanche
 *   ADDRESS=0x... npx hardhat run scripts/checkBalance.ts --network avalanche
 */

import { ethers, network } from "hardhat";
import * as dotenv          from "dotenv";
import * as https           from "https";

dotenv.config();

// ── Routescan endpoints ───────────────────────────────────────────────────────
const ROUTESCAN = {
  "avalanche": "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api",
  "polygon":   "https://api.routescan.io/v2/network/mainnet/evm/137/etherscan/api",
  "localhost": null,
} as const;

function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

async function main() {
  const [signer]  = await ethers.getSigners();
  const address   = process.env.ADDRESS ?? signer.address;
  const net       = network.name as keyof typeof ROUTESCAN;
  const apiBase   = ROUTESCAN[net] ?? null;

  console.log("\n────────────────────────────────────────────────");
  console.log("  checkBalance");
  console.log("────────────────────────────────────────────────");
  console.log(`  Network  : ${network.name}`);
  console.log(`  Address  : ${address}`);
  console.log("────────────────────────────────────────────────");

  // ── Native balance from provider ────────────────────────────────────────────
  const nativeWei  = await ethers.provider.getBalance(address);
  const nativeEth  = ethers.formatEther(nativeWei);
  console.log(`\n  Native   : ${nativeEth} (raw: ${nativeWei.toString()} wei)`);

  // ── ERC-20 balances via Routescan (Avalanche only) ──────────────────────────
  if (apiBase && net === "avalanche") {
    const TOKENS = [
      { symbol: "UNY",   address: "0xc09003213b34c7bec8d2eddfad4b43e51d007d66", decimals: 18 },
      { symbol: "WAVAX", address: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7", decimals: 18 },
      { symbol: "USDC",  address: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", decimals: 6  },
    ];

    for (const token of TOKENS) {
      const url = `${apiBase}?module=account&action=tokenbalance&contractaddress=${token.address}&address=${address}&tag=latest`;
      try {
        const resp = await fetchJson(url) as { status: string; result: string };
        if (resp.status === "1") {
          console.log(`  ${token.symbol.padEnd(6)}: ${ethers.formatUnits(resp.result, token.decimals)}`);
        } else {
          console.log(`  ${token.symbol.padEnd(6)}: 0`);
        }
      } catch {
        console.log(`  ${token.symbol.padEnd(6)}: (query failed)`);
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
