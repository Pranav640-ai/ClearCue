import { EMPTY_SCAN_STATE, type TabScanState } from "../shared/scan";
import { EMPTY_TAB_RECOVERY, type TabRecoveryState } from "../shared/recovery";
import type { PageSnapshot } from "../shared/types";
import { normalizeOrigin } from "../shared/sites";

/**
 * Per-tab state kept by the background and persisted in `chrome.storage.session`
 * so that service-worker suspension does not lose track of which page a result
 * belongs to.
 */
export interface StoredTabState {
  tabId: number;
  url: string | null;
  origin: string | null;
  title: string | null;
  documentId: string | null;
  browserDocumentId?: string;
  contentConnected: boolean;
  pageSnapshot: PageSnapshot | null;
  /** Latest deterministic scan result for this document, or idle. */
  scan: TabScanState;
  /** Bounded, local-only interaction recovery events for this document. */
  recovery: TabRecoveryState;
  updatedAt: string;
}

export function emptyTabState(tabId: number, url: string | null, title: string | null): StoredTabState {
  return {
    tabId,
    url,
    origin: normalizeOrigin(url),
    title,
    documentId: null,
    browserDocumentId: undefined,
    contentConnected: false,
    pageSnapshot: null,
    scan: { ...EMPTY_SCAN_STATE },
    recovery: { ...EMPTY_TAB_RECOVERY },
    updatedAt: new Date().toISOString(),
  };
}

export function comparableUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export interface SnapshotAcceptance {
  accepted: boolean;
  reason: string | null;
  next: StoredTabState;
}

/**
 * Guard against stale messages: a content script from an old document must not
 * overwrite state for the newly navigated page. The background compares the
 * reported snapshot with the tab's current URL (origin + pathname), and rejects
 * snapshots that do not belong to it.
 */
export function acceptContentSnapshot(
  current: StoredTabState | null,
  senderTabId: number,
  snapshot: PageSnapshot,
  tabUrl: string | null,
  tabTitle: string | null,
): SnapshotAcceptance {
  const base = current ?? emptyTabState(senderTabId, tabUrl, tabTitle);
  const snapshotUrl = comparableUrl(snapshot.url);
  const currentUrl = comparableUrl(tabUrl);

  if (!snapshotUrl) {
    return { accepted: false, reason: "Snapshot URL is not a valid web URL.", next: base };
  }
  if (currentUrl && snapshotUrl !== currentUrl) {
    return { accepted: false, reason: "Snapshot does not match the current tab page.", next: base };
  }

  // A document change or SPA path change starts a fresh observation window.
  const sameDocument = base.documentId === snapshot.documentId;
  const samePage = comparableUrl(base.url) === snapshotUrl;
  return {
    accepted: true,
    reason: null,
    next: {
      ...base,
      tabId: senderTabId,
      url: snapshot.url,
      origin: snapshot.origin,
      title: snapshot.title || tabTitle || base.title,
      documentId: snapshot.documentId,
      browserDocumentId: sameDocument ? base.browserDocumentId : undefined,
      contentConnected: true,
      pageSnapshot: snapshot,
      // A new document cannot inherit the previous document's scan result.
      scan: sameDocument ? base.scan : { ...EMPTY_SCAN_STATE },
      recovery: sameDocument && samePage ? base.recovery : { events: [], updatedAt: null },
      updatedAt: new Date().toISOString(),
    },
  };
}

/** A navigation invalidates content from the previous document immediately. */
export function markNavigated(state: StoredTabState, url: string | null, title: string | null): StoredTabState {
  return {
    ...state,
    url,
    origin: normalizeOrigin(url),
    title: title ?? state.title,
    documentId: null,
    contentConnected: false,
    pageSnapshot: null,
    scan: { ...EMPTY_SCAN_STATE },
    recovery: { ...EMPTY_TAB_RECOVERY },
    updatedAt: new Date().toISOString(),
  };
}

export function isSameDocument(state: StoredTabState | null, documentId: string | null): boolean {
  return Boolean(state && documentId && state.documentId === documentId && state.contentConnected);
}
