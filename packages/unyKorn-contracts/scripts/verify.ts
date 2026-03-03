/**
 * scripts/verify.ts
 *
 * Verifies UNYToken on Routescan / Snowtrace / Polygonscan.
 * Run AFTER deploy when DEPLOYED_ADDRESS is set in .env, or pass it as arg.
 *
 * Usage:
 *   DEPLOYED_ADDRESS=0x... npx hardhat run scripts/verify.ts --network avalanche
 *   DEPLOYED_ADDRESS=0x... npx hardhat run scripts/verify.ts --network polygon
 */

import { run, ethers, network } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  // Support address via env or first CLI extra arg
  const address = process.env.DEPLOYED_ADDRESS
    ?? process.argv.find((a) => /^0x[0-9a-fA-F]{40}$/.test(a));

  if (!address) {
    throw new Error(
      "No address supplied. Set DEPLOYED_ADDRESS in .env or pass it as extra arg."
    );
  }

  const [deployer] = await ethers.getSigners();

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  UnyKorn Token — verify");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Network   : ${network.name}`);
  console.log(`  Address   : ${address}`);
  console.log(`  Deployer  : ${deployer.address}`);
  console.log("───────────────────────────────────────────────────────\n");

  await run("verify:verify", {
    address,
    constructorArguments: [deployer.address],
  });

  console.log("\n  ✅ Verification submitted.\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
