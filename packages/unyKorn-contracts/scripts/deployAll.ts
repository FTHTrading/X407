/**
 * scripts/deployAll.ts
 *
 * Deploys both UNYToken and VaultRegistry in sequence and seeds the registry.
 * Use this for fresh network deployments (local dev or new chains).
 *
 * Usage:
 *   npx hardhat run scripts/deployAll.ts --network localhost
 *   npx hardhat run scripts/deployAll.ts --network avalanche
 */

import { ethers, network } from "hardhat";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId    = (await ethers.provider.getNetwork()).chainId;

  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║  UnyKorn — full deploy (UNYToken + VaultRegistry)     ║");
  console.log("╚═══════════════════════════════════════════════════════╝");
  console.log(`  Network   : ${network.name} (chainId ${chainId})`);
  console.log(`  Deployer  : ${deployer.address}`);
  console.log(`  Balance   : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} native\n`);

  // ── 1. UNYToken ──────────────────────────────────────────────────────────
  console.log("  [1/2] Deploying UNYToken…");
  const TokenFactory = await ethers.getContractFactory("UNYToken");
  const token        = await TokenFactory.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`        ✅ ${tokenAddress}\n`);

  // ── 2. VaultRegistry ────────────────────────────────────────────────────
  console.log("  [2/2] Deploying VaultRegistry…");
  const RegistryFactory = await ethers.getContractFactory("VaultRegistry");
  const registry        = await RegistryFactory.deploy(deployer.address);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`        ✅ ${registryAddress}\n`);

  // ── Seed registry ────────────────────────────────────────────────────────
  console.log("  Seeding registry with deployed UNYToken…");
  const addTx = await registry.addEntry(
    `uny-token-${chainId}`,
    0, // TOKEN
    tokenAddress,
    chainId,
    ""
  );
  await addTx.wait();
  const vTx = await registry.verify(`uny-token-${chainId}`);
  await vTx.wait();
  console.log(`        ✓ uny-token-${chainId} → ${tokenAddress}\n`);

  // ── Save artefact ────────────────────────────────────────────────────────
  const artefact = {
    network:          network.name,
    chainId:          chainId.toString(),
    deployer:         deployer.address,
    token:            tokenAddress,
    vaultRegistry:    registryAddress,
    deployed_at:      new Date().toISOString(),
  };
  const outDir = resolve(__dirname, "../../../exports/deployments");
  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(outDir, `${network.name}-all.json`);
  writeFileSync(outFile, JSON.stringify(artefact, null, 2));
  console.log(`  📄 Artefact → ${outFile}`);

  console.log("\n  ─────────────────────────────────────────────────────");
  console.log(`  token:         ${tokenAddress}`);
  console.log(`  vaultRegistry: ${registryAddress}`);
  console.log("  ─────────────────────────────────────────────────────");
  console.log("\n  Next steps:");
  console.log("  1. Copy addresses into registry/contracts/contracts.json");
  console.log("  2. Set VITE_VAULT_REGISTRY_ADDRESS in packages/unyKorn-wallet/.env");
  console.log("  3. Run verify scripts when on mainnet\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
