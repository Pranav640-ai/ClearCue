// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildRecoveryView,
  EMPTY_TAB_RECOVERY,
  normalizeRecoveryText,
  pruneRecoveryEvents,
  recoveryDedupeKey,
  relatedElementReference,
  type RecoveryEvent,
} from "../recovery";
import { recoveryEventSchema } from "../recoverySchema";

function event(overrides: Partial<RecoveryEvent> = {}): RecoveryEvent {
  const base: RecoveryEvent = {
    id: "event-1",
    interactionId: "interaction-1",
    documentId: "document-12345678",
    pageUrl: "http://127.0.0.1:4318/recovery.html",
    category: "validation-error",
    severity: "error",
    message: "Enter your registration number.",
    evidence: [{ id: "ev:message", kind: "message-text", value: "Enter your registration number.", privacy: "local-only" }],
    related: {
      locator: "html:nth-child(1)>body:nth-child(2)>form:nth-child(1)>input:nth-child(1)",
      tagName: "input",
      role: "textbox",
      name: "Registration number",
      documentId: "document-12345678",
    },
    association: "direct",
    existingAnnouncement: "none",
    announcementStatus: "pending",
    actions: ["jump", "replay", "dismiss"],
    observedAt: "2026-03-01T10:00:00.000Z",
    expiresAt: "2026-03-01T10:10:00.000Z",
    dedupeKey: "validation-error|field|enter your registration number.",
    dismissedAt: null,
    replayCount: 0,
    source: "observed",
  };
  return { ...base, ...overrides };
}

describe("recovery contracts", () => {
  it("validates a complete event and rejects unknown fields", () => {
    expect(recoveryEventSchema.safeParse(event()).success).toBe(true);
    expect(recoveryEventSchema.safeParse({ ...event(), unexpected: true }).success).toBe(false);
  });

  it("bounds observed text without interpreting it", () => {
    expect(normalizeRecoveryText("  Enter\n your   name.  ")).toBe("Enter your name.");
    expect(normalizeRecoveryText("x".repeat(400), 40)).toHaveLength(40);
  });

  it("deduplicates by category, association and normalised text", () => {
    const a = recoveryDedupeKey({ category: "success-confirmation", message: "Saved.", relatedLocator: null });
    const b = recoveryDedupeKey({ category: "success-confirmation", message: "  SAVED. ", relatedLocator: null });
    const c = recoveryDedupeKey({ category: "success-confirmation", message: "Saved.", relatedLocator: "field" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("prunes expired events and builds honest statistics", () => {
    const now = Date.parse("2026-03-01T10:05:00.000Z");
    const current = event({ id: "current", announcementStatus: "announced-by-clearcue" });
    const page = event({ id: "page", dedupeKey: "page", announcementStatus: "announced-by-page", related: null, association: "none" });
    const dismissed = event({ id: "dismissed", dedupeKey: "dismissed", dismissedAt: "2026-03-01T10:04:00.000Z", related: null, association: "none" });
    const expired = event({ id: "expired", dedupeKey: "expired", expiresAt: "2026-03-01T10:04:59.000Z" });
    const view = buildRecoveryView([current, page, dismissed, expired], true, now);
    expect(view.statistics.detected).toBe(3);
    expect(view.statistics.announcedByClearCue).toBe(1);
    expect(view.statistics.announcedByPage).toBe(1);
    expect(view.statistics.dismissed).toBe(1);
    expect(view.statistics.withRelatedField).toBe(1);
    expect(view.latest?.id).toBe("page");
    expect(pruneRecoveryEvents([expired], now)).toHaveLength(0);
  });

  it("does not treat a dismissed latest outcome as current", () => {
    const view = buildRecoveryView([event({ dismissedAt: "2026-03-01T10:01:00.000Z" })], true, Date.parse("2026-03-01T10:02:00.000Z"));
    expect(view.events).toHaveLength(1);
    expect(view.latest).toBeNull();
  });

  it("keeps an empty tab state immutable enough for session wiring", () => {
    expect(EMPTY_TAB_RECOVERY.events).toEqual([]);
    expect(relatedElementReference(event())?.locator).toContain("input");
    expect(relatedElementReference(event({ related: null }))).toBeNull();
  });
});
