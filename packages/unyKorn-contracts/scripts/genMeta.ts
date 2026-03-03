/**
 * genMeta.ts
 * Generates ERC-721 compliant metadata JSON files for all TLD NFTs
 * that have a known token_id in tlds.json.
 *
 * Output: ../../exports/metadata/{contract_short}/{token_id}.json
 *
 * Run: npx hardhat run scripts/genMeta.ts
 * Or:  npx ts-node scripts/genMeta.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";

// ── Paths ─────────────────────────────────────────────────────────────────────
const CONTRACTS_PKG  = resolve(__dirname, "..");
const ROOT           = resolve(CONTRACTS_PKG, "../..");
const TLDS_PATH      = join(ROOT, "registry", "contracts", "tlds.json");
const EXPORTS_DIR    = join(ROOT, "exports", "metadata");

// ── Load TLDs ─────────────────────────────────────────────────────────────────
interface TldEntry {
  tld:           string;
  sector:        string;
  status:        string;
  contract?:     string;
  token_id?:     number;
  ipfs_metadata?: string;
  mint_txn?:     string;
  source?:       string;
  vault_contract?: string;
}

interface TldsFile {
  _contract_GlacierMint_1: string;
  _contract_GlacierMint_2: string;
  _contract_GlacierMint_0: string;
  _contract_OptimaMint:    string;
  tlds: TldEntry[];
}

const raw   = readFileSync(TLDS_PATH, "utf8");
const tlds  = JSON.parse(raw) as TldsFile;

// Contract short-name map for output directories
const CONTRACT_NAMES: Record<string, string> = {
  [tlds._contract_GlacierMint_1?.toLowerCase()]: "glaciermint-1",
  [tlds._contract_GlacierMint_2?.toLowerCase()]: "glaciermint-2",
  [tlds._contract_GlacierMint_0?.toLowerCase()]: "glaciermint-0",
  [tlds._contract_OptimaMint?.toLowerCase()]:    "optima",
};

// ── Build metadata ────────────────────────────────────────────────────────────
const skipped: string[] = [];
const written: string[] = [];

for (const entry of tlds.tlds) {
  // Only process entries that have both contract and token_id
  if (entry.contract === undefined || entry.token_id === undefined) {
    skipped.push(entry.tld);
    continue;
  }

  const contractKey  = entry.contract.toLowerCase();
  const contractDir  = CONTRACT_NAMES[contractKey] ?? contractKey.slice(0, 10);
  const outDir       = join(EXPORTS_DIR, contractDir);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  // ERC-721 standard metadata schema
  const meta = {
    name:         `${entry.tld} TLD`,
    description:  `UnyKorn root TLD namespace NFT for ${entry.tld}. Sector: ${entry.sector}. Minted on Polygon via GlacierMint.`,
    image:        entry.ipfs_metadata ?? `ipfs://placeholder_${entry.tld.replace(/\./g, "_")}_image`,
    external_url: `https://unykorn.io/tld${entry.tld}`,
    attributes:   [
      { trait_type: "TLD",               value: entry.tld                       },
      { trait_type: "Sector",            value: entry.sector                    },
      { trait_type: "Status",            value: entry.status                    },
      { trait_type: "Chain",             value: "polygon-mainnet"               },
      { trait_type: "Contract",          value: entry.contract                  },
      { trait_type: "Token ID",          value: String(entry.token_id)          },
      { trait_type: "Source Confidence", value: entry.source ?? "unverified"    },
      ...(entry.vault_contract ? [{ trait_type: "Vault Contract", value: entry.vault_contract }] : []),
    ],
    properties: {
      contract:    entry.contract,
      token_id:    entry.token_id,
      chain_id:    137,
      ipfs_cid:    entry.ipfs_metadata?.replace("ipfs://", "") ?? null,
      mint_txn:    entry.mint_txn ?? null,
      source:      entry.source ?? "unverified",
    },
  };

  const outPath = join(outDir, `${entry.token_id}.json`);
  writeFileSync(outPath, JSON.stringify(meta, null, 2));
  written.push(`  ✓  ${contractDir}/${entry.token_id}.json  (${entry.tld})`);
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log("\n📝  TLD Metadata Generator\n");
written.forEach(l => console.log(l));
console.log(`\n✅  ${written.length} metadata files written → exports/metadata/`);
if (skipped.length) {
  console.log(`    Skipped ${skipped.length} TLDs (no token_id): ${skipped.slice(0, 8).join(", ")}${skipped.length > 8 ? "…" : ""}`);
}
console.log();
