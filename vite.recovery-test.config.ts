import { defineConfig } from "vite";

/** Standalone recovery bundle used only by measurement and pilot scripts. */
export default defineConfig({
  build: {
    outDir: "dist-test",
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: "src/content/recovery/testEntry.ts",
      name: "ClearCueRecovery",
      formats: ["iife"],
      fileName: () => "recovery.js",
    },
  },
});
