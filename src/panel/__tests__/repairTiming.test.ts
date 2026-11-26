import { describe, expect, it } from "vitest";
import { attemptTiming } from "../components/RepairPanel";

describe("repair decision timing", () => {
  it("reports real inference time separately from decision overhead", () => {
    expect(attemptTiming({ inferenceMs: 8421, latencyMs: 0 })).toBe("8421 ms inference");
  });

  it("labels a deterministic decision that made no inference call", () => {
    expect(attemptTiming({ inferenceMs: null, latencyMs: 12 })).toBe("12 ms decision");
  });
});
