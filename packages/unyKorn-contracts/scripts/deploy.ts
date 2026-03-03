/**
 * scripts/deploy.ts
 *
 * Deploys UNYToken to the selected network.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network localhost
 *   npx hardhat run scripts/deploy.ts --network avalanche
 *   npx hardhat run scripts/deploy.ts --network polygon
 *
 * After a mainnet deploy:
 *  1. Copy the printed address into registry/contracts/contracts.json
 *  2. Run the verify script: npm run verify:avalanche
 *  3. Tag the build: git tag v0.x.0-<chain>-deploy
 */

import { ethers, network } from "hardhat";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  UnyKorn Token — deploy");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Network   : ${network.name} (chainId ${(await ethers.provider.getNetwork()).chainId})`);
  console.log(`  Deployer  : ${deployer.address}`);
  console.log(`  Balance   : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} native`);
  console.log("───────────────────────────────────────────────────────\n");

  const Factory = await ethers.getContractFactory("UNYToken");
  const token   = await Factory.deploy(deployer.address);
  await token.waitForDeployment();

  const address = await token.getAddress();
  const supply  = ethers.formatUnits(await token.totalSupply(), 18);

  console.log(`  ✅ UNYToken deployed`);
  console.log(`     Address      : ${address}`);
  console.log(`     Total supply : ${supply} UNY`);
  console.log();

  // ── Persist deployment artefact ─────────────────────────────────────────
  const artefact = {
    name:       "UNYToken",
    chain:      network.name,
    address,
    deployer:   deployer.address,
    supply,
    deployed_at: new Date().toISOString(),
  };

  const outDir = resolve(__dirname, "../../../exports/deployments");
  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(outDir, `${network.name}-UNYToken.json`);
  writeFileSync(outFile, JSON.stringify(artefact, null, 2));
  console.log(`  📄 Artefact saved → ${outFile}\n`);

  console.log("  Next steps:");
  console.log("  1. Update registry/contracts/contracts.json with the new address");
  console.log("  2. Run:  npm run verify:avalanche   (if deployed to Avalanche)");
  console.log("  3. Run:  git tag v0.1.0-avalanche-deploy && git push --tags\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
