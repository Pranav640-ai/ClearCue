import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

// Independent exploratory cohort. No submission, typing into sites, repair, or activation.
const sites = [
  ["E-commerce", "https://www.ikea.com/us/en/"],
  ["E-commerce", "https://www.adafruit.com/"],
  ["Government", "https://www.census.gov/"],
  ["Government", "https://www.canada.ca/en.html"],
  ["Education", "https://ocw.mit.edu/"],
  ["Education", "https://www.open.edu/openlearn/"],
  ["News", "https://www.theguardian.com/international"],
  ["News", "https://apnews.com/"],
  ["Documentation", "https://docs.python.org/3/"],
  ["Documentation", "https://doc.rust-lang.org/book/"],
  ["Documentation", "https://learn.microsoft.com/en-us/"],
  ["Search", "https://www.startpage.com/"],
  ["Search", "https://www.openverse.org/"],
  ["Public form", "https://www.gov.uk/find-local-council"],
  ["Public form", "https://www.usa.gov/register-to-vote"],
  ["Complex navigation", "https://www.loc.gov/"],
  ["Complex navigation", "https://www.metmuseum.org/"],
  ["Complex navigation", "https://www.nasa.gov/"],
];
const searchOnly = process.argv.includes("--search-only");
const rankSample = process.argv.includes("--rank-sample");
const targets = searchOnly ? [
  ["Search", "https://www.google.com/"],
  ["Search", "https://search.marginalia.nu/"],
] : rankSample ? sites.filter(([, url]) => /adafruit|ocw\.mit|docs\.python|gov\.uk|nasa/.test(url)) : sites;
const source = process.env.CLEARCUE_QA_RELEASE_DIR ?? "dist";
const eligibleOrigins = new Set(targets.flatMap(([, url]) => {
  const host = new URL(url).hostname;
  const alternates = host.startsWith("www.") ? [host, host.slice(4)] : [host, "www." + host];
  return alternates.map((name) => "https://" + name);
}));
const dir = await mkdtemp(path.join(tmpdir(), "clearcue-final-qa-"));
const extension = path.join(dir, "extension");
const report = { measuredAt: new Date().toISOString(), browser: null, extensionHttpRequests: 0, rows: [] };
let context;

function round(value) { return Math.round(value * 10) / 10; }
async function poll(read, ready, timeout = 8500) {
  const start = Date.now();
  do {
    const value = await read();
    if (ready(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 150));
  } while (Date.now() - start < timeout);
  return null;
}

try {
  const build = JSON.parse(await readFile(path.join(source, "clearcue-build.json"), "utf8"));
  if (build.channel !== "release") throw new Error("This probe requires the clean release build.");
  await cp(source, extension, { recursive: true });
  const manifestFile = path.join(extension, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  manifest.host_permissions = [...eligibleOrigins].map((origin) => origin + "/*");
  await writeFile(manifestFile, JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(path.join(dir, "profile"), {
    channel: "chromium", headless: true, acceptDownloads: false,
    args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension, "--disable-background-networking"],
  });
  context.on("request", (request) => {
    if (!/^https?:/.test(request.url())) return;
    try {
      const sender = request.serviceWorker()?.url() ?? request.frame().url();
      if (sender.startsWith("chrome-extension:")) report.extensionHttpRequests++;
    } catch {
      // Requests preceding frame attachment have unknown attribution.
    }
  });
  // Drop telemetry writes and requests with external effects before they reach a site.
  await context.route("**/*", (route) => /^(GET|HEAD|OPTIONS)$/.test(route.request().method()) ? route.continue() : route.abort());
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const panelURL = new URL("panel.html", worker.url()).href;
  const page = context.pages()[0] ?? await context.newPage();
  const pendingPanel = context.waitForEvent("page", (next) => next.url() === panelURL);
  const startup = performance.now();
  await worker.evaluate((url) => chrome.windows.create({ url, type: "normal", focused: false }), panelURL);
  const panel = await pendingPanel;
  const send = (message) => panel.evaluate((request) => chrome.runtime.sendMessage(request), message);
  await panel.getByRole("heading", { name: "Context Navigator" }).waitFor();
  report.panelStartupMs = round(performance.now() - startup);
  report.browser = await page.evaluate(() => navigator.userAgent);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));

  for (const [category, url] of targets) {
    const row = { category, url, status: "blocked" };
    report.rows.push(row);
    const start = performance.now();
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12000 });
      row.httpStatus = response?.status() ?? null;
      row.loadMs = round(performance.now() - start);
      const origin = new URL(page.url()).origin;
      if (!response?.ok() || !eligibleOrigins.has(origin)) {
        row.reason = !response?.ok() ? "page unavailable or access challenged" : "redirect outside QA grant";
        continue;
      }
      row.origin = origin;
      await page.bringToFront();
      const before = await metrics();
      const enabling = await send({ kind: "panel:setSiteEnabled", origin, enabled: true });
      if (!enabling?.ok) {
        row.reason = enabling?.code ?? "grant failed";
        continue;
      }
      const state = await poll(() => send({ kind: "panel:getState" }).then((result) => result?.data),
        (data) => data?.context.origin === origin && data.context.status === "connected" && Boolean(data.scan.summary));
      if (!state) {
        row.reason = "no connected scan";
        continue;
      }
      const { tabId, documentId } = state.context;
      const scoped = { tabId, documentId };
      const t = performance.now();
      const overview = await send({ kind: "panel:navigationOverview", ...scoped });
      row.pageMapMs = round(performance.now() - t);
      if (!overview?.ok) {
        row.reason = overview?.code ?? "overview failed";
        continue;
      }
      const { controls, sections = [], fields = [], limited } = overview.data;
      row.scan = {
        issues: state.scan.summary.issueTotal,
        controls: state.scan.summary.interactiveCount,
        ms: round(state.scan.summary.durationMs),
        capped: state.scan.summary.truncated,
      };
      row.navigation = { controls: controls.length, sections: sections.length, forms: overview.data.forms,
        required: fields.filter((field) => field.required).length, limited,
        ambiguousSameSection: controls.length - new Set(controls.map((control) =>
          JSON.stringify([control.name, control.role, control.section]))).size };
      const target = controls.find((control) => ["searchbox", "textbox"].includes(control.role) && /search/i.test(control.name) && !control.form)
        ?? controls.find((control) => control.role === "link" && control.name && !/sign|log in|buy|cart|order|checkout|delete|download|account|privacy|consent/i.test(control.name));
      if (target) {
        const pageBefore = page.url();
        const startFocus = performance.now();
        const focus = await send({ kind: "panel:navigationFocus", ...scoped, snapshotId: overview.data.id, candidateId: target.id });
        row.focusMs = round(performance.now() - startFocus);
        row.focus = focus?.ok && focus.data?.focused ? "verified focus" : "abstained";
        row.urlUnchanged = page.url() === pageBefore;
        const startContext = performance.now();
        const lens = await send({ kind: "panel:navigationContext", ...scoped });
        row.lensMs = round(performance.now() - startContext);
        row.lens = Boolean(lens?.ok && lens.data?.text && lens.data?.focusedId === target.id);
      } else {
        row.focus = "no safe candidate";
      }
      const stale = await send({ kind: "panel:navigationFocus", ...scoped, snapshotId: overview.data.id, candidateId: "999" });
      row.unknownTargetRejected = Boolean(stale?.ok && stale.data?.focused === false);
      if (rankSample) {
        const duplicate = controls.find((control) => control.name && !control.form &&
          controls.some((other) => other.id !== control.id && other.name === control.name &&
            other.role === control.role && other.section === control.section));
        const navigator = panel.locator("#navigator");
        await navigator.getByRole("button", { name: "Refresh page overview" }).click();
        const input = navigator.getByLabel("What would you like to find?");
        const focusBeforeSearch = await page.evaluateHandle(() => document.activeElement);
        await input.fill(duplicate ? "Find " + duplicate.name.slice(0, 160) : "Find search");
        await navigator.getByRole("button", { name: "Find controls", exact: true }).click();
        await navigator.getByRole("status").filter({ hasText: /matching controls|No grounded matches|Review the page overview/ })
          .waitFor({ timeout: 7000 });
        row.ranking = {
          duplicateGoal: Boolean(duplicate),
          matches: await navigator.locator(".navigation-matches li").count(),
          explicitTie: await navigator.getByText(/Several controls match equally well/).isVisible(),
          focusUnchanged: await page.evaluate((original) => document.activeElement === original, focusBeforeSearch),
        };
        await focusBeforeSearch.dispose();
      }
      const after = await metrics();
      row.rendererWorkMs = round((after.TaskDuration - before.TaskDuration) * 1000);
      row.rendererHeapMiB = round(after.JSHeapUsedSize / 1048576);
      row.status = "tested";
    } catch (error) {
      row.reason = /net::(ERR_[A-Z_]+)/.exec(String(error))?.[1] ?? (error?.name === "TimeoutError" ? "timeout" : "automation error");
    } finally {
      console.log(category, new URL(url).hostname, row.status, row.reason ?? "");
    }
  }
} finally {
  await context?.close();
  await writeFile(searchOnly ? "artifacts/final-qa/public-search.json" :
    rankSample ? "artifacts/final-qa/public-ranking.json" : "artifacts/final-qa/public-sites.json",
    JSON.stringify(report, null, 2) + "\n");
  const relative = path.relative(path.resolve(tmpdir()), path.resolve(dir));
  if (/^clearcue-final-qa-[a-z0-9]+$/i.test(relative)) await rm(dir, { recursive: true, force: true });
}
