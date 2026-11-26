import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const out = "artifacts/final-qa";
const source = process.env.CLEARCUE_QA_RELEASE_DIR ?? "dist";
const base = "http://127.0.0.1:4318";
const root = await mkdtemp(path.join(tmpdir(), "clearcue-surfaces-"));
const extension = path.join(root, "extension");
const checks = [];
const expectedNoRetention = ["QA-FINAL-FORM-78EFC", "QA-FINAL-GOAL-045AD", "candidate@example.test"];
let context;
try {
  if (JSON.parse(await readFile(path.join(source, "clearcue-build.json"), "utf8")).channel !== "release") throw new Error("Expected clean release");
  await cp(source, extension, { recursive: true });
  const manifestPath = path.join(extension, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.host_permissions = [base + "/*"];
  await writeFile(manifestPath, JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(path.join(root, "profile"), {
    channel: "chromium", headless: true, acceptDownloads: false,
    args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension,
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "--disable-background-networking", "--no-proxy-server"],
  });
  let egress = 0;
  context.on("request", (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== base) egress++;
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const inspectStorage = () => worker.evaluate(async (sentinels) => {
    const [local, session] = await Promise.all([chrome.storage.local.get(null), chrome.storage.session.get(null)]);
    const content = JSON.stringify({ local, session });
    return { localKeyCount: Object.keys(local).length, sessionKeyCount: Object.keys(session).length,
      sentinelRetained: sentinels.map((sentinel) => content.includes(sentinel)),
      redFlags: /FIREBASE_APPCHECK_DEBUG_TOKEN|VITE_APPCHECK_DEBUG_TOKEN|data:image\/png;base64|data:audio/i.test(content) };
  }, expectedNoRetention);
  const extensionURL = new URL("panel.html", worker.url());
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(base + "/recovery.html");
  const panelRequest = context.waitForEvent("page", (value) => value.url() === extensionURL.href);
  const startup = performance.now();
  await worker.evaluate((url) => chrome.windows.create({ url, focused: false }), extensionURL.href);
  const panel = await panelRequest;
  const send = (request) => panel.evaluate((value) => chrome.runtime.sendMessage(value), request);
  await panel.getByRole("heading", { name: "Get started with ClearCue" }).waitFor();
  const panelStartupMs = Math.round(performance.now() - startup);
  await panel.setViewportSize({ width: 360, height: 850 });
  await panel.screenshot({ path: out + "/panel-introduction.png" });
  const permission = await send({ kind: "panel:setSiteEnabled", origin: base, enabled: true });
  if (!permission?.ok) throw new Error("Fixture permission failed");
  await page.bringToFront();
  await panel.getByRole("list", { name: "Page headings" }).getByText("Interaction recovery lab", { exact: true }).waitFor();
  const skip = panel.getByRole("button", { name: "Skip introduction" });
  await skip.focus();
  await skip.press("Enter");
  checks.push({ name: "keyboard skip focus restored", pass: await panel.getByRole("button", { name: "Revisit introduction" })
    .evaluate((element) => element === document.activeElement) });
  const goal = panel.getByLabel("What would you like to find?");
  await goal.fill(expectedNoRetention[1]);
  await goal.press("Enter");
  await panel.getByRole("status").filter({ hasText: "No grounded matches" }).waitFor();
  const storageDuringGoal = await inspectStorage();
  await goal.fill("Find registration number");
  await goal.press("Enter");
  const candidate = panel.getByRole("button", { name: "Focus Registration number, result 1" });
  await candidate.focus();
  await panel.screenshot({ path: out + "/panel-navigator-keyboard.png" });
  await candidate.press("Enter");
  checks.push({ name: "keyboard focus transition", pass: await page.waitForFunction(
    () => document.activeElement?.id === "reg-number", undefined, { timeout: 5000 }).then(() => true, () => false) });
  await page.locator("#reg-number").fill(expectedNoRetention[0]);
  await page.locator("#applicant-email").fill(expectedNoRetention[2]);
  await page.getByRole("button", { name: "Continue application" }).press("Enter");
  await panel.getByRole("button", { name: "Jump to affected field: Registration number" }).waitFor();
  const recovery = panel.getByRole("region", { name: "Interaction recovery", exact: true });
  checks.push({ name: "recovery statistics have a named group", pass: await recovery
    .getByRole("group", { name: "Recovery statistics", exact: true }).isVisible() });
  await recovery.screenshot({ path: out + "/panel-recovery.png" });
  await panel.getByRole("list", { name: "Page headings", exact: true }).screenshot({ path: out + "/panel-page-map.png" });
  await panel.getByRole("button", { name: "Check current form requirements" }).click();
  await panel.getByRole("list", { name: "Required fields and validation" }).screenshot({ path: out + "/panel-form.png" });
  await panel.getByRole("region", { name: "Settings", exact: true }).screenshot({ path: out + "/panel-settings.png" });
  checks.push({ name: "speech settings and recognition controls are absent",
    pass: await panel.getByLabel("Preferred speech output").count() === 0 &&
      await panel.getByRole("button", { name: /local voice input|speech pack|read .* aloud/i }).count() === 0 });
  await panel.getByRole("region", { name: "Privacy", exact: true }).screenshot({ path: out + "/panel-privacy.png" });
  await panel.locator("#repair").screenshot({ path: out + "/panel-repair.png" });
  await panel.locator("#scan").screenshot({ path: out + "/panel-scanner.png" });
  for (const width of [320, 360, 520, 768]) {
    await panel.setViewportSize({ width, height: 850 });
    checks.push({ name: "panel horizontal overflow at " + width, pass: await panel.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth) });
    checks.push({ name: "statistic labels clear values at " + width, pass: await panel.evaluate(() =>
      [...document.querySelectorAll("#scan .facts dt, .repair-stats dt")].every((label) => {
        const value = label.nextElementSibling;
        if (!value) return false;
        const start = value.getBoundingClientRect().left;
        const text = document.createRange();
        text.selectNodeContents(label);
        return [...text.getClientRects()].every((rect) => rect.right <= start);
      })) });
  }
  const axe = await readFile(path.join("node_modules", "axe-core", "axe.min.js"), "utf8");
  await panel.setViewportSize({ width: 360, height: 850 });
  await panel.evaluate(axe);
  const accessibility = await panel.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
    return { passes: result.passes.length, incomplete: result.incomplete.map((entry) =>
      ({ id: entry.id, targets: entry.nodes.map((node) => node.target) })),
      violations: result.violations.map((entry) => ({ id: entry.id, impact: entry.impact, targets: entry.nodes.map((node) => node.target) })) };
  });
  const cdp = await context.newCDPSession(panel);
  await cdp.send("Performance.enable");
  const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
  const idleStart = performance.now();
  const before = await metrics();
  await new Promise((resolve) => setTimeout(resolve, 3500));
  const after = await metrics();
  const performanceSample = { panelStartupMs, idleIntervalMs: Math.round(performance.now() - idleStart),
    panelRendererIdleTaskMs: Math.round((after.TaskDuration - before.TaskDuration) * 10000) / 10,
    panelJsHeapMiB: Math.round(after.JSHeapUsedSize / 104857.6) / 10 };
  const storage = await inspectStorage();
  const diagnostic = await context.newPage();
  await diagnostic.setViewportSize({ width: 900, height: 850 });
  await diagnostic.goto(new URL("diagnostics.html", extensionURL).href);
  checks.push({ name: "diagnostics describes the clean release accurately", pass: await diagnostic.getByText(
    /clean release supports offline accessibility assistance/).isVisible() });
  await diagnostic.screenshot({ path: out + "/diagnostics.png", fullPage: true });
  const practice = await context.newPage();
  await practice.setViewportSize({ width: 360, height: 850 });
  await practice.goto(new URL("practice.html", extensionURL).href);
  await practice.getByRole("heading", { name: "Practice typed navigation" }).waitFor();
  checks.push({ name: "practice cannot activate controls by command", pass: await (async () => {
    const command = practice.getByRole("textbox", { name: "Command", exact: true });
    const run = practice.getByRole("button", { name: "Run command" });
    await command.fill("Take me to the sorting options");
    await run.click();
    await practice.getByRole("combobox", { name: "Sorting options" }).evaluate((element) => {
      if (document.activeElement !== element) throw new Error("Typed practice did not focus the control.");
    });
    await command.fill("Select the second option");
    await run.click();
    return await practice.getByText(/Use the control manually/i).isVisible() &&
      await practice.getByRole("combobox", { name: "Sorting options" }).inputValue() === "Relevance" &&
      await practice.getByRole("checkbox", { name: /activation/i }).count() === 0;
  })() });
  checks.push({ name: "practice label and select are visually separated", pass: await practice.evaluate(() => {
    const label = document.querySelector('label[for="practice-sort"]');
    const select = document.getElementById("practice-sort");
    return select.getBoundingClientRect().top - label.getBoundingClientRect().bottom >= 4;
  }) });
  await practice.screenshot({ path: out + "/practice.png", fullPage: true });
  const report = { checks, accessibility, performanceSample, storageDuringGoal, storage, egress };
  await writeFile(out + "/surfaces.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (checks.some((entry) => !entry.pass) || accessibility.violations.length ||
    [storageDuringGoal, storage].some((sample) => sample.sentinelRetained.some(Boolean) || sample.redFlags) || egress) process.exitCode = 1;
} finally {
  await context?.close();
  const relative = path.relative(path.resolve(tmpdir()), path.resolve(root));
  if (/^clearcue-surfaces-[a-z0-9]+$/i.test(relative)) await rm(root, { recursive: true, force: true });
}
