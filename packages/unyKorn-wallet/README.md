# unyKorn-wallet

Vite + React wallet UI for the UnyKorn token ecosystem.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
```

## Environment

Copy `.env.example` to `.env` and fill in:

```
VITE_WALLETCONNECT_PROJECT_ID=   # from https://cloud.walletconnect.com
VITE_AVALANCHE_RPC=              # https://api.avax.network/ext/bc/C/rpc
VITE_UNY_TOKEN_ADDRESS=0xc09003213b34c7bec8d2eddfad4b43e51d007d66
VITE_UNY_USDC_POOL_ADDRESS=0x9ff923a83b3d12db280ff65d69ae37819a743f83
```

## Feature targets

- [ ] Connect wallet (MetaMask, WalletConnect)
- [ ] Display UNY balance
- [ ] Display AVAX + USDC balances
- [ ] Swap UNY ↔ USDC via LFJ
- [ ] Multi-chain toggle (Avalanche / Polygon)
