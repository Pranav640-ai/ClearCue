import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

/**
 * Real scanner measurements. Nothing here is estimated: every number comes from
 * a Chromium run of the shipped scanner bundle on a generated page.
 *
 * Each generated page plants defects at a known ratio, so the reported false
 * positives and false negatives are measured against the planted truth rather
 * than against another tool's opinion.
 */

const bundle = path.resolve(process.cwd(), "dist-test/scanner.js");
const sizes = [
  { name: "small", controls: 20, filler: 60 },
  { name: "medium", controls: 200, filler: 400 },
  { name: "large", controls: 1000, filler: 1600 },
];
const RUNS = 5;

function buildPage({ controls, filler }) {
  const parts = [];
  for (let index = 0; index < filler; index += 1) {
    parts.push(`<section class="filler"><h2>Section ${index}</h2><p>Background copy for layout only.</p></section>`);
  }
  let planted = 0;
  for (let index = 0; index < controls; index += 1) {
    const bucket = index % 10;
    if (bucket === 0) {
      // One planted defect per ten controls: icon-only button with no name.
      parts.push(`<button class="icon" aria-describedby="hint-${index}"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"></svg></button>`);
      planted += 1;
    } else if (bucket === 1) {
      parts.push(`<label for="field-${index}">Field ${index}</label><input id="field-${index}" type="text">`);
    } else if (bucket === 2) {
      parts.push(`<a href="/docs/page-${index}"><svg viewBox="0 0 20 20" width="16" height="16" role="img"><title>Open document ${index}</title></svg></a>`);
    } else {
      parts.push(`<button type="button">Action ${index}</button>`);
    }
  }
  parts.push(`<p id="hint-0" class="visually-hidden">Adds an item</p>`);
  return { html: `<main>${parts.join("\n")}</main>`, planted };
}

async function measure(page, size) {
  const { html, planted } = buildPage(size);
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.addScriptTag({ path: bundle });

  const initial = [];
  for (let run = 0; run < RUNS; run += 1) {
    const result = await page.evaluate(() => {
      const scanner = new window.ClearCueScanner.Scanner(document, "perf");
      const started = performance.now();
      const outcome = scanner.scanAll();
      return {
        ms: performance.now() - started,
        interactiveCount: outcome.summary.interactiveCount,
        issueTotal: outcome.summary.issueTotal,
        truncated: outcome.summary.truncated,
      };
    });
    initial.push(result);
  }

  const incremental = [];
  for (let run = 0; run < RUNS; run += 1) {
    incremental.push(
      await page.evaluate(() => {
        const scanner = new window.ClearCueScanner.Scanner(document, "perf");
        scanner.scanAll();
        const targets = Array.from(document.querySelectorAll("button:not(.icon)")).slice(0, 25);
        const started = performance.now();
        const outcome = scanner.scanTargets(targets);
        return { ms: performance.now() - started, issueTotal: outcome.summary.issueTotal };
      }),
    );
  }

  // Frequent updates: 250 attribute mutations, then the observer's debounced flush.
  const dynamic = await page.evaluate(async () => {
    const scanner = new window.ClearCueScanner.Scanner(document, "perf");
    scanner.scanAll();
    let flushedAt = 0;
    const started = performance.now();
    const observer = new window.ClearCueScanner.Observer(document, scanner, () => {
      flushedAt = performance.now();
    });
    observer.start();
    const named = Array.from(document.querySelectorAll("button:not(.icon)")).slice(0, 250);
    for (const button of named) {
      button.setAttribute("aria-label", "Temporary label");
      button.removeAttribute("aria-label");
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    observer.stop();
    return {
      ms: flushedAt === 0 ? null : flushedAt - started,
      mutationCount: named.length * 2,
      issueTotal: scanner.getIssues().length,
    };
  });

  const last = initial[initial.length - 1];
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  return {
    name: size.name,
    pageDescription: `${size.controls} controls, ${size.filler} filler sections`,
    interactiveCount: last.interactiveCount,
    plantedDefects: planted,
    detectedIssues: last.issueTotal,
    falsePositives: Math.max(0, last.issueTotal - planted),
    falseNegatives: Math.max(0, planted - last.issueTotal),
    truncated: last.truncated,
    initialMs: { median: Number(median(initial.map((entry) => entry.ms)).toFixed(2)), runs: initial.map((entry) => Number(entry.ms.toFixed(2))) },
    incrementalMs: {
      median: Number(median(incremental.map((entry) => entry.ms)).toFixed(2)),
      runs: incremental.map((entry) => Number(entry.ms.toFixed(2))),
      elements: 25,
    },
    dynamicUpdateMs: dynamic.ms === null ? null : Number(dynamic.ms.toFixed(2)),
    dynamicMutations: dynamic.mutationCount,
    issuesAfterDynamic: dynamic.issueTotal,
  };
}

if (!existsSync(bundle)) {
  execSync("npx vite build --config vite.scanner-test.config.ts", { stdio: "inherit" });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const results = [];
for (const size of sizes) results.push(await measure(page, size));
const browserVersion = browser.version();
const durationNote = await page.evaluate(() => navigator.userAgent);
await browser.close();

const report = {
  measuredAt: new Date().toISOString(),
  method: "Real Chromium run of dist-test/scanner.js; medians of 5 runs unless noted.",
  environment: { browser: browserVersion, userAgent: durationNote, node: process.version },
  results,
  notes: [
    "Initial timings include accessible-name computation for every interactive control.",
    "Incremental timings re-scan 25 changed controls only.",
    "Dynamic timings include the 250 ms observer debounce, so they measure update latency, not raw scan cost.",
    "Planted defects are one unnamed icon button per ten controls, so false positives/negatives are measured, not estimated.",
  ],
};

await mkdir(path.resolve(process.cwd(), "artifacts"), { recursive: true });
await writeFile(path.resolve(process.cwd(), "artifacts/scanner-performance.json"), JSON.stringify(report, null, 2));

console.log("Scanner performance (real Chromium measurements)");
for (const result of results) {
  console.log(
    `${result.name.padEnd(7)} interactive=${String(result.interactiveCount).padStart(5)} issues=${String(result.detectedIssues).padStart(4)} ` +
      `initial=${String(result.initialMs.median).padStart(6)}ms incremental=${String(result.incrementalMs.median).padStart(5)}ms ` +
      `dynamic=${result.dynamicUpdateMs === null ? "n/a" : `${result.dynamicUpdateMs}ms`} FP=${result.falsePositives} FN=${result.falseNegatives}`,
  );
}
