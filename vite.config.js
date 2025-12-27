import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,

    // Content scripts must be classic scripts → output IIFE (no ESM import/export)
    rollupOptions: {
      input: resolve(__dirname, "src/content.js"),
      output: {
        format: "iife",
        entryFileNames: "content.js",
        inlineDynamicImports: true,
      },
    },

    // avoids Vite trying to split chunks (content script can’t import chunks)
    cssCodeSplit: false,
    sourcemap: true,
  },
});