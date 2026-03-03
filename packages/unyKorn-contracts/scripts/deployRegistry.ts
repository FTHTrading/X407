/**
 * scripts/deployRegistry.ts
 *
 * Deploys VaultRegistry and optionally seeds it with the live UNY token entry.
 *
 * Usage:
 *   npx hardhat run scripts/deployRegistry.ts --network localhost
 *   npx hardhat run scripts/deployRegistry.ts --network avalanche
 */

import { ethers, network } from "hardhat";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

// UNY token already live on Avalanche (from registry/contracts/contracts.json)
// Operator deployer: 0x8aced25DC8530FDaf0f86D53a0A1E02AAfA7Ac7A
const KNOWN_ENTRIES = [
  {
    label:       "uny-token-43114",
    entryType:   0,   // TOKEN
    address:     "0xc09003213b34c7bec8d2eddfad4b43e51d007d66",
    chainId:     43114,
    metadataUri: "https://snowtrace.io/token/0xc09003213b34c7bec8d2eddfad4b43e51d007d66",
    verified:    true,
  },
  {
    label:       "wavax-token-43114",
    entryType:   0,   // TOKEN
    address:     "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
    chainId:     43114,
    metadataUri: "https://snowtrace.io/token/0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
    verified:    true,
  },
  {
    label:       "usdc-token-43114",
    entryType:   0,   // TOKEN
    address:     "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
    chainId:     43114,
    metadataUri: "https://snowtrace.io/token/0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
    verified:    true,
  },
  {
    label:       "uny-usdc-pool-43114",
    entryType:   2,   // POOL
    address:     "0x9ff923a83b3d12db280ff65d69ae37819a743f83",
    chainId:     43114,
    metadataUri: "https://dexscreener.com/avalanche/0x9ff923a83b3d12db280ff65d69ae37819a743f83",
    verified:    true,
  },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId    = (await ethers.provider.getNetwork()).chainId;

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  VaultRegistry — deploy");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Network   : ${network.name} (chainId ${chainId})`);
  console.log(`  Deployer  : ${deployer.address}`);
  console.log(`  Balance   : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} native`);
  console.log("───────────────────────────────────────────────────────\n");

  const Factory  = await ethers.getContractFactory("VaultRegistry");
  const registry = await Factory.deploy(deployer.address);
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log(`  ✅ VaultRegistry deployed`);
  console.log(`     Address  : ${address}\n`);

  // ── Seed known entries if on Avalanche mainnet ─────────────────────────────
  if (BigInt(chainId) === 43114n) {
    console.log("  Seeding known entries...");
    for (const e of KNOWN_ENTRIES) {
      console.log(`   + ${e.label}`);
      const tx = await registry.addEntry(e.label, e.entryType, e.address, e.chainId, e.metadataUri);
      await tx.wait();
      if (e.verified) {
        const vtx = await registry.verify(e.label);
        await vtx.wait();
        console.log(`   ✓ verified`);
      }
    }
    console.log();
  }

  // ── Save artefact ──────────────────────────────────────────────────────────
  const artefact = {
    name:        "VaultRegistry",
    chain:       network.name,
    address,
    deployer:    deployer.address,
    seededCount: BigInt(chainId) === 43114n ? KNOWN_ENTRIES.length : 0,
    deployed_at: new Date().toISOString(),
  };

  const outDir = resolve(__dirname, "../../../exports/deployments");
  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(outDir, `${network.name}-VaultRegistry.json`);
  writeFileSync(outFile, JSON.stringify(artefact, null, 2));
  console.log(`  📄 Artefact → ${outFile}\n`);
  console.log("  Next: update registry/contracts/contracts.json with VaultRegistry address.\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
