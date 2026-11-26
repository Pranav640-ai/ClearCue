import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "../settings";
import { redactSensitiveText, selectCloudEvidence } from "../privacy";
import type { Evidence } from "../types";

const evidence: Evidence[] = [
  { id: "E1", classification: "structural", elementRef: "el-1", value: "button#submit", cloudSafe: true },
  { id: "E2", classification: "visible-text", elementRef: "el-1", value: "Pay now", cloudSafe: true },
  { id: "E3", classification: "attribute", elementRef: "el-2", value: "type=password value=hunter2", cloudSafe: false },
];

const cloudOn = mergeSettings(DEFAULT_SETTINGS, { privacyMode: "cloud_allowed" });

describe("selectCloudEvidence", () => {
  it("sends nothing in local-only mode", () => {
    const result = selectCloudEvidence(evidence, DEFAULT_SETTINGS, "page-evidence");
    expect(result.allowed).toBe(false);
    expect(result.text).toBe("");
    expect(result.evidenceIds).toEqual([]);
  });

  it("excludes evidence that is not classified as cloud-safe", () => {
    const result = selectCloudEvidence(evidence, cloudOn, "page-evidence");
    expect(result.allowed).toBe(true);
    expect(result.evidenceIds).toEqual(["E1", "E2"]);
    expect(result.text).not.toContain("hunter2");
  });

  it("respects the character budget exactly", () => {
    const tight = mergeSettings(cloudOn, { maxCloudEvidenceCharacters: 20 });
    const result = selectCloudEvidence(evidence, tight, "page-evidence");
    expect(result.allowed).toBe(true);
    expect(result.sentCharacters).toBeLessThanOrEqual(20);
    expect(result.evidenceIds).toEqual(["E1"]);
  });

  it("refuses when the budget cannot fit any evidence", () => {
    const tiny = mergeSettings(cloudOn, { maxCloudEvidenceCharacters: 2 });
    const result = selectCloudEvidence(evidence, tiny, "page-evidence");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("budget");
  });

  it("refuses when no evidence is safe to send", () => {
    const unsafeOnly = evidence.filter((item) => !item.cloudSafe);
    const result = selectCloudEvidence(unsafeOnly, cloudOn, "page-evidence");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("safe to send");
  });

  it("keeps diagnostics independent of the page privacy mode but honours its own switch", () => {
    expect(selectCloudEvidence([], DEFAULT_SETTINGS, "diagnostics").allowed).toBe(true);
    expect(selectCloudEvidence([], { ...DEFAULT_SETTINGS, allowCloudForDiagnostics: false }, "diagnostics").allowed).toBe(false);
  });

  it("never includes raw page text in diagnostics", () => {
    const result = selectCloudEvidence(evidence, cloudOn, "diagnostics");
    expect(result.text).toBe("");
    expect(result.evidenceIds).toEqual([]);
  });
});

describe("redactSensitiveText", () => {
  it("removes email addresses and long digit sequences", () => {
    expect(redactSensitiveText("contact rowan@example.com")).toBe("contact [email]");
    expect(redactSensitiveText("card 4111 1111 1111 1111")).toBe("card [number]");
  });

  it("caps the output length so a single value cannot bloat the payload", () => {
    expect(redactSensitiveText("a".repeat(1000)).length).toBe(240);
  });
});
