import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, isCloudAllowedForPurpose, mergeSettings, parseStoredSettings, describePrivacyMode } from "../settings";
import { settingsPatchSchema } from "../messages";

describe("mergeSettings", () => {
  it("records an opt-in time when cloud is enabled", () => {
    const next = mergeSettings(DEFAULT_SETTINGS, { privacyMode: "cloud_allowed" }, "2026-05-01T10:00:00.000Z");
    expect(next.privacyMode).toBe("cloud_allowed");
    expect(next.cloudOptInAt).toBe("2026-05-01T10:00:00.000Z");
  });

  it("clears the opt-in time when cloud is switched off", () => {
    const cloudOn = mergeSettings(DEFAULT_SETTINGS, { privacyMode: "cloud_allowed" });
    const off = mergeSettings(cloudOn, { privacyMode: "local_only" });
    expect(off.privacyMode).toBe("local_only");
    expect(off.cloudOptInAt).toBeNull();
  });

  it("does not reset an existing opt-in timestamp on unrelated changes", () => {
    const cloudOn = mergeSettings(DEFAULT_SETTINGS, { privacyMode: "cloud_allowed" }, "2026-01-01T00:00:00.000Z");
    const next = mergeSettings(cloudOn, { allowCloudForDiagnostics: false }, "2026-02-02T00:00:00.000Z");
    expect(next.cloudOptInAt).toBe("2026-01-01T00:00:00.000Z");
    expect(next.allowCloudForDiagnostics).toBe(false);
  });

  it("clamps the evidence budget into the allowed range", () => {
    expect(mergeSettings(DEFAULT_SETTINGS, { maxCloudEvidenceCharacters: -20 }).maxCloudEvidenceCharacters).toBe(0);
    expect(mergeSettings(DEFAULT_SETTINGS, { maxCloudEvidenceCharacters: 99999 }).maxCloudEvidenceCharacters).toBe(4000);
    expect(mergeSettings(DEFAULT_SETTINGS, { maxCloudEvidenceCharacters: 123.9 }).maxCloudEvidenceCharacters).toBe(123);
  });

  it("ignores a non-finite budget", () => {
    const next = mergeSettings(DEFAULT_SETTINGS, { maxCloudEvidenceCharacters: Number.NaN });
    expect(next.maxCloudEvidenceCharacters).toBe(DEFAULT_SETTINGS.maxCloudEvidenceCharacters);
  });
});

describe("parseStoredSettings", () => {
  it("falls back to safe defaults for corrupt data", () => {
    expect(parseStoredSettings(null)).toEqual({ ...DEFAULT_SETTINGS });
    expect(parseStoredSettings({ privacyMode: "everywhere" })).toEqual({ ...DEFAULT_SETTINGS });
  });

  it("keeps valid stored settings", () => {
    const stored = { ...DEFAULT_SETTINGS, privacyMode: "cloud_allowed" as const, cloudOptInAt: "2026-03-03T00:00:00.000Z" };
    expect(parseStoredSettings(stored)).toEqual(stored);
  });

  it("loads older profiles without enabling synthesis or changing their announcement preference", () => {
    const legacy = { schemaVersion: 1, privacyMode: "local_only", cloudOptInAt: null,
      allowCloudForDiagnostics: false, maxCloudEvidenceCharacters: 250, announceRecoveryMessages: false };
    expect(parseStoredSettings(legacy)).toEqual({ ...DEFAULT_SETTINGS, ...legacy });
  });

  it("keeps unrelated preferences when an assistance setting is changed", () => {
    const existing = { ...DEFAULT_SETTINGS, speechOutput: "local_voice" as const, autoRepair: true, onboardingSeen: true };
    const patch = settingsPatchSchema.parse({ explanationDetail: "concise" });
    expect(patch).toEqual({ explanationDetail: "concise" });
    expect(mergeSettings(existing, patch)).toEqual({ ...existing, explanationDetail: "concise" });
    expect(settingsPatchSchema.safeParse({ speechRate: 3 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ speechOutput: "cloud_voice" }).success).toBe(false);
  });
});

describe("isCloudAllowedForPurpose", () => {
  const cloudOn = mergeSettings(DEFAULT_SETTINGS, { privacyMode: "cloud_allowed" });

  it("never allows page evidence while local-only", () => {
    expect(isCloudAllowedForPurpose(DEFAULT_SETTINGS, "page-evidence")).toBe(false);
  });

  it("allows page evidence only after explicit opt-in", () => {
    expect(isCloudAllowedForPurpose(cloudOn, "page-evidence")).toBe(true);
  });

  it("treats diagnostics as an independent, explicit switch", () => {
    expect(isCloudAllowedForPurpose(DEFAULT_SETTINGS, "diagnostics")).toBe(true);
    expect(isCloudAllowedForPurpose({ ...DEFAULT_SETTINGS, allowCloudForDiagnostics: false }, "diagnostics")).toBe(false);
  });
});

describe("describePrivacyMode", () => {
  it("never implies that local-only sends data", () => {
    expect(describePrivacyMode("local_only")).toContain("nothing from a webpage is sent");
    expect(describePrivacyMode("cloud_allowed")).toContain("minimal evidence");
  });
});
