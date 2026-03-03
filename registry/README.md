# Registry

Structured, version-controlled reference data for the UnyKorn stack.  
No private keys. No seed phrases. No speculative valuations.

## Folder map

| Folder | What it holds |
|--------|---------------|
| `chains/` | Chain IDs, RPC endpoints, explorer URLs |
| `contracts/` | Deployed contract addresses + verification status |
| `tokens/` | Token metadata (symbol, address, decimals, chain) |
| `pools/` | LP pool addresses + pair composition |
| `wallets/` | Public wallet addresses by role (no keys/seeds) |
| `ipfs/` | IPFS CID index |
| `snapshots/` | Point-in-time markdown snapshots (historical records) |

## Conventions

- One JSON file per distinct artefact (token per chain, pool per dex).
- YAML for human-edited, multi-entry files (wallets).
- Snapshots are append-only markdown; never overwrite, create a new dated file.
- Run `node scripts/inventory.mjs` to regenerate `exports/` at any time.

## Quick links

- Avalanche UNY token → `tokens/avalanche-uny.json`
- Avalanche LFJ pool  → `pools/avalanche-lfj-uny-usdc.json`
- Wallets             → `wallets/wallets.yaml`
- All chains          → `chains/chains.json`
- All contracts       → `contracts/contracts.json`
- IPFS CIDs           → `ipfs/cids.json`
