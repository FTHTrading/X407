/**
 * build-proof-pack.mjs
 * Assembles the UnyKorn proof-pack deliverable:
 *   1. Copies registry exports + raw registry data into exports/proof-pack/
 *   2. Zips to exports/proof-pack/UNYKORN_PROOF_PACK_v1.zip
 *
 * Run: node scripts/build-proof-pack.mjs
 * Requires: Node ≥18. No external npm deps — uses PowerShell Compress-Archive on Windows.
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, readFileSync } from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname  = fileURLToPath(new URL("..", import.meta.url));
const ROOT       = __dirname;
const PACK_DIR   = join(ROOT, "exports", "proof-pack");
const ZIP_PATH   = join(ROOT, "exports", "proof-pack", "UNYKORN_PROOF_PACK_v1.zip");

// ── Sources to include ────────────────────────────────────────────────────────
const INCLUDE_FILES = [
  // Registry raw data
  ["registry/contracts/contracts.json",  "registry/contracts.json"],
  ["registry/contracts/tlds.json",        "registry/tlds.json"],
  ["registry/ipfs/ipfs-index.json",       "registry/ipfs-index.json"],
  ["registry/ipfs/cids.json",             "registry/cids.json"],
  ["registry/tokens/avalanche-uny.json",  "registry/avalanche-uny.json"],
  ["registry/pools/avalanche-lfj-uny-usdc.json", "registry/pools.json"],
  ["registry/chains/chains.json",         "registry/chains.json"],
  ["registry/wallets/wallets.yaml",       "registry/wallets.yaml"],
  // XRPL assets (if present)
  ["registry/xrpl/xrpl-assets.json",     "registry/xrpl-assets.json"],
  // Docs
  ["docs/STATUS.md",       "docs/STATUS.md"],
  ["docs/ROADMAP.md",      "docs/ROADMAP.md"],
  ["docs/OPERATIONS.md",   "docs/OPERATIONS.md"],
  ["README.md",            "README.md"],
];

const INCLUDE_DIRS = [
  // All CSV exports
  ["exports", "exports"],
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function safeCopy(src, destRel) {
  const srcAbs  = join(ROOT, src);
  const destAbs = join(PACK_DIR, destRel);
  if (!existsSync(srcAbs)) {
    console.warn(`  SKIP (not found): ${src}`);
    return;
  }
  ensureDir(join(PACK_DIR, destRel.includes("/") ? destRel.split("/").slice(0, -1).join("/") : "."));
  copyFileSync(srcAbs, destAbs);
  console.log(`  ✓ ${src}  →  proof-pack/${destRel}`);
}

function copyDirFlat(srcRel, destRel) {
  const srcAbs  = join(ROOT, srcRel);
  if (!existsSync(srcAbs)) return;
  const destAbs = join(PACK_DIR, destRel);
  ensureDir(destAbs);
  for (const f of readdirSync(srcAbs)) {
    const full = join(srcAbs, f);
    if (statSync(full).isFile()) {
      copyFileSync(full, join(destAbs, f));
      console.log(`  ✓ ${srcRel}/${f}  →  proof-pack/${destRel}/${f}`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log("\n📦  UnyKorn Proof-Pack Builder\n");
console.log(`   Staging dir : ${PACK_DIR}`);
console.log(`   Output ZIP  : ${ZIP_PATH}\n`);

// 1. Recreate staging dir (wipe stale files but keep the dir)
ensureDir(PACK_DIR);

// 2. Copy individual files
console.log("── Copying files ──────────────────────────────────────────");
for (const [src, dest] of INCLUDE_FILES) {
  safeCopy(src, dest);
}

// 3. Copy directory contents
console.log("\n── Copying export CSVs ────────────────────────────────────");
const exportsAbs = join(ROOT, "exports");
if (existsSync(exportsAbs)) {
  ensureDir(join(PACK_DIR, "exports"));
  for (const f of readdirSync(exportsAbs)) {
    const full = join(exportsAbs, f);
    if (statSync(full).isFile() && !f.startsWith("UNYKORN_PROOF_PACK")) {
      copyFileSync(full, join(PACK_DIR, "exports", f));
      console.log(`  ✓ exports/${f}  →  proof-pack/exports/${f}`);
    }
  }
}

// 4. Write a manifest
const manifest = {
  name:    "UNYKORN_PROOF_PACK_v1",
  built:   new Date().toISOString(),
  files:   INCLUDE_FILES.map(([, d]) => d),
  notes: [
    "Registry truth — on-chain + chat_log verified",
    "token_ids marked source:chat_log need on-chain confirmation via polygonscan tokenURI()",
    "IPFS CIDs can be verified at https://ipfs.io/ipfs/<CID>",
  ]
};
import("fs").then(fs => {
  fs.writeFileSync(join(PACK_DIR, "MANIFEST.json"), JSON.stringify(manifest, null, 2));
  console.log("\n  ✓ MANIFEST.json written");
  buildZip();
});

function buildZip() {
  // 5. Remove old zip
  if (existsSync(ZIP_PATH)) {
    try { execSync(`del /F /Q "${ZIP_PATH}"`, { shell: "cmd.exe" }); } catch (_) {}
  }

  // 6. Zip via PowerShell Compress-Archive
  console.log("\n── Building ZIP ────────────────────────────────────────────");
  const ps = `Compress-Archive -Path "${PACK_DIR}\\*" -DestinationPath "${ZIP_PATH}" -Force`;
  try {
    execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: "inherit" });
    console.log(`\n✅  Proof-pack ZIP ready: exports/proof-pack/UNYKORN_PROOF_PACK_v1.zip\n`);
  } catch (err) {
    console.error("  ✗ ZIP failed — staging dir still available at:", PACK_DIR);
    console.error("    Run manually: Compress-Archive -Path exports\\proof-pack\\* -DestinationPath exports\\proof-pack\\UNYKORN_PROOF_PACK_v1.zip");
    process.exit(1);
  }
}
