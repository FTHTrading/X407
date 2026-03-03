/**
 * generateWallet.ts
 * Generate a new Avalanche operator wallet and write the private key
 * DIRECTLY to .env — never printed to terminal/logs.
 *
 * Usage:
 *   npx hardhat run scripts/generateWallet.ts
 *
 * Output:
 *   - Prints ONLY the public address
 *   - Writes PRIVATE_KEY to .env (replacing existing)
 *   - Backs up old .env to .env.backup-<timestamp>
 */

import { ethers } from "hardhat";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";
import { resolve } from "path";

async function main() {
  const envPath = resolve(__dirname, "../.env");

  // Backup existing .env
  if (existsSync(envPath)) {
    const backupPath = `${envPath}.backup-${Date.now()}`;
    copyFileSync(envPath, backupPath);
    console.log(`  ✓ Backed up existing .env to ${backupPath}`);
  }

  // Generate new random wallet
  const wallet = ethers.Wallet.createRandom();

  console.log("\n  ╔══════════════════════════════════════════════════╗");
  console.log("  ║        NEW AVALANCHE OPERATOR WALLET             ║");
  console.log("  ╠══════════════════════════════════════════════════╣");
  console.log(`  ║  Address: ${wallet.address}`.padEnd(53) + "║");
  console.log("  ║                                                  ║");
  console.log("  ║  ⚠ Private key written to .env (NOT displayed)   ║");
  console.log("  ║  ⚠ NEVER share .env or paste the key in chat     ║");
  console.log("  ╚══════════════════════════════════════════════════╝\n");

  // Read existing .env and replace PRIVATE_KEY
  let envContent = "";
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, "utf8");
  }

  // Strip the 0x prefix for .env (Hardhat convention)
  const rawKey = wallet.privateKey.replace("0x", "");

  if (envContent.match(/^PRIVATE_KEY\s*=/m)) {
    // Replace existing PRIVATE_KEY line
    envContent = envContent.replace(
      /^PRIVATE_KEY\s*=.*/m,
      `PRIVATE_KEY=${rawKey}`
    );
  } else {
    // Add PRIVATE_KEY
    envContent += `\nPRIVATE_KEY=${rawKey}\n`;
  }

  writeFileSync(envPath, envContent, "utf8");
  console.log("  ✓ .env updated with new PRIVATE_KEY");
  console.log(`  ✓ New operator address: ${wallet.address}`);
  console.log("\n  Next steps:");
  console.log("    1. Fund this address with AVAX from Kraken");
  console.log("    2. Run the UNY rescue script to salvage tokens from the old wallet");
  console.log("    3. Update registry/wallets/wallets.yaml\n");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exitCode = 1;
});
