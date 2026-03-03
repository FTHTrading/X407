# UnyKorn Stack — Operations

_Reference for day-to-day operator tasks._

---

## Daily checks

1. Check pool health: https://dexscreener.com/avalanche/0x9ff923a83b3d12db280ff65d69ae37819a743f83
2. Check wallet balances with `checkBalance` scripts.
3. Run inventory scan if new files were added: `node scripts/inventory.mjs`

---

## Compile contracts

```powershell
# From repo root (VS Code task: Hardhat: Compile)
cd packages/unyKorn-contracts
npm run compile
```

---

## Run tests

```powershell
# VS Code task: Hardhat: Test
cd packages/unyKorn-contracts
npm test
```

---

## Deploy (local hardhat node)

```powershell
# Terminal 1 — start local node (VS Code task: Hardhat: Node)
cd packages/unyKorn-contracts
npx hardhat node

# Terminal 2 — deploy
npx hardhat run scripts/deploy.ts --network localhost
```

---

## Deploy to Avalanche mainnet

```powershell
# Requires .env with PRIVATE_KEY and AVALANCHE_RPC (never commit .env)
cd packages/unyKorn-contracts
npx hardhat run scripts/deploy.ts --network avalanche
```

---

## Start Wallet UI

```powershell
# VS Code task: Wallet UI: Dev
cd packages/unyKorn-wallet
npm run dev
# Opens at http://localhost:5173
```

---

## Run full inventory

```powershell
# Windows (from repo root) — VS Code task: Inventory: Scan repo
node scripts/inventory.mjs

# Windows with disk discovery
.\scripts\inventory.ps1

# Mac/Linux with disk discovery
bash scripts/inventory.sh
```

Output files: `exports/inventory.json` and `exports/inventory.csv`

---

## Add a new registry entry

1. Create a JSON file in the relevant `registry/` subfolder.
2. Follow the existing file format for that type.
3. Commit with a message like `registry: add <chain>-<name>.json`.

---

## Security hygiene

| Rule | Action |
|------|--------|
| Never commit `.env` | `.gitignore` covers it; double-check with `git status` |
| Rotate any leaked key | Treat any pasted/committed key as burned immediately |
| Secret flagged by scanner | Open file, remove secret, move to `.env` or hardware wallet |
| Public repo | Audit `registry/` for wallet addresses — OK; audit for private keys — must be zero |
