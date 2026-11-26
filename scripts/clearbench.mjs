import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const frozen = "benchmarks/clearbench-v1/";
const ratio = (numerator, denominator) => ({ numerator, denominator, value: denominator ? numerator / denominator : null });
const mean = (samples) => samples.length ? samples.reduce((total, n) => total + n, 0) / samples.length : null;

export async function runClearBench({ context, page, panel, origin, panelState, waitForState }) {
  const fingerprints = JSON.parse(await readFile(frozen + "freeze.json", "utf8"));
  for (const [path, expected] of Object.entries(fingerprints)) {
    const actual = createHash("sha256").update((await readFile(path, "utf8")).replace(/\r\n/g, "\n")).digest("hex");
    if (actual !== expected) throw new Error("ClearBench frozen file changed: " + path);
  }
  const protocol = JSON.parse(await readFile(frozen + "protocol.json", "utf8"));
  const timeout = protocol.configuration.timeoutMs;
  async function open(caseId, needScan = false) {
    const url = origin + protocol.fixture + "?trial=" + encodeURIComponent(caseId);
    await page.goto(url);
    await page.bringToFront();
    return waitForState(panel, (state) => state.context.url === url && state.context.status === "connected" &&
      (!needScan || state.scan.status === "ready"), 12000, caseId);
  }
  const observations = { repair: [], recovery: [], navigation: [] };

  const startState = await open("repair", true);
  await panel.reload();
  await page.bringToFront();
  await panel.getByRole("list", { name: "Page headings" }).getByText("Waterline dispatch", { exact: true }).waitFor({ timeout: 12000 });
  const preferences = await panel.evaluate(() => chrome.runtime.sendMessage({
    kind: "panel:updateSettings", patch: { announceRecoveryMessages: true },
  }));
  if (!preferences?.ok || !preferences.data.settings.announceRecoveryMessages) throw new Error("ClearBench announcement preference was not established.");
  const locators = startState.scan.summary.issues.map((issue) => issue.element.locator);
  const detected = await page.evaluate((paths) => paths.map((locator) => document.querySelector(locator)?.id ?? ""), locators);
  const before = await page.evaluate((ids) => ids.map((id) => document.getElementById(id)?.getAttribute("aria-label")),
    protocol.repair.map((item) => item.id));
  const rules = panel.getByRole("button", { name: "Rules only", exact: true });
  const begin = performance.now();
  await rules.click();
  await panel.waitForFunction(() => document.querySelector("#repair progress") === null &&
    Array.from(document.querySelectorAll("#repair button")).some((button) => button.textContent.trim() === "Rules only" && !button.disabled),
    null, { timeout, polling: 150 }).catch(() => undefined);
  await panel.locator("#repair").getByText(/Last run:/).waitFor({ timeout }).catch(() => undefined);
  const repairState = await panelState(panel);
  const ruleAttempts = repairState.repair.attempts.filter((attempt) => attempt.documentId === startState.context.documentId)
    .map(({ issueId, action, source, routing }) => ({ issueId, action, source, routing }));
  const ruleDuration = performance.now() - begin;
  for (let index = 0; index < protocol.repair.length; index++) {
    const item = protocol.repair[index];
    const control = page.locator("#" + item.id);
    const label = await control.getAttribute("aria-label");
    const observed = { ...item, detected: detected.includes(item.id), label, changed: label !== before[index],
      correct: label === item.expectedLabel, undoRestored: null };
    if (observed.changed) {
      const finalState = await panelState(panel);
      const issue = finalState.repairs.find((repair) => !repair.undoneAt && repair.newValue === label && repair.documentId === startState.context.documentId);
      if (issue) {
        await panel.getByTestId("repair-history-" + issue.id).getByRole("button", { name: "Undo" }).click();
        await waitForState(panel, (state) => state.repairs.some((repair) => repair.id === issue.id && repair.undoneAt), timeout, "repair Undo").catch(() => null);
      }
      observed.undoRestored = (await control.getAttribute("aria-label")) === before[index];
    }
    observations.repair.push(observed);
  }

  for (const item of protocol.recovery) {
    await open("recovery-" + item.id);
    const time = Date.now();
    const action = page.getByRole("button", { name: item.button, exact: true });
    await action.click();
    const match = (state) => state.recovery.events.find((event) => event.message.includes(item.expectedMessage ?? "") &&
      (!item.expectedField || event.related?.name === item.expectedField) && event.announcementStatus !== "pending");
    let state;
    if (item.expectedMessage) state = await waitForState(panel, (candidate) => Boolean(match(candidate)), timeout, item.id).catch(() => null);
    else {
      await page.waitForTimeout(700);
      state = await panelState(panel);
    }
    state ??= await panelState(panel);
    const event = item.expectedMessage ? match(state) : undefined;
    const matchingMessage = item.expectedMessage ? state.recovery.events.find((entry) => entry.message.includes(item.expectedMessage)) : undefined;
    let repeated = null;
    if (item.repeated && event) {
      await action.click();
      repeated = Boolean(await waitForState(panel, (candidate) => candidate.recovery.events.some((next) =>
        next.id !== event.id && next.interactionId !== event.interactionId && next.message === event.message), timeout, "repeat").catch(() => null));
    }
    observations.recovery.push({ ...item, detected: Boolean(matchingMessage), outcomes: state.recovery.events.length,
      related: (event ?? matchingMessage)?.related?.name ?? null,
      actualAnnouncement: (event ?? matchingMessage)?.announcementStatus ?? null, repeatObserved: repeated,
      detectionMs: matchingMessage ? Date.parse(matchingMessage.observedAt) - time : null });
  }

  for (const item of protocol.navigation) {
    await open("nav-" + item.id);
    // This harness hosts the side panel in a separate Chromium window.
    // Wait for that document to render the new tab's overview before typing.
    await panel.reload();
    await page.bringToFront();
    await panel.getByRole("list", { name: "Page headings" }).getByText("Waterline dispatch", { exact: true }).waitFor({ timeout: 12000 });
    const goal = panel.getByLabel("What would you like to find?");
    await goal.fill(item.goal);
    const time = performance.now();
    await panel.getByRole("button", { name: "Find controls", exact: true }).click();
    await panel.getByRole("status").filter({ hasText: /matching controls|No grounded matches/ }).first().waitFor({ timeout });
    const names = await panel.locator("#navigator .navigation-matches strong").allTextContents();
    const position = item.name ? names.indexOf(item.name) + 1 : null;
    let focused = null;
    if (item.target && position) {
      await panel.locator("#navigator .navigation-matches button").nth(position - 1).click();
      focused = await page.waitForFunction((id) => document.activeElement?.id === id, item.target,
        { timeout: 2500, polling: 100 }).then(() => true, () => false);
    }
    observations.navigation.push({ ...item, candidates: names, position, focused, elapsedMs: performance.now() - time });
  }

  const repairs = observations.repair;
  const recoveries = observations.recovery;
  const targets = observations.navigation.filter((row) => row.target);
  const writes = repairs.filter((r) => r.changed);
  const barriers = repairs.filter((r) => r.barrier);
  const positive = recoveries.filter((r) => r.expectedMessage);
  const negative = recoveries.filter((r) => !r.expectedMessage);
  const metrics = {
    repairDetectionPrecision: ratio(barriers.filter((r) => r.detected).length, repairs.filter((r) => r.detected).length),
    repairDetectionRecall: ratio(barriers.filter((r) => r.detected).length, barriers.length),
    repairLabelPrecision: ratio(writes.filter((r) => r.correct).length, writes.length),
    repairCoverage: ratio(writes.filter((r) => r.correct && r.barrier).length, barriers.length),
    incorrectRepair: ratio(writes.filter((r) => !r.correct).length, writes.length),
    unsafeWrites: writes.filter((r) => r.expectedLabel === null).length,
    undo: ratio(writes.filter((r) => r.undoRestored).length, writes.length),
    recoveryRecall: ratio(positive.filter((r) => r.detected).length, positive.length),
    recoveryPrecision: ratio(positive.filter((r) => r.detected).length, positive.filter((r) => r.detected).length + negative.filter((r) => r.outcomes).length),
    recoveryCorrectAssociation: ratio(positive.filter((r) => r.detected && r.related === r.expectedField).length, positive.length),
    navigatorTop1: ratio(targets.filter((r) => r.position === 1).length, targets.length),
    navigatorIncluded: ratio(targets.filter((r) => r.position).length, targets.length),
    navigatorFocus: ratio(targets.filter((r) => r.focused).length, targets.length),
    navigatorMeanMs: mean(observations.navigation.map((n) => n.elapsedMs)),
    recoveryMeanMs: mean(positive.flatMap((r) => r.detectionMs === null ? [] : [r.detectionMs])),
    ruleBatchMs: ruleDuration,
  };
  const report = { measuredAt: new Date().toISOString(), configuration: { ...protocol.configuration, announceRecoveryMessages: true }, fingerprints, metrics, observations, ruleAttempts,
    environment: { browser: await page.evaluate(() => navigator.userAgent), node: process.version,
      revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() },
    unmeasured: ["Nano text", "Nano visual", "offline Nano", "cloud on this cohort", "voice recognition", "NVDA speech", "human usability"] };
  await writeFile("artifacts/clearbench-v1.json", JSON.stringify(report, null, 2) + "\n", "utf8");
  const rows = Object.entries(metrics).filter(([, item]) => typeof item === "object" && item !== null);
  const chart = '<!doctype html><html lang="en"><meta charset="utf-8"><title>ClearBench v1</title>' +
    '<style>body{font:1rem system-ui;margin:2rem auto;max-width:48rem;padding:1rem}li{margin-block:.8rem}meter{width:12rem;margin-inline:1rem}</style>' +
    '<main><h1>ClearBench v1</h1><p>Deterministic Chromium results. Rates use the denominators shown.</p><ul>' +
    rows.map(([name, rate]) => '<li>' + name.replace(/([A-Z])/g, " $1") +
      (rate.value === null ? " · no observations" : ' <meter min="0" max="1" value="' + rate.value + '" aria-hidden="true"></meter>' +
      rate.numerator + " of " + rate.denominator) + "</li>").join("") + "</ul></main></html>";
  await writeFile("artifacts/clearbench-v1.html", chart, "utf8");
  console.log("ClearBench recorded", repairs.length, "repair controls,", recoveries.length,
    "recovery cases and", observations.navigation.length, "Navigator goals.");
}
