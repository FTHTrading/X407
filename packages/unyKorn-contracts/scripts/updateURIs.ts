/**
 * updateURIs.ts
 * Batch-sets tokenURI on GlacierMint contracts for all TLDs with known
 * token_id and ipfs_metadata in tlds.json.
 *
 * SAFETY:  Reads PRIVATE_KEY from .env. Only runs on --network polygon.
 *          Dry-run by default — pass --live to broadcast real txns.
 *
 * Run (dry-run):  npx hardhat run scripts/updateURIs.ts --network polygon
 * Run (live):     DRY_RUN=false npx hardhat run scripts/updateURIs.ts --network polygon
 *
 * Required env (in .env at packages/unyKorn-contracts/):
 *   PRIVATE_KEY   — signer key (must be the GlacierMint owner/minter)
 *   POLYGON_RPC   — Polygon mainnet RPC URL
 */

import hre from "hardhat";
import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { join, resolve } from "path";

// ── Config ────────────────────────────────────────────────────────────────────
const DRY_RUN = process.env.DRY_RUN !== "false";

// Minimal ABI covering common GlacierMint URI setter patterns
const GLACIER_ABI = [
  // ERC-721 standard read
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  // Common setter patterns (try in order until one matches)
  "function setTokenURI(uint256 tokenId, string memory _tokenURI)",
  "function updateMetadata(uint256 tokenId, string memory _uri)",
  "function setBaseURI(string memory baseURI_)",
  "function setURI(uint256 tokenId, string memory uri)",
];

// ── Load TLD registry ─────────────────────────────────────────────────────────
const ROOT      = resolve(__dirname, "../../..");
const TLDS_PATH = join(ROOT, "registry", "contracts", "tlds.json");

interface TldEntry {
  tld:           string;
  contract?:     string;
  token_id?:     number;
  ipfs_metadata?: string;
  source?:       string;
}
interface TldsFile { tlds: TldEntry[]; }

const tldData = JSON.parse(readFileSync(TLDS_PATH, "utf8")) as TldsFile;

// Only entries with contract + token_id + ipfs_metadata
const targets = tldData.tlds.filter(
  (t): t is Required<Pick<TldEntry, "contract"|"token_id"|"ipfs_metadata">> & TldEntry =>
    !!(t.contract && t.token_id !== undefined && t.ipfs_metadata)
);

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const [signer] = await ethers.getSigners();

  console.log("\n🔧  GlacierMint URI Batch Updater");
  console.log(`    Signer  : ${signer.address}`);
  console.log(`    Network : ${hre.network.name}`);
  console.log(`    Mode    : ${DRY_RUN ? "DRY RUN (no txns sent)" : "⚡ LIVE — BROADCASTING"}`);
  console.log(`    Targets : ${targets.length} TLDs with token_id + ipfs_metadata\n`);

  if (hre.network.name !== "polygon" && !DRY_RUN) {
    console.error("✗  Live mode requires --network polygon. Refusing to run on:", hre.network.name);
    process.exit(1);
  }

  // Group by contract to batch per-contract
  const byContract = new Map<string, typeof targets>();
  for (const t of targets) {
    const key = t.contract.toLowerCase();
    if (!byContract.has(key)) byContract.set(key, []);
    byContract.get(key)!.push(t);
  }

  let successCount = 0;
  let failCount    = 0;

  for (const [contractAddr, entries] of byContract) {
    console.log(`\n── Contract ${contractAddr} (${entries.length} tokens) ──`);
    const contract = new ethers.Contract(contractAddr, GLACIER_ABI, signer);

    for (const entry of entries) {
      const uri = entry.ipfs_metadata; // e.g. "ipfs://QmS9kk..."

      // Read current tokenURI
      let current = "(unknown)";
      try {
        current = await contract.tokenURI(entry.token_id);
      } catch (_) { /* contract may not support tokenURI() read */ }

      if (current === uri) {
        console.log(`  ⏭  token_id ${entry.token_id} (${entry.tld}) — already set, skip`);
        continue;
      }

      console.log(`  ${DRY_RUN ? "🔍" : "📡"}  token_id ${entry.token_id} (${entry.tld})`);
      console.log(`       current : ${current}`);
      console.log(`       new     : ${uri}`);

      if (DRY_RUN) {
        console.log(`       → dry-run: would call setTokenURI(${entry.token_id}, "${uri}")`);
        successCount++;
        continue;
      }

      // Try setter methods in priority order
      let sent = false;
      for (const setter of ["setTokenURI", "updateMetadata", "setURI"] as const) {
        try {
          const tx = await (contract as any)[setter](entry.token_id, uri);
          console.log(`       → txn: ${tx.hash}`);
          await tx.wait();
          console.log(`       ✓ confirmed`);
          successCount++;
          sent = true;
          break;
        } catch (err: any) {
          if (err?.code === "CALL_EXCEPTION" || err?.message?.includes("not a function")) continue;
          console.error(`       ✗ ${setter} failed:`, err?.message ?? err);
        }
      }

      if (!sent) {
        console.warn(`       ✗ no compatible setter found on contract — add ABI manually`);
        failCount++;
      }
    }
  }

  console.log(`\n── Summary ──────────────────────────────────────────────`);
  console.log(`   ✓ ${successCount} succeeded (or would succeed in dry-run)`);
  if (failCount) console.log(`   ✗ ${failCount} failed`);
  if (DRY_RUN) console.log(`\n   Re-run with DRY_RUN=false to broadcast real transactions.`);
  console.log();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
