# unyKorn-master

Monorepo for the UnyKorn token stack — contracts, wallet UI, and registry.

## Open in VS Code

```powershell
code unyKorn.code-workspace
```

## Quick navigation

| What | Where |
|------|-------|
| Smart contracts (Hardhat) | `packages/unyKorn-contracts/` |
| Wallet UI (Vite + React) | `packages/unyKorn-wallet/` |
| Registry (tokens, pools, wallets) | `registry/` |
| Inventory scanner | `scripts/inventory.mjs` |
| Disk discovery (Windows) | `scripts/inventory.ps1` |
| Disk discovery (Mac/Linux) | `scripts/inventory.sh` |
| Status | `docs/STATUS.md` |
| Roadmap | `docs/ROADMAP.md` |
| Operations reference | `docs/OPERATIONS.md` |

## Run inventory

```powershell
node scripts/inventory.mjs
# Output: exports/inventory.json  exports/inventory.csv
```

## Security

- `.env` files are git-ignored. Copy `.env.example` → `.env` in each package.
- Private keys and seed phrases are **never** stored in this repo.
- If the inventory scanner flags a file with `secret_flag: true`, open it, remove the secret, and store it in a hardware wallet or encrypted vault.
