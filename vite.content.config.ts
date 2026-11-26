import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Content scripts cannot use ES module imports in Manifest V3, so this bundle is
 * built separately as a self-contained IIFE written to `dist/content.js`.
 * It shares the same TypeScript sources and is registered dynamically, per
 * origin, only after the user grants access.
 */
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    target: "chrome139",
    sourcemap: false,
    lib: {
      entry: fromRoot("./src/content/contentScript.ts"),
      name: "ClearCueContent",
      formats: ["iife"],
      fileName: () => "content.js",
    },
    rollupOptions: {
      output: {
        extend: false,
      },
    },
  },
});
