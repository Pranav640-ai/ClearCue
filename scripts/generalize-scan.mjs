import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

/**
 * Generalisation check on real, unfamiliar public pages.
 *
 * The scanner is injected as a read-only test bundle; nothing is clicked, typed
 * or sent. Only aggregate counts are stored, never page text or issue evidence.
 * A failure to load a site is recorded as a real failure, not hidden.
 */

const bundle = path.resolve(process.cwd(), "dist-test/scanner.js");
const sites = [
  { name: "Wikipedia — Web accessibility", url: "https://en.wikipedia.org/wiki/Web_accessibility" },
  { name: "MDN — ARIA", url: "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA" },
  { name: "GOV.UK — Accessibility", url: "https://www.gov.uk/help/accessibility" },
];

if (!existsSync(bundle)) {
  execSync("npx vite build --config vite.scanner-test.config.ts", { stdio: "inherit" });
}

const bundleSource = await readFile(bundle, "utf8");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const results = [];

for (const site of sites) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const response = await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1500);
    // Inline injection is blocked by strict CSP on some sites; evaluating the
    // bundle through the automation protocol is not, and remains read-only.
    await page.evaluate(bundleSource);
    const summary = await page.evaluate(() =>
      window.ClearCueScanner.scan("generalization-check"),
    );
    results.push({
      name: site.name,
      url: site.url,
      httpStatus: response?.status() ?? null,
      finalUrl: page.url(),
      interactiveCount: summary.interactiveCount,
      issueTotal: summary.issueTotal,
      durationMs: Number(summary.durationMs.toFixed(2)),
      truncated: summary.truncated,
      counts: summary.counts,
      pageErrors: errors,
      error: null,
    });
  } catch (error) {
    results.push({ name: site.name, url: site.url, error: error instanceof Error ? error.message : String(error) });
  } finally {
    await page.close();
  }
}

const browserVersion = browser.version();
await browser.close();

const report = {
  measuredAt: new Date().toISOString(),
  method: "Read-only scan bundle injected into real public pages after load; no interaction, aggregate counts only.",
  environment: { browser: browserVersion, node: process.version },
  results,
  caveats: [
    "Public pages change constantly, so counts are a snapshot, not a benchmark.",
    "No ground truth exists for these pages; they demonstrate that the scanner runs on unfamiliar markup without crashing.",
    "Issue evidence is never persisted here, only category counts.",
  ],
};

await mkdir(path.resolve(process.cwd(), "artifacts"), { recursive: true });
await writeFile(path.resolve(process.cwd(), "artifacts/scanner-generalization.json"), JSON.stringify(report, null, 2));

for (const result of results) {
  if (result.error) {
    console.log(`${result.name}: FAILED — ${result.error}`);
  } else {
    console.log(
      `${result.name}: interactive=${result.interactiveCount} issues=${result.issueTotal} (${result.durationMs} ms) ` +
        `button=${result.counts.missingButtonLabels} form=${result.counts.missingFormLabels} link=${result.counts.missingLinkLabels} vague=${result.counts.vagueLinks} other=${result.counts.other}`,
    );
  }
}
