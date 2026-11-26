import type { ExtensionSettings } from "../shared/types";
import type { RecoveryEvent, TabRecoveryState } from "../shared/recovery";
import {
  EMPTY_TAB_RECOVERY,
  pruneRecoveryEvents,
  recoveryOutcomeScope,
  RECOVERY_DUPLICATE_WINDOW_MS,
  RECOVERY_HISTORY_LIMIT,
} from "../shared/recovery";

export interface RecoveryIngest {
  state: TabRecoveryState;
  accepted: boolean;
  duplicate: boolean;
  announce: boolean;
  event: RecoveryEvent;
}

/**
 * Session-scoped recovery bookkeeping. Duplicate suppression is per tab and
 * per dedupe key so repeated mutation batches cannot re-announce one outcome.
 */
export function acceptRecoveryEvent(
  state: TabRecoveryState | undefined,
  event: RecoveryEvent,
  settings: ExtensionSettings,
  now = Date.now(),
): RecoveryIngest {
  const base = state ?? EMPTY_TAB_RECOVERY;
  const current = pruneRecoveryEvents(base.events, now);
  const duplicate = current.find((item) => {
    if (item.id === event.id) return true;
    if (recoveryOutcomeScope(item) !== recoveryOutcomeScope(event)) return false;
    const observed = Date.parse(item.observedAt);
    return Number.isFinite(observed) && now - observed < RECOVERY_DUPLICATE_WINDOW_MS;
  });
  if (duplicate) {
    return { state: { events: current, updatedAt: base.updatedAt }, accepted: false, duplicate: true, announce: false, event: duplicate };
  }

  const stored: RecoveryEvent = {
    ...event,
    announcementStatus:
      event.announcementStatus === "pending" && !settings.announceRecoveryMessages ? "preference-off" : event.announcementStatus,
  };
  const announce = stored.announcementStatus === "pending";
  const events = [...current, stored].slice(-RECOVERY_HISTORY_LIMIT);
  return {
    state: { events, updatedAt: new Date(now).toISOString() },
    accepted: true,
    duplicate: false,
    announce,
    event: stored,
  };
}

export function markRecoveryAnnounced(
  state: TabRecoveryState | undefined,
  eventId: string,
  ok: boolean,
  error: string | null,
): TabRecoveryState {
  const base = state ?? EMPTY_TAB_RECOVERY;
  const events = base.events.map((event) => {
    if (event.id !== eventId) return event;
    if (ok) return { ...event, announcementStatus: "announced-by-clearcue" as const };
    return {
      ...event,
      announcementStatus: "failed" as const,
      evidence: [...event.evidence, { id: "ev:announce", kind: "attribute-change" as const, value: error?.slice(0, 280) || "The live region update failed.", privacy: "local-only" as const }].slice(-8),
    };
  });
  return { events, updatedAt: new Date().toISOString() };
}

export function replayRecoveryEvent(
  state: TabRecoveryState | undefined,
  eventId: string,
): RecoveryEvent | null {
  return state?.events.find((event) => event.id === eventId && !event.dismissedAt) ?? null;
}

export function incrementRecoveryReplay(state: TabRecoveryState | undefined, eventId: string): TabRecoveryState {
  const base = state ?? EMPTY_TAB_RECOVERY;
  return {
    events: base.events.map((event) => (event.id === eventId ? { ...event, replayCount: Math.min(100, event.replayCount + 1) } : event)),
    updatedAt: new Date().toISOString(),
  };
}

export function dismissRecoveryEvent(
  state: TabRecoveryState | undefined,
  eventId: string,
  now = Date.now(),
): TabRecoveryState {
  const base = state ?? EMPTY_TAB_RECOVERY;
  return {
    events: base.events.map((event) => (event.id === eventId ? { ...event, dismissedAt: new Date(now).toISOString() } : event)),
    updatedAt: new Date(now).toISOString(),
  };
}

export function clearTabRecovery(): TabRecoveryState {
  return { events: [], updatedAt: null };
}
