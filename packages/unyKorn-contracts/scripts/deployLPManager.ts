/**
 * deployLPManager.ts
 * Deploys the UnyKornLPManager contract to the target network.
 *
 * Run:  npx hardhat run scripts/deployLPManager.ts --network avalanche
 *       npx hardhat run scripts/deployLPManager.ts --network localhost
 */

import hre, { ethers } from "hardhat";

// ── TraderJoe LB Router V2.1 on Avalanche C-Chain ─────────────────────────────
const LB_ROUTER_AVALANCHE = "0xb4315e873dBcf96Ffd0acd8EA43f689D8c20fB30";
// ── UNY Token on Avalanche ────────────────────────────────────────────────────
const UNY_TOKEN            = "0xc09003213b34c7bec8d2eddfad4b43e51d007d66";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network    = hre.network.name;

  console.log("\n📦  Deploying UnyKornLPManager");
  console.log(`    Network  : ${network}`);
  console.log(`    Deployer : ${deployer.address}`);

  let routerAddr = LB_ROUTER_AVALANCHE;
  let unyAddr    = UNY_TOKEN;

  // On localhost, deploy mock router + use a mock UNY
  if (network === "localhost" || network === "hardhat") {
    console.log("    (local mode — using real addresses for reference only)");
  }

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`    Balance  : ${ethers.formatEther(bal)} AVAX\n`);

  const LPManager = await ethers.getContractFactory("UnyKornLPManager");
  const lp = await LPManager.deploy(routerAddr, unyAddr, deployer.address);
  await lp.waitForDeployment();

  const addr = await lp.getAddress();
  console.log(`✅  UnyKornLPManager deployed: ${addr}`);
  console.log(`    Router : ${routerAddr}`);
  console.log(`    UNY    : ${unyAddr}`);
  console.log(`    Owner  : ${deployer.address}\n`);

  // Record to registry
  console.log("Add to registry/contracts/contracts.json:");
  console.log(JSON.stringify({
    name: "UnyKornLPManager",
    address: addr,
    chain: network === "avalanche" ? "avalanche-cchain" : network,
    chain_id: network === "avalanche" ? 43114 : 31337,
    type: "lp-manager",
    deployed_by: deployer.address,
    deployed_at: new Date().toISOString(),
  }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
