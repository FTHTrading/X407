/**
 * scripts/checkBalances.ts
 *
 * Checks native + UNY + USDC balances for ALL wallets in
 * registry/wallets/wallets.yaml using the Routescan API (no API key required).
 *
 * Usage:
 *   npx hardhat run scripts/checkBalances.ts --network avalanche
 *
 * Output: prints a table + saves exports/balances-<network>-<date>.json
 */

import { ethers, network } from "hardhat";
import * as dotenv          from "dotenv";
import * as https           from "https";
import * as fs              from "fs";
import * as path            from "path";

dotenv.config();

// ── Routescan base URLs ───────────────────────────────────────────────────────
const ROUTESCAN: Record<string, string | null> = {
  "avalanche": "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api",
  "polygon":   "https://api.routescan.io/v2/network/mainnet/evm/137/etherscan/api",
  "localhost": null,
};

// ── Token contracts ───────────────────────────────────────────────────────────
const TOKENS: Record<string, { address: string; decimals: number; symbol: string }[]> = {
  avalanche: [
    { address: "0xc09003213b34c7bec8d2eddfad4b43e51d007d66", decimals: 18, symbol: "UNY"    },
    { address: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7", decimals: 18, symbol: "WAVAX"  },
    { address: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", decimals: 6,  symbol: "USDC"   },
    { address: "0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664", decimals: 6,  symbol: "USDC.e" },
    { address: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", decimals: 6,  symbol: "USDt"   },
    { address: "0xd586e7f844cea2f87f50152665bcbc2c279d8d70", decimals: 18, symbol: "DAI.e"  },
    { address: "0x152b9d0fdc40c096de345c4ea95c83a3d837e38e", decimals: 8,  symbol: "BTC.b"  },
  ],
  polygon: [
    { address: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", decimals: 6,  symbol: "USDC"   },
    { address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", decimals: 6,  symbol: "USDC-N" },
    { address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", decimals: 6,  symbol: "USDT"   },
    { address: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", decimals: 18, symbol: "DAI"    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fetchJson(url: string): Promise<{ status: string; result: string }> {
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

// Simple YAML EVM address extractor — no external dep needed
function extractEVMAddresses(yamlContent: string): { label: string; address: string }[] {
  const results: { label: string; address: string }[] = [];
  // Match lines like:   address: "0x..."  or  key: "0x..."
  const re = /^\s*(?:address:|[a-z_]+:)\s*["']?(0x[0-9a-fA-F]{40})["']?/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(yamlContent)) !== null) {
    results.push({ label: "wallet", address: match[1] });
  }

  // Also extract label: "..." just before address lines
  const blockRe = /label:\s*["']([^"']+)["']\s*\n\s*address:\s*["']?(0x[0-9a-fA-F]{40})["']?/gm;
  const blockResults: { label: string; address: string }[] = [];
  while ((match = blockRe.exec(yamlContent)) !== null) {
    blockResults.push({ label: match[1], address: match[2] });
  }
  if (blockResults.length > 0) return blockResults;

  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const net     = network.name;
  const apiBase = ROUTESCAN[net] ?? null;
  const tokens  = TOKENS[net] ?? [];

  // Load wallets from registry
  const walletsYaml = path.resolve(__dirname, "../../../registry/wallets/wallets.yaml");
  const yamlContent = fs.readFileSync(walletsYaml, "utf8");
  const wallets     = extractEVMAddresses(yamlContent);

  console.log(`\n╔═══════════════════════════════════════════════════════╗`);
  console.log(`║  checkBalances — ${net.padEnd(35)}║`);
  console.log(`╚═══════════════════════════════════════════════════════╝`);
  console.log(`  Wallets found   : ${wallets.length}`);
  console.log(`  Token queries   : ${tokens.map(t => t.symbol).join(", ") || "native only"}`);
  console.log();

  const results: object[] = [];

  for (const w of wallets) {
    const row: Record<string, string> = { label: w.label, address: w.address };

    // Native
    try {
      const nativeWei = await ethers.provider.getBalance(w.address);
      row["native"]   = ethers.formatEther(nativeWei);
    } catch {
      row["native"]   = "error";
    }

    // Token balances via Routescan
    if (apiBase) {
      for (const token of tokens) {
        const url = `${apiBase}?module=account&action=tokenbalance&contractaddress=${token.address}&address=${w.address}&tag=latest`;
        try {
          const resp = await fetchJson(url);
          row[token.symbol] = resp.status === "1"
            ? ethers.formatUnits(resp.result, token.decimals)
            : "0";
        } catch {
          row[token.symbol] = "error";
        }
        // short delay to be polite to the public API
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // Print row
    const cols = Object.entries(row).map(([k, v]) => `${k}: ${v}`).join("  |  ");
    console.log(`  ${cols}`);
    results.push(row);
  }

  // Save
  const outDir  = path.resolve(__dirname, "../../../exports");
  fs.mkdirSync(outDir, { recursive: true });
  const today   = new Date().toISOString().slice(0, 10);
  const outFile = path.join(outDir, `balances-${net}-${today}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ network: net, generated_at: new Date().toISOString(), wallets: results }, null, 2));
  console.log(`\n  📄 Saved → ${outFile}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
