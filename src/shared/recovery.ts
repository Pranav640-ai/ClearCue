import type { ElementReference, ISO8601 } from "./types";

/**
 * Stage 5 interaction-recovery contracts.
 *
 * A recovery event is an *observation* of a meaningful page change, not an
 * interpretation of user intent. Messages are local-only page text and are
 * stored in per-tab session state, never in extension-wide local storage.
 */

export const RECOVERY_CATEGORIES = [
  "validation-error",
  "error-summary",
  "success-confirmation",
  "operation-failure",
  "dialog-opened",
  "menu-expanded",
  "loading-completed",
  "status-update",
  "uncertain-outcome",
] as const;

export type RecoveryCategory = (typeof RECOVERY_CATEGORIES)[number];

export const RECOVERY_CATEGORY_LABELS: Record<RecoveryCategory, string> = {
  "validation-error": "Field validation error",
  "error-summary": "Error summary",
  "success-confirmation": "Success confirmation",
  "operation-failure": "Operation failure",
  "dialog-opened": "Dialog opened",
  "menu-expanded": "Menu or section expanded",
  "loading-completed": "Loading completed",
  "status-update": "Status update",
  "uncertain-outcome": "Uncertain outcome",
};

export const RECOVERY_SEVERITIES = ["info", "success", "warning", "error"] as const;
export type RecoverySeverity = (typeof RECOVERY_SEVERITIES)[number];

export const ANNOUNCEMENT_MECHANISMS = [
  "aria-live-polite",
  "aria-live-assertive",
  "role-alert",
  "role-status",
  "dialog-focus",
  "native-validation",
  "native-selection",
  "none",
] as const;

export type AnnouncementMechanism = (typeof ANNOUNCEMENT_MECHANISMS)[number];

export const ANNOUNCEMENT_MECHANISM_LABELS: Record<AnnouncementMechanism, string> = {
  "aria-live-polite": "an existing polite ARIA live region",
  "aria-live-assertive": "an existing assertive ARIA live region",
  "role-alert": "an existing role=alert element",
  "role-status": "an existing role=status element",
  "dialog-focus": "focus entering an open dialog",
  "native-validation": "browser constraint validation",
  "native-selection": "native selection control",
  none: "no existing live announcement mechanism",
};

export const ANNOUNCEMENT_STATUSES = [
  "pending",
  "announced-by-page",
  "announced-by-clearcue",
  "preference-off",
  "failed",
] as const;

export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const RECOVERY_ACTION_KINDS = ["jump", "replay", "dismiss"] as const;
export type RecoveryActionKind = (typeof RECOVERY_ACTION_KINDS)[number];

export const RECOVERY_SOURCES = ["observed", "rule", "on_device"] as const;
export type RecoverySource = (typeof RECOVERY_SOURCES)[number];

export const RECOVERY_EVIDENCE_KINDS = [
  "message-text",
  "newly-displayed",
  "text-change",
  "attribute-change",
  "aria-invalid",
  "error-reference",
  "role-or-live-region",
  "dialog",
  "busy-to-idle",
  "focus",
] as const;

export type RecoveryEvidenceKind = (typeof RECOVERY_EVIDENCE_KINDS)[number];

export interface RecoveryEvidence {
  id: string;
  kind: RecoveryEvidenceKind;
  value: string;
  privacy: "local-only";
}

export interface RecoveryRelatedTarget {
  locator: string;
  tagName: string;
  role: string | null;
  /** Best available label; may be empty when the control has no accessible name. */
  name: string;
  documentId: string;
}

export interface RecoveryEvent {
  id: string;
  interactionId: string | null;
  documentId: string;
  pageUrl: string;
  category: RecoveryCategory;
  severity: RecoverySeverity;
  message: string;
  evidence: RecoveryEvidence[];
  related: RecoveryRelatedTarget | null;
  association: "direct" | "inferred" | "none";
  existingAnnouncement: AnnouncementMechanism;
  announcementStatus: AnnouncementStatus;
  actions: RecoveryActionKind[];
  observedAt: ISO8601;
  expiresAt: ISO8601;
  dedupeKey: string;
  dismissedAt: ISO8601 | null;
  replayCount: number;
  source: RecoverySource;
}

export interface RecoveryStatistics {
  detected: number;
  announcedByClearCue: number;
  announcedByPage: number;
  preferenceOff: number;
  pending: number;
  failed: number;
  dismissed: number;
  withRelatedField: number;
}

export interface RecoveryView {
  events: RecoveryEvent[];
  latest: RecoveryEvent | null;
  statistics: RecoveryStatistics;
  announceAutomatically: boolean;
  updatedAt: ISO8601 | null;
}

export const EMPTY_RECOVERY_STATISTICS: RecoveryStatistics = {
  detected: 0,
  announcedByClearCue: 0,
  announcedByPage: 0,
  preferenceOff: 0,
  pending: 0,
  failed: 0,
  dismissed: 0,
  withRelatedField: 0,
};

export const EMPTY_RECOVERY_VIEW: RecoveryView = {
  events: [],
  latest: null,
  statistics: { ...EMPTY_RECOVERY_STATISTICS },
  announceAutomatically: true,
  updatedAt: null,
};

export interface TabRecoveryState {
  events: RecoveryEvent[];
  updatedAt: ISO8601 | null;
}

export const EMPTY_TAB_RECOVERY: TabRecoveryState = { events: [], updatedAt: null };

export const RECOVERY_HISTORY_LIMIT = 30;
export const RECOVERY_EVENT_TTL_MS = 10 * 60 * 1000;
export const RECOVERY_DUPLICATE_WINDOW_MS = 20 * 1000;

/** Collapse whitespace and bound observed text. Never used as HTML. */
export function normalizeRecoveryText(value: string, max = 300): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Deduplication uses the category, associated locator and normalised text.
 * It deliberately ignores timestamps so repeated announcements of the same
 * unchanged message are suppressed within the dedupe window.
 */
export function recoveryDedupeKey(input: {
  category: RecoveryCategory;
  message: string;
  relatedLocator: string | null;
}): string {
  return `${input.category}|${input.relatedLocator ?? "none"}|${normalizeRecoveryText(input.message, 240).toLowerCase()}`;
}

export function isUrgentRecovery(event: Pick<RecoveryEvent, "category" | "severity">): boolean {
  return event.severity === "error" && (event.category === "operation-failure" || event.category === "error-summary");
}

/** Remove expired entries and keep the newest bounded slice. */
export function pruneRecoveryEvents(events: readonly RecoveryEvent[], now = Date.now()): RecoveryEvent[] {
  return events
    .filter((event) => {
      const expires = Date.parse(event.expiresAt);
      return Number.isFinite(expires) ? expires > now : true;
    })
    .slice(-RECOVERY_HISTORY_LIMIT);
}

export function buildRecoveryView(
  events: readonly RecoveryEvent[],
  announceAutomatically: boolean,
  now = Date.now(),
): RecoveryView {
  const current = pruneRecoveryEvents(events, now);
  const statistics: RecoveryStatistics = { ...EMPTY_RECOVERY_STATISTICS };
  for (const event of current) {
    statistics.detected += 1;
    if (event.related) statistics.withRelatedField += 1;
    if (event.dismissedAt) statistics.dismissed += 1;
    if (event.announcementStatus === "announced-by-clearcue") statistics.announcedByClearCue += 1;
    else if (event.announcementStatus === "announced-by-page") statistics.announcedByPage += 1;
    else if (event.announcementStatus === "preference-off") statistics.preferenceOff += 1;
    else if (event.announcementStatus === "failed") statistics.failed += 1;
    else statistics.pending += 1;
  }
  const latest =
    [...current]
      .reverse()
      .find((event) => event.dismissedAt === null && (event.related !== null || event.category !== "uncertain-outcome")) ??
    null;
  return {
    events: [...current].reverse(),
    latest,
    statistics,
    announceAutomatically,
    updatedAt: current.at(-1)?.observedAt ?? null,
  };
}

export function relatedElementReference(event: RecoveryEvent): ElementReference | null {
  if (!event.related) return null;
  return {
    ref: event.related.locator,
    tagName: event.related.tagName,
    role: event.related.role ?? undefined,
    locator: event.related.locator,
  };
}

/** Identical mutations in a single interaction share one announcement. */
export function recoveryOutcomeScope(event: RecoveryEvent): string {
  return JSON.stringify([event.documentId, event.interactionId, event.dedupeKey]);
}
