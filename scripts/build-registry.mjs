#!/usr/bin/env node
/**
 * build-registry.mjs
 * Reads all registry JSON/YAML files and emits:
 *   exports/unykorn-registry.json   — master combined registry
 *   exports/csv/contracts.csv
 *   exports/csv/tokens.csv
 *   exports/csv/tlds.csv
 *   exports/csv/ipfs.csv
 *   exports/csv/xrpl.csv
 *
 * Run:  node scripts/build-registry.mjs
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");
const REGISTRY  = path.join(ROOT, "registry");
const EXPORTS   = path.join(ROOT, "exports");
const CSV_DIR   = path.join(EXPORTS, "csv");

// ── helpers ──────────────────────────────────────────────────────────────────

function readJson(rel) {
  const full = path.join(REGISTRY, rel);
  if (!fs.existsSync(full)) return null;
  // Strip single-line // comments (contracts.json uses JSON5-style comments)
  const raw = fs.readFileSync(full, "utf8")
    .replace(/^\s*\/\/.*$/gm, "")   // remove // comment lines
    .replace(/,\s*([}\]])/g, "$1"); // remove trailing commas
  try { return JSON.parse(raw); }
  catch (e) { console.warn(`  ⚠  skipping ${rel}: ${e.message}`); return null; }
}

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function writeCsv(filename, rows) {
  if (!rows || rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const lines = [
    keys.join(","),
    ...rows.map(r =>
      keys.map(k => {
        const v = r[k] == null ? "" : String(r[k]);
        return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(",")
    )
  ];
  fs.writeFileSync(path.join(CSV_DIR, filename), lines.join("\n"), "utf8");
  console.log(`  ✓  exports/csv/${filename}  (${rows.length} rows)`);
}

// ── load registry data ────────────────────────────────────────────────────────

const contracts    = readJson("contracts/contracts.json");
const tlds         = readJson("contracts/tlds.json");
const ipfsIndex    = readJson("ipfs/ipfs-index.json");
const cids         = readJson("ipfs/cids.json");
const chains       = readJson("chains/chains.json");
const avaxUny      = readJson("tokens/avalanche-uny.json");
const avaxWavax    = readJson("tokens/avalanche-wavax.json");
const polyTokens   = readJson("tokens/polygon-tokens.json");
const poolUsdcUny  = readJson("pools/avalanche-lfj-uny-usdc.json");
const poolWavaxUny = readJson("pools/avalanche-lfj-uny-wavax.json");
const xrpl         = readJson("xrpl/xrpl-assets.json");

// ── normalize contracts ───────────────────────────────────────────────────────

const contractRows = contracts?.contracts?.map(c => ({
  id:       c.id      || "",
  name:     c.name    || "",
  chain:    c.chain   || "",
  chain_id: c.chain_id || "",
  address:  c.address || "",
  type:     c.type    || "",
  status:   c.status  || "",
  tx_deploy:c.tx_deploy || "",
  notes:    c.notes   || ""
})) ?? [];

// ── normalize TLDs ────────────────────────────────────────────────────────────

const tldRows = tlds?.tlds?.map(t => ({
  tld:      t.tld      || "",
  sector:   t.sector   || "",
  status:   t.status   || "",
  contract: t.contract || tlds?._minter_contract || "",
  token_id: t.token_id ?? "",
  ipfs:     t.ipfs_metadata || "",
  mint_txn: t.mint_txn || ""
})) ?? [];

// ── normalize IPFS ────────────────────────────────────────────────────────────

const ipfsRows = [
  ...(ipfsIndex?.assets ?? []).map(a => ({
    source:       "ipfs-index",
    cid:          a.cid,
    type:         a.type,
    name:         a.name,
    chain:        a.chain,
    contract:     a.contract_address || "",
    token_id:     a.token_id ?? "",
    created_at:   a.created_at || "",
    verification: a.verification,
    gateway:      a.gateway,
    notes:        a.notes || ""
  })),
  ...(cids?.cids ?? []).map(c => ({
    source:       "cids",
    cid:          c.cid,
    type:         "pinned",
    name:         c.asset,
    chain:        "",
    contract:     "",
    token_id:     "",
    created_at:   c.pinned_at || "",
    verification: "pinned",
    gateway:      c.gateway,
    notes:        c.notes || ""
  }))
];

// ── normalize tokens ──────────────────────────────────────────────────────────

const tokenSources = [avaxUny, avaxWavax, ...(polyTokens?.tokens ?? [])].filter(Boolean);
const tokenRows = tokenSources.map(t => ({
  symbol:   t.symbol   || "",
  name:     t.name     || "",
  chain:    t.chain    || "",
  chain_id: t.chain_id || "",
  address:  t.address  || "",
  decimals: t.decimals ?? "",
  status:   t.status   || "verified",
  notes:    t.notes    || ""
}));

// ── normalize XRPL IOUs ───────────────────────────────────────────────────────

const xrplRows = (xrpl?.ious ?? []).map(i => ({
  currency:     i.currency,
  issuer:       i.issuer,
  supply:       i.supply_obs ?? i.supply_logical ?? "",
  function:     i.function,
  value_low:    i.implied_value_low  ?? i.implied_value ?? "",
  value_high:   i.implied_value_high ?? i.implied_value ?? "",
  verification: i.verification
}));

// ── pools ─────────────────────────────────────────────────────────────────────

const poolRows = [poolUsdcUny, poolWavaxUny].filter(Boolean).map(p => ({
  pair:         p.pair || "",
  chain:        p.chain || "",
  dex:          p.dex  || "",
  pair_address: p.pair_address || "",
  token0:       p.token0?.symbol || "",
  token1:       p.token1?.symbol || ""
}));

// ── assemble master registry ──────────────────────────────────────────────────

const master = {
  _generated:  new Date().toISOString(),
  _version:    "1.0.0",
  chains:      chains?.chains    ?? [],
  contracts:   contractRows,
  tlds:        tldRows,
  tokens:      tokenRows,
  pools:       poolRows,
  ipfs:        ipfsRows,
  xrpl_ious:   xrplRows,
  xrpl_wallets: xrpl?.wallets ?? [],
  summary: {
    contracts:    contractRows.length,
    tlds:         tldRows.length,
    tokens:       tokenRows.length,
    pools:        poolRows.length,
    ipfs_entries: ipfsRows.length,
    xrpl_ious:    xrplRows.length
  }
};

// ── write outputs ─────────────────────────────────────────────────────────────

ensureDir(EXPORTS);
ensureDir(CSV_DIR);

fs.writeFileSync(
  path.join(EXPORTS, "unykorn-registry.json"),
  JSON.stringify(master, null, 2),
  "utf8"
);
console.log(`\n✓  exports/unykorn-registry.json`);

writeCsv("contracts.csv", contractRows);
writeCsv("tlds.csv",      tldRows);
writeCsv("tokens.csv",    tokenRows);
writeCsv("ipfs.csv",      ipfsRows);
writeCsv("xrpl.csv",      xrplRows);
writeCsv("pools.csv",     poolRows);

console.log(`\nRegistry build complete.`);
console.log(`  contracts : ${master.summary.contracts}`);
console.log(`  TLDs      : ${master.summary.tlds}`);
console.log(`  tokens    : ${master.summary.tokens}`);
console.log(`  IPFS CIDs : ${master.summary.ipfs_entries}`);
console.log(`  XRPL IOUs : ${master.summary.xrpl_ious}`);
