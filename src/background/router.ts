import { looksDestructive } from "../repair/validation";
import { isLocalIconPng, mayUseLocalIcon } from "../shared/localIcon";
import { failure, contentMessageSchema, panelRequestSchema, type ContentMessage, type PanelRequest } from "../shared/messages";
import { EMPTY_SCAN_STATE, type ScanSummary, type TabScanState } from "../shared/scan";
import {
  emptyRepairStatistics,

  type RepairApplyResult,
  type RepairAttempt,
  type RepairSuggestion,
  type RepairUndoRequest,
  type RepairUndoResult,
  type RepairView,
  type LiveTargetCheck,
} from "../shared/repair";
import { mergeSettings } from "../shared/settings";
import { buildRecoveryView } from "../shared/recovery";
import { enabledSiteRecords, isSiteEnabled, normalizeOrigin, originPattern, setSiteEnabled } from "../shared/sites";
import type { ActivityStats, AppliedRepair, ExtensionSettings, PanelState, TabContext } from "../shared/types";
import {
  appendAttempt,
  deleteTabState,
  readActivity,
  readAttempts,
  readInferenceRecord,
  readRepairs,
  readSettings,
  readSites,
  readSuggestions,
  readTabState,
  writeActivity,
  writeInferenceRecord,
  writeRepairs,
  writeSettings,
  writeSites,
  writeSuggestions,
  writeTabState,
} from "./storage";
import { acceptContentSnapshot, comparableUrl, emptyTabState, markNavigated, type StoredTabState } from "./tabRegistry";
import {
  acceptRecoveryEvent,
  dismissRecoveryEvent,
  incrementRecoveryReplay,
  markRecoveryAnnounced,
} from "./recovery";
import {
  hasHostPermission,
  injectContentScript,
  isContentScriptRegistered,
  registerContentScriptForOrigin,
  unregisterContentScriptForOrigin,
} from "./scriptRegistry";

type HandlerResult = unknown;

function buildRepairView(input: {
  attempts: RepairAttempt[];
  suggestions: RepairSuggestion[];
  repairs: AppliedRepair[];
  activity: ActivityStats;
  scan: TabScanState;
  settings: ExtensionSettings;
  lastInference: import("./storage").InferenceRecord | null;
}): RepairView {
  const statistics = emptyRepairStatistics();
  const active = input.repairs.filter((repair) => repair.undoneAt === null);
  statistics.detectedIssues = input.scan.summary?.issueTotal ?? 0;
  statistics.appliedRepairs = active.length;
  statistics.deterministicRepairs = active.filter((repair) => repair.source === "rule").length;
  statistics.onDeviceRepairs = active.filter((repair) => repair.source === "on_device").length;
  statistics.cloudRepairs = active.filter((repair) => repair.source === "in_cloud").length;
  statistics.suggestions = input.suggestions.length;
  statistics.abstentions = input.attempts.filter((attempt) => attempt.status === "abstained").length;
  statistics.inferenceRequests = input.activity.inference.onDeviceCalls + input.activity.inference.inCloudCalls;
  statistics.cloudEscalations = input.activity.inference.inCloudCalls;
  statistics.failedRequests = input.attempts.filter((attempt) => attempt.status === "failed").length;
  statistics.undone = input.activity.repairsUndone;
  return {
    attempts: input.attempts.slice(-40).reverse(),
    suggestions: input.suggestions.slice(-20).reverse(),
    statistics,
    paused: input.settings.repairPaused,
    autoRepair: input.settings.autoRepair,
    lastInference: input.lastInference
      ? {
          source: input.lastInference.source,
          requestedSource: input.lastInference.requestedSource,
          attempted: input.lastInference.attempted,
          latencyMs: input.lastInference.latencyMs,
          at: input.lastInference.at,
          purpose: input.lastInference.purpose,
          ok: input.lastInference.ok,
          error: input.lastInference.error,
        }
      : null,
  };
}

/**
 * Only this extension's own pages may issue panel requests. The check uses the
 * sender URL rather than "no tab", because the panel can legitimately be opened
 * as a tab (and in tests) as well as in the side panel.
 */
export function isPanelSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && sender.url?.split(/[?#]/, 1)[0] === chrome.runtime.getURL("panel.html");
}

export function isContentSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && sender.frameId === 0 && typeof sender.tab?.id === "number" &&
    typeof sender.documentId === "string" && (sender.documentLifecycle === undefined || sender.documentLifecycle === "active");
}

function documentTarget(state: StoredTabState | null): chrome.tabs.MessageSendOptions {
  return state?.browserDocumentId ? { frameId: 0, documentId: state.browserDocumentId } : { frameId: 0 };
}

async function activeTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab ?? null;
}

function shortcutsFrom(commands: chrome.commands.Command[]): PanelState["shortcuts"] {  return commands
    .filter((command) => !(command.name ?? "").startsWith("_"))
    .map((command) => ({
      name: command.name ?? "",
      description: command.description ?? "",
      shortcut: command.shortcut ?? "",
    }));
}

async function buildPanelState(): Promise<PanelState> {
  const tab = await activeTab();
  const settings = await readSettings();
  const sites = await readSites();
  const activity = await readActivity();
  const repairs = await readRepairs();
  const attempts = await readAttempts();
  const suggestions = await readSuggestions();
  const lastInference = await readInferenceRecord();

  const tabId = tab?.id ?? null;
  const tabUrl = tab?.url ?? null; // undefined without activeTab/host access
  const origin = normalizeOrigin(tabUrl);
  const enabled = isSiteEnabled(sites, origin);
  const granted = origin ? await hasHostPermission(origin) : false;
  const registered = origin ? await isContentScriptRegistered(origin) : false;
  let stored = tabId === null ? null : await readTabState<StoredTabState>(tabId);
  if (tabId !== null && tabUrl && enabled && granted && registered && (!stored?.contentConnected || stored.url !== tabUrl)) {
    stored = await withTabWrite(tabId, async () => {
      const latest = await readTabState<StoredTabState>(tabId);
      const reply = await chrome.tabs.sendMessage(tabId, { kind: "bg:requestSnapshot" }, { frameId: 0 }).catch(() => null);
      const parsed = contentMessageSchema.safeParse({ kind: "content:snapshot", snapshot: reply?.data });
      if (!reply?.ok || !parsed.success || parsed.data.kind !== "content:snapshot" || parsed.data.snapshot.url !== tabUrl ||
        (await chrome.tabs.get(tabId).catch(() => null))?.url !== tabUrl) return latest;
      const accepted = acceptContentSnapshot(latest, tabId, parsed.data.snapshot, tabUrl, tab?.title ?? null);
      if (!accepted.accepted) return latest;
      await writeTabState(tabId, accepted.next);
      return accepted.next;
    });
  }
  const contentConnected = Boolean(stored?.contentConnected && stored.documentId);
  const scan =
    stored?.scan && stored.documentId && stored.scan.summary?.documentId === stored.documentId
      ? stored.scan
      : { ...EMPTY_SCAN_STATE };

  let status: TabContext["status"];
  let note: string | null = null;

  if (!tab) {
    status = "no-tab";
    note = "No active tab was found. Open ClearCue from the toolbar icon on the page you want help with.";
  } else if (!tabUrl) {
    status = "permission-required";
    note = "Chrome has not exposed this tab's address. Open ClearCue from the toolbar icon on the page, then try again.";
  } else if (!origin) {
    status = "restricted-url";
    note = "ClearCue works only on ordinary http(s) websites. Browser pages, extension pages and local files are excluded.";
  } else if (!enabled) {
    status = "permission-required";
    note = "ClearCue is not enabled on this site yet.";
  } else if (!granted) {
    status = "permission-required";
    note = "Site access was granted earlier but has since been removed. Enable the site again to re-approve access.";
  } else if (!contentConnected) {
    status = "connecting";
    note = registered
      ? "Waiting for the page to connect. If this persists, reload the page."
      : "Access is granted; preparing the page inspector.";
  } else {
    status = "connected";
  }

  const context: TabContext = {
    tabId,
    url: tabUrl,
    origin,
    title: tab?.title ?? stored?.title ?? null,
    status,
    note,
    contentConnected,
    documentId: stored?.documentId ?? null,
    siteEnabled: enabled,
    hostPermissionGranted: granted,
    pageSnapshot: stored?.pageSnapshot ?? null,
    updatedAt: new Date().toISOString(),
  };

  let shortcuts: PanelState["shortcuts"] = [];
  try {
    shortcuts = shortcutsFrom(await chrome.commands.getAll());
  } catch {
    shortcuts = [];
  }

  return {
    context,
    scan,
    settings,
    enabledSites: enabledSiteRecords(sites),
    activity,
    repairs,
    repair: buildRepairView({ attempts, suggestions, repairs, activity, scan, settings, lastInference }),
    recovery: buildRecoveryView(stored?.recovery?.events ?? [], settings.announceRecoveryMessages),
    shortcuts,
    extensionVersion: chrome.runtime.getManifest().version,
    contentScriptRegistered: registered,
    checkedAt: new Date().toISOString(),
  };
}

async function setBadgeForTab(tabId: number, connected: boolean): Promise<void> {
  try {
    await chrome.action.setBadgeText({ tabId, text: connected ? "ON" : "" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#14532d" });
    await chrome.action.setTitle({
      tabId,
      title: connected ? "ClearCue is active on this page" : "Open ClearCue",
    });
  } catch {
    // Tab may already be gone; badge state is cosmetic.
  }
}

async function applySiteEnabled(origin: string, enabled: boolean) {
  if (!normalizeOrigin(origin)) return failure("Unsupported site origin.", "invalid-origin");

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tabId = tab?.id;
  const tabMatches = tabId !== undefined && normalizeOrigin(tab?.url) === origin;
  const sites = await readSites();

  if (enabled) {
    if (!(await hasHostPermission(origin))) {
      return failure("Chrome has not granted access to this site. Use Enable on this site so Chrome can ask for permission.", "permission-required");
    }
    try {
      await registerContentScriptForOrigin(origin);
    } catch (error) {
      return failure(`Could not register the page inspector: ${error instanceof Error ? error.message : String(error)}`, "registration-failed");
    }
    await writeSites(setSiteEnabled(sites, origin, true));

    if (tabMatches && tabId !== undefined) {
      try {
        await injectContentScript(tabId);
      } catch (error) {
        // Registration still applies on the next load; report the immediate failure.
        return failure(
          `Access is saved, but the current page could not be connected: ${error instanceof Error ? error.message : String(error)}. Reload the page.`,
          "injection-failed",
        );
      }
    }
  } else {
    await unregisterContentScriptForOrigin(origin);
    const updated = setSiteEnabled(sites, origin, false);
    await writeSites(updated);

    if (tabMatches && tabId !== undefined) {
      const stored = await readTabState<StoredTabState>(tabId);
      let restoredIds: string[] = [];
      try {
        const response = (await chrome.tabs.sendMessage(tabId, { kind: "bg:siteDisabled" })) as {
          data?: { restored?: string[] };
        } | null;
        restoredIds = response?.data?.restored ?? [];
      } catch {
        // No content script in the tab.
      }
      if (stored?.documentId && restoredIds.length > 0) {
        const repairs = await readRepairs();
        const restored = new Set(restoredIds);
        const now = new Date().toISOString();
        let changed = 0;
        const nextRepairs = repairs.map((repair) => {
          if (repair.undoneAt === null && repair.documentId === stored.documentId && restored.has(repair.id)) {
            changed += 1;
            return { ...repair, undoneAt: now };
          }
          return repair;
        });
        if (changed > 0) {
          await writeRepairs(nextRepairs);
          const activity = await readActivity();
          await writeActivity({
            ...activity,
            repairsUndone: activity.repairsUndone + changed,
            updatedAt: now,
          });
        }
      }
      if (stored) {
        const next: StoredTabState = {
          ...stored,
          contentConnected: false,
          documentId: null,
          scan: { ...EMPTY_SCAN_STATE },
          recovery: { events: [], updatedAt: null },
        };
        await writeTabState(tabId, next);
      }
      await setBadgeForTab(tabId, false);
    }
    try {
      await chrome.permissions.remove({ origins: [originPattern(origin)] });
    } catch {
      // Permission may already be gone.
    }
  }

  return { ok: true as const, data: await buildPanelState() };
}

type PageNavigationRequest = Extract<PanelRequest, {kind: "panel:navigationOverview" | "panel:navigationFocus" | "panel:navigationContext"}>;

async function navigatePage(message: PageNavigationRequest | { kind: "announce-context"; tabId: number }): Promise<HandlerResult> {
  const tab = await activeTab();
  if (!tab?.url || tab.id !== message.tabId) return failure("The active tab changed.", "stale-tab");
  const origin = normalizeOrigin(tab.url);
  if (!origin || !isSiteEnabled(await readSites(), origin) || !(await hasHostPermission(origin))) {
    return failure("Enable ClearCue on this site before using navigation.", "site-disabled");
  }
  const stored = await readTabState<StoredTabState>(message.tabId);
  if (!stored?.documentId || (message.kind !== "announce-context" && stored.documentId !== message.documentId) ||
      comparableUrl(stored.url) !== comparableUrl(tab.url)) {
    return failure("The current page changed. Refresh the page overview.", "stale-document");
  }
  const current = await activeTab();
  if (current?.id !== tab.id || current.url !== tab.url) return failure("The active page changed.", "stale-tab");
  const target = { documentId: stored.documentId, pageUrl: tab.url };
  try {
    const request = message.kind === "panel:navigationFocus"
      ? { kind: "bg:navigationFocus", ...target, snapshotId: message.snapshotId, candidateId: message.candidateId }
      : message.kind === "panel:navigationOverview" ? { kind: "bg:navigationOverview", ...target }
      : { kind: "bg:navigationContext", ...target, ...(message.kind === "announce-context" ? { announce: true } : {}) };
    return await chrome.tabs.sendMessage(tab.id, request, documentTarget(stored));
  } catch {
    return failure("The page did not respond. Refresh the page overview and try again.", "navigation-unavailable");
  }
}

export async function announceFocusedContext(tabId: number): Promise<void> {
  await navigatePage({ kind: "announce-context", tabId });
}

async function handlePanelRequest(message: PanelRequest, sender: chrome.runtime.MessageSender): Promise<HandlerResult> {
  if (!isPanelSender(sender)) return failure("Rejected message from an untrusted sender.", "untrusted-sender");

  switch (message.kind) {
    case "panel:navigationOverview":
    case "panel:navigationContext":
    case "panel:navigationFocus":
      return navigatePage(message);
    case "panel:getState":
      return { ok: true as const, data: await buildPanelState() };

    case "panel:setSiteEnabled":
      return applySiteEnabled(message.origin, message.enabled);

    case "panel:updateSettings": {
      const current = await readSettings();
      const next = mergeSettings(current, message.patch);
      await writeSettings(next);
      return { ok: true as const, data: await buildPanelState() };
    }

    case "panel:rescan": {
      const tab = await activeTab();
      const tabId = tab?.id;
      if (!tab || tabId === undefined) return failure("No active tab was found. Open ClearCue on the page you want to scan.", "no-tab");
      const sites = await readSites();
      if (!isSiteEnabled(sites, normalizeOrigin(tab.url ?? null))) return failure("ClearCue is not enabled on this site.", "site-disabled");
      const current = await readTabState<StoredTabState>(tabId);
      if (!current?.documentId || !current.contentConnected) {
        return failure("The page is not connected yet. Reload the page and try again.", "not-connected");
      }
      await writeTabState(tabId, {
        ...current,
        scan: { status: "scanning", summary: current.scan.summary, error: null, updatedAt: new Date().toISOString() },
      });

      let response: unknown;
      try {
        response = await chrome.tabs.sendMessage(tabId, { kind: "bg:requestScan" });
      } catch {
        await writeTabState(tabId, {
          ...current,
          scan: {
            ...EMPTY_SCAN_STATE,
            status: "error",
            error: "The page did not answer the scan request. Reload the page and try again.",
            updatedAt: new Date().toISOString(),
          },
        });
        return failure("The page did not answer the scan request. Reload the page and try again.", "scan-failed");
      }

      const candidate = response as { ok?: boolean; data?: ScanSummary } | null;
      if (candidate?.ok && candidate.data && candidate.data.documentId === current.documentId) {
        await writeTabState(tabId, {
          ...current,
          scan: { status: "ready", summary: candidate.data, error: null, updatedAt: new Date().toISOString() },
        });
      }
      return { ok: true as const, data: await buildPanelState() };
    }

    case "panel:localIcon":
    case "panel:checkTarget": {
      const tab = await activeTab();
      const tabId = tab?.id;
      if (!tab || tabId === undefined) return failure("No active tab was found.", "no-tab");
      const sites = await readSites();
      if (!isSiteEnabled(sites, normalizeOrigin(tab.url ?? null))) return failure("ClearCue is not enabled on this site.", "site-disabled");
      const stored = await readTabState<StoredTabState>(tabId);
      const scanned = stored?.scan.summary?.issues.find((issue) => issue.id === message.issueId);
      if (stored?.documentId !== message.documentId || !scanned) return failure("The issue is not in the current scan.", "stale-document");
      if (message.kind === "panel:localIcon") {
        if (!mayUseLocalIcon(scanned) || looksDestructive(scanned)) return failure("This issue has no eligible local icon.", "local-icon-unavailable");
        try {
          const response = await chrome.tabs.sendMessage(tabId, {
            kind: "bg:localIcon", documentId: message.documentId, issue: scanned,
          }, { frameId: 0 }) as { ok?: boolean; data?: unknown } | null;
          if (response?.ok && isLocalIconPng(response.data)) return { ok: true as const, data: response.data };
        } catch {
          // A stale document or missing content script can make extraction unavailable.
        }
        return failure("Local icon extraction was unavailable.", "local-icon-unavailable");
      }
      try {
        const response = (await chrome.tabs.sendMessage(tabId, { kind: "bg:checkTarget", issue: scanned })) as {
          ok?: boolean;
          data?: LiveTargetCheck;
        } | null;
        if (!response?.ok || !response.data) return failure("The page did not return the target state.", "target-check-failed");
        return { ok: true as const, data: response.data };
      } catch {
        return failure("The page did not answer the target check.", "target-check-failed");
      }
    }

    case "panel:repairApply": {
      const settings = await readSettings();
      if (settings.repairPaused || (message.request.proposedBy === "in_cloud" &&
        (settings.privacyMode !== "cloud_allowed" || settings.cloudOptInAt === null))) {
        return failure("Current repair or privacy settings no longer allow this proposal.", "repair-disabled");
      }
      const tab = await activeTab();
      const tabId = tab?.id;
      if (!tab || tabId === undefined) return failure("No active tab was found.", "no-tab");
      const sites = await readSites();
      if (!isSiteEnabled(sites, normalizeOrigin(tab.url ?? null))) return failure("ClearCue is not enabled on this site.", "site-disabled");
      const stored = await readTabState<StoredTabState>(tabId);
      if (!stored?.documentId || stored.documentId !== message.request.documentId) {
        return failure("The page changed after this repair was planned.", "stale-document");
      }
      let response: unknown;
      try {
        response = await chrome.tabs.sendMessage(tabId, { kind: "bg:applyRepair", request: message.request }, documentTarget(stored));
      } catch {
        return failure("The page did not answer the repair request. Reload the page and try again.", "repair-failed");
      }
      const payload = response as { ok?: boolean; data?: RepairApplyResult } | null;
      const result = payload?.data;
      if (!payload?.ok || !result?.ok || !result.applied) {
        return failure(result?.error ?? "The repair could not be applied.", result?.conflict ? "repair-conflict" : "repair-failed");
      }
      const repairs = await readRepairs();
      const applied: AppliedRepair = {
        ...result.applied,
        documentId: message.request.documentId,
        tabId,
      };
      await writeRepairs([...repairs, applied]);
      const activity = await readActivity();
      await writeActivity({
        ...activity,
        repairsApplied: activity.repairsApplied + 1,
        updatedAt: new Date().toISOString(),
      });
      return { ok: true as const, data: await buildPanelState() };
    }

    case "panel:undoRepair": {
      const repairs = await readRepairs();
      const repair = repairs.find((item) => item.id === message.repairId && item.undoneAt === null);
      if (!repair) return failure("That repair is not available to undo.", "repair-not-found");
      const tab = await activeTab();
      const tabId = tab?.id;
      if (!tab || tabId === undefined || !repair.documentId) return failure("The repaired page is not open.", "no-tab");
      const stored = await readTabState<StoredTabState>(tabId);
      if (!stored?.documentId || stored.documentId !== repair.documentId) {
        return failure("The page changed since this repair was applied, so it cannot be undone here.", "stale-document");
      }
      const request: RepairUndoRequest = {
        repairId: repair.id,
        issueId: repair.issueId,
        documentId: repair.documentId,
        locator: repair.elementRef.locator,
        target: "aria-label",
        expectedCurrentValue: repair.newValue,
        previousValue: repair.previousValue,
        previousPresent: repair.previousPresent ?? (repair.previousValue ?? "").length > 0,
      };
      let response: unknown;
      try {
        response = await chrome.tabs.sendMessage(tabId, { kind: "bg:undoRepair", request }, documentTarget(stored));
      } catch {
        return failure("The page did not answer the undo request.", "undo-failed");
      }
      const payload = response as { ok?: boolean; data?: RepairUndoResult } | null;
      if (!payload?.ok || !payload.data?.ok) {
        return failure(payload?.data?.error ?? "The repair could not be undone.", payload?.data?.conflict ? "repair-conflict" : "undo-failed");
      }
      await writeRepairs(repairs.map((item) => (item.id === repair.id ? { ...item, undoneAt: new Date().toISOString() } : item)));
      const activity = await readActivity();
      await writeActivity({ ...activity, repairsUndone: activity.repairsUndone + 1, updatedAt: new Date().toISOString() });
      return { ok: true as const, data: await buildPanelState() };
    }

    case "panel:undoAllRepairs": {
      const tab = await activeTab();
      const tabId = tab?.id;
      if (!tab || tabId === undefined) return failure("No active tab was found.", "no-tab");
      const stored = await readTabState<StoredTabState>(tabId);
      if (!stored?.documentId) return failure("The page is not connected.", "not-connected");
      const repairs = await readRepairs();
      const undoCandidates = repairs.filter(
        (repair) => repair.undoneAt === null && repair.documentId === stored.documentId && repair.tabId === tabId,
      );
      if (undoCandidates.length === 0) return failure("There are no applied repairs to undo on this page.", "repair-not-found");
      const requests: RepairUndoRequest[] = undoCandidates.map((repair) => ({
        repairId: repair.id,
        issueId: repair.issueId,
        documentId: repair.documentId ?? stored.documentId ?? "",
        locator: repair.elementRef.locator,
        target: "aria-label",
        expectedCurrentValue: repair.newValue,
        previousValue: repair.previousValue,
        previousPresent: repair.previousPresent ?? (repair.previousValue ?? "").length > 0,
      }));
      let response: unknown;
      try {
        response = await chrome.tabs.sendMessage(tabId, { kind: "bg:undoAllRepairs", requests }, documentTarget(stored));
      } catch {
        return failure("The page did not answer the undo request.", "undo-failed");
      }
      const payload = response as { ok?: boolean; data?: RepairUndoResult[] } | null;
      const results = payload?.data ?? [];
      const succeeded = new Map<string, RepairUndoResult>();
      results.forEach((result, index) => {
        const repair = undoCandidates[index];
        if (repair && result.ok) succeeded.set(repair.id, result);
      });
      if (succeeded.size === 0) {
        return failure(results.find((result) => result.error)?.error ?? "No repair could be undone.", "undo-failed");
      }
      await writeRepairs(
        repairs.map((item) => (succeeded.has(item.id) ? { ...item, undoneAt: new Date().toISOString() } : item)),
      );
      const activity = await readActivity();
      await writeActivity({
        ...activity,
        repairsUndone: activity.repairsUndone + succeeded.size,
        updatedAt: new Date().toISOString(),
      });
      return { ok: true as const, data: await buildPanelState() };
    }

    case "panel:recordAttempt": {
      await appendAttempt(message.attempt);
      return { ok: true as const, data: await buildPanelState() };
    }

    case "panel:recordSuggestion": {
      const suggestions = await readSuggestions();
      const duplicate = suggestions.some(
        (item) => item.issueId === message.suggestion.issueId && item.label === message.suggestion.label && item.documentId === message.suggestion.documentId,
      );
      if (!duplicate) await writeSuggestions([...suggestions, message.suggestion]);
      return { ok: true as const, data: await buildPanelState() };
    }

    case "panel:dismissSuggestion": {
      const suggestions = await readSuggestions();
      await writeSuggestions(suggestions.filter((item) => item.id !== message.suggestionId));
      return { ok: true as const, data: await buildPanelState() };
    }

    case "panel:recordInference": {
      const at = new Date().toISOString();
      await writeInferenceRecord({
        source: message.source,
        requestedSource: message.requestedSource,
        attempted: message.attempted,
        latencyMs: message.latencyMs,
        purpose: message.purpose,
        ok: message.ok,
        error: message.error,
        at,
      });
      if (message.ok && message.source !== "unknown") {
        const activity = await readActivity();
        await writeActivity({
          ...activity,
          inference: {
            ...activity.inference,
            onDeviceCalls: activity.inference.onDeviceCalls + (message.source === "on_device" ? 1 : 0),
            inCloudCalls: activity.inference.inCloudCalls + (message.source === "in_cloud" ? 1 : 0),
          },
          updatedAt: at,
        });
      }
      return { ok: true as const, data: await buildPanelState() };
    }

    case "panel:focusRecovery": {
      const tab = await activeTab();
      const tabId = tab?.id;
      if (!tab || tabId === undefined) return failure("No active tab was found.", "no-tab");
      const stored = await readTabState<StoredTabState>(tabId);
      const event = stored?.recovery.events.find((item) => item.id === message.eventId);
      if (!stored?.documentId || !event || event.documentId !== stored.documentId || !event.related) {
        return failure("That recovery outcome is no longer available on this page.", "stale-recovery");
      }
      try {
        const response = (await chrome.tabs.sendMessage(tabId, {
          kind: "bg:focusRecovery",
          eventId: event.id,
          documentId: stored.documentId,
          locator: event.related.locator,
        })) as { ok?: boolean; data?: { focused?: boolean; reason?: string; name?: string } } | null;
        if (!response?.ok || !response.data) return failure("The page did not answer the jump request.", "recovery-focus-failed");
        return {
          ok: true as const,
          data: {
            kind: "focus" as const,
            focused: Boolean(response.data.focused),
            message: response.data.reason ?? "The jump could not be completed.",
            name: response.data.name ?? "",
          },
        };
      } catch {
        return failure("The page did not answer the jump request. Reload the page and try again.", "recovery-focus-failed");
      }
    }

    case "panel:replayRecovery": {
      const tab = await activeTab();
      const tabId = tab?.id;
      if (!tab || tabId === undefined) return failure("No active tab was found.", "no-tab");
      const stored = await readTabState<StoredTabState>(tabId);
      const event = stored?.recovery.events.find((item) => item.id === message.eventId);
      if (!stored?.documentId || !event || event.documentId !== stored.documentId) {
        return failure("That recovery message is no longer available on this page.", "stale-recovery");
      }
      try {
        const response = (await chrome.tabs.sendMessage(tabId, {
          kind: "bg:announceRecovery",
          event,
          replay: true,
        })) as { ok?: boolean; data?: { scheduled?: boolean } } | null;
        if (!response?.ok || !response.data?.scheduled) {
          return failure("The page could not replay the message through its live region.", "recovery-replay-failed");
        }
        await writeTabState(tabId, { ...stored, recovery: incrementRecoveryReplay(stored.recovery, event.id) });
        const activity = await readActivity();
        await writeActivity({
          ...activity,
          recoveryMessages: activity.recoveryMessages + 1,
          updatedAt: new Date().toISOString(),
        });
        return { ok: true as const, data: { kind: "replay" as const, scheduled: true, message: "The message was replayed through the page live region." } };
      } catch {
        return failure("The page did not answer the replay request.", "recovery-replay-failed");
      }
    }

    case "panel:dismissRecovery": {
      const tab = await activeTab();
      const tabId = tab?.id;
      if (!tab || tabId === undefined) return failure("No active tab was found.", "no-tab");
      const stored = await readTabState<StoredTabState>(tabId);
      const event = stored?.recovery.events.find((item) => item.id === message.eventId);
      if (!stored || !event) return failure("That recovery outcome is no longer available.", "stale-recovery");
      await writeTabState(tabId, { ...stored, recovery: dismissRecoveryEvent(stored.recovery, event.id) });
      return { ok: true as const, data: { kind: "dismiss" as const, message: "The recovery outcome was dismissed from the panel." } };
    }

    case "panel:openDiagnostics": {
      await chrome.tabs.create({ url: chrome.runtime.getURL("diagnostics.html") });
      return { ok: true as const, data: await buildPanelState() };
    }

    default:
      return failure("Unsupported panel request.", "unsupported-request");
  }
}

async function handleContentMessage(message: ContentMessage, sender: chrome.runtime.MessageSender): Promise<HandlerResult> {
  if (!isContentSender(sender)) return failure("Rejected message from an untrusted content sender.", "untrusted-sender");
  const tabId = sender.tab?.id;
  if (tabId === undefined) return failure("Content message without a tab id.", "missing-tab");

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return failure("The tab no longer exists.", "tab-gone");

  const sites = await readSites();
  const origin = normalizeOrigin(tab.url);
  if (!origin || !isSiteEnabled(sites, origin) || !(await hasHostPermission(origin))) {
    return failure("ClearCue is disabled on this site.", "site-disabled");
  }
  if (normalizeOrigin(sender.url) !== origin || comparableUrl(sender.url) !== comparableUrl(tab.url)) {
    return failure("The content sender is not on the current page.", "stale-document");
  }

  const current = await readTabState<StoredTabState>(tabId);
  if (current?.browserDocumentId && current.browserDocumentId !== sender.documentId) {
    return failure("A different browser document owns this tab context.", "stale-document");
  }

  if (message.kind === "content:repairsRestored") {
    const repairs = await readRepairs();
    const restored = new Set(message.repairIds);
    const now = new Date().toISOString();
    let changed = 0;
    const nextRepairs = repairs.map((repair) => {
      if (repair.undoneAt === null && repair.documentId === message.documentId && restored.has(repair.id)) {
        changed += 1;
        return { ...repair, undoneAt: now };
      }
      return repair;
    });
    if (changed > 0) {
      await writeRepairs(nextRepairs);
      const activity = await readActivity();
      await writeActivity({ ...activity, repairsUndone: activity.repairsUndone + changed, updatedAt: now });
    }
    return { ok: true as const, data: { accepted: true, restored: changed } };
  }

  if (message.kind === "content:scanError") {
    if (current?.documentId && current.documentId !== message.documentId) {
      return failure("The scan error belongs to a previous document.", "stale-document");
    }
    const base = current ?? emptyTabState(tabId, tab.url ?? null, tab.title ?? null);
    await writeTabState(tabId, {
      ...base,
      documentId: message.documentId,
      contentConnected: true,
      scan: {
        status: "error",
        summary: base.scan.summary,
        error: message.error,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    });
    await setBadgeForTab(tabId, true);
    return { ok: true as const, data: { accepted: true } };
  }

  if (message.kind === "content:recovery") {
    const event = message.event;
    if (!current?.documentId || !current.contentConnected) {
      return failure("The page is not connected.", "not-connected");
    }
    if (current.documentId !== event.documentId) {
      return failure("The recovery outcome belongs to a previous document.", "stale-document");
    }
    if (comparableUrl(event.pageUrl) !== comparableUrl(tab.url)) {
      return failure("The recovery outcome does not match the current page.", "stale-document");
    }
    const settings = await readSettings();
    const result = acceptRecoveryEvent(current.recovery, event, settings);
    if (result.accepted) {
      await writeTabState(tabId, { ...current, recovery: result.state, updatedAt: new Date().toISOString() });
    }
    return {
      ok: true as const,
      data: {
        accepted: result.accepted,
        duplicate: result.duplicate,
        announce: result.announce,
        eventId: result.event.id,
      },
    };
  }

  if (message.kind === "content:recoveryAnnounced") {
    if (!current?.documentId || current.documentId !== message.documentId) {
      return failure("The announcement belongs to a previous document.", "stale-document");
    }
    const hasEvent = current.recovery.events.some((event) => event.id === message.eventId);
    if (!hasEvent) return failure("The recovery outcome is not stored for this page.", "stale-recovery");
    await writeTabState(tabId, {
      ...current,
      recovery: markRecoveryAnnounced(current.recovery, message.eventId, message.ok, message.error),
      updatedAt: new Date().toISOString(),
    });
    if (message.ok) {
      const activity = await readActivity();
      await writeActivity({
        ...activity,
        recoveryMessages: activity.recoveryMessages + 1,
        updatedAt: new Date().toISOString(),
      });
    }
    return { ok: true as const, data: { accepted: true } };
  }

  if (message.kind === "content:scan") {
    const summary = message.summary;
    if (current?.documentId && current.documentId !== summary.documentId) {
      return failure("The scan result belongs to a previous document.", "stale-document");
    }
    if (comparableUrl(tab.url) !== comparableUrl(summary.url)) {
      return failure("The scan result does not match the current page.", "stale-document");
    }
    const base = current ?? emptyTabState(tabId, tab.url ?? null, tab.title ?? null);
    const next: StoredTabState = {
      ...base,
      url: summary.url,
      origin: summary.origin,
      documentId: summary.documentId,
      browserDocumentId: sender.documentId,
      contentConnected: true,
      scan: { status: "ready", summary, error: null, updatedAt: new Date().toISOString() },
      updatedAt: new Date().toISOString(),
    };
    await writeTabState(tabId, next);
    await setBadgeForTab(tabId, true);
    return { ok: true as const, data: { accepted: true } };
  }

  const acceptance = acceptContentSnapshot(current, tabId, message.snapshot, tab.url ?? null, tab.title ?? null);
  if (!acceptance.accepted) {
    return failure(acceptance.reason ?? "Stale page snapshot.", "stale-document");
  }

  await writeTabState(tabId, { ...acceptance.next, browserDocumentId: sender.documentId });
  if (message.kind !== "content:snapshot") notifyPanelContextChanged();
  await setBadgeForTab(tabId, true);
  return { ok: true as const, data: { accepted: true } };
}

// Content scans and recovery messages replace the same session record.
// Queue writes per tab so simultaneous outcomes do not lose each other.
const contentWrites = new Map<number, Promise<unknown>>();

function withTabWrite<T>(tabId: number, write: () => Promise<T>): Promise<T> {
  const operation = (contentWrites.get(tabId) ?? Promise.resolve()).then(write, write);
  contentWrites.set(tabId, operation);
  return operation.finally(() => {
    if (contentWrites.get(tabId) === operation) contentWrites.delete(tabId);
  });
}

export async function handleMessage(raw: unknown, sender: chrome.runtime.MessageSender): Promise<HandlerResult> {
  if (raw && typeof raw === "object" && "kind" in raw && raw.kind === "diagnostics:cloudAllowed") {
    if (sender.id !== chrome.runtime.id || sender.url?.split(/[?#]/, 1)[0] !== chrome.runtime.getURL("diagnostics.html")) {
      return failure("Rejected an untrusted diagnostics sender.", "untrusted-sender");
    }
    return { ok: true, data: (await readSettings()).allowCloudForDiagnostics };
  }
  const content = contentMessageSchema.safeParse(raw);
  if (content.success) {
    const tabId = sender.tab?.id;
    if (tabId === undefined || !isContentSender(sender)) return failure("Rejected an untrusted content sender.", "untrusted-sender");
    return withTabWrite(tabId, () => handleContentMessage(content.data, sender));
  }

  const panel = panelRequestSchema.safeParse(raw);
  if (panel.success) return handlePanelRequest(panel.data, sender);

  return failure("Malformed or unsupported message.", "invalid-message");
}

export function installMessageRouter(): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    handleMessage(message, sender)
      .then((result) => sendResponse(result))
      .catch((error: unknown) => {
        sendResponse(failure(error instanceof Error ? error.message : String(error), "internal-error"));
      });
    return true;
  });
}

function notifyPanelContextChanged(): void {
  void chrome.runtime.sendMessage({ kind: "bg:panelContextChanged" }).catch(() => undefined);
}

/** Keep per-tab state honest when pages navigate or tabs close. */
export function installTabLifecycle(): void {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo.url && changeInfo.status !== "loading") return;
    void withTabWrite(tabId, async () => {
      const current = (await readTabState<StoredTabState>(tabId)) ?? emptyTabState(tabId, tab.url ?? null, tab.title ?? null);
      const url = tab.url ?? null;
      // Hash and query updates can arrive after the same document has already
      // reported its new context. Preserve a connected inspector for these changes.
      if (changeInfo.status !== "loading" && current.contentConnected && comparableUrl(current.url) === comparableUrl(url)) {
        if (current.url !== url) {
          await writeTabState(tabId, { ...current, url, recovery: { events: [], updatedAt: null } });
        }
        notifyPanelContextChanged();
        return;
      }
      if (changeInfo.status !== "loading" && current.contentConnected && current.url === url) return;
      await writeTabState(tabId, markNavigated(current, url, tab.title ?? null));
      notifyPanelContextChanged();
      await setBadgeForTab(tabId, false);
    }).catch(() => undefined);
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void withTabWrite(tabId, () => deleteTabState(tabId)).catch(() => undefined);
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    void (async () => {
      const state = await readTabState<StoredTabState>(tabId);
      await setBadgeForTab(tabId, Boolean(state?.contentConnected));
      notifyPanelContextChanged();
    })();
  });
}
