import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * The build output is a Manifest V3 extension:
 *  - `panel.html` is the React side panel (branding, site state, privacy, history).
 *  - `diagnostics.html` is a normal extension document (secure context), which is
 *    required for Chrome's built-in `LanguageModel` Prompt API and therefore for
 *    on-device inference. Inference is never placed in the service worker.
 *  - `background.js` is the MV3 service worker: message routing and tab state only.
 *  - `content.js` is built separately (vite.content.config.ts) because content
 *    scripts cannot use ES module imports.
 * All dependencies are bundled locally; the extension loads no remote code.
 */
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome139",
    sourcemap: false,
    rollupOptions: {
      input: {
        panel: fromRoot("./panel.html"),
        practice: fromRoot("./practice.html"),
        diagnostics: fromRoot("./diagnostics.html"),
        background: fromRoot("./src/background/serviceWorker.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
