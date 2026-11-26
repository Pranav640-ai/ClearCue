import { describe, expect, it } from "vitest";
import { acceptContentSnapshot, emptyTabState, isSameDocument, markNavigated } from "../../background/tabRegistry";
import { EMPTY_SCAN_STATE } from "../scan";
import type { PageSnapshot } from "../types";

const DOC_A = "11111111-1111-4111-8111-111111111111";
const DOC_B = "22222222-2222-4222-8222-222222222222";

function snapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    documentId: DOC_A,
    url: "https://apply.example.org/form",
    origin: "https://apply.example.org",
    title: "Apply",
    counts: { forms: 1, fields: 5, buttons: 2, links: 3 },
    at: "2026-05-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("acceptContentSnapshot", () => {
  it("accepts a snapshot that matches the tab URL and records the document", () => {
    const result = acceptContentSnapshot(null, 7, snapshot(), "https://apply.example.org/form", "Apply");
    expect(result.accepted).toBe(true);
    expect(result.next.contentConnected).toBe(true);
    expect(result.next.documentId).toBe(DOC_A);
    expect(result.next.origin).toBe("https://apply.example.org");
    expect(result.next.tabId).toBe(7);
  });

  it("rejects a late message from a previous page in the same origin", () => {
    const current = emptyTabState(7, "https://apply.example.org/review", "Review");
    const result = acceptContentSnapshot(current, 7, snapshot(), "https://apply.example.org/review", "Review");
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("does not match the current tab page");
    expect(result.next).toBe(current);
  });

  it("rejects a message from a different origin", () => {
    const current = emptyTabState(7, "https://shop.example.org/cart", "Cart");
    const result = acceptContentSnapshot(current, 7, snapshot(), "https://shop.example.org/cart", "Cart");
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("does not match the current tab page");
    expect(result.next.contentConnected).toBe(false);
  });

  it("rejects an invalid snapshot URL", () => {
    const result = acceptContentSnapshot(null, 7, snapshot({ url: "about:blank" }), null, null);
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("not a valid web URL");
  });

  it("accepts query-string changes on the same path", () => {
    const result = acceptContentSnapshot(null, 7, snapshot({ url: "https://apply.example.org/form?step=2" }), "https://apply.example.org/form?step=1", "Apply");
    expect(result.accepted).toBe(true);
  });
});

describe("markNavigated", () => {
  it("invalidates the previous document immediately", () => {
    const connected = acceptContentSnapshot(null, 7, snapshot(), "https://apply.example.org/form", "Apply").next;
    const navigated = markNavigated(connected, "https://apply.example.org/thanks", "Thanks");
    expect(navigated.contentConnected).toBe(false);
    expect(navigated.documentId).toBeNull();
    expect(navigated.url).toBe("https://apply.example.org/thanks");
  });

  it("drops the previous scan when the document navigates", () => {
    const connected = acceptContentSnapshot(null, 7, snapshot(), "https://apply.example.org/form", "Apply").next;
    connected.scan = {
      status: "ready",
      summary: { issueTotal: 3 } as never,
      error: null,
      updatedAt: "2026-05-01T10:00:01.000Z",
    };
    const navigated = markNavigated(connected, "https://apply.example.org/thanks", "Thanks");
    expect(navigated.scan).toEqual(EMPTY_SCAN_STATE);
    expect(isSameDocument(navigated, DOC_A)).toBe(false);
  });

  it("recognises a still-connected document", () => {
    const connected = acceptContentSnapshot(null, 7, snapshot(), "https://apply.example.org/form", "Apply").next;
    expect(isSameDocument(connected, DOC_A)).toBe(true);
    expect(isSameDocument(connected, DOC_B)).toBe(false);
    expect(isSameDocument(null, DOC_A)).toBe(false);
  });
});
