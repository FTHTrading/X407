/**
 * inventory.mjs
 * Walks the unyKorn-master repo and emits exports/inventory.json + exports/inventory.csv.
 * Flags files that may contain secrets (hex private keys / mnemonic-length word runs).
 *
 * Usage:
 *   node scripts/inventory.mjs              (runs from repo root)
 *   node scripts/inventory.mjs /some/path   (runs from supplied root)
 */

import fs   from "fs";
import path from "path";
import crypto from "crypto";

const ROOT     = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const OUT_JSON = path.join(ROOT, "exports", "inventory.json");
const OUT_CSV  = path.join(ROOT, "exports", "inventory.csv");

// Directories to never recurse into
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out",
  ".next", "artifacts", "cache", "typechain-types", "exports"
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function sha256(filePath) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(filePath));
  return h.digest("hex");
}

function walk(dir, results = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return results; }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(p, results);
    } else if (entry.isFile()) {
      results.push(p);
    }
  }
  return results;
}

// Files where hex strings are expected and NOT secrets (false-positive list)
const SKIP_SECRET_SCAN = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "*.lock",
  // Registry files contain contract/tx addresses + CIDs — not private keys
  "contracts.json",
  "tlds.json",
  "ipfs-index.json",
  "cids.json",
  "xrpl-assets.json",
  "wallets.yaml",
]);

// Heuristics: flag (not store) possible secrets
// 64-char hex run  → probable EVM private key
// 12-24 lowercase word sequence → probable BIP-39 mnemonic
const SECRET_PATTERNS = [
  /(?<![a-f0-9])[a-f0-9]{64}(?![a-f0-9])/i,
  /\b([a-z]+\s){11,23}[a-z]+\b/
];

function scanSecrets(filePath, sizeBytes) {
  const basename = path.basename(filePath);
  if (SKIP_SECRET_SCAN.has(basename)) return false;
  if (sizeBytes > 2_000_000) return false; // skip large binaries
  let txt;
  try { txt = fs.readFileSync(filePath, "utf8"); }
  catch { return false; }
  return SECRET_PATTERNS.some((re) => re.test(txt));
}

// ── File classifier ───────────────────────────────────────────────────────────

function classify(filePath) {
  const n = path.basename(filePath).toLowerCase();
  const ext = path.extname(n);
  if (n.includes("hardhat.config"))   return "hardhat-config";
  if (n.includes("vite.config"))      return "vite-config";
  if (n === "package.json")           return "package-json";
  if (n === ".env.example")           return "env-example";
  if (n.startsWith(".env"))           return "env-secret";
  if (n.includes("deploy"))           return "deploy-script";
  if (n.includes("verify"))           return "verify-script";
  if (n.includes("genesis"))          return "genesis";
  if (n.includes("registry"))         return "registry";
  if (n.includes("ipfs") || n.includes("cid")) return "ipfs";
  if (n.includes("inventory"))        return "inventory";
  if (ext === ".sol")                 return "solidity";
  if (ext === ".ts")                  return "typescript";
  if ([".js", ".mjs", ".cjs"].includes(ext)) return "javascript";
  if ([".json", ".jsonc"].includes(ext))     return "json";
  if ([".yaml", ".yml"].includes(ext))       return "yaml";
  if (ext === ".md")                  return "docs";
  if (ext === ".sh")                  return "shell";
  if (ext === ".ps1")                 return "powershell";
  return "file";
}

// ── Main ──────────────────────────────────────────────────────────────────────

fs.mkdirSync(path.join(ROOT, "exports"), { recursive: true });

const files = walk(ROOT);
const rows  = [];

for (const f of files) {
  const stat = fs.statSync(f);
  const flagged = scanSecrets(f, stat.size);
  rows.push({
    path:        path.relative(ROOT, f).replace(/\\/g, "/"),
    type:        classify(f),
    bytes:       stat.size,
    sha256:      sha256(f),
    secret_flag: flagged
  });
}

// Sort: flagged first, then by path
rows.sort((a, b) => (b.secret_flag - a.secret_flag) || a.path.localeCompare(b.path));

// ── Write JSON ────────────────────────────────────────────────────────────────
const jsonOut = {
  root:         ROOT,
  generated_at: new Date().toISOString(),
  total_files:  rows.length,
  secret_count: rows.filter(r => r.secret_flag).length,
  files:        rows
};
fs.writeFileSync(OUT_JSON, JSON.stringify(jsonOut, null, 2));

// ── Write CSV ─────────────────────────────────────────────────────────────────
const escape = v => String(v).includes(",") ? `"${v}"` : v;
const csvLines = ["path,type,bytes,sha256,secret_flag",
  ...rows.map(r => [r.path, r.type, r.bytes, r.sha256, r.secret_flag].map(escape).join(","))
];
fs.writeFileSync(OUT_CSV, csvLines.join("\n") + "\n");

// ── Report ────────────────────────────────────────────────────────────────────
const fc = jsonOut.secret_count;
console.log(`\nInventory complete (${rows.length} files)`);
console.log(`  JSON  → ${OUT_JSON}`);
console.log(`  CSV   → ${OUT_CSV}`);
if (fc > 0) {
  console.log(`\n⚠  ${fc} file(s) flagged as possible secret carriers:`);
  rows.filter(r => r.secret_flag).forEach(r => console.log(`   • ${r.path}`));
  console.log("\nAction: open each file, remove secrets, move them to .env or offline storage.\n");
} else {
  console.log("\n✓  No secret patterns detected.\n");
}
