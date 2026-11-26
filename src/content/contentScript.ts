/**
 * ClearCue content script.
 *
 * Stage 3 scans deterministically. Stage 4 adds verified, reversible
 * accessible-name repairs: every change is attribute-scoped, checked against a
 * live snapshot, verified by recomputing the accessible name, and can be undone.
 * The script never reads form values and never sends page content anywhere.
 */

import { PageNavigator } from "./navigator";
import { mayUseLocalIcon } from "../shared/localIcon";
import { renderLocalIconPng } from "./repair/localIcon";
import type { BackgroundToContentMessage, ContentMessage } from "../shared/messages";
import type { AppliedRepair, PageSnapshot } from "../shared/types";
import type { RepairApplyRequest, RepairApplyResult, RepairUndoRequest, RepairUndoResult } from "../shared/repair";
import type { ScanSummary } from "../shared/scan";
import { ScanObserver } from "./scanner/observer";
import { AccessibilityScanner } from "./scanner/scan";
import { applyAccessibleName, captureLiveFor, undoAccessibleName } from "./repair/target";
import { PageAnnouncer } from "./recovery/announcer";
import { RecoveryEngine } from "./recovery/engine";
import { focusRecoveryTarget } from "./recovery/focus";

const LOADED_FLAG = "__clearcueContentLoaded";

interface ClearCueGlobal extends Window {
  [LOADED_FLAG]?: string;
}

const globalWindow = window as ClearCueGlobal;
const existingInstance = globalWindow[LOADED_FLAG];
const documentId = existingInstance ?? crypto.randomUUID();

if (!existingInstance) {
  globalWindow[LOADED_FLAG] = documentId;
  start(documentId);
}

function start(instanceId: string): void {
  let disabled = false;
  const scanner = new AccessibilityScanner(document, instanceId);
  const navigator = new PageNavigator(document);
  let observer: ScanObserver | null = null;
  const announcer = new PageAnnouncer(document);
  let recoveryStarted = false;
  let recoveryEngine: RecoveryEngine | null = null;
  /** Repairs applied in this document, with the exact undo preconditions. */
  const pendingRepairs = new Map<string, { request: RepairUndoRequest; applied: AppliedRepair; element: Element }>();

  const applyRepair = (request: RepairApplyRequest): RepairApplyResult => {
    const scanned = scanner.getIssues().find((issue) => issue.id === request.issueId);
    if (!scanned || request.documentId !== instanceId || request.locator !== scanned.element.locator) {
      return {
        ok: false,
        verified: false,
        applied: null,
        error: "The issue is no longer in the current scan.",
        accessibleNameBefore: null,
        accessibleNameAfter: null,
        conflict: true,
      };
    }
    const expectedElement = scanner.getElementForIssue(request.issueId);
    const { live, element } = captureLiveFor(document, request, expectedElement);
    if (!element || !live.found) {
      return {
        ok: false,
        verified: false,
        applied: null,
        error: "The target element no longer exists.",
        accessibleNameBefore: null,
        accessibleNameAfter: null,
        conflict: true,
      };
    }
    if (!expectedElement || live.replaced) {
      return {
        ok: false,
        verified: false,
        applied: null,
        error: "The target element was replaced after the scan.",
        accessibleNameBefore: live.accessibleName,
        accessibleNameAfter: live.accessibleName,
        conflict: true,
      };
    }
    for (const expected of request.snapshot) {
      const actual = live.attributes.find((item) => item.name === expected.name);
      if (!actual || actual.present !== expected.present || (actual.value ?? null) !== (expected.value ?? null)) {
        return {
          ok: false,
          verified: false,
          applied: null,
          error: "The page changed the naming attributes after validation.",
          accessibleNameBefore: live.accessibleName,
          accessibleNameAfter: live.accessibleName,
          conflict: true,
        };
      }
    }
    const outcome = applyAccessibleName(element, request, scanned.element);
    if (!outcome.ok || !outcome.repair) {
      return {
        ok: false,
        verified: false,
        applied: null,
        error: outcome.error,
        accessibleNameBefore: outcome.accessibleNameBefore,
        accessibleNameAfter: outcome.accessibleNameAfter,
        conflict: outcome.conflict,
      };
    }
    pendingRepairs.set(outcome.repair.id, {
      applied: outcome.repair,
      element,
      request: {
        repairId: outcome.repair.id,
        issueId: request.issueId,
        documentId: request.documentId,
        locator: request.locator,
        target: request.target,
        expectedCurrentValue: outcome.repair.newValue,
        previousValue: outcome.repair.previousValue,
        previousPresent: outcome.repair.previousPresent ?? false,
      },
    });
    return {
      ok: true,
      verified: outcome.verified,
      applied: outcome.repair,
      error: null,
      accessibleNameBefore: outcome.accessibleNameBefore,
      accessibleNameAfter: outcome.accessibleNameAfter,
      conflict: false,
    };
  };

  const undoRepair = (request: RepairUndoRequest): RepairUndoResult => {
    const retained = pendingRepairs.get(request.repairId);
    const element = retained?.element;
    if (!retained || !element?.isConnected || request.documentId !== instanceId) {
      return { ok: false, conflict: true, error: "The target element no longer exists.", restoredValue: null };
    }
    const outcome = undoAccessibleName(element, retained.request);
    if (outcome.ok) pendingRepairs.delete(request.repairId);
    return outcome;
  };

  const buildSnapshot = (): PageSnapshot => ({
    documentId: instanceId,
    url: location.href,
    origin: location.origin,
    title: document.title.slice(0, 512),
    counts: {
      forms: document.forms.length,
      fields: document.querySelectorAll("input, select, textarea").length,
      buttons: document.querySelectorAll("button, [role='button']").length,
      links: document.querySelectorAll("a[href]").length,
    },
    at: new Date().toISOString(),
  });

  const send = (message: ContentMessage): void => {
    if (disabled) return;
    try {
      chrome.runtime.sendMessage(message).catch(() => {
        // The extension was reloaded or the page is shutting down. Stay silent.
      });
    } catch {
      // Context invalidated.
    }
  };

  const sendScan = (summary: ScanSummary): void => {
    send({ kind: "content:scan", summary });
  };

  const reportAnnouncement = (eventId: string, ok: boolean, error: string | null): void => {
    send({ kind: "content:recoveryAnnounced", documentId: instanceId, eventId, ok, error });
  };

  const handleRecoveryEvent = (event: import("../shared/recovery").RecoveryEvent): void => {
    if (disabled) return;
    try {
      chrome.runtime
        .sendMessage({ kind: "content:recovery", event })
        .then((response: unknown) => {
          const payload = response as { ok?: boolean; data?: { announce?: boolean } } | null;
          if (disabled || !payload?.ok || !payload.data?.announce ||
            event.pageUrl !== location.origin + location.pathname) return;
          const scheduled = announcer.announce(event, false, (written) => {
            reportAnnouncement(event.id, written, written ? null : "The page live region update was cancelled.");
          });
          if (!scheduled) reportAnnouncement(event.id, false, "The page live region could not be queued.");
        })
        .catch(() => {
          // Background unavailable: observation continues, nothing is announced twice.
        });
    } catch {
      // Extension context invalidated.
    }
  };

  recoveryEngine = new RecoveryEngine({
    documentId: instanceId,
    pageUrl: () => `${location.origin}${location.pathname}`,
    onEvent: handleRecoveryEvent,
  });

  const startRecovery = (): void => {
    if (disabled || recoveryStarted) return;
    recoveryStarted = true;
    announcer.prepare();
    recoveryEngine?.start();
  };

  const announce = (kind: ContentMessage["kind"]): void => {
    send({ kind, snapshot: buildSnapshot() } as ContentMessage);
  };

  const runFullScan = (): void => {
    if (disabled) return;
    try {
      sendScan(scanner.scanAll().summary);
    } catch (error) {
      // A scanner failure must not break page interaction. Report it truthfully
      // through the existing snapshot channel instead of pretending success.
      try {
        chrome.runtime.sendMessage({
          kind: "content:scanError",
          documentId: instanceId,
          error: error instanceof Error ? error.message.slice(0, 240) : "Scan failed.",
        });
      } catch {
        // Context invalidated.
      }
    }
  };

  const startObserver = (): void => {
    if (disabled || observer) return;
    observer = new ScanObserver(document, scanner, (outcome) => sendScan(outcome.summary));
    observer.start();
  };

  chrome.runtime.onMessage.addListener((message: BackgroundToContentMessage, _sender, sendResponse) => {
    if (message.kind === "bg:navigationOverview" || message.kind === "bg:navigationFocus" || message.kind === "bg:navigationContext") {
      if (disabled || message.documentId !== instanceId || message.pageUrl !== location.href) {
        sendResponse({ ok: false, code: "stale-document", error: "The page or its access changed." });
        return false;
      }
      if (message.kind === "bg:navigationContext" && message.announce) {
        const scheduled = document.hasFocus() && announcer.announce({
          message: navigator.describeFocus(), category: "status-update", severity: "info",
        });
        sendResponse({ ok: true, data: { scheduled } });
      } else {
        sendResponse({ ok: true, data: message.kind === "bg:navigationOverview" ? navigator.read() :
          message.kind === "bg:navigationContext" ? navigator.context() : navigator.focus(message.snapshotId, message.candidateId) });
      }
      return false;
    }
    if (message.kind === "bg:focusRecovery") {
      if (message.documentId !== instanceId || disabled) {
        sendResponse({ ok: false, data: { focused: false, reason: "The page changed after this outcome was observed.", name: "" } });
        return false;
      }
      sendResponse({ ok: true, data: focusRecoveryTarget(document, message.locator) });
      return false;
    }
    if (message.kind === "bg:announceRecovery") {
      if (disabled || message.event.documentId !== instanceId) {
        sendResponse({ ok: false, data: { scheduled: false } });
        return false;
      }
      sendResponse({ ok: true, data: { scheduled: announcer.announce(message.event, message.replay) } });
      return false;
    }
    if (message.kind === "bg:recoveryStop") {
      recoveryEngine?.stop();
      recoveryStarted = false;
      announcer.dispose();
      sendResponse({ ok: true, data: { stopped: true } });
      return false;
    }
    if (message.kind === "bg:siteDisabled") {
      navigator.reset();
      // Disabling a site restores every repair ClearCue applied, unless the page
      // changed the attribute independently in the meantime.
      const restored: string[] = [];
      const conflicts: string[] = [];
      for (const entry of Array.from(pendingRepairs.values())) {
        const outcome = undoRepair(entry.request);
        if (outcome.ok) restored.push(entry.request.repairId);
        else conflicts.push(entry.request.repairId);
      }
      pendingRepairs.clear();
      disabled = true;
      observer?.stop();
      observer = null;
      recoveryEngine?.stop();
      recoveryStarted = false;
      announcer.dispose();
      scanner.clear();
      sendResponse({ ok: true, data: { restored, conflicts } });
      return false;
    }
    if (message.kind === "bg:localIcon") {
      const issue = scanner.getIssues().find((item) => item.id === message.issue.id);
      const expected = scanner.getElementForIssue(message.issue.id);
      if (disabled || message.documentId !== instanceId || !issue || !expected || !mayUseLocalIcon(issue)) {
        sendResponse({ ok: false });
        return false;
      }
      const { live, element } = captureLiveFor(document, {
        locator: issue.element.locator, expectedTag: issue.element.tagName,
      }, expected);
      let image: string | null = null;
      if (element && live.found && !live.replaced && !live.accessibleName) {
        try {
          image = renderLocalIconPng(element);
        } catch {
          // A rejected geometry or failed canvas cannot select the visual route.
        }
      }
      sendResponse({ ok: image !== null, data: image });
      return false;
    }
    if (message.kind === "bg:checkTarget") {
      const expected = scanner.getElementForIssue(message.issue.id);
      const { live } = captureLiveFor(
        document,
        { locator: message.issue.element.locator, expectedTag: message.issue.element.tagName },
        expected,
      );
      sendResponse({ ok: true, data: live });
      return false;
    }
    if (message.kind === "bg:applyRepair") {
      sendResponse({ ok: true, data: applyRepair(message.request) });
      return false;
    }
    if (message.kind === "bg:undoRepair") {
      sendResponse({ ok: true, data: undoRepair(message.request) });
      return false;
    }
    if (message.kind === "bg:undoAllRepairs") {
      const results = message.requests.map((request) => undoRepair(request));
      sendResponse({ ok: true, data: results });
      return false;
    }
    if (message.kind === "bg:requestSnapshot") {
      sendResponse(disabled ? { ok: false } : { ok: true, data: buildSnapshot() });
      return false;
    }
    if (message.kind === "bg:requestScan") {
      const outcome = scanner.scanAll();
      sendScan(outcome.summary);
      startObserver();
      startRecovery();
      sendResponse({ ok: true, data: outcome.summary });
      return false;
    }
    return false;
  });

  // SPA navigations do not reload the document, so rescan explicitly.
  let lastUrl = location.href;
  const reportIfUrlChanged = (): void => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    navigator.reset();
    // A single-page navigation creates a new page context; ClearCue restores
    // its repairs unless the site overwrote them first, and reports which.
    const restored: string[] = [];
    for (const entry of Array.from(pendingRepairs.values())) {
      const outcome = undoRepair(entry.request);
      if (outcome.ok) restored.push(entry.request.repairId);
    }
    pendingRepairs.clear();
    if (restored.length > 0) send({ kind: "content:repairsRestored", documentId: instanceId, repairIds: restored });
    announcer.dispose();
    announcer.prepare();
    recoveryEngine?.reset();
    announce("content:pageChanged");
    runFullScan();
  };

  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method].bind(history);
    history[method] = ((...args: Parameters<History["pushState"]>) => {
      const result = original(...args);
      queueMicrotask(reportIfUrlChanged);
      return result;
    }) as History[typeof method];
  }

  window.addEventListener("popstate", reportIfUrlChanged);
  window.addEventListener("hashchange", reportIfUrlChanged);
  window.addEventListener("pagehide", () => {
    navigator.reset();
    observer?.stop();
    observer = null;
    recoveryEngine?.stop();
    recoveryStarted = false;
  });

  const initial = (): void => {
    if (disabled) return;
    announce("content:hello");
    runFullScan();
    startObserver();
    startRecovery();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initial, { once: true });
  } else {
    initial();
  }
  // Stylesheets loaded after DOMContentLoaded can change what is hidden.
  window.addEventListener(
    "load",
    () => {
      if (!disabled) {
        runFullScan();
        startObserver();
        startRecovery();
      }
    },
    { once: true },
  );
}
