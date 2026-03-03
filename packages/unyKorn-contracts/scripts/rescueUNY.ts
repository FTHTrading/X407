/**
 * rescueUNY.ts
 * Emergency UNY token rescue from compromised wallet.
 *
 * Strategy: "gas-and-grab"
 * 1. From the NEW wallet, send a tiny amount of AVAX to the OLD wallet (just enough for 1 ERC-20 transfer)
 * 2. Immediately submit the UNY transfer from the OLD wallet to the NEW wallet
 * 3. Use high gas price to try to beat the sweeper bot
 *
 * ⚠ WARNING: The sweeper bot may front-run this. There's no guarantee of success.
 *            Avalanche doesn't have Flashbots-style private mempools.
 *            We maximize our chances by:
 *            - Using the minimum possible AVAX (bot may ignore dust)
 *            - Using high priority gas price
 *            - Submitting both transactions as fast as possible
 *
 * Usage:
 *   npx hardhat run scripts/rescueUNY.ts --network avalanche
 *
 * Environment:
 *   DRY_RUN=true|false    (default: true — preview only)
 *   OLD_KEY=<hex>         (private key of compromised wallet — REQUIRED for live)
 */

import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const ROOT = resolve(__dirname, "../../..");
const DRY_RUN = process.env.DRY_RUN !== "false";

// Old compromised wallet address
const OLD_ADDR = "0x8aced25DC8530FDaf0f86D53a0A1E02AAfA7Ac7A";

// UNY token
const UNY_ADDR = "0xc09003213b34c7bec8d2eddfad4b43e51d007d66";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

async function main() {
  const [newSigner] = await ethers.getSigners(); // New wallet from .env PRIVATE_KEY

  console.log("\n  🚨  UNY RESCUE — Compromised Wallet Recovery");
  console.log("  ═══════════════════════════════════════════════════");
  console.log(`  New wallet  : ${newSigner.address}`);
  console.log(`  Old wallet  : ${OLD_ADDR}`);
  console.log(`  Mode        : ${DRY_RUN ? "DRY RUN 🏜️" : "⚡ LIVE"}`);
  console.log();

  // Check new wallet AVAX balance
  const newAvax = await ethers.provider.getBalance(newSigner.address);
  console.log(`  New wallet AVAX: ${ethers.formatEther(newAvax)} AVAX`);

  // Check old wallet UNY balance
  const unyToken = new ethers.Contract(UNY_ADDR, ERC20_ABI, ethers.provider);
  const unyBal = await unyToken.balanceOf(OLD_ADDR);
  const unyDec = await unyToken.decimals();
  console.log(`  Old wallet UNY : ${ethers.formatUnits(unyBal, unyDec)} UNY`);

  // Check old wallet AVAX
  const oldAvax = await ethers.provider.getBalance(OLD_ADDR);
  console.log(`  Old wallet AVAX: ${ethers.formatEther(oldAvax)} AVAX`);

  if (unyBal === 0n) {
    console.log("\n  ✗ No UNY to rescue — old wallet is empty.");
    return;
  }

  // Estimate gas for ERC-20 transfer (~65,000 gas)
  // We'll use aggressive gas price to front-run the bot
  const feeData = await ethers.provider.getFeeData();
  const baseGasPrice = feeData.gasPrice || ethers.parseUnits("30", "gwei");
  // Use 3x current gas price to try to beat the bot
  const aggressiveGasPrice = baseGasPrice * 3n;
  const transferGas = 65000n;
  const gasNeeded = transferGas * aggressiveGasPrice;

  // Add a tiny buffer (10%)
  const avaxToSend = (gasNeeded * 110n) / 100n;

  console.log(`\n  Gas strategy:`);
  console.log(`    Base gas price    : ${ethers.formatUnits(baseGasPrice, "gwei")} gwei`);
  console.log(`    Aggressive price  : ${ethers.formatUnits(aggressiveGasPrice, "gwei")} gwei (3x)`);
  console.log(`    Est. gas needed   : ${ethers.formatEther(gasNeeded)} AVAX`);
  console.log(`    AVAX to send      : ${ethers.formatEther(avaxToSend)} AVAX`);

  if (newAvax < avaxToSend + ethers.parseEther("0.01")) {
    console.log(`\n  ✗ New wallet needs at least ${ethers.formatEther(avaxToSend + ethers.parseEther("0.01"))} AVAX`);
    console.log(`    Current balance: ${ethers.formatEther(newAvax)} AVAX`);
    console.log(`    Fund the new wallet first: ${newSigner.address}`);
    return;
  }

  console.log(`\n  Plan:`);
  console.log(`    Step 1: Send ${ethers.formatEther(avaxToSend)} AVAX → old wallet (gas funding)`);
  console.log(`    Step 2: Transfer ${ethers.formatUnits(unyBal, unyDec)} UNY → new wallet`);
  console.log(`    ⚠ Sweeper bot may intercept — this is a race condition`);

  if (DRY_RUN) {
    console.log(`\n  ⏸️  DRY RUN — no transactions sent.`);
    console.log(`  To execute: set DRY_RUN=false and OLD_KEY=<compromised_private_key>`);
    console.log(`  The OLD_KEY is needed to sign the UNY transfer FROM the old wallet.\n`);
    return;
  }

  // ── LIVE EXECUTION ────────────────────────────────────────────────────────
  const oldKey = process.env.OLD_KEY;
  if (!oldKey) {
    console.error("\n  ✗ OLD_KEY environment variable required for live execution.");
    console.error("    Set OLD_KEY=<compromised_wallet_private_key>");
    return;
  }

  const oldSigner = new ethers.Wallet(oldKey, ethers.provider);
  if (oldSigner.address.toLowerCase() !== OLD_ADDR.toLowerCase()) {
    console.error(`\n  ✗ OLD_KEY does not match expected address.`);
    console.error(`    Expected: ${OLD_ADDR}`);
    console.error(`    Got:      ${oldSigner.address}`);
    return;
  }

  // Get the old wallet's current nonce
  const oldNonce = await ethers.provider.getTransactionCount(OLD_ADDR, "latest");
  console.log(`\n  Old wallet nonce: ${oldNonce}`);

  // ── Step 1: Fund old wallet with gas ──
  console.log(`\n  Step 1: Sending ${ethers.formatEther(avaxToSend)} AVAX to old wallet...`);
  const fundTx = await newSigner.sendTransaction({
    to: OLD_ADDR,
    value: avaxToSend,
    gasPrice: aggressiveGasPrice,
  });

  // ── Step 2: IMMEDIATELY submit UNY transfer (don't wait for fund tx confirmation)
  // Pre-sign the UNY transfer so we can broadcast it instantly
  console.log(`  Step 2: Submitting UNY transfer (not waiting for gas tx)...`);

  const unyWithOldSigner = new ethers.Contract(UNY_ADDR, ERC20_ABI, oldSigner);

  // Submit UNY transfer with higher gas price and correct nonce
  const rescueTx = await unyWithOldSigner.transfer(
    newSigner.address,
    unyBal,
    {
      gasPrice: aggressiveGasPrice,
      gasLimit: transferGas,
      nonce: oldNonce, // Use current nonce — this tx goes as soon as gas arrives
    }
  );

  console.log(`\n  ⏳ Waiting for transactions...`);
  console.log(`    Fund tx  : ${fundTx.hash}`);
  console.log(`    Rescue tx: ${rescueTx.hash}`);

  // Wait for both
  const [fundReceipt, rescueReceipt] = await Promise.all([
    fundTx.wait(),
    rescueTx.wait().catch((e: any) => {
      console.error(`\n  ✗ Rescue tx FAILED: ${e.message}`);
      return null;
    }),
  ]);

  console.log(`\n  Fund tx    : ${fundReceipt?.status === 1 ? "✓ Success" : "✗ Failed"} (block ${fundReceipt?.blockNumber})`);

  if (rescueReceipt) {
    console.log(`  Rescue tx  : ${rescueReceipt.status === 1 ? "✓ SUCCESS" : "✗ FAILED"} (block ${rescueReceipt.blockNumber})`);

    if (rescueReceipt.status === 1) {
      const finalBal = await unyToken.balanceOf(newSigner.address);
      console.log(`\n  🎉 UNY RESCUED: ${ethers.formatUnits(finalBal, unyDec)} UNY now in new wallet`);
    }
  } else {
    console.log(`  Rescue tx  : ✗ FAILED — bot likely front-ran the transfer`);
    console.log(`  The UNY may still be in the old wallet — check Snowtrace.`);
  }

  // Check remaining balances
  const finalNewAvax = await ethers.provider.getBalance(newSigner.address);
  const finalOldAvax = await ethers.provider.getBalance(OLD_ADDR);
  const finalOldUNY  = await unyToken.balanceOf(OLD_ADDR);
  const finalNewUNY  = await unyToken.balanceOf(newSigner.address);

  console.log(`\n  ── Final State ──`);
  console.log(`  New wallet AVAX: ${ethers.formatEther(finalNewAvax)}`);
  console.log(`  New wallet UNY : ${ethers.formatUnits(finalNewUNY, unyDec)}`);
  console.log(`  Old wallet AVAX: ${ethers.formatEther(finalOldAvax)}`);
  console.log(`  Old wallet UNY : ${ethers.formatUnits(finalOldUNY, unyDec)}\n`);
}

main().catch((err) => {
  console.error("Rescue error:", err);
  process.exitCode = 1;
});
