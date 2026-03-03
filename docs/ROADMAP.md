# UnyKorn Stack — Roadmap

_Last updated: 2026-03-03_

---

## Phase 1 — Foundation ✅

- [x] Deploy UNY ERC-20 on Avalanche C-Chain
- [x] Establish UNY/USDC LP pool on LFJ (TraderJoe)
- [x] Establish UNY/WAVAX LP pool on LFJ
- [x] Create Master Stack monorepo structure (`packages/`, `registry/`, `scripts/`)
- [x] Registry scaffolding: chains, tokens, pools, wallets, XRPL
- [x] Hardhat project: compile, test, deploy pipeline complete (Solidity 0.8.24)
- [x] Wallet UI MVP: Vite + React + TypeScript, connect wallet, display balance

## Phase 2 — Registry & Automation ✅

- [x] Expand contracts registry to 30 contracts (GlacierMint-0/1/2, OptimaMint, DTT, OGB, OIB, SHO, etc.)
- [x] Build TLD namespace registry: 78 TLDs with token_ids, IPFS CIDs, source classification
- [x] Build IPFS CID index: 33 CIDs with provenance tracking
- [x] Catalog XRPL IOUs: 10 assets
- [x] Fill pool pair addresses via Dexscreener API (UNY/USDC + UNY/WAVAX)
- [x] Add primary_operator wallet to `wallets.yaml` with full 24-token snapshot
- [x] Create `inventory.mjs` — file scanner with secret detection (71 files)
- [x] Create `build-registry.mjs` — canonical JSON + CSV export pipeline
- [x] Create `build-proof-pack.mjs` — ZIP archive builder with manifest
- [x] Create `opensea-sync.mjs` — OpenSea v2 API NFT cross-reference script
- [x] Create `genMeta.ts` — ERC-721 metadata generator from TLD registry
- [x] Create `updateURIs.ts` — batch tokenURI setter (dry-run by default)
- [x] Root `package.json` with monorepo npm scripts (`full-build`, `inventory`, `export`, `proof-pack`)
- [x] Hardhat multi-key support (`PRIVATE_KEY`, `PRIVATE_KEY_2`, `PRIVATE_KEY_3` with zero-key filtering)
- [x] `.env.registry` for OpenSea API key + operator wallet
- [x] `.env.example` files for contracts + root

## Phase 3 — Testing & Verification (current)

- [ ] Test `opensea-sync.mjs` against live OpenSea v2 API
- [ ] Test `genMeta.ts` — generate metadata JSON for TLDs with token_ids
- [ ] Test `updateURIs.ts` — dry-run on Polygon, then live execution
- [ ] Verify GlacierMint + OptimaMint contracts on Polygonscan
- [ ] Verify contracts on Routescan (Avalanche)
- [ ] Pin contract ABIs to IPFS; record CIDs in `ipfs-index.json`

## Phase 4 — Liquidity & Visibility

- [ ] Add meaningful LP depth to UNY/USDC and UNY/WAVAX pools
- [ ] List UNY on at least one additional DEX aggregator
- [ ] Deploy wallet UI to production (IPFS / Vercel / CDN)
- [ ] Git tag `v0.1.0-avalanche-deploy`

## Phase 5 — Cross-chain & RWA

- [ ] Polygon deployment pipeline (live contract interaction)
- [ ] Bridge setup (Avalanche ↔ Polygon)
- [ ] Solana integration (Wormhole or native)
- [ ] RWA proof documentation in `registry/`
- [ ] Governance / DAO tooling (TBD)

---

_Update this file as milestones are reached._
