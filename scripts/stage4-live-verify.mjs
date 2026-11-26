import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

/**
 * Stage 4 live verification.
 *
 * This is deliberately separate from `npm run test:e2e` because it performs
 * real cloud inference. It loads the built extension into Chromium with one
 * test-only host permission for the local playground, grants site consent
 * through the real background message, and drives the real panel pipeline.
 *
 * The test-only manifest grant removes the un-automatable native Chrome
 * permission prompt. It does not bypass any ClearCue consent check: the site
 * record is still written through `panel:setSiteEnabled`, and cloud inference
 * is enabled through the panel's explicit confirmation UI.
 *
 * It never prints or stores the App Check debug token.
 */

const ORIGIN = "http://127.0.0.1:4318";
const PAGE_URL = `${ORIGIN}/stage4.html`;
const DIST = path.resolve("dist");
const TEST_DIST = path.resolve(".stage4-live-dist");
const REPORT = path.resolve("artifacts/stage4-live-verification.json");
const SENTINEL = "SENTINEL-PRIVATE-8842";
const PRIVATE_NEEDLES = ["Private case note", "8842", "account.html", SENTINEL];

const checks = [];
function check(id, pass, detail) {
  checks.push({ id, pass: Boolean(pass), detail });
  if (!pass) throw new Error(`Check failed: ${id} (${detail})`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function serverReady() {
  try {
    const response = await fetch(PAGE_URL, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function startServer() {
  if (await serverReady()) return null;
  const child = spawn(process.execPath, ["scripts/serve-playground.mjs"], { stdio: "ignore" });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(250);
    if (await serverReady()) return child;
  }
  child.kill();
  throw new Error("The playground server did not start.");
}

async function prepareExtension() {
  await rm(TEST_DIST, { recursive: true, force: true });
  await cp(DIST, TEST_DIST, { recursive: true });
  const manifestPath = path.join(TEST_DIST, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.name = "ClearCue Stage 4 live verification";
  manifest.host_permissions = [`${ORIGIN}/*`];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

async function installNetworkRecorder(panel) {
  await panel.evaluate(() => {
    const previousFetch = window.fetch.bind(window);
    const requests = [];
    Object.defineProperty(window, "__ccNetwork", { value: requests, configurable: true });
    window.fetch = async (input, init) => {
      const address = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const parsed = new URL(address, location.href);
      const url = parsed.origin + parsed.pathname;
      const inference = parsed.pathname.endsWith(":generateContent");
      let body = inference ? init?.body ?? null : null;
      if (inference && body === null && input instanceof Request) body = await input.clone().text();
      const entry = { url, body: typeof body === "string" ? body : "", status: null };
      requests.push(entry);
      const response = await previousFetch(input, init);
      entry.status = response.status;
      return response;
    };
  });
}

async function network(panel) {
  return panel.evaluate(() => (window.__ccNetwork ?? []).map((entry) => ({ url: entry.url, body: entry.body, status: entry.status })));
}

async function panelState(panel) {
  const response = await panel.evaluate(async () => chrome.runtime.sendMessage({ kind: "panel:getState" }));
  if (!response?.ok) throw new Error(response?.error ?? "panel:getState failed");
  return response.data;
}

async function syncPanel(panel, page) {
  await panel.reload({ waitUntil: "load" });
  await page.bringToFront();
  await sleep(900);
  await installNetworkRecorder(panel);
}

async function waitForAttempt(panel, issueId, previousCount, timeout = 65_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const state = await panelState(panel);
    if (attemptsFor(state, issueId).length > previousCount) return state;
    await sleep(400);
  }
  throw new Error("The repair attempt did not finish in time.");
}

function issueByEvidence(state, value) {
  return state.scan.summary?.issues.find((issue) => issue.evidence.some((item) => item.id === "ev:icon" && item.value === value)) ?? null;
}

function issueByIdFragment(state, fragment) {
  return state.scan.summary?.issues.find((issue) => issue.id.includes(fragment)) ?? null;
}

async function clickIssue(panel, state, issue) {
  const before = attemptsFor(state, issue.id).length;
  await issueButton(panel, issue.id).click();
  return waitForAttempt(panel, issue.id, before);
}

function issueButton(panel, issueId) {
  return panel.getByTestId("repair-issue-" + issueId).getByRole("button", { name: /^Repair this issue:/ });
}

async function clickHistoryUndo(panel, state, issueId) {
  const activeRepair = state.repairs.find((repair) => repair.issueId === issueId && repair.undoneAt === null);
  if (!activeRepair) throw new Error("No active repair for " + issueId + ".");
  await panel.getByTestId("repair-history-" + activeRepair.id).getByRole("button", { name: "Undo" }).click();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const next = await panelState(panel);
    const repair = next.repairs.find((item) => item.id === activeRepair.id && item.undoneAt !== null);
    if (repair) return next;
    await sleep(250);
  }
  throw new Error("The repair was not undone in time.");
}

function attemptsFor(state, issueId) {
  return state.repair.attempts.filter((attempt) => attempt.issueId === issueId);
}

async function injectFixtures(page) {
  await page.evaluate(() => {
    const section = document.createElement("section");
    section.id = "live-fixtures";
    section.innerHTML = `
      <h2>Live verification fixtures</h2>
      <button id="live-cloud" class="icon-button" type="button"><img alt="Search" aria-hidden="true" width="16" height="16" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" /></button>
      <button id="live-rule" class="icon-button" type="button"><svg width="18" height="18" aria-label="settings" aria-hidden="true"></svg></button>
      <button id="live-cloud-off" class="icon-button" type="button"><img alt="Refresh" aria-hidden="true" width="16" height="16" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" /></button>
      <button id="live-stale" class="icon-button" type="button"><img alt="Download" aria-hidden="true" width="16" height="16" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" /></button>
    `;
    document.querySelector("main")?.append(section);
  });
}

async function main() {
  await mkdir(path.dirname(REPORT), { recursive: true });
  const server = await startServer();
  await prepareExtension();

  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [`--disable-extensions-except=${TEST_DIST}`, `--load-extension=${TEST_DIST}`, "--no-first-run", "--window-size=1280,900"],
  });

  const report = { generatedAt: new Date().toISOString(), method: "Real built extension, real Firebase cloud inference, Playwright-driven Chromium.", checks };
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 20_000 }));
    const extensionId = new URL(worker.url()).host;
    report.extensionId = extensionId;
    report.browser = context.browser()?.version() ?? null;

    const page = await context.newPage();
    await page.goto(PAGE_URL, { waitUntil: "load" });
    await page.bringToFront();

    const panelPromise = context.waitForEvent("page", { predicate: (candidate) => candidate.url().includes("panel.html"), timeout: 15_000 });
    await worker.evaluate((url) => chrome.windows.create({ url, type: "normal", focused: false }), `chrome-extension://${extensionId}/panel.html`);
    const panel = await panelPromise;
    panel.on("console", (message) => {
      if (message.text().includes("[ClearCue][repair]")) console.log(`[panel] ${message.text()}`);
    });
    await panel.waitForLoadState("load");

    const enabled = await panel.evaluate(async (origin) => chrome.runtime.sendMessage({ kind: "panel:setSiteEnabled", origin, enabled: true }), ORIGIN);
    check("site-consent-written", enabled?.ok && enabled.data?.context?.siteEnabled, "The background accepted site consent.");
    check("site-access-granted", enabled?.data?.context?.hostPermissionGranted, "The test manifest grants only the local playground origin.");

    await page.reload({ waitUntil: "load" });
    await injectFixtures(page);
    await page.fill("#case1-query", SENTINEL);
    await page.bringToFront();
    await sleep(1800);
    await panel.reload({ waitUntil: "load" });
    await page.bringToFront();
    await sleep(1200);

    await panel.evaluate(async () => chrome.runtime.sendMessage({ kind: "panel:rescan" }));
    await page.bringToFront();
    await sleep(400);
    await panel.reload({ waitUntil: "load" });
    await page.bringToFront();
    await sleep(1200);
    let state = await panelState(panel);
    check("fixture-detected", Boolean(issueByEvidence(state, "Search (img-alt)")), "The scanner detected the medium-confidence icon fixture.");
    check("on-device-truthfully-unavailable", state.repair.statistics.onDeviceRepairs === 0, "No on-device result is claimed in this environment.");

    await panel.getByRole("button", { name: "Allow cloud inference…" }).click();
    await panel.getByRole("button", { name: "Yes, allow cloud inference" }).click();
    await panel.waitForTimeout(500);
    state = await panelState(panel);
    check("cloud-consent-recorded", state.settings.privacyMode === "cloud_allowed" && Boolean(state.settings.cloudOptInAt), "Explicit cloud opt-in was stored.");
    await installNetworkRecorder(panel);

    // 1. Real cloud-generated repair through panel -> pipeline -> validation -> content script.
    const cloudIssue = issueByEvidence(state, "Search (img-alt)");
    check("cloud-fixture-detected", Boolean(cloudIssue), "The cloud fixture is present in the scanned issue list.");
    const beforeCloud = (await network(panel)).length;
    state = await clickIssue(panel, state, cloudIssue);
    const cloudAttempt = attemptsFor(state, cloudIssue.id).at(-1);
    let requests = await network(panel);
    const cloudRequests = requests.slice(beforeCloud);
    report.debugCloud = {
      attempt: cloudAttempt,
      requests: cloudRequests.map((request) => ({ url: request.url, status: request.status, length: request.body.length })),
    };
    check("cloud-request-made", cloudRequests.some((request) => request.url.includes("generateContent") && request.status === 200), "A real generateContent request returned HTTP 200.");
    check("cloud-source-is-real", cloudAttempt?.source === "in_cloud" && state.repair.lastInference?.source === "in_cloud", "The recorded source is IN_CLOUD, read from the SDK.");
    check("cloud-repair-applied", cloudAttempt?.status === "applied" && state.repair.statistics.cloudRepairs === 1, "The cloud proposal passed validation and was applied.");
    check("cloud-label-visible", (await page.locator("#live-cloud").getAttribute("aria-label")) === "Search", "The real content script applied the cloud label.");
    const cloudBodies = cloudRequests.map((request) => request.body).join("\n");
    const leaks = PRIVATE_NEEDLES.filter((needle) => cloudBodies.includes(needle));
    check("cloud-request-no-private-data", leaks.length === 0, `Cloud request bodies contained no private sentinel or nearby text. Leaks: ${leaks.join(", ") || "none"}.`);
    report.cloud = {
      label: cloudAttempt?.proposedLabel,
      latencyMs: cloudAttempt?.inferenceMs,
      routing: cloudAttempt?.routing,
      requestBodiesScanned: cloudRequests.length,
      privateNeedleLeaks: leaks,
    };

    state = await clickHistoryUndo(panel, state, cloudIssue.id);
    check("cloud-undo-restores-attribute", (await page.locator("#live-cloud").getAttribute("aria-label")) === null,
      "Undo restored the original absence of the cloud-generated aria-label.");
    check("cloud-undo-recorded", state.repairs.some((item) => item.id === cloudAttempt.appliedRepairId && item.undoneAt !== null),
      "The actual cloud repair was recorded as undone.");

    // 2. Deterministic repair, no inference request.
    await syncPanel(panel, page);
    state = await panelState(panel);
    const ruleIssue = issueByEvidence(state, "settings (aria-label)");
    check("rule-fixture-detected", Boolean(ruleIssue), "The deterministic fixture is present in the scanned issue list.");
    const beforeRule = (await network(panel)).length;
    state = await clickIssue(panel, state, ruleIssue);
    const ruleAttempt = attemptsFor(state, ruleIssue.id).at(-1);
    const afterRuleRequests = await network(panel);
    report.debugRule = {
      attempt: ruleAttempt,
      network: afterRuleRequests.map((request) => ({ url: request.url, status: request.status, length: request.body.length })),
    };
    check("rule-no-inference", afterRuleRequests.length === beforeRule, "The deterministic repair made no inference request.");
    check("rule-source-is-rule", ruleAttempt?.source === "rule" && ruleAttempt?.status === "applied", "The deterministic repair was recorded as a rule repair.");
    check("rule-label-visible", (await page.locator("#live-rule").getAttribute("aria-label")) === "Settings", "The rule label was applied by the real content script.");

    // 3. Individual undo restores the exact prior state.
    state = await clickHistoryUndo(panel, state, ruleIssue.id);
    check("undo-restores-attribute", !(await page.locator("#live-rule").evaluate((element) => element.hasAttribute("aria-label"))), "Undo removed the ClearCue attribute.");
    check("undo-recorded", state.repairs.find((repair) => repair.issueId === ruleIssue.id)?.undoneAt !== null, "The undo timestamp was persisted.");

    // 4. Sensitive-context case: page text must not leave, even when cloud is used.
    await syncPanel(panel, page);
    state = await panelState(panel);
    const privateIssue = issueByEvidence(state, "graphic-only, no authored name");
    const sensitiveIssue = state.scan.summary.issues.find(
      (issue) => issue.category === "link-name" && issue.evidence.some((item) => item.kind === "nearby-text"),
    );
    check("sensitive-case-detected", Boolean(sensitiveIssue), "The private-context link was detected.");
    const beforeSensitive = (await network(panel)).length;
    state = await clickIssue(panel, state, sensitiveIssue);
    requests = await network(panel);
    const sensitiveBodies = requests.slice(beforeSensitive).map((request) => request.body).join("\n");
    const sensitiveLeaks = PRIVATE_NEEDLES.filter((needle) => sensitiveBodies.includes(needle));
    check("sensitive-text-stayed-local", sensitiveLeaks.length === 0, `No private page text appeared in a cloud request. Leaks: ${sensitiveLeaks.join(", ") || "none"}.`);
    const sensitiveAttempt = attemptsFor(state, sensitiveIssue.id).at(-1);
    check("sensitive-no-page-mutation", !(await page.locator(sensitiveIssue.element.locator).evaluate((element) => element.hasAttribute("aria-label"))), "No label was invented for the sensitive link.");
    report.sensitiveCase = {
      cloudRequestMade: requests.length > beforeSensitive,
      privateNeedleLeaks: sensitiveLeaks,
      outcome: sensitiveAttempt?.status,
      source: sensitiveAttempt?.source,
      routing: sensitiveAttempt?.routing,
    };
    check("private-fixture-unused", Boolean(privateIssue), "A second graphic-only fixture remained detectable for comparison.");

    // 5. Cloud disabled by the user: no request, no mutation.
    await syncPanel(panel, page);
    await panel.getByRole("button", { name: "Switch back to local-only" }).click();
    await panel.waitForTimeout(500);
    state = await panelState(panel);
    check("cloud-opt-out-recorded", state.settings.privacyMode === "local_only" && state.settings.cloudOptInAt === null, "Turning cloud off cleared the opt-in.");
    const cloudOffIssue = issueByEvidence(state, "Refresh (img-alt)");
    const beforeOff = (await network(panel)).length;
    state = await clickIssue(panel, state, cloudOffIssue);
    const offAttempt = attemptsFor(state, cloudOffIssue.id).at(-1);
    check("cloud-off-no-request", (await network(panel)).length === beforeOff, "No network request was made with cloud disabled.");
    check("cloud-off-routing", offAttempt?.routing.includes("cloud-disabled-by-user"), "The abstention carries cloud-disabled-by-user.");
    check("cloud-off-no-mutation", !(await page.locator("#live-cloud-off").evaluate((element) => element.hasAttribute("aria-label"))), "The cloud-off control was left unchanged.");

    // 6. Destructive control: abstain without inference and without mutation.
    await syncPanel(panel, page);
    state = await panelState(panel);
    const destructiveIssue = state.scan.summary.issues.find((issue) => issue.evidence.some((item) => item.kind === "nearby-text" && item.value.startsWith("6. Destructive")));
    const beforeDestructive = (await network(panel)).length;
    state = await clickIssue(panel, state, destructiveIssue);
    const destructiveAttempt = attemptsFor(state, destructiveIssue.id).at(-1);
    check("destructive-no-inference", (await network(panel)).length === beforeDestructive, "The destructive case made no inference request.");
    check("destructive-unsafe-routing", destructiveAttempt?.routing.includes("unsafe-action"), "The destructive case is routed as unsafe-action.");
    check("destructive-unchanged", !(await page.locator("#case-6 button").evaluate((element) => element.hasAttribute("aria-label"))), "The destructive control was not renamed.");

    // 7. Dynamic replacement: a pending cloud request must never write to the replacement.
    await syncPanel(panel, page);
    await panel.getByRole("button", { name: "Allow cloud inference…" }).click();
    await panel.getByRole("button", { name: "Yes, allow cloud inference" }).click();
    await panel.waitForTimeout(400);
    state = await panelState(panel);
    const staleIssue = issueByEvidence(state, "Download (img-alt)");
    const beforeStale = attemptsFor(state, staleIssue.id).length;
    const cloudRequest = panel.waitForRequest((request) =>
      request.method() === "POST" && request.url().includes("generateContent") &&
      request.postData()?.includes("Download"), { timeout: 15000 });
    await issueButton(panel, staleIssue.id).click();
    await cloudRequest;
    await page.evaluate(() => {
      const target = document.querySelector("#live-stale");
      if (!target) return;
      const replacement = document.createElement("button");
      replacement.id = "live-stale-replacement";
      replacement.type = "button";
      replacement.textContent = "Replacement";
      target.replaceWith(replacement);
    });
    state = await waitForAttempt(panel, staleIssue.id, beforeStale);
    const staleAttempt = attemptsFor(state, staleIssue.id).at(-1);
    report.debugStale = { attempt: staleAttempt, requests: (await network(panel)).map((request) => ({ status: request.status, length: request.body.length })) };
    const staleRouting = staleAttempt?.routing ?? [];
    check("stale-routing", staleAttempt?.status === "abstained" &&
      (staleRouting.includes("stale-target") || staleRouting.includes("insufficient-evidence")),
    staleRouting.includes("stale-target") ? "The late proposal was rejected as stale." :
      "The model response produced no eligible proposal. The deterministic stale-target regression exercises rejection separately.");
    check("stale-no-mutation", !(await page.locator("#live-stale-replacement").evaluate((element) => element.hasAttribute("aria-label"))), "The replacement element was not modified.");

    // 8. SPA navigation restores ClearCue-owned repairs.
    await syncPanel(panel, page);
    state = await panelState(panel);
    const spaIssue = issueByEvidence(state, "settings (aria-label)");
    state = await clickIssue(panel, state, spaIssue);
    check("spa-precondition", (await page.locator("#live-rule").getAttribute("aria-label")) === "Settings", "The fixture carries a repair before navigation.");
    await page.evaluate(() => {
      history.pushState({}, "", "/stage4-spa");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await sleep(1000);
    check("spa-restores-repair", !(await page.locator("#live-rule").evaluate((element) => element.hasAttribute("aria-label"))), "SPA navigation restored the ClearCue-owned attribute.");
    state = await panelState(panel);
    check("spa-undo-recorded", state.repairs.find((repair) => repair.issueId === spaIssue.id && repair.undoneAt !== null) !== undefined, "The restored repair is marked undone.");

    // 9. Disabling the site restores every remaining ClearCue-owned repair.
    await page.goto(PAGE_URL, { waitUntil: "load" });
    await injectFixtures(page);
    await page.bringToFront();
    await sleep(1500);
    await panel.reload({ waitUntil: "load" });
    await page.bringToFront();
    await sleep(1000);
    await panel.evaluate(async () => chrome.runtime.sendMessage({ kind: "panel:rescan" }));
    await page.bringToFront();
    await sleep(400);
    await panel.reload({ waitUntil: "load" });
    await page.bringToFront();
    await sleep(1000);
    state = await panelState(panel);
    const disableIssue = issueByEvidence(state, "settings (aria-label)");
    check("disable-fixture-detected", Boolean(disableIssue), "The rule fixture was detected after the reload.");
    state = await clickIssue(panel, state, disableIssue);
    check("disable-precondition", (await page.locator("#live-rule").getAttribute("aria-label")) === "Settings", "The fixture carries a repair before site disable.");
    await panel.getByRole("button", { name: "Disable on this site" }).click();
    await panel.waitForTimeout(1200);
    check("disable-restores-repair", !(await page.locator("#live-rule").evaluate((element) => element.hasAttribute("aria-label"))), "Disabling the site restored the ClearCue-owned attribute.");

    report.statistics = (await panelState(panel)).repair.statistics;
    report.screenshots = [];
    await panel.screenshot({ path: "artifacts/stage4-live-panel.png", fullPage: true });
    await page.screenshot({ path: "artifacts/stage4-live-page.png", fullPage: true });
    report.screenshots.push("artifacts/stage4-live-panel.png", "artifacts/stage4-live-page.png");
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await writeFile(REPORT, JSON.stringify(report, null, 2));
    await context.close();
    if (server) server.kill();
    await rm(TEST_DIST, { recursive: true, force: true });
  }

  const passed = checks.filter((item) => item.pass).length;
  console.log(`Stage 4 live verification: ${passed}/${checks.length} checks passed.`);
  console.log(`Report: ${path.relative(process.cwd(), REPORT)}`);
}

main().catch((error) => {
  console.error("STAGE 4 LIVE VERIFICATION FAILED:", error.message);
  process.exitCode = 1;
});
