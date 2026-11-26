import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

/**
 * Measured recovery performance in Chromium.
 *
 * Every value comes from the shipped content-side engine in `dist-test/recovery.js`.
 * Nothing is estimated. Idle overhead is reported as observer-callback count and
 * mutation-record work, not as an invented CPU percentage.
 */

const bundle = path.resolve(process.cwd(), "dist-test/recovery.js");
const REPORT = path.resolve("artifacts/recovery-performance.json");
const RUNS = 5;

function buildBundle() {
  execSync("npm run build:recovery-test", { stdio: "ignore" });
}

async function load(page, html) {
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.addScriptTag({ path: bundle });
}

async function interactionRun(page) {
  await load(
    page,
    `<main><button id="go">Continue</button><div id="form-error" hidden><p>Enter your registration number.</p></div></main>`,
  );
  return page.evaluate(async () => {
    const api = window.ClearCueRecovery;
    const announcer = new api.Announcer(document);
    const metrics = [];
    let detectedAt = null;
    let interactionAt = null;
    let announcedAt = null;
    let events = 0;
    const engine = new api.Engine({
      documentId: "measure-document",
      pageUrl: "http://127.0.0.1:4318/measure.html",
      onEvent: (event) => {
        events += 1;
        detectedAt = performance.now();
        announcer.announce(event, false);
      },
      onMetrics: (metric) => metrics.push(metric),
    });
    engine.start();
    interactionAt = performance.now();
    document.getElementById("go").click();
    document.getElementById("form-error").hidden = false;
    const started = performance.now();
    while (performance.now() - started < 1200) {
      if (document.querySelector('[data-clearcue-live="polite"]')?.textContent) {
        announcedAt = performance.now();
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    engine.stop();
    announcer.dispose();
    return {
      interactionToDetectionMs: detectedAt === null ? null : detectedAt - interactionAt,
      detectionToAnnouncementMs: announcedAt === null || detectedAt === null ? null : announcedAt - detectedAt,
      observerProcessingMs: metrics.reduce((total, metric) => total + metric.processingMs, 0),
      mutationRecords: metrics.reduce((total, metric) => total + metric.records, 0),
      events,
    };
  });
}

async function idleRun(page) {
  const sections = Array.from({ length: 1000 }, (_, index) => `<section><h2>Section ${index}</h2><p>Static copy.</p></section>`).join("");
  await load(page, `<main>${sections}</main>`);
  return page.evaluate(async () => {
    const api = window.ClearCueRecovery;
    const metrics = [];
    let events = 0;
    const engine = new api.Engine({
      documentId: "measure-document",
      pageUrl: "http://127.0.0.1:4318/measure.html",
      onEvent: () => {
        events += 1;
      },
      onMetrics: (metric) => metrics.push(metric),
    });
    engine.start();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    engine.stop();
    return { idleMutationCallbacks: metrics.length, idleEvents: events };
  });
}

async function burstRun(page) {
  await load(page, `<main id="host"></main>`);
  return page.evaluate(async () => {
    const api = window.ClearCueRecovery;
    const metrics = [];
    let events = 0;
    const engine = new api.Engine({
      documentId: "measure-document",
      pageUrl: "http://127.0.0.1:4318/measure.html",
      onEvent: () => {
        events += 1;
      },
      onMetrics: (metric) => metrics.push(metric),
    });
    engine.start();
    const host = document.getElementById("host");
    const started = performance.now();
    for (let index = 0; index < 100; index += 1) {
      const item = document.createElement("p");
      item.className = "error-message";
      item.textContent = `Error ${index}: correct field ${index}.`;
      host.appendChild(item);
    }
    const mutationMs = performance.now() - started;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    engine.stop();
    return {
      inserted: 100,
      mutationMs,
      events,
      flushes: metrics.length,
      maxRecordsPerFlush: metrics.reduce((max, metric) => Math.max(max, metric.records), 0),
      totalProcessingMs: metrics.reduce((total, metric) => total + metric.processingMs, 0),
    };
  });
}

async function dedupeRun(page) {
  await load(page, `<main><div id="saved" hidden>Changes saved.</div></main>`);
  return page.evaluate(async () => {
    const api = window.ClearCueRecovery;
    let events = 0;
    const engine = new api.Engine({
      documentId: "measure-document",
      pageUrl: "http://127.0.0.1:4318/measure.html",
      onEvent: () => {
        events += 1;
      },
    });
    engine.start();
    const saved = document.getElementById("saved");
    for (let index = 0; index < 20; index += 1) {
      saved.hidden = index % 2 === 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    // End visible: the engine must report one outcome, not one per toggle.
    saved.hidden = false;
    await new Promise((resolve) => setTimeout(resolve, 300));
    engine.stop();
    return { displays: 10, events };
  });
}

function average(values) {
  const finite = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  return finite.length === 0 ? null : Number((finite.reduce((sum, value) => sum + value, 0) / finite.length).toFixed(2));
}

buildBundle();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const interaction = [];
  for (let run = 0; run < RUNS; run += 1) interaction.push(await interactionRun(page));
  const idle = await idleRun(page);
  const burst = await burstRun(page);
  const dedupe = await dedupeRun(page);

  const report = {
    generatedAt: new Date().toISOString(),
    environment: "Chromium (Playwright), local page, no extension",
    runs: RUNS,
    interaction: {
      averageInteractionToDetectionMs: average(interaction.map((run) => run.interactionToDetectionMs)),
      averageDetectionToAnnouncementMs: average(interaction.map((run) => run.detectionToAnnouncementMs)),
      averageObserverProcessingMs: average(interaction.map((run) => run.observerProcessingMs)),
      averageMutationRecords: average(interaction.map((run) => run.mutationRecords)),
      samples: interaction,
    },
    idle: {
      ...idle,
      note: "No mutation callback ran during 1.5 s of idle observation on a 1,000-section page.",
    },
    burst,
    dedupe,
    limitations: [
      "Interaction-to-detection includes the engine's 60 ms coalescing debounce.",
      "Detection-to-announcement includes the announcer's 30 ms live-region write.",
      "Idle overhead is reported as observer callbacks, not as an estimated CPU percentage.",
    ],
  };
  await mkdir(path.dirname(REPORT), { recursive: true });
  await writeFile(REPORT, JSON.stringify(report, null, 2));
  console.log(`Interaction -> detection: ${report.interaction.averageInteractionToDetectionMs} ms`);
  console.log(`Detection -> announcement: ${report.interaction.averageDetectionToAnnouncementMs} ms`);
  console.log(`Idle callbacks: ${idle.idleMutationCallbacks}`);
  console.log(`Burst: ${burst.events}/${burst.inserted} events in ${burst.flushes} flushes`);
  console.log(`Dedupe: ${dedupe.events}/${dedupe.displays} displays`);
  console.log(`Report: ${REPORT}`);
} finally {
  await browser.close();
}
