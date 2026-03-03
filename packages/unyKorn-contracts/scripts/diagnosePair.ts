/**
 * diagnosePair.ts — one-shot diagnostic to find correct ABI for pair contracts
 */
import { ethers } from "hardhat";

async function main() {
  const pairs = [
    { name: "UNY/USDC", addr: "0x9ff923a83b3d12db280ff65d69ae37819a743f83" },
    { name: "UNY/WAVAX", addr: "0xC6F5273D74571d91CBcBA0A2900ed5F7C800F5d0" },
  ];

  // Known function selectors across LB versions
  const sigs: [string, string][] = [
    // LB V2.1
    ["getActiveId()",       "0x44a185bb"],
    ["getReserves()",       "0x0902f1ac"],
    ["getBinStep()",        "0x17f11ecc"],
    ["getTokenX()",         "0x0abb4fe6"],
    ["getTokenY()",         "0xda10610c"],
    // LB V2.0 / V1 fallback
    ["findFirstNonEmptyBinId(uint24,bool)", "0x83843d31"],
    // Uniswap V2 style
    ["token0()",            "0x0dfe1681"],
    ["token1()",            "0xd21220a7"],
    ["getReserves()",       "0x0902f1ac"],
    // General
    ["factory()",           "0xc45a0155"],
    ["name()",              "0x06fdde03"],
  ];

  for (const pair of pairs) {
    console.log(`\n── ${pair.name} (${pair.addr}) ──`);

    const code = await ethers.provider.getCode(pair.addr);
    console.log(`  Code size: ${(code.length - 2) / 2} bytes`);
    if (code === "0x") {
      console.log("  ✗ NO CONTRACT at this address");
      continue;
    }

    for (const [name, sel] of sigs) {
      try {
        const result = await ethers.provider.call({ to: pair.addr, data: sel });
        const short = result.length > 130 ? result.slice(0, 130) + "..." : result;
        console.log(`  ✓ ${name.padEnd(40)} => ${short}`);
      } catch (e: any) {
        // silent — just means function doesn't exist
      }
    }
  }

  // Check operator balance
  const [signer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(signer.address);
  console.log(`\nOperator: ${signer.address}`);
  console.log(`AVAX Balance: ${ethers.formatEther(bal)}`);
}

main().catch(console.error);
