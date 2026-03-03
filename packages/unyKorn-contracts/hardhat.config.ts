import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const ZERO_KEY      = "0x" + "0".repeat(64);
const PRIVATE_KEY   = process.env.PRIVATE_KEY   || ZERO_KEY;
const PRIVATE_KEY_2 = process.env.PRIVATE_KEY_2 || ZERO_KEY;
const PRIVATE_KEY_3 = process.env.PRIVATE_KEY_3 || ZERO_KEY;

// Only include keys that were actually provided (filter out zero placeholders)
const signers = [PRIVATE_KEY, PRIVATE_KEY_2, PRIVATE_KEY_3].filter(k => k !== ZERO_KEY);
const accounts = signers.length > 0 ? signers : [ZERO_KEY];

const AVALANCHE_RPC = process.env.AVALANCHE_RPC || "https://api.avax.network/ext/bc/C/rpc";
const POLYGON_RPC   = process.env.POLYGON_RPC   || "https://polygon-rpc.com";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },

  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    avalanche: {
      url:      AVALANCHE_RPC,
      chainId:  43114,
      accounts,
    },
    polygon: {
      url:      POLYGON_RPC,
      chainId:  137,
      accounts,
    },
  },

  etherscan: {
    apiKey: {
      avalanche: process.env.SNOWTRACE_API_KEY    || "",
      polygon:   process.env.POLYGONSCAN_API_KEY  || "",
    },
    customChains: [
      {
        network:  "avalanche",
        chainId:  43114,
        urls: {
          // Routescan (Snowtrace-compatible) — preferred for Avalanche
          apiURL:     "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan",
          browserURL: "https://avalanche.routescan.io",
        },
      },
    ],
  },

  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
};

export default config;
