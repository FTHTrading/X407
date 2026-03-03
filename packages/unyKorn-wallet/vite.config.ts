import { defineConfig } from "vite";
import react           from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Required by some Web3 packages that reference global
    global: "globalThis",
  },
  resolve: {
    alias: {
      // Some older deps still reference 'process'
      process: "process/browser",
    },
  },
  build: {
    target: "es2020",
  },
});
