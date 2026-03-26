/**
 * src/wagmi.ts — Wagmi v2 + RainbowKit configuration
 *
 * Supported chains:  Avalanche C-Chain (primary), Polygon PoS
 * Wallet connectors: MetaMask, WalletConnect, Coinbase Wallet, Rainbow
 */

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";
import {
  base,
  avalanche,
  polygon,
} from "wagmi/chains";

const UNYKORN_CHAIN_ID = Number(import.meta.env.VITE_UNYKORN_CHAIN_ID || 7331);
const UNYKORN_RPC_URL = import.meta.env.VITE_UNYKORN_RPC_URL || "https://rpc.l1.unykorn.org";
const UNYKORN_EXPLORER_URL = import.meta.env.VITE_UNYKORN_EXPLORER_URL || "https://explorer.unykorn.org";

export const UNYKORN_CHAIN = defineChain({
  id: UNYKORN_CHAIN_ID,
  name: "UnyKorn L1",
  nativeCurrency: {
    name: "UnyKorn",
    symbol: "UNY",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [UNYKORN_RPC_URL] },
    public: { http: [UNYKORN_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "UnyKorn Explorer", url: UNYKORN_EXPLORER_URL },
  },
});

export const BASE_CHAIN      = base;
export const AVALANCHE_CHAIN = avalanche;
export const POLYGON_CHAIN   = polygon;

// RainbowKit requires a non-empty WalletConnect Cloud project ID.
// Get one free at https://cloud.walletconnect.com  and set VITE_WALLETCONNECT_PROJECT_ID.
// The fallback below is a publicly-known example ID that keeps the app functional.
const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "b3d7d44fca5a012e0c9e3295e22791ce";

export const wagmiConfig = getDefaultConfig({
  appName:   "UnyKorn Wallet",
  projectId: WALLETCONNECT_PROJECT_ID,
  chains:    [UNYKORN_CHAIN, base, avalanche, polygon],
  ssr:       false,
});

// ── Published contract addresses ─────────────────────────────────────────────

export const BASE_USDC_ADDRESS: `0x${string}` =
  ((import.meta.env.VITE_BASE_USDC_ADDRESS as `0x${string}` | undefined) ??
  "0x833589fCD6EDB6E08f4c7C32D4f71b54bdA02913") as `0x${string}`;

export const UNYKORN_TREASURY_ADDRESS =
  import.meta.env.VITE_UNYKORN_TREASURY_ADDRESS || "uny1_DEMO_TREASURY";

export const UNYKORN_EXPLORER_TX_BASE = `${UNYKORN_EXPLORER_URL.replace(/\/$/, "")}/tx/`;

export const UNY_TOKEN_ADDRESS =
  (import.meta.env.VITE_UNY_TOKEN_ADDRESS as `0x${string}`) ??
  "0xc09003213b34c7bec8d2eddfad4b43e51d007d66";

export const UNY_USDC_POOL_ADDRESS =
  (import.meta.env.VITE_UNY_USDC_POOL_ADDRESS as `0x${string}`) ??
  "0x9ff923a83b3d12db280ff65d69ae37819a743f83";

// Avalanche USDC (native — 6 decimals)
export const USDC_ADDRESS: `0x${string}` =
  "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e";

// Wrapped AVAX on Avalanche C-Chain
export const WAVAX_ADDRESS: `0x${string}` =
  "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7";

// LFJ (Trader Joe V1) — deep-link URLs pre-filled with UNY as output
export const LFJ_ROUTER_URL_USDC =
  `https://traderjoexyz.com/avalanche/trade?inputCurrency=${USDC_ADDRESS}&outputCurrency=${UNY_TOKEN_ADDRESS}`;

export const LFJ_ROUTER_URL_AVAX =
  `https://traderjoexyz.com/avalanche/trade?inputCurrency=AVAX&outputCurrency=${UNY_TOKEN_ADDRESS}`;

// Keep backward-compat alias
export const LFJ_ROUTER_URL = LFJ_ROUTER_URL_USDC;

// Operator / deployer address (Avalanche) — rotated 2026-03-03
export const OPERATOR_ADDRESS: `0x${string}` = "0x95989eB2AD1bF8036d23B53db4d587455a322022";

// WAVAX/UNY pool
export const UNY_WAVAX_POOL_ADDRESS: `0x${string}` = "0xC6F5273D74571d91CBcBA0A2900ed5F7C800F5d0";
