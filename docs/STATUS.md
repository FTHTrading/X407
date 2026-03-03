# UnyKorn Stack — Status

_Last updated: 2026-03-03_

---

## Deployed on-chain

| Item | Chain | Address | Status |
|------|-------|---------|--------|
| UNY Token | Avalanche C-Chain (43114) | `0xc09003213b34c7bec8d2eddfad4b43e51d007d66` | ✅ Deployed |
| UNY/USDC Pool (LFJ) | Avalanche C-Chain | `0x9ff923a83b3d12db280ff65d69ae37819a743f83` | ✅ Live (thin LP) |
| UNY/WAVAX Pool (LFJ) | Avalanche C-Chain | `0xC6F5273D74571d91CBcBA0A2900ed5F7C800F5d0` | ✅ Live |
| GlacierMint-0 | Polygon (137) | `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9` | ✅ Deployed |
| GlacierMint-1 | Polygon (137) | `0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6` | ✅ Deployed |
| GlacierMint-2 | Polygon (137) | `0xf569734B2e5F1A85eFBfAEe7e8D3514b3e4F3da1` | ✅ Deployed |
| OptimaMint | Polygon (137) | `0xBe59bc5890555283e917C880e0e25163D2b788C9` | ✅ Deployed |

---

## Registry (canonical data)

| Dataset | File(s) | Count | Status |
|---------|---------|-------|--------|
| Contracts | `registry/contracts/contracts.json` | 30 | ✅ Complete |
| TLD namespaces | `registry/contracts/tlds.json` | 78 | ✅ Complete (token_ids, IPFS CIDs, source tags) |
| IPFS CIDs | `registry/ipfs/ipfs-index.json` | 33 | ✅ Complete |
| Pools | `registry/pools/` | 2 | ✅ UNY/USDC + UNY/WAVAX |
| Tokens | `registry/tokens/` | 30 | ✅ Complete |
| XRPL IOUs | `registry/xrpl/xrpl-assets.json` | 10 | ✅ Complete |
| Chains | `registry/chains/chains.json` | — | ✅ Avalanche + Polygon |
| Wallets | `registry/wallets/wallets.yaml` | — | ✅ primary_operator + token snapshot |

---

## Packages

| Package | Location | Status |
|---------|----------|--------|
| Hardhat contracts | `packages/unyKorn-contracts` | ✅ Compiles clean (Solidity 0.8.24, ethers-v6) |
| Wallet UI | `packages/unyKorn-wallet` | ✅ MVP complete (Vite + React + TS) |

---

## Build & automation scripts

| Script | Location | Status |
|--------|----------|--------|
| Inventory scanner | `scripts/inventory.mjs` | ✅ Working (71 files, secret detection) |
| Registry builder | `scripts/build-registry.mjs` | ✅ Working (JSON + CSV export) |
| Proof-pack builder | `scripts/build-proof-pack.mjs` | ✅ Working (ZIP archive) |
| OpenSea sync | `scripts/opensea-sync.mjs` | ⏳ Created, untested |
| Metadata generator | `packages/unyKorn-contracts/scripts/genMeta.ts` | ⏳ Created, untested |
| URI batch-updater | `packages/unyKorn-contracts/scripts/updateURIs.ts` | ⏳ Created, untested (dry-run by default) |
| Deploy scripts | `packages/unyKorn-contracts/scripts/deploy*.ts` | ✅ Ready |
| Balance checkers | `packages/unyKorn-contracts/scripts/checkBalance*.ts` | ✅ Ready |
| Contract verifier | `packages/unyKorn-contracts/scripts/verify.ts` | ✅ Ready |

---

## Pending

- [ ] Test `opensea-sync.mjs` against live OpenSea v2 API
- [ ] Test `genMeta.ts` — generate ERC-721 metadata from TLD registry
- [ ] Test `updateURIs.ts` — dry-run URI update on Polygon
- [ ] Increase LP liquidity depth on LFJ
- [ ] Verify contracts on Routescan / Polygonscan
- [ ] Deploy wallet UI to production (IPFS / Vercel)
- [ ] Git tag `v0.1.0-avalanche-deploy`

---

## Quick commands

```powershell
# Full build (inventory → registry export → proof-pack)
npm run full-build

# Inventory only
npm run inventory

# Compile contracts
cd packages/unyKorn-contracts && npm run compile

# Start wallet UI dev server
cd packages/unyKorn-wallet && npm run dev
```

Output: `exports/inventory.json`, `exports/inventory.csv`, `exports/unykorn-registry.json`, CSVs in `exports/csv/`
The scanner flags files that may contain secrets — review and clean them first.
