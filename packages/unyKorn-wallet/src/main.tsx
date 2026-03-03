/**
 * src/main.tsx — entry point
 * Sets up Wagmi + RainbowKit + React Query providers.
 */

import React from "react";
import ReactDOM from "react-dom/client";

import { WagmiProvider }              from "wagmi";
import { RainbowKitProvider }         from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { wagmiConfig, AVALANCHE_CHAIN } from "./wagmi";
import App                              from "./App";

import "@rainbow-me/rainbowkit/styles.css";
import "./index.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={AVALANCHE_CHAIN}
          modalSize="compact"
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
