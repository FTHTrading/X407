# unyKorn-contracts

Hardhat project for UnyKorn EVM smart contracts.

## Quick start

```bash
npm install
npm run compile
npm test
```

## Target networks

| Network | Chain ID | Config key |
|---------|----------|------------|
| Avalanche C-Chain | 43114 | `avalanche` |
| Polygon | 137 | `polygon` |
| Hardhat local | 31337 | `localhost` |

## Environment

Copy `.env.example` to `.env` and fill in:

```
PRIVATE_KEY=          # operator deployer key (never share)
AVALANCHE_RPC=        # https://api.avax.network/ext/bc/C/rpc
POLYGON_RPC=          # https://polygon-rpc.com
SNOWTRACE_API_KEY=    # for contract verification
POLYGONSCAN_API_KEY=  # for contract verification
```

## Deployed contracts

See `../../registry/contracts/contracts.json` for the canonical deployed address registry.
