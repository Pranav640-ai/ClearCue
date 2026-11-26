import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  webServer: {
    command: "node scripts/serve-playground.mjs",
    url: "http://127.0.0.1:4318/index.html",
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
