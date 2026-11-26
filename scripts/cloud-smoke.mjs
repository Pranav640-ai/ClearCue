import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

/**
 * Genuine cloud smoke test.
 *
 * Loads the built extension, opens the diagnostics document, requests a real
 * App Check token and runs the two cloud diagnostics. It prints exactly what
 * happened. It never fakes a result and never retries with App Check disabled.
 *
 * Exit codes:
 *   0 — every executed cloud case returned a real IN_CLOUD response
 *   2 — blocked by external configuration (API disabled, App Check not accepted)
 *   1 — unexpected failure (script error, page error, missing UI)
 */

const local = (path) => new URL(path, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const distPath = local("../dist/");
const artifactPath = local("../artifacts/cloud-smoke.json");
const screenshotPath = local("../artifacts/cloud-smoke.png");

const CASES = [
  { id: "cloud-text", title: "Cloud text" },
  { id: "cloud-json", title: "Cloud structured JSON" },
];

async function readCase(page, id) {
  const card = page.locator(`#test-${id}-title`).locator("xpath=ancestor::article[1]");
  const badge = card.locator(".badge").first();
  const badgeText = (await badge.count()) > 0 ? (await badge.innerText()).trim() : null;
  const error = card.locator(".error");
  const errorText = (await error.count()) > 0 ? (await error.innerText()).trim() : null;
  const latency = await card
    .locator("dt", { hasText: "Latency" })
    .first()
    .locator("xpath=following-sibling::dd[1]")
    .innerText()
    .catch(() => null);
  const check = card.locator(".check");
  const checkText = (await check.count()) > 0 ? (await check.innerText()).trim() : null;
  const errorCode = errorText ? (/Error code:\s*(\S+)/.exec(errorText)?.[1] ?? null) : null;
  return { badgeText, inferenceSource: badgeText, errorText, errorCode, latency, checkText };
}

/**
 * The debug token must never reach an artefact, a screenshot or a log. String
 * values that look like a UUID are masked before anything is written or printed.
 */
function redact(value) {
  if (typeof value === "string") {
    return value.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[redacted-uuid]");
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redact(entry)]));
  }
  return value;
}

async function main() {
  await mkdir(new URL("../artifacts/", import.meta.url), { recursive: true });

  // Start from the current bundle, including its worker. A reused Chrome
  // profile can serve an earlier worker registration after a local rebuild.
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [`--disable-extensions-except=${distPath}`, `--load-extension=${distPath}`, "--no-first-run"],
  });

  const report = {
    startedAt: new Date().toISOString(),
    verdict: "not-run",
    extensionId: null,
    projectId: null,
    cloudModel: null,
    appCheckMode: null,
    appCheckStatus: null,
    cases: {},
    consoleErrors: [],
    pageErrors: [],
    screenshot: "artifacts/cloud-smoke.png",
  };

  try {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) serviceWorker = await context.waitForEvent("serviceworker", { timeout: 15000 });
    report.extensionId = new URL(serviceWorker.url()).host;

    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") report.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => report.pageErrors.push(error.message));

    await page.goto(`chrome-extension://${report.extensionId}/diagnostics.html`, { waitUntil: "load" });
    await page.waitForSelector("#firebase-heading", { timeout: 15000 });
    const policy = await page.evaluate(() => chrome.runtime.sendMessage({ kind: "diagnostics:cloudAllowed" }));
    if (!policy?.ok || policy.data !== true) {
      throw new Error(policy?.ok ? "Cloud diagnostics are disabled in this test profile." :
        "The extension did not authorize the diagnostics preference request (" + (policy?.code ?? "no reply") + ").");
    }

    // Opening diagnostics is offline-safe. This explicitly authorized smoke
    // test requests a real token before exercising the cloud model.
    const checkCloud = page.getByRole("button", { name: "Check cloud connection" });
    if (await checkCloud.isEnabled()) {
      await checkCloud.click();
      await page.waitForFunction(() => /Acquired|Failed:/.test(
        document.querySelector('[aria-labelledby="firebase-heading"]')?.textContent ?? ""), null, { timeout: 20_000 });
    }

    const runtime = await page.locator("#firebase-heading").locator("xpath=ancestor::article[1]").innerText();
    report.projectId = /Project\s*\n\s*(\S+)/.exec(runtime)?.[1] ?? null;
    report.cloudModel = /Cloud model\s*\n\s*(\S+)/.exec(runtime)?.[1] ?? null;
    report.appCheckMode = /App Check\s*\n\s*([^\n]+)/.exec(runtime)?.[1]?.trim() ?? null;
    report.appCheckStatus = /App Check token\s*\n\s*([^\n]+)/.exec(runtime)?.[1]?.trim() ?? null;

    for (const testCase of CASES) {
      const card = page.locator(`#test-${testCase.id}-title`).locator("xpath=ancestor::article[1]");
      const button = card.getByRole("button", { name: /Run test|Running/ });
      if (await button.isDisabled()) {
        report.cases[testCase.id] = { skipped: true, reason: "Test is unavailable in this runtime." };
        continue;
      }
      await button.click();
      await page.waitForFunction(
        (id) => {
          const title = document.querySelector(`#test-${id}-title`);
          const article = title?.closest("article");
          return Boolean(article?.querySelector(".badge") || article?.querySelector(".error"));
        },
        testCase.id,
        { timeout: 30000, polling: 250 },
      );
      report.cases[testCase.id] = await readCase(page, testCase.id);
    }

    await page.screenshot({ path: screenshotPath, fullPage: true });
  } finally {
    await context.close();
  }

  report.finishedAt = new Date().toISOString();
  const cases = Object.values(report.cases).filter((entry) => entry && !entry.skipped);
  const observed = cases.length > 0 && cases.every((entry) => entry.badgeText === "IN_CLOUD");
  const errorTexts = Object.values(report.cases)
    .map((entry) => (entry && typeof entry.errorText === "string" ? entry.errorText : ""))
    .join("\n");
  const blockers = [];
  if (/api-not-enabled|SERVICE_DISABLED/i.test(errorTexts)) blockers.push("ai-logic-api-disabled");
  if (/USER_PROJECT_DENIED|serviceusage\.services\.use/i.test(errorTexts)) blockers.push("project-permission-denied");
  if (/App ?Check token is invalid/i.test(errorTexts)) blockers.push("app-check-token-rejected");
  if (/^Failed:.*App ?Check/i.test(report.appCheckStatus ?? "")) blockers.push("app-check-token-request-failed");
  report.blockedReasons = blockers;

  const blocked = blockers.length > 0;
  report.verdict = observed ? "in_cloud-confirmed" : blocked ? "blocked-externally" : "no-cloud-response";

  const safe = redact(report);
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(artifactPath, JSON.stringify(safe, null, 2), "utf8"),
  );
  console.log(JSON.stringify(safe, null, 2));
  if (report.pageErrors.length > 0) {
    console.error("FAIL: page errors occurred");
    process.exitCode = 1;
    return;
  }
  if (observed) {
    process.exitCode = 0;
  } else if (blocked) {
    console.error("BLOCKED: cloud inference could not authenticate or the AI Logic API is disabled.");
    process.exitCode = 2;
  } else {
    console.error("FAIL: no cloud response and no recognised blocking error.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("SMOKE FAILED:", error);
  process.exitCode = 1;
});
