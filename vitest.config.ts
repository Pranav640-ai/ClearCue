import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    reporters: ["default"],
    onConsoleLog(log) {
      // Repair routing debug output is intentionally verbose in the browser.
      if (log.startsWith("[ClearCue][repair]")) return false;
    },
  },
});
