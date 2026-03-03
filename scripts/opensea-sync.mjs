/**
 * opensea-sync.mjs
 * Fetches all NFTs held by the operator wallet from OpenSea v2 API.
 * Writes raw response to exports/opensea-nfts.json and a clean summary
 * to exports/opensea-summary.json.
 *
 * Run: node scripts/opensea-sync.mjs
 * Requires: .env.registry with OPENSEA_API_KEY and OPERATOR_WALLET
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

// ── Load .env.registry ────────────────────────────────────────────────────────
const ROOT     = fileURLToPath(new URL("..", import.meta.url));
const envPath  = join(ROOT, ".env.registry");

if (!existsSync(envPath)) {
  console.error("✗  .env.registry not found. Copy .env.example → .env.registry and fill in values.");
  process.exit(1);
}

// Minimal dotenv parser (no dep needed for simple key=value format)
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const API_KEY = env.OPENSEA_API_KEY;
const WALLET  = env.OPERATOR_WALLET;

if (!API_KEY || API_KEY === "your_opensea_api_key_here") {
  console.error("✗  OPENSEA_API_KEY not set in .env.registry");
  process.exit(1);
}
if (!WALLET) {
  console.error("✗  OPERATOR_WALLET not set in .env.registry");
  process.exit(1);
}

const EXPORTS_DIR = join(ROOT, "exports");
if (!existsSync(EXPORTS_DIR)) mkdirSync(EXPORTS_DIR, { recursive: true });

// ── OpenSea v2 API — chains to scan ──────────────────────────────────────────
const CHAINS = ["ethereum", "matic", "arbitrum", "avalanche"];

// ── Fetch with pagination ─────────────────────────────────────────────────────
async function fetchNFTsForChain(chain) {
  let next   = null;
  let assets = [];
  let page   = 0;

  do {
    const url = `https://api.opensea.io/api/v2/chain/${chain}/account/${WALLET}/nfts?limit=200${next ? "&next=" + next : ""}`;
    const res  = await fetch(url, {
      headers: { "x-api-key": API_KEY, "accept": "application/json" }
    });

    if (res.status === 404) break;                        // chain not supported / no NFTs
    if (!res.ok) {
      console.warn(`  ⚠ ${chain} HTTP ${res.status}: ${await res.text()}`);
      break;
    }

    const data = await res.json();
    const nfts = data.nfts ?? [];
    assets.push(...nfts);
    next   = data.next ?? null;
    page++;

    if (nfts.length === 0) break;
  } while (next && page < 20);                           // hard cap 4,000 NFTs/chain

  return assets;
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log("\n🔍  OpenSea Sync");
console.log(`    Wallet : ${WALLET}`);
console.log(`    Chains : ${CHAINS.join(", ")}\n`);

const allNFTs  = {};
const summary  = { wallet: WALLET, fetched_at: new Date().toISOString(), by_chain: {} };
let   total    = 0;

for (const chain of CHAINS) {
  process.stdout.write(`  → ${chain.padEnd(12)}`);
  const nfts = await fetchNFTsForChain(chain);
  allNFTs[chain] = nfts;
  summary.by_chain[chain] = {
    count:      nfts.length,
    contracts:  [...new Set(nfts.map(n => n.contract))],
    tokens:     nfts.map(n => ({
      contract:    n.contract,
      token_id:    n.identifier,
      name:        n.name,
      collection:  n.collection,
      metadata_url:n.metadata_url ?? null,
      image_url:   n.image_url    ?? null,
      opensea_url: `https://opensea.io/assets/${chain}/${n.contract}/${n.identifier}`,
    })),
  };
  total += nfts.length;
  console.log(`${nfts.length} NFTs`);
}

summary.total = total;

// Write outputs
writeFileSync(join(EXPORTS_DIR, "opensea-nfts-raw.json"),  JSON.stringify(allNFTs, null, 2));
writeFileSync(join(EXPORTS_DIR, "opensea-summary.json"),   JSON.stringify(summary, null, 2));

console.log(`\n✅  ${total} total NFTs across ${CHAINS.length} chains`);
console.log(`    exports/opensea-nfts-raw.json`);
console.log(`    exports/opensea-summary.json\n`);

// ── Cross-reference with TLD registry ─────────────────────────────────────────
const tldsPath = join(ROOT, "registry", "contracts", "tlds.json");
if (existsSync(tldsPath)) {
  const tlds = JSON.parse(readFileSync(tldsPath, "utf8"));
  const knownContracts = new Set([
    tlds._contract_GlacierMint_0,
    tlds._contract_GlacierMint_1,
    tlds._contract_GlacierMint_2,
    tlds._contract_OptimaMint,
  ].map(a => a?.toLowerCase()));

  const matched = [];
  for (const [chain, nfts] of Object.entries(allNFTs)) {
    for (const n of nfts) {
      if (knownContracts.has(n.contract?.toLowerCase())) {
        matched.push({ chain, contract: n.contract, token_id: n.identifier, name: n.name, metadata_url: n.metadata_url });
      }
    }
  }

  if (matched.length > 0) {
    writeFileSync(join(EXPORTS_DIR, "opensea-tld-matches.json"), JSON.stringify(matched, null, 2));
    console.log(`🎯  ${matched.length} TLD NFT(s) found in GlacierMint contracts`);
    console.log(`    exports/opensea-tld-matches.json\n`);
  } else {
    console.log(`    (no GlacierMint TLD NFTs found in this wallet on scanned chains)`);
  }
}
