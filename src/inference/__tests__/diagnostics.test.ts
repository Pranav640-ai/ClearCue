import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_CASES, checkOutcome } from "../diagnostics";
import type { InferenceOutcome } from "../types";

function outcome(overrides: Partial<InferenceOutcome> = {}): InferenceOutcome {
  return {
    key: "cloud-text",
    label: "Cloud text",
    requestedMode: "only_in_cloud",
    status: "success",
    actualSource: "in_cloud",
    latencyMs: 120,
    model: "cloud:gemini-3.5-flash-lite",
    sourceMismatch: false,
    text: "8 hours",
    structured: null,
    error: null,
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

const cloudCase = DIAGNOSTIC_CASES.find((testCase) => testCase.id === "cloud-text");
const accessibilityCase = DIAGNOSTIC_CASES.find((testCase) => testCase.id === "accessibility-label");

describe("checkOutcome", () => {
  it("has a cloud case to exercise", () => {
    expect(cloudCase).toBeDefined();
    expect(accessibilityCase).toBeDefined();
  });

  it("fails a cloud case that actually ran on device", () => {
    const result = checkOutcome(outcome({ actualSource: "on_device" }), cloudCase!);
    expect(result.passed).toBe(false);
    expect(result.notes.join(" ")).toContain("Expected IN_CLOUD");
  });

  it("fails when the expected answer is missing", () => {
    const result = checkOutcome(outcome({ text: "nine hours" }), cloudCase!);
    expect(result.passed).toBe(false);
  });

  it("passes a correct cloud answer", () => {
    expect(checkOutcome(outcome(), cloudCase!).passed).toBe(true);
  });

  it("rejects an accessibility proposal that invents evidence", () => {
    const result = checkOutcome(
      outcome({
        key: "accessibility-label",
        structured: {
          jsonParsed: true,
          schemaValid: true,
          issues: [],
          data: {
            label: "Search products",
            evidenceIds: ["E99"],
            confidence: "high",
            abstained: false,
            reason: "because",
          },
        },
      }),
      accessibilityCase!,
    );
    expect(result.passed).toBe(false);
    expect(result.labelEvaluation?.accepted).toBe(false);
  });

  it("accepts an evidence-backed accessibility proposal", () => {
    const result = checkOutcome(
      outcome({
        key: "accessibility-label",
        structured: {
          jsonParsed: true,
          schemaValid: true,
          issues: [],
          data: {
            label: "Search products",
            evidenceIds: ["E2", "E3"],
            confidence: "high",
            abstained: false,
            reason: "The search field and region heading both describe product search.",
          },
        },
      }),
      accessibilityCase!,
    );
    expect(result.passed).toBe(true);
    expect(result.labelEvaluation?.abstained).toBe(false);
  });
});
