import { describe, expect, it } from "vitest";
import { toInferenceFailure } from "../errors";

describe("toInferenceFailure", () => {
  it("explains how to fix a missing LanguageModel API", () => {
    const failure = toInferenceFailure({
      code: "api-not-enabled",
      message: "Local LanguageModel API not available in this environment.",
    });
    expect(failure.hint).toContain("chrome://flags");
  });

  it("points App Check rejections at debug token registration", () => {
    const failure = toInferenceFailure(new Error("App Check token is invalid"));
    expect(failure.hint).toContain("debug token");
  });

  it("explains USER_PROJECT_DENIED instead of blaming the network", () => {
    const failure = toInferenceFailure({
      code: "fetch-error",
      message:
        "AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/x/models/gemini-3.5-flash-lite:generateContent: [403 ] Caller does not have required permission to use project 123. Grant the caller the roles/serviceusage.serviceUsageConsumer role.",
    });
    expect(failure.hint).toContain("Generative Language API");
    expect(failure.hint).toContain("API key");
  });

  it("keeps App Check guidance ahead of project-permission guidance", () => {
    const failure = toInferenceFailure({ code: "fetch-error", message: "AppCheck: Fetch server returned 403" });
    expect(failure.hint).toContain("debug token");
  });

  it("maps quota failures", () => {
    const failure = toInferenceFailure({ code: "unknown", message: "429 RESOURCE_EXHAUSTED" });
    expect(failure.code).toBe("unknown");
    expect(failure.hint).toContain("quota");
  });

  it("keeps the original message instead of inventing success", () => {
    const failure = toInferenceFailure(new Error("something specific broke"));
    expect(failure.message).toBe("something specific broke");
    expect(failure.code).toBe("unknown-error");
  });
});
