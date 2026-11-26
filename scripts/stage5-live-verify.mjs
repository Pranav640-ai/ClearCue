import { runClearBench } from "./clearbench.mjs";
import { verifyFlagship } from "./stage9-flagship.mjs";
import { verifyActivation } from "./verify-activation.mjs";
import { verifyAssistance } from "./verify-assistance.mjs";
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

/**
 * Stage 5 live verification against the built extension.
 *
 * This drives the real background, content script and panel. It makes no AI
 * request and no network request. A test-only host permission for the local
 * playground removes Chrome's un-automatable permission prompt; site consent is
 * still granted through the real `panel:setSiteEnabled` message.
 */

const ORIGIN = "http://127.0.0.1:4318";
const PAGE_URL = `${ORIGIN}/recovery.html`;
const DIST = path.resolve("dist");
const TEST_DIST = path.resolve(".stage5-live-dist");
const navigatorCheck = process.argv.includes("--navigator");
const clearBench = process.argv.includes("--clearbench");
const flagship = process.argv.includes("--flagship");
const activation = process.argv.includes("--activation");
const assistance = process.argv.includes("--assistance");
const offline = assistance || activation || flagship || clearBench || navigatorCheck || process.argv.includes("--offline");
const artifactName = assistance ? "assistance-verification" : activation ? "activation-verification" : flagship ? "stage9-live" : clearBench ? "clearbench-runtime" : navigatorCheck ? "stage6-live" : offline ? "offline-verification" : "stage5-live";
const REPORT = path.resolve("artifacts/" + artifactName + (artifactName.endsWith("-live") ? "-verification" : "") + ".json");
const checks = [];

function check(id, pass, detail) {
  checks.push({ id, pass: Boolean(pass), detail });
  if (!pass) throw new Error(`Check failed: ${id} (${detail})`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function serverReady() {
  try {
    return (await fetch(PAGE_URL, { signal: AbortSignal.timeout(1500) })).ok;
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
  manifest.name = "ClearCue Stage 5 live verification";
  manifest.host_permissions = [`${ORIGIN}/*`];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

async function panelState(panel) {
  const response = await panel.evaluate(async () => chrome.runtime.sendMessage({ kind: "panel:getState" }));
  if (!response?.ok) throw new Error(response?.error ?? "panel:getState failed");
  return response.data;
}

async function waitForState(panel, predicate, timeout = 12_000, label = "state") {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const state = await panelState(panel);
    if (predicate(state)) return state;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function enableSite(panel) {
  const response = await panel.evaluate(
    async (origin) => chrome.runtime.sendMessage({ kind: "panel:setSiteEnabled", origin, enabled: true }),
    ORIGIN,
  );
  if (!response?.ok) throw new Error(response?.error ?? "Could not enable the site.");
}

async function connectedState(panel) {
  return waitForState(panel, (state) => state.context.status === "connected" && state.context.hostPermissionGranted, 20_000, "connected page");
}

async function bringPage(page, panel) {
  await page.bringToFront();
  await sleep(250);
  return panelState(panel);
}

async function submitEmptyRegistration(page) {
  await page.fill("#applicant-email", "student@example.com");
  await page.getByRole("button", { name: "Continue application" }).click();
}

const server = await startServer();
let context;
try {
  const manifest = await prepareExtension();
  check("stage5-no-tabs-permission", !manifest.permissions.includes("tabs"), "The manifest still does not request the tabs permission.");
  check("stage5-minimal-permissions", manifest.permissions.join(",") === "storage,sidePanel,activeTab,scripting", manifest.permissions.join(", "));

  context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      "--disable-extensions-except=" + TEST_DIST,
      "--load-extension=" + TEST_DIST,
      ...(offline ? ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "--no-proxy-server", "--disable-background-networking"] : []),
    ],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(worker.url()).host;
  const manifestVersion = await worker.evaluate(() => chrome.runtime.getManifest().version);
  check("stage5-version", manifestVersion === "0.5.0", `Loaded version ${manifestVersion}.`);

  if (offline) {
    const probe = await context.newPage();
    const failed = await probe.goto("https://example.com/", { timeout: 8_000 }).then(() => "", (error) => error.message);
    check("offline-dns-blocked", /ERR_NAME_NOT_RESOLVED/.test(failed), "External Chromium navigation fails DNS.");
    await probe.close();
    const workerBlocked = await worker.evaluate(async () => {
      return fetch("https://example.com/", { signal: AbortSignal.timeout(5_000) }).then(() => false, () => true);
    });
    check("offline-worker-egress-blocked", workerBlocked, "The extension service worker could not fetch an external HTTPS origin.");
  }

  let unexpectedRequests = 0;
  let sentinelObserved = false;
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    // Only known playground asset and document loads belong to the harness.
    if (url.origin === ORIGIN && ["document", "stylesheet", "script", "image"].includes(request.resourceType())) return;
    unexpectedRequests += 1;
    sentinelObserved ||= request.url().includes("SENTINEL") || (request.postData() ?? "").includes("SENTINEL");
  });
  const panelPromise = context.waitForEvent("page", {
    predicate: (candidate) => candidate.url().includes("panel.html"),
    timeout: 15_000,
  });
  await worker.evaluate((url) => chrome.windows.create({ url, type: "normal", focused: false }), `chrome-extension://${extensionId}/panel.html`);
  const panel = await panelPromise;
  await panel.waitForLoadState("load");
  await enableSite(panel);

  const page = await context.newPage();
  await page.goto(PAGE_URL);
  await page.bringToFront();
  let state = await connectedState(panel);
  check("stage5-clean-start", state.recovery.events.length === 0, "No recovery outcome exists before an interaction.");
  check("stage5-local-only", state.settings.privacyMode === "local_only", "The live run stays local-only.");

  const beforeEvents = state.recovery.statistics.detected;
  const startedAt = Date.now();
  await submitEmptyRegistration(page);
  state = await waitForState(panel, (next) => next.recovery.events.length > 0, 12_000, "validation recovery");
  const fieldEvent = state.recovery.events.find((event) => event.related?.name === "Registration number");
  check("stage5-detected-validation", Boolean(fieldEvent), "A field validation outcome was recorded.");
  check("stage5-observed-message", fieldEvent.message.includes("eight-character"), `Observed text: ${fieldEvent.message}`);
  check("stage5-correlated", Boolean(fieldEvent.interactionId), "The outcome is correlated to a recent interaction, not asserted as causation.");
  check("stage5-not-page-announced", fieldEvent.existingAnnouncement === "none", "No existing live mechanism was found.");
  check("stage5-announcement-recorded", fieldEvent.announcementStatus === "announced-by-clearcue", `Status: ${fieldEvent.announcementStatus}`);
  check("stage5-detection-sla", Date.now() - startedAt < 8000, `Detection and announcement completed in ${Date.now() - startedAt} ms.`);
  const liveText = await page.locator('[data-clearcue-live="polite"]').textContent();
  check("stage5-live-region", (liveText ?? "").includes("eight-character"), "The page live region contains the observed message.");
  check("stage5-no-focus-steal", (await page.evaluate(() => document.activeElement?.id ?? "")) !== "reg-number", "Focus did not move automatically.");

  const latest = state.recovery.latest;
  check("stage5-latest-linked", latest?.related?.name === "Registration number", "The panel latest outcome links the registration field.");
  const jump = panel.getByRole("button", { name: "Jump to affected field: Registration number" });
  await jump.waitFor({ timeout: 8000 });
  await jump.click();
  await waitForState(panel, (next) => next.recovery.events.some((event) => event.id === fieldEvent.id), 4000, "jump response");
  check("stage5-jump-focus", (await page.evaluate(() => document.activeElement?.id ?? "")) === "reg-number", "The explicit Jump action focused the input.");
  check("stage5-value-preserved", (await page.inputValue("#reg-number")) === "", "Jump did not alter the field value.");

  const replayBefore = (await panelState(panel)).recovery.events.find((event) => event.id === fieldEvent.id)?.replayCount ?? 0;
  const replayButton = panel.getByRole("button", { name: /Replay message:/ });
  await replayButton.waitFor({ timeout: 8000 });
  await replayButton.click();
  state = await waitForState(
    panel,
    (next) => (next.recovery.events.find((event) => event.id === fieldEvent.id)?.replayCount ?? 0) > replayBefore,
    5000,
    "replay",
  );
  check("stage5-replay-count", (state.recovery.events.find((event) => event.id === fieldEvent.id)?.replayCount ?? 0) === replayBefore + 1, "Replay count increased.");
  await sleep(120);
  check("stage5-replay-live", (await page.locator('[data-clearcue-live="polite"]').textContent() ?? "").includes("Repeated message"), "Replay wrote a repeated message.");

  const dismissButton = panel.getByRole("button", { name: /Dismiss this recovery message:/ });
  await dismissButton.waitFor({ timeout: 8000 });
  await dismissButton.click();
  state = await waitForState(panel, (next) => next.recovery.events.some((event) => event.id === fieldEvent.id && event.dismissedAt), 5000, "dismiss");
  check("stage5-dismiss", Boolean(state.recovery.events.find((event) => event.id === fieldEvent.id)?.dismissedAt), "Dismiss persisted locally.");

  const countBeforeRepeat = state.recovery.events.length;
  await page.getByRole("button", { name: "Reset workflow" }).click();
  await page.locator("#reg-summary").waitFor({ state: "hidden" });
  await submitEmptyRegistration(page);
  state = await waitForState(panel, (next) => next.recovery.events.some((event) =>
    event.message === fieldEvent.message && event.interactionId !== fieldEvent.interactionId), 8000, "repeat submission");
  check("stage5-repeat-retained", state.recovery.events.length > countBeforeRepeat &&
    state.recovery.events.some((event) => event.message === fieldEvent.message && event.interactionId !== fieldEvent.interactionId),
    "A new user submission retained an identical outcome.");

  // Preference off: a different outcome must be recorded as preference-off, not announced.
  const preference = panel.getByLabel(/Announce outcomes through the page live region/);
  await preference.waitFor({ timeout: 5000 });
  await preference.click();
  await waitForState(panel, (next) => !next.settings.announceRecoveryMessages, 4000, "preference");
  await page.getByRole("button", { name: "Add driftwood lantern" }).click();
  state = await waitForState(panel, (next) => next.recovery.events.some((event) => event.message.includes("Driftwood lantern")), 8000, "preference-off outcome");
  const preferenceEvent = state.recovery.events.find((event) => event.message.includes("Driftwood lantern"));
  check("stage5-preference-off", preferenceEvent?.announcementStatus === "preference-off", `Status: ${preferenceEvent?.announcementStatus}`);
  // Page-owned live region must suppress ClearCue's own announcement.
  const accessible = await context.newPage();
  await accessible.goto(PAGE_URL);
  await accessible.bringToFront();
  await connectedState(panel);
  await accessible.getByRole("button", { name: "Accessible comparison: off" }).click();
  await submitEmptyRegistration(accessible);
  state = await waitForState(
    panel,
    (next) => next.recovery.events.some((event) => event.category === "validation-error" && event.existingAnnouncement !== "none"),
    8000,
    "page-owned announcement",
  );
  const pageOwned = state.recovery.events.find((event) => event.existingAnnouncement !== "none");
  check("stage5-page-owned", pageOwned?.announcementStatus === "announced-by-page", `Status: ${pageOwned?.announcementStatus}`);
  const comparisonRegions = await accessible.locator("[data-clearcue-live]").allTextContents();
  check("stage5-no-clearcue-write", comparisonRegions.length === 2 && comparisonRegions.every((text) => !text),
    "The pre-created live regions stayed empty during the page-owned announcement.");

  // aria-hidden visual failure.
  await accessible.getByRole("button", { name: "Add sold-out item" }).click();
  state = await waitForState(panel, (next) => next.recovery.events.some((event) => event.category === "operation-failure"), 8000, "visual failure");
  const failure = state.recovery.events.find((event) => event.category === "operation-failure");
  check("stage5-failure-evidence", failure?.message.includes("sold out"), failure?.message ?? "missing");
  check("stage5-failure-severity", failure?.severity === "error", "The failure is not downgraded to success.");

  // Ambiguous account summary: no guess, no jump.
  await accessible.getByRole("button", { name: "Save changes" }).click();
  state = await waitForState(panel, (next) => next.recovery.events.some((event) => event.message.includes("Check the highlighted fields")), 8000, "ambiguous summary");
  const ambiguous = state.recovery.events.find((event) => event.message.includes("Check the highlighted fields"));
  check("stage5-ambiguous-no-field", ambiguous?.related === null, "No field was guessed for a summary naming two fields.");
  check("stage5-ambiguous-no-jump", !ambiguous?.actions.includes("jump"), "Jump is not offered without a reliable field.");
  const summaryRow = panel.locator("#recovery-history li").filter({ hasText: "Check the highlighted fields" });
  await summaryRow.first().waitFor({ timeout: 8000 });
  const latestOutcome = panel.locator(".recovery-latest");
  const summaryIsLatest = (await latestOutcome.textContent())?.includes("Check the highlighted fields");
  const jumpDisabled = summaryIsLatest
    ? await latestOutcome.getByRole("button", { name: /Jump to affected field/ }).isDisabled()
    : await summaryRow.first().getByRole("button", { name: /Jump/ }).count() === 0;
  check("stage5-jump-disabled", jumpDisabled && (await summaryRow.first().textContent())?.includes("no field link"),
    "The ambiguous outcome is identified without an available Jump action.");

  // A real success after correction.
  await accessible.fill("#account-email", "student@example.com");
  await accessible.fill("#account-phone", "0800 555 0142");
  await accessible.getByRole("button", { name: "Save changes" }).click();
  state = await waitForState(panel, (next) => next.recovery.events.some((event) => event.message.includes("Changes saved")), 8000, "visual success");
  const success = state.recovery.events.find((event) => event.message.includes("Changes saved"));
  check("stage5-success", success?.category === "success-confirmation", `Category: ${success?.category}`);

  if (offline) {
    const diagnostics = await context.newPage();
    await diagnostics.goto("chrome-extension://" + extensionId + "/diagnostics.html");
    check("offline-diagnostics-starts", (await diagnostics.locator("#firebase-heading").textContent()) !== null,
      "Diagnostics rendered without requesting a cloud token.");
    await diagnostics.close();
    await accessible.bringToFront();

    await accessible.evaluate(() => {
      const button = document.createElement("button");
      button.id = "offline-rule";
      button.type = "button";
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("aria-label", "Settings");
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
      document.querySelector("main").append(button);
    });
    state = await waitForState(panel, (next) => next.scan.summary?.issues.some((issue) =>
      issue.evidence.some((item) => item.id === "ev:icon" && item.value === "Settings (aria-label)")), 8000, "offline scanner");
    const rule = state.scan.summary.issues.find((issue) => issue.evidence.some((item) =>
      item.id === "ev:icon" && item.value === "Settings (aria-label)"));
    check("offline-scan", Boolean(rule), "The content script scanned a newly inserted control offline.");
    await panel.getByTestId("repair-issue-" + rule.id).getByRole("button", { name: /^Repair this issue:/ }).click();
    state = await waitForState(panel, (next) => next.repairs.some((repair) => repair.issueId === rule.id && repair.source === "rule"),
      8000, "offline repair");
    const applied = state.repairs.find((repair) => repair.issueId === rule.id);
    check("offline-repair", (await accessible.locator("#offline-rule").getAttribute("aria-label")) === "Settings",
      "A deterministic rule updated the actual accessible label offline.");
    await panel.getByTestId("repair-history-" + applied.id).getByRole("button", { name: "Undo" }).click();
    await waitForState(panel, (next) => next.repairs.some((repair) => repair.id === applied.id && repair.undoneAt), 8000, "offline undo");
    check("offline-undo", (await accessible.locator("#offline-rule").getAttribute("aria-label")) === null,
      "Undo removed the applied label from the original element.");

    await accessible.goto(ORIGIN + "/visual-repair.html");
    await accessible.bringToFront();
    state = await waitForState(panel, (next) => next.scan.summary?.url?.endsWith("/visual-repair.html") &&
      next.scan.summary.issues.filter((issue) => issue.category === "icon-control-name").length >= 11, 10_000, "visual fixtures");
    const localIconIssues = state.scan.summary.issues.filter((issue) => issue.category === "icon-control-name");
    const extracted = await panel.evaluate(async ({ issues, documentId }) => {
      const results = [];
      for (const issue of issues) {
        const reply = await chrome.runtime.sendMessage({ kind: "panel:localIcon", issueId: issue.id, documentId });
        if (!reply?.ok) {
          results.push(false);
          continue;
        }
        const image = await createImageBitmap(await fetch("data:image/png;base64," + reply.data).then((value) => value.blob()));
        results.push(image.width === 96 && image.height === 96);
        image.close();
      }
      return results;
    }, { issues: localIconIssues, documentId: state.context.documentId });
    const extractedCount = extracted.filter(Boolean).length;
    check("offline-extract-icon", extractedCount === 10,
      "Ten supported visual fixtures rendered 96 × 96 local PNGs through the built extension, before inference.");
    check("offline-reject-sensitive-and-unsupported", extracted.length - extractedCount === 3,
      "Three controls were rejected, including external-reference syntax, an authored destructive context, and a form.");
  }

  if (navigatorCheck) {
    await accessible.goto(ORIGIN + "/member-portal.html");
    await accessible.bringToFront();
    state = await waitForState(panel, (next) => next.context?.url?.endsWith("/member-portal.html") &&
      next.context.status === "connected", 9000, "navigator connected");
    const goal = panel.getByLabel("What would you like to find?");
    const find = panel.getByRole("button", { name: "Find controls", exact: true });
    await panel.getByText(/Harbor services member portal\. 1 forms/).waitFor();
    await goal.fill("Where can I enter my registration number?");
    await goal.press("Enter");
    const candidate = panel.getByRole("button", { name: /Focus Registration number, result 1/ });
    await candidate.waitFor();
    check("navigator-typed-without-voice", await goal.isEnabled(), "Typed goals are usable without starting a microphone.");
    check("navigator-overview", await panel.getByRole("list", { name: "Page headings" }).count() === 1, "Observed page headings are exposed.");
    check("navigator-grounding", await panel.getByText(/The control’s name matches your goal/).count() > 0, "The first candidate explains its match.");
    check("navigator-explicit", await accessible.evaluate(() => document.activeElement?.id !== "member"), "Search does not focus the page.");
    await candidate.click();
    await panel.getByText(/Focused the textbox labelled Registration number/).waitFor();
    check("navigator-real-focus", await accessible.evaluate(() => document.activeElement?.id === "member"), "Focus reached the original input.");
    check("navigator-no-activation", await accessible.evaluate(() => Object.values(window.activationCounts).every((n) => n === 0)),
      "No website click, submission or input event occurred.");
    check("navigator-no-value-change", await accessible.locator("#member").inputValue() === "HBR-902", "The fictional input value was preserved.");
    await accessible.evaluate(() => document.querySelector("#member").replaceWith(document.querySelector("#member").cloneNode()));
    await candidate.click();
    await panel.getByText(/page or control changed/i).waitFor();
    check("navigator-replaced", await accessible.evaluate(() => document.activeElement?.id !== "member"), "An identical replacement was not focused.");

    await goal.fill("Find details");
    await find.click();
    await panel.getByText(/Several controls match equally well/).waitFor();
    check("navigator-ambiguous", await panel.getByRole("button", { name: /Focus Details, result/ }).count() === 2,
      "Both tied candidates remain explicit, distinguishable choices.");
    await goal.fill("Find submarine insurance");
    await find.click();
    await panel.getByText(/No grounded matches/).waitFor();
    check("navigator-no-match", await panel.locator(".navigation-matches button").count() === 0, "No controls were invented.");

    await panel.getByRole("button", { name: "Refresh page overview" }).click();
    await panel.getByRole("button", { name: "Focus Registration number in Membership application" }).waitFor();
    const ask = async (text) => { await goal.fill(text); await goal.press("Enter"); };
    await accessible.locator("#order-sort").focus();
    await ask("Where am I?");
    await panel.getByText(/Display order, combobox.*Newest first, Oldest first/).waitFor({ timeout: 8000 });
    check("navigator-context-options", await accessible.evaluate(() => document.activeElement?.id === "order-sort"),
      "Live Context Lens reported the manually focused control and choices without moving focus.");
    const announcement = await panel.evaluate(({ tabId, documentId, url }) => chrome.tabs.sendMessage(tabId,
      { kind: "bg:navigationContext", documentId, pageUrl: url, announce: true }, { frameId: 0 }), state.context);
    check("navigator-context-announcer", announcement?.data?.scheduled === true && await accessible.waitForFunction(() =>
      document.querySelector('[data-clearcue-live="polite"]')?.textContent.includes("Display order")).then(() => true),
    "The focused control explanation reached the shared live region.");
    await ask("Find registration number");
    await ask("What's next?");
    await panel.getByText(/Suggested next step: Registration number/).waitFor();
    check("navigator-guidance-reads", await accessible.evaluate(() => document.activeElement?.id === "order-sort"),
      "Asking for the next step kept the current page focus.");
    await ask("Take me there");
    await panel.getByText(/Focused the textbox labelled Registration number/).waitFor();
    check("navigator-guidance-focus", await accessible.evaluate(() => document.activeElement?.id === "member"),
      "The explicit follow-up focused the proposed registration field.");
    await ask("Continue my task");
    await panel.getByText(/Suggested next step: Contact email/).waitFor();
    await ask("Take me there");
    await panel.getByText(/Focused the textbox labelled Contact email/).waitFor();
    await ask("Go back");
    await panel.getByText(/Focused the textbox labelled Registration number/).waitFor();
    check("navigator-guidance-back", await accessible.evaluate(() => document.activeElement?.id === "member"),
      "Back revisited a verified focus step without using browser history.");
    const requirements = panel.getByRole("list", { name: "Required fields and validation" });
    await requirements.getByText(/Contact email.*incomplete/).waitFor();
    await accessible.locator("#contact-email").fill("unfinished");
    await panel.getByRole("button", { name: "Check current form requirements" }).click();
    await requirements.getByText(/Contact email.*needs validation review/).waitFor();
    check("navigator-form-privacy", !(await requirements.textContent()).includes("unfinished"),
      "The form status reflects browser validity flags without revealing the field value.");
    await panel.getByRole("button", { name: "Focus Display order in Orders and receipts" }).click();
    await panel.getByText(/Focused the combobox labelled Display order/).waitFor();
    check("navigator-section-map", await accessible.evaluate(() => document.activeElement?.id === "order-sort"),
      "The section map focused an existing control in Orders and receipts.");
    await accessible.locator("#order-sort").press("ArrowDown");
    const observedSelection = await waitForState(panel, (next) => next.recovery.events.some((event) =>
      event.message === "A selection changed." && event.existingAnnouncement === "native-selection"), 8000, "native selection");
    check("navigator-selection-privacy", !JSON.stringify(observedSelection.recovery.events).includes("Oldest first"),
      "Recovery recorded the native selection signal without the selected label or value.");

    const other = await context.newPage();
    await other.goto("about:blank");
    await other.bringToFront();
    const reply = await panel.evaluate(({ tabId, documentId }) => chrome.runtime.sendMessage({
      kind: "panel:navigationOverview", tabId, documentId,
    }), state.context);
    check("navigator-cross-tab", reply.code === "stale-tab", "A request for a different active tab was rejected.");
    await other.close();
    await accessible.bringToFront();
    const getOverview = ({ tabId, documentId }) => chrome.runtime.sendMessage({ kind: "panel:navigationOverview", tabId, documentId });
    const beforeSpa = await panel.evaluate(getOverview, state.context);
    await accessible.evaluate(() => { location.hash = "alternate-view"; });
    const afterSpa = await waitForState(panel, (next) => next.context?.url?.endsWith("#alternate-view") &&
      next.context.status === "connected", 12000, "navigator SPA");
    const stale = await panel.evaluate(({ tabId, documentId, snapshotId, candidateId }) =>
      chrome.runtime.sendMessage({ kind: "panel:navigationFocus", tabId, documentId, snapshotId, candidateId }),
      { ...afterSpa.context, snapshotId: beforeSpa.data.id, candidateId: beforeSpa.data.controls[0].id });
    const fresh = await panel.evaluate(getOverview, afterSpa.context);
    check("navigator-spa", stale?.data?.focused === false && fresh?.ok && fresh.data.id !== beforeSpa.data.id,
      "A same-document URL change invalidates old candidates and permits a fresh overview.");

  }

  if (clearBench) await runClearBench({
    context, page: accessible, panel, origin: ORIGIN, panelState, waitForState,
  });
  if (flagship) await verifyFlagship({ page: accessible, panel, url: PAGE_URL, waitForState, check });
  if (activation) await verifyActivation({ context, page: accessible, panel, url: ORIGIN + "/member-portal.html", check });
  if (assistance) await verifyAssistance({ page: accessible, panel, origin: ORIGIN, waitForState, check });

  // Disable clears the document's recovery history and removes the live region.
  const disable = panel.getByRole("button", { name: "Disable on this site" });
  await disable.first().waitFor({ timeout: 5000 }).catch(() => undefined);
  if (await disable.count()) {
    await disable.first().click();
    state = await waitForState(panel, (next) => next.context.status !== "connected", 8000, "site disabled");
    check("stage5-disable-clears", state.recovery.events.length === 0, "Disabling the site cleared recovery state.");
  } else {
    check("stage5-disable-clears", false, "The disable control was not available.");
  }


  check("stage5-no-network", unexpectedRequests === 0, `The browser context observed ${unexpectedRequests} unexpected HTTP request(s).`);
  check("stage5-no-secret", !sentinelObserved, "No synthetic secret appeared in requests.");

  await mkdir(path.dirname(REPORT), { recursive: true });
  await panel.screenshot({ path: "artifacts/" + artifactName + "-panel.png", fullPage: true });
  await page.screenshot({ path: "artifacts/" + artifactName + "-page.png", fullPage: true });
  await writeFile(
    REPORT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        extensionVersion: manifestVersion,
        checks,
        passed: checks.filter((item) => item.pass).length,
        total: checks.length,
        privacyMode: "local_only",
        networkRequests: unexpectedRequests,
        offline,
        screenshots: ["artifacts/" + artifactName + "-panel.png", "artifacts/" + artifactName + "-page.png"],
      },
      null,
      2,
    ),
  );
  console.log(`${offline ? "Offline" : "Stage 5 live"} verification: ${checks.filter((item) => item.pass).length}/${checks.length} checks passed.`);
  console.log(`Report: ${REPORT}`);
} finally {
  await context?.close();
  server?.kill();
}
