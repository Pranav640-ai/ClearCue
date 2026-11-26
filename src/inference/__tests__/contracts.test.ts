import { describe, expect, it } from "vitest";
import { pageSummaryContract, accessibilityLabelContract } from "../schemas";

describe("structured output contracts", () => {
  it("derives an on-device JSON schema constraint without JSON Schema metadata", () => {
    const constraint = pageSummaryContract.deviceConstraint;
    expect(constraint.$schema).toBeUndefined();
    expect(constraint.type).toBe("object");
    expect(Object.keys(constraint.properties as Record<string, unknown>)).toEqual(["summary", "keyPoints", "confidence"]);
    expect(constraint.required).toEqual(["summary", "keyPoints", "confidence"]);
  });

  it("keeps cloud and on-device property names in sync", () => {
    const deviceProps = Object.keys(pageSummaryContract.deviceConstraint.properties as Record<string, unknown>);
    const cloudProps = Object.keys(accessibilityLabelContract.cloudSchema.properties as Record<string, unknown>);
    expect(cloudProps).toEqual(["label", "evidenceIds", "confidence", "abstained", "reason"]);
    expect(deviceProps).toEqual(["summary", "keyPoints", "confidence"]);
  });
});
