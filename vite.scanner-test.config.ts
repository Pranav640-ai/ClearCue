import { defineConfig } from "vite";

/**
 * Standalone scanner bundle used only by the test and measurement scripts.
 * It is never part of the packaged extension.
 */
export default defineConfig({
  build: {
    outDir: "dist-test",
    // Recovery measurements share this directory.
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: "src/content/scanner/testEntry.ts",
      name: "ClearCueScanner",
      formats: ["iife"],
      fileName: () => "scanner.js",
    },
  },
});
