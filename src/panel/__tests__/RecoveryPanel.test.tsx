// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RecoveryPanel } from "../components/RecoveryPanel";
import { buildRecoveryView, type RecoveryEvent } from "../../shared/recovery";
import type { RecoveryController } from "../useRecovery";

function event(overrides: Partial<RecoveryEvent> = {}): RecoveryEvent {
  return {
    id: "event-1",
    interactionId: "interaction-1",
    documentId: "document-12345678",
    pageUrl: "http://127.0.0.1:4318/recovery.html",
    category: "validation-error",
    severity: "error",
    message: "Enter the eight-character registration number.",
    evidence: [],
    related: {
      locator: "html:nth-child(1)>body:nth-child(2)>form:nth-child(1)>input:nth-child(1)",
      tagName: "input",
      role: "textbox",
      name: "Registration number",
      documentId: "document-12345678",
    },
    association: "direct",
    existingAnnouncement: "none",
    announcementStatus: "announced-by-clearcue",
    actions: ["jump", "replay", "dismiss"],
    observedAt: "2026-03-01T10:00:00.000Z",
    expiresAt: "2026-03-01T10:10:00.000Z",
    dedupeKey: "dedupe",
    dismissedAt: null,
    replayCount: 0,
    source: "observed",
    ...overrides,
  };
}

const controller: RecoveryController = {
  busy: null,
  feedback: null,
  jump: vi.fn(async () => undefined),
  replay: vi.fn(async () => undefined),
  dismiss: vi.fn(async () => undefined),
  setAutomatic: vi.fn(async () => undefined),
  clearFeedback: vi.fn(),
};

describe("RecoveryPanel", () => {
  it("shows the observed message, field, announcement status and honest statistics", () => {
    const view = buildRecoveryView([event()], true, Date.parse("2026-03-01T10:01:00.000Z"));
    const html = renderToStaticMarkup(
      <RecoveryPanel recovery={view} controller={controller} announceAutomatically onToggleAutomatic={controller.setAutomatic} />,
    );
    expect(html).toContain("Enter the eight-character registration number.");
    expect(html).toContain("Registration number");
    expect(html).toContain("ClearCue updated the page live region");
    expect(html).toContain("Jump to affected field: Registration number");
    expect(html).toContain("Replay message:");
    expect(html).toContain("Dismiss this recovery message:");
    expect(html).toContain("Page live region updated");
    expect(html).toContain('role="group" aria-label="Recovery statistics"');
    expect(html).toContain("Observed directly from page semantics; no model call was needed.");
  });

  it("refuses a jump when association is ambiguous", () => {
    const view = buildRecoveryView(
      [event({ related: null, association: "none", existingAnnouncement: "aria-live-polite", announcementStatus: "announced-by-page" })],
      true,
      Date.parse("2026-03-01T10:01:00.000Z"),
    );
    const html = renderToStaticMarkup(
      <RecoveryPanel recovery={view} controller={controller} announceAutomatically onToggleAutomatic={controller.setAutomatic} />,
    );
    expect(html).toContain("No reliable field association");
    expect(html).toContain("Jump is disabled because more than one control");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Jump to affected field<\/button>/);
  });

  it("renders a preference-off status without claiming an announcement", () => {
    const view = buildRecoveryView([event({ announcementStatus: "preference-off" })], false, Date.parse("2026-03-01T10:01:00.000Z"));
    const html = renderToStaticMarkup(
      <RecoveryPanel recovery={view} controller={controller} announceAutomatically={false} onToggleAutomatic={controller.setAutomatic} />,
    );
    expect(html).toContain("Automatic announcements are off");
    expect(html).not.toContain("ClearCue updated the page live region");
  });

  it("keeps field-association uncertainty in concise output", () => {
    const view = buildRecoveryView([event({ association: "inferred" })], true, Date.parse("2026-03-01T10:01:00.000Z"));
    const html = renderToStaticMarkup(<RecoveryPanel recovery={view} controller={controller}
      announceAutomatically onToggleAutomatic={controller.setAutomatic} concise />);
    expect(html).toContain("inferred from a shared group");
    expect(html).not.toContain("Observed directly from page semantics");
    expect(html).toContain("Jump to affected field: Registration number");
  });
});
