# UnyKorn Master Registry Snapshot — March 2026

**Date:** March 3, 2026
**Status:** Compilation of all confirmed live assets, contracts, and registry entries.

---

## Control Addresses

| Role               | Chain    | Address                                      |
|--------------------|----------|----------------------------------------------|
| Master Admin       | Polygon  | `0x8aced25DC8530FDaf0f86D53a0A1E02AAfA7Ac7A` |
| Master Admin       | Solana   | `GFHJQ7JgcRGYToPf2KXdGWDABRVnqzMU7ePDu4b3BqZg` |
| UNY Deployer (AVAX)| Avalanche| `0x8aced25DC8530FDaf0f86D53a0A1E02AAfA7Ac7A` |

---

## Avalanche C-Chain Contracts

| Contract        | Address                                        | Status          |
|-----------------|------------------------------------------------|-----------------|
| UNY Token       | `0xc09003213b34c7bec8d2eddfad4b43e51d007d66`  | ✅ deployed      |
| VaultRegistry   | *(pending mainnet deploy)*                     | ⏳ pending       |

### Avalanche Token Addresses (verified)

| Symbol | Address                                        |
|--------|------------------------------------------------|
| UNY    | `0xc09003213b34c7bec8d2eddfad4b43e51d007d66`  |
| WAVAX  | `0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7`  |
| USDC   | `0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e`  |

### Avalanche Pools (LFJ / Trader Joe)

| Pair         | Pool Address                                   | Status     |
|--------------|------------------------------------------------|------------|
| UNY/USDC     | `0x9ff923a83b3d12db280ff65d69ae37819a743f83`  | ✅ live     |
| UNY/WAVAX    | *(pair address TBD — look up on LFJ)*          | ⏳ pending  |

---

## Polygon PoS Contracts (confirmed full addresses)

### TLD & Vault Infrastructure

| Contract            | Address                                        |
|---------------------|------------------------------------------------|
| GlacierMint         | `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9`  |
| SubVaultFactory     | `0xe1299c378f56903248f0357597d57d48d2d67a6c`  |
| .nil Vault          | `0xAc2a8CFcB7E01Ed80585235b3a994E51aa268a4C`  |
| RegistryAggregator  | `0xb9ca719983c7cf1de869da520cbd14594fae6aba`  |

### Diversegy × Genie Energy Stack (all deployed Polygon)

| Contract                | Address                                        |
|-------------------------|------------------------------------------------|
| .diversegy TLD Registry | `0x7aaaeea71ae66ddfb0a448975b6d7b9b0f752103`  |
| GenieBrokerSBT          | `0x8740e6dfae81ef8bfca6b13a3f72787198154142`  |
| CapriceRequestNFT       | `0x649ffd3f41e5839d31cc802ddf5062f86a7963ac`  |
| MatrixQuoteNFT          | `0x98b3060a3a5867ef09b8814946a6b53c13bd4aac`  |
| BrokerQuoteNFT          | `0x95ca17addf2d0a5f0265c1111a757ae421c3fe0e`  |
| DealTrackerNFT          | `0xd02cbbcad44191dc41b1f688e720db9f716bca38`  |
| CustomerLOANFT          | `0xf3539302cf71333fb30a109ee3893e7534214eb0`  |
| OptimaVault4626         | `0x4399312599e936097870561fdb30451448d3e00c`  |
| GenieRewardVault        | `0xb38ea864a29b89dd6cd2d4d6ad3682eee52f52ef`  |
| GSwitchToken            | `0x33b4656465f4968b701194c7061d74b36c2611bd`  |
| CommissionReceiptNFT    | `0xaccd3f54aa64d1f6312024881024478efbd3d27f`  |
| AgentProfileNFT         | `0x15b671f5e4bd1f3ddfa5ed03e38aefa2fba6ec27`  |
| CommissionOverrideEngine| `0xf3c5fceb67d0289463910f082d868ef9f9d97c5d`  |
| PayoutRouter            | `0xb05e0434f6a86075ac6563a0503531271a901a97`  |
| VaultAutoPayout         | `0x5c14f339f0ae72e1d8f62ce4227a5bd931168ec7`  |
| WUFToken                | `0xa78f40f73ea565f61a1db90e654bf0ea37c529d1`  |

---

## Root TLD Registry (107+ live on Polygon via GlacierMint)

See full list in `registry/contracts/tlds.json`.

Notable minted TLDs with confirmed on-chain data:

| TLD        | Token ID | Mint Txn (truncated)   | IPFS Metadata CID                             |
|------------|----------|------------------------|-----------------------------------------------|
| .optima    | 0        | `0x381919d6...b7c7111` | `bafkreibae3zfa4mgvez...ul32shya`             |
| .usd       | —        | —                      | `QmYuJTmCs9BVfcCSumt3d...eg6f`               |
| .oil       | —        | —                      | `QmUzWzxCXeFNuD4yvYwGM...zRs`                |

---

## IPFS / Genesis Certificates

See full list in `registry/ipfs/cids.json`.

| Label               | CID (truncated)                            |
|---------------------|--------------------------------------------|
| tld-usd-genesis     | `QmYuJTmCs9BVfcCSumt3d...g6f`             |
| tld-oil-genesis     | `QmUzWzxCXeFNuD4yvYwGM...Rs`              |
| optima-nft-metadata | `bafkreibae3zfa4mgvez...hya`              |
| optima-genesis-cert | `QmVHcBxsnH4bNWhQKVkq...J1`               |

---

## Tokens

- **Avalanche:** UNY (live), WAVAX (standard wrapped), USDC (native)
- **Polygon:** WUF ✅, GSWITCH ✅, 25+ additional tokens (addresses pending — see `registry/tokens/polygon-tokens.json`)
- **Solana:** SPL tokens (FBM, CUBANAID, others) — addresses pending

---

## Dev Stack Status (March 2026)

| Component                 | Status                     |
|---------------------------|----------------------------|
| UNYToken.sol              | ✅ deployed Avalanche       |
| VaultRegistry.sol         | ✅ compiled, 36/36 tests     |
| Wallet UI (Vite/React)    | ✅ tsc clean, dev server live http://localhost:5173 |
| npm install contracts     | ✅ done                      |
| npm install wallet        | ✅ done                      |
| Mainnet VaultRegistry deploy | ⏳ needs PRIVATE_KEY in .env |
| UNY/WAVAX pool address    | ⏳ look up on LFJ            |
| WalletConnect project ID  | ⏳ https://cloud.walletconnect.com |

---

## Pending Items (ordered by priority)

1. **WalletConnect project ID** → `packages/unyKorn-wallet/.env` `VITE_WALLETCONNECT_PROJECT_ID`
2. **UNY/WAVAX pool pair address** → update `registry/pools/avalanche-lfj-uny-wavax.json`
3. **VaultRegistry mainnet deploy** → `npm run deploy:registry:avalanche` (needs PRIVATE_KEY)
4. **Fill polygon token addresses** → `registry/tokens/polygon-tokens.json` (paste from Polygonscan)
5. **Fill remaining TLD token_ids / txn hashes** → `registry/contracts/tlds.json`
