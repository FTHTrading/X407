# Build Snapshot — UNY on Avalanche — March 2026

**Status:** Deployed and live.  
**Date captured:** 2026-03-03

---

## Deployed artefacts

| Artefact | Chain | Address |
|----------|-------|---------|
| UNY Token (ERC-20) | Avalanche C-Chain (43114) | `0xc09003213b34c7bec8d2eddfad4b43e51d007d66` |
| UNY/USDC LP Pool (LFJ) | Avalanche C-Chain (43114) | `0x9ff923a83b3d12db280ff65d69ae37819a743f83` |

## Status notes

- Token deployed and verified on Snowtrace.
- LFJ pool live; liquidity is thin — treat price/FDV figures as fragile.
- Wallet UI in development (`packages/unyKorn-wallet`).
- Hardhat project scaffolded (`packages/unyKorn-contracts`).

## Outstanding tasks (as of this snapshot)

- [ ] Increase LP depth to stabilise price feed.
- [x] Complete Wallet UI MVP and run Vite build.
- [x] Build Hardhat project — contracts, tests, deploy + verify scripts complete.
- [ ] Verify all deployed contracts on Routescan.
- [ ] Pin contract ABI artefacts to IPFS and record CIDs in `registry/ipfs/cids.json`.
- [ ] Tag this build in Git: `git tag v0.1.0-avalanche-deploy`.

## References

- Dexscreener pair: https://dexscreener.com/avalanche/0x9ff923a83b3d12db280ff65d69ae37819a743f83
- Snowtrace token:  https://snowtrace.io/token/0xc09003213b34c7bec8d2eddfad4b43e51d007d66
