/**
 * diagnoseLB.ts — Check if UNY has any LB V2.1 pairs on the LB Factory
 */
import { ethers } from "hardhat";

const LB_FACTORY = "0x8e42f2F4101563bF679975178e880FD87d3eFd4e";
const UNY        = "0xc09003213b34c7bec8d2eddfad4b43e51d007d66";
const USDC       = "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e";
const WAVAX      = "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7";

const FACTORY_ABI = [
  "function getNumberOfLBPairs() view returns (uint256)",
  "function getAllLBPairs(address tokenX, address tokenY) view returns (tuple(uint16 binStep, address LBPair, bool createdByOwner, bool ignoredForRouting)[])",
  "function getLBPairInformation(address tokenA, address tokenB, uint256 binStep) view returns (tuple(uint16 binStep, address LBPair, bool createdByOwner, bool ignoredForRouting))",
];

// Also check the JoeV1 factory
const JOE_V1_FACTORY = "0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10";
const V1_FACTORY_ABI = [
  "function getPair(address, address) view returns (address)",
  "function allPairsLength() view returns (uint256)",
];

const PAIR_V2_ABI = [
  "function getActiveId() view returns (uint24)",
  "function getBinStep() view returns (uint16)",
  "function getReserves() view returns (uint128, uint128)",
  "function getTokenX() view returns (address)",
  "function getTokenY() view returns (address)",
];

async function main() {
  const [signer] = await ethers.getSigners();

  // ── Check JoeV1 Factory ──
  console.log("\n── TraderJoe V1 Factory ──");
  const v1Factory = new ethers.Contract(JOE_V1_FACTORY, V1_FACTORY_ABI, signer);
  
  const v1UsdcPair = await v1Factory.getPair(UNY, USDC);
  const v1WavaxPair = await v1Factory.getPair(UNY, WAVAX);
  console.log(`  UNY/USDC  V1 pair: ${v1UsdcPair}`);
  console.log(`  UNY/WAVAX V1 pair: ${v1WavaxPair}`);

  // ── Check LB V2.1 Factory ──
  console.log("\n── LB V2.1 Factory ──");
  const lbFactory = new ethers.Contract(LB_FACTORY, FACTORY_ABI, signer);

  try {
    const totalPairs = await lbFactory.getNumberOfLBPairs();
    console.log(`  Total LB pairs: ${totalPairs}`);
  } catch (e: any) {
    console.log(`  getNumberOfLBPairs failed: ${e.message?.slice(0, 80)}`);
  }

  // Check UNY/USDC LB pairs
  try {
    const lbUsdcPairs = await lbFactory.getAllLBPairs(UNY, USDC);
    console.log(`\n  UNY/USDC LB pairs: ${lbUsdcPairs.length}`);
    for (const p of lbUsdcPairs) {
      console.log(`    binStep=${p.binStep} pair=${p.LBPair} owner=${p.createdByOwner} ignored=${p.ignoredForRouting}`);
      // Try reading pair state
      try {
        const pair = new ethers.Contract(p.LBPair, PAIR_V2_ABI, signer);
        const activeId = await pair.getActiveId();
        const [rx, ry] = await pair.getReserves();
        console.log(`      activeId=${activeId} reserveX=${rx} reserveY=${ry}`);
      } catch (e2: any) {
        console.log(`      ⚠ Pair read failed: ${e2.message?.slice(0, 60)}`);
      }
    }
  } catch (e: any) {
    console.log(`  getAllLBPairs(UNY, USDC) failed: ${e.message?.slice(0, 80)}`);
  }

  // Check UNY/WAVAX LB pairs
  try {
    const lbWavaxPairs = await lbFactory.getAllLBPairs(UNY, WAVAX);
    console.log(`\n  UNY/WAVAX LB pairs: ${lbWavaxPairs.length}`);
    for (const p of lbWavaxPairs) {
      console.log(`    binStep=${p.binStep} pair=${p.LBPair} owner=${p.createdByOwner} ignored=${p.ignoredForRouting}`);
      try {
        const pair = new ethers.Contract(p.LBPair, PAIR_V2_ABI, signer);
        const activeId = await pair.getActiveId();
        const [rx, ry] = await pair.getReserves();
        console.log(`      activeId=${activeId} reserveX=${rx} reserveY=${ry}`);
      } catch (e2: any) {
        console.log(`      ⚠ Pair read failed: ${e2.message?.slice(0, 60)}`);
      }
    }
  } catch (e: any) {
    console.log(`  getAllLBPairs(UNY, WAVAX) failed: ${e.message?.slice(0, 80)}`);
  }
}

main().catch(console.error);
