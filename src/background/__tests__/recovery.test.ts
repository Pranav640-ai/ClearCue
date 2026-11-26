// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../shared/settings";
import type { ExtensionSettings } from "../../shared/types";
import type { RecoveryEvent, TabRecoveryState } from "../../shared/recovery";
import {
  acceptRecoveryEvent,
  clearTabRecovery,
  dismissRecoveryEvent,
  incrementRecoveryReplay,
  markRecoveryAnnounced,
  replayRecoveryEvent,
} from "../recovery";

function event(id = "event-1", overrides: Partial<RecoveryEvent> = {}): RecoveryEvent {
  const dedupeKey = overrides.dedupeKey ?? `dedupe-${id}`;
  return {
    id,
    interactionId: "interaction-1",
    documentId: "document-12345678",
    pageUrl: "http://127.0.0.1:4318/recovery.html",
    category: "validation-error",
    severity: "error",
    message: "Enter your registration number.",
    evidence: [],
    related: null,
    association: "none",
    existingAnnouncement: "none",
    announcementStatus: "pending",
    actions: ["replay", "dismiss"],
    observedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    dedupeKey,
    dismissedAt: null,
    replayCount: 0,
    source: "observed",
    ...overrides,
  };
}

const settings: ExtensionSettings = { ...DEFAULT_SETTINGS, announceRecoveryMessages: true };

describe("background recovery state", () => {
  it("accepts a new event and requests one announcement", () => {
    const result = acceptRecoveryEvent(undefined, event(), settings);
    expect(result.accepted).toBe(true);
    expect(result.announce).toBe(true);
    expect(result.state.events).toHaveLength(1);
  });

  it("stores preference-off instead of announcing when the user disabled announcements", () => {
    const result = acceptRecoveryEvent(undefined, event(), { ...settings, announceRecoveryMessages: false });
    expect(result.announce).toBe(false);
    expect(result.event.announcementStatus).toBe("preference-off");
  });

  it("never repeats a page-owned outcome", () => {
    const result = acceptRecoveryEvent(undefined, event("page", { existingAnnouncement: "role-alert", announcementStatus: "announced-by-page" }), settings);
    expect(result.announce).toBe(false);
    expect(result.event.announcementStatus).toBe("announced-by-page");
  });

  it("suppresses the same outcome inside the duplicate window", () => {
    const first = acceptRecoveryEvent(undefined, event(), settings);
    const second = acceptRecoveryEvent(first.state, event("event-2", { dedupeKey: "dedupe-event-1" }), settings);
    expect(second.accepted).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.announce).toBe(false);
  });

  it("keeps identical outcomes from separate interactions within the duplicate window", () => {
    const first = acceptRecoveryEvent(undefined, event(), settings);
    const repeated = acceptRecoveryEvent(first.state, event("event-2", {
      dedupeKey: first.event.dedupeKey,
      interactionId: "interaction-2",
    }), settings);
    expect(repeated.state.events).toHaveLength(2);
    expect(repeated.announce).toBe(true);
  });

  it("marks a successful announcement and can reject stale replay", () => {
    const accepted = acceptRecoveryEvent(undefined, event(), settings);
    const announced = markRecoveryAnnounced(accepted.state, "event-1", true, null);
    expect(announced.events[0]?.announcementStatus).toBe("announced-by-clearcue");
    const failed = markRecoveryAnnounced(accepted.state, "event-1", false, "live region failed");
    expect(failed.events[0]?.announcementStatus).toBe("failed");
    expect(failed.events[0]?.evidence.at(-1)?.value).toContain("live region failed");
  });

  it("increments replay counts, dismisses and clears only this tab", () => {
    const accepted = acceptRecoveryEvent(undefined, event(), settings);
    const replayed = incrementRecoveryReplay(accepted.state, "event-1");
    expect(replayed.events[0]?.replayCount).toBe(1);
    expect(replayRecoveryEvent(replayed, "event-1")?.id).toBe("event-1");
    const dismissed = dismissRecoveryEvent(replayed, "event-1");
    expect(dismissed.events[0]?.dismissedAt).not.toBeNull();
    expect(replayRecoveryEvent(dismissed, "event-1")).toBeNull();
    expect(clearTabRecovery()).toEqual({ events: [], updatedAt: null });
  });

  it("keeps only the newest bounded history", () => {
    let state: TabRecoveryState | undefined;
    for (let index = 0; index < 35; index += 1) {
      state = acceptRecoveryEvent(state, event(`event-${index}`), settings).state;
    }
    expect(state?.events).toHaveLength(30);
    expect(state?.events[0]?.id).toBe("event-5");
  });
});
