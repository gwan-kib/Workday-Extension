import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    cssCodeSplit: false,

    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content.js"),
        background: resolve(__dirname, "src/background.js"),
      },
      output: {
        // Leave format alone (Vite defaults to ESM)
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",

        // Key: stop shared chunks
        manualChunks: () => null,
      },
    },
  },
});
