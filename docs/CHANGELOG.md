# UnyKorn Stack — Changelog

All notable changes to the UnyKorn monorepo are documented here.

---

## [Unreleased] — 2026-03-03

### LP V1 Rewrite (CRITICAL)

**Discovery:** Smoke test revealed both UNY pools (UNY/USDC, UNY/WAVAX) are TraderJoe V1 classic AMM (x\*y=k), NOT Liquidity Book V2.1. Zero LB pairs exist for UNY. Confirmed via `diagnosePair.ts` and `diagnoseLB.ts` querying live contracts.

**Registry corrections:**
- `avalanche-lfj-uny-usdc.json` — Fixed pair_type to V1, corrected token order (on-chain: token0=USDC, token1=UNY), removed all lb_* fields, added v1_router/pair_factory
- `avalanche-lfj-uny-wavax.json` — Same corrections (on-chain: token0=WAVAX, token1=UNY)
- `lp-config.json` — Protocol changed to "TraderJoe V1 Classic AMM", bin-based strategies removed, full_range strategy added

**Script rewrites (LB V2.1 → V1 Classic AMM):**
- `checkLP.ts` — V1 ABIs (getReserves, token0/1), LP ERC-20 balance, reserve-based pricing. **Live-tested on Avalanche ✓**
- `addLiquidity.ts` — V1 Router addLiquidity/addLiquidityAVAX (standard params, no bins/distributions)
- `removeLiquidity.ts` — V1 LP token approve + removeLiquidity/removeLiquidityAVAX (percentage-based, no bin scanning)
- `collectFees.ts` — Converted to snapshot-based fee estimation tool (V1 fees auto-compound into LP value)
- `lp-monitor.mjs` — V1 reserves + ERC-20 LP balanceOf (no ERC-1155 bin scanning). **Live-tested ✓**
- `lp-safety.ts` — Added `printPositionDiffV1()` for V1 position diff preview (LP token / reserve-based)

**New diagnostic tools:**
- `diagnosePair.ts` — Tests function selectors to determine pair type (V1 vs LB)
- `diagnoseLB.ts` — Queries LB Factory for pair existence, counts total LB pairs

### Registry expansion

- **contracts.json**: Expanded from 22 → 30 contracts
  - Added: GlacierMint-1, GlacierMint-2, DTT, OGB, OIB, SHO, TroptionsVaultNFT, GlacierAgentWallet (ERC-6551)
- **tlds.json**: Expanded from 0 → 78 TLD entries
  - Each entry includes: `token_id`, `contract`, `ipfs_metadata_cid`, `source` (`chat_log` | `verified`)
  - References 4 GlacierMint contracts + OptimaMint
- **ipfs-index.json**: Expanded from 7 → 33 CIDs
  - GlacierMint-1 TLD certs (11), GlacierMint-2 certs (5), creator/personal domains (4), plus originals
- **pools**: Filled `pair_address` for UNY/WAVAX pool via Dexscreener API (`0xC6F5273D...`)
  - UNY/USDC: `0x9ff923a83B3d12DB280Ff65D69AE37819a743f83`
  - UNY/WAVAX: `0xC6F5273D74571d91CBcBA0A2900ed5F7C800F5d0`
- **wallets.yaml**: Added `primary_operator` wallet (`0xffBC...62b5` / `uni.eth`)
  - Full 24-token snapshot (UNY=52,368, DTT=176,594, TRUST=39,949, etc.)
- **xrpl-assets.json**: 10 XRPL IOUs cataloged

### Build tooling (new)

- **`scripts/inventory.mjs`** — File scanner with secret detection. Outputs `exports/inventory.json` + `.csv`
- **`scripts/build-registry.mjs`** — Canonical JSON + CSV export pipeline for all registry data
- **`scripts/build-proof-pack.mjs`** — Stages registry + exports into a ZIP proof-pack with manifest
- **`scripts/opensea-sync.mjs`** — Fetches operator wallet NFTs from OpenSea v2 API, cross-references with GlacierMint contracts
- **Root `package.json`** — Monorepo scripts: `inventory`, `export`, `export:all`, `proof-pack`, `opensea:sync`, `full-build`

### Contract scripts (new)

- **`genMeta.ts`** — Generates ERC-721 metadata JSON from `tlds.json` for entries with `token_id`
- **`updateURIs.ts`** — Batch-sets `tokenURI` on GlacierMint contracts (dry-run by default, `--live` flag for real txns)

### Hardhat configuration

- **Fixed corrupted variable names** — `hardhat.config.ts` had rogue characters in `PRIVATE_KEY` / `PRIVATE_KEY_2` variable declarations; cleaned up
- **Multi-key support** — Config now reads `PRIVATE_KEY`, `PRIVATE_KEY_2`, `PRIVATE_KEY_3` from `.env`, filters out zero-key placeholders
- **Network config** — Avalanche C-Chain (43114) + Polygon (137) with Routescan etherscan integration

### Environment & security

- **`.env`** (contracts) — PRIVATE_KEY set (66 chars), RPC endpoints configured
- **`.env.registry`** (root) — OpenSea API key + operator wallet address
- **`.env.example`** files created for contracts + root
- **`.gitignore`** — All `.env` files excluded

### Exports generated

- `exports/unykorn-registry.json` — Unified registry export
- `exports/csv/` — contracts.csv, tlds.csv, tokens.csv, ipfs.csv, xrpl.csv, pools.csv
- `exports/proof-pack/UNYKORN_PROOF_PACK_v1.zip` — Portable proof archive
- `exports/dexscreener_uny_pairs.json` — Dexscreener API response for UNY pairs

### Documentation

- **STATUS.md** — Rewritten to reflect 30 contracts, 78 TLDs, 33 CIDs, all scripts, current pending items
- **ROADMAP.md** — Reorganized into 5 phases; Phase 1 + Phase 2 marked complete
- **CHANGELOG.md** — This file (new)

---

## [0.0.1] — 2026-03 (initial)

- Monorepo created with `packages/unyKorn-contracts` and `packages/unyKorn-wallet`
- UNY ERC-20 deployed on Avalanche C-Chain
- UNY/USDC pool established on LFJ (TraderJoe)
- Initial registry scaffolding: chains, tokens, pools, wallets
- Hardhat project: Solidity 0.8.24, compile/test/deploy pipeline
- Wallet UI MVP: Vite + React + TypeScript
