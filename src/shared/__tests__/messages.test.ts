import { describe, expect, it } from "vitest";
import { contentMessageSchema, panelRequestSchema, settingsPatchSchema } from "../messages";

const snapshot = {
  documentId: "0f8fad5b-d9cb-469f-a165-70867728950e",
  url: "https://apply.example.org/form",
  origin: "https://apply.example.org",
  title: "Apply",
  counts: { forms: 1, fields: 5, buttons: 2, links: 3 },
  at: "2026-05-01T10:00:00.000Z",
};

describe("panelRequestSchema", () => {
  it("accepts the supported requests", () => {
    expect(panelRequestSchema.safeParse({ kind: "panel:getState" }).success).toBe(true);
    expect(panelRequestSchema.safeParse({ kind: "panel:setSiteEnabled", origin: "https://a.example", enabled: true }).success).toBe(true);
    expect(panelRequestSchema.safeParse({ kind: "panel:updateSettings", patch: { privacyMode: "local_only" } }).success).toBe(true);
    expect(panelRequestSchema.safeParse({ kind: "panel:undoRepair", repairId: "repair-1" }).success).toBe(true);
    expect(panelRequestSchema.safeParse({ kind: "panel:openDiagnostics" }).success).toBe(true);
  });

  it("rejects unknown kinds and extra fields", () => {
    expect(panelRequestSchema.safeParse({ kind: "panel:deleteEverything" }).success).toBe(false);
    expect(panelRequestSchema.safeParse({ kind: "panel:getState", tabId: 7 }).success).toBe(false);
  });

  it("rejects a settings patch carrying an unknown key", () => {
    expect(settingsPatchSchema.safeParse({ privacyMode: "cloud_allowed", sendPageHtml: true }).success).toBe(false);
  });

  it("rejects invalid privacy values", () => {
    expect(settingsPatchSchema.safeParse({ privacyMode: "always_cloud" }).success).toBe(false);
  });
});

describe("contentMessageSchema", () => {
  it("accepts hello, pageChanged and snapshot messages", () => {
    for (const kind of ["content:hello", "content:pageChanged", "content:snapshot"]) {
      expect(contentMessageSchema.safeParse({ kind, snapshot }).success).toBe(true);
    }
  });

  it("rejects negative or fractional counts", () => {
    expect(contentMessageSchema.safeParse({ kind: "content:hello", snapshot: { ...snapshot, counts: { ...snapshot.counts, forms: -1 } } }).success).toBe(false);
    expect(contentMessageSchema.safeParse({ kind: "content:hello", snapshot: { ...snapshot, counts: { ...snapshot.counts, forms: 1.5 } } }).success).toBe(false);
  });

  it("rejects an empty document id and oversized title", () => {
    expect(contentMessageSchema.safeParse({ kind: "content:hello", snapshot: { ...snapshot, documentId: "" } }).success).toBe(false);
    expect(contentMessageSchema.safeParse({ kind: "content:hello", snapshot: { ...snapshot, title: "x".repeat(513) } }).success).toBe(false);
  });

  it("rejects arbitrary content kinds", () => {
    expect(contentMessageSchema.safeParse({ kind: "content:readPassword", snapshot }).success).toBe(false);
  });
});
