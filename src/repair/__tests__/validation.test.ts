import { describe, expect, it } from "vitest";
import type { ExtensionSettings } from "../../shared/types";
import type { ScannedIssue } from "../../shared/scan";
import type { RepairProposal } from "../../shared/repair";
import type { LiveTargetCheck } from "../../shared/repair";
import { DEFAULT_SETTINGS } from "../../shared/settings";
import { validateRepair, isGenericLabel, looksDestructive, snapshotOf } from "../validation";

function issue(overrides: Partial<ScannedIssue> = {}): ScannedIssue {
  return {
    id: "button-name:main>button:nth-of-type(1)",
    category: "button-name",
    severity: "failure",
    ruleId: "button-name",
    element: { ref: "button", tagName: "button", locator: "main>button:nth-of-type(1)" },
    accessibleName: "",
    evidence: [
      { id: "ev:role", kind: "role", value: "button", privacy: "cloud-eligible" },
      { id: "ev:icon", kind: "icon", value: "search", privacy: "cloud-eligible" },
    ],
    candidates: [],
    needsReasoning: true,
    status: "open",
    detectedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function live(overrides: Partial<LiveTargetCheck> = {}): LiveTargetCheck {
  return {
    found: true,
    tagName: "button",
    role: "button",
    accessibleName: "",
    attributes: [
      { name: "aria-label", present: false, value: null },
      { name: "aria-labelledby", present: false, value: null },
    ],
    replaced: false,
    ...overrides,
  };
}

function proposal(overrides: Partial<RepairProposal> = {}): RepairProposal {
  return {
    issueId: "button-name:main>button:nth-of-type(1)",
    label: "Search",
    evidenceIds: ["ev:icon"],
    ambiguity: "none",
    risk: "low",
    decision: "apply",
    explanation: "The icon says search.",
    source: "on_device",
    ...overrides,
  };
}

function input(overrides: Partial<Parameters<typeof validateRepair>[0]> = {}) {
  const target = issue();
  const settings: ExtensionSettings = { ...DEFAULT_SETTINGS };
  return {
    issue: target,
    proposal: proposal(),
    live: live(),
    currentDocumentId: "doc-1",
    expectedDocumentId: "doc-1",
    authorized: true,
    settings,
    scanIssueIds: new Set([target.id]),
    ...overrides,
  };
}

describe("repair validation", () => {
  it("accepts a specific label supported by evidence", () => {
    const result = validateRepair(input());
    expect(result.accepted).toBe(true);
    expect(result.action).toBe("apply");
    expect(result.deterministicChecks.join(" ")).toContain("Document id matches");
  });

  it("rejects invented evidence ids", () => {
    const result = validateRepair(input({ proposal: proposal({ evidenceIds: ["ev:made-up"] }) }));
    expect(result.accepted).toBe(false);
    expect(result.routing).toContain("insufficient-evidence");
  });

  it("rejects generic labels", () => {
    const result = validateRepair(input({ proposal: proposal({ label: "button", evidenceIds: ["ev:role"] }) }));
    expect(result.accepted).toBe(false);
    expect(result.reasons.join(" ")).toContain("generic");
  });

  it("rejects role-word repetition for a native button", () => {
    expect(isGenericLabel("click here")).toBe(true);
    const result = validateRepair(input({ proposal: proposal({ label: "Search button" }) }));
    expect(result.accepted).toBe(false);
  });

  it("rejects markup and line breaks", () => {
    const result = validateRepair(input({ proposal: proposal({ label: "<img src=x>" }) }));
    expect(result.accepted).toBe(false);
    expect(result.routing).toContain("unsafe-action");
  });

  it("preserves visible text for vague links", () => {
    const link = issue({
      id: "vague-link:main>a:nth-of-type(1)",
      category: "vague-link",
      element: { ref: "a", tagName: "a", locator: "main>a:nth-of-type(1)" },
      accessibleName: "Read more",
      evidence: [
        { id: "ev:role", kind: "role", value: "link", privacy: "cloud-eligible" },
        { id: "ev:nearby", kind: "nearby-text", value: "Housing application guide", privacy: "local-only" },
      ],
    });
    const base = input({
      issue: link,
      live: live({ tagName: "a", role: "link", accessibleName: "Read more" }),
      scanIssueIds: new Set([link.id]),
      proposal: proposal({ issueId: link.id, label: "Read more about housing", evidenceIds: ["ev:nearby"] }),
    });
    expect(validateRepair(base).accepted).toBe(true);
    const missing = validateRepair({ ...base, proposal: { ...base.proposal, label: "Housing guide" } });
    expect(missing.accepted).toBe(false);
    expect(missing.reasons.join(" ")).toContain("visible text");
  });

  it("does not overwrite an existing accessible name", () => {
    const result = validateRepair(input({ live: live({ accessibleName: "Existing" }) }));
    expect(result.accepted).toBe(false);
    expect(result.routing).toContain("stale-target");
  });

  it("refuses stale document ids", () => {
    const result = validateRepair(input({ currentDocumentId: "doc-2" }));
    expect(result.accepted).toBe(false);
    expect(result.routing).toContain("stale-target");
  });

  it("refuses a replaced element", () => {
    const result = validateRepair(input({ live: live({ replaced: true }) }));
    expect(result.accepted).toBe(false);
    expect(result.routing).toContain("stale-target");
  });

  it("refuses an incompatible role", () => {
    const result = validateRepair(input({ live: live({ role: "heading" }) }));
    expect(result.accepted).toBe(false);
    expect(result.routing).toContain("unsafe-action");
  });

  it("downgrades ambiguous proposals to suggestions", () => {
    const result = validateRepair(input({ proposal: proposal({ ambiguity: "medium" }) }));
    expect(result.action).toBe("suggest");
    expect(result.routing).toContain("conflicting-evidence");
  });

  it("downgrades unsupported wording to a suggestion", () => {
    const result = validateRepair(input({ proposal: proposal({ label: "Open basket", evidenceIds: ["ev:icon"] }) }));
    expect(result.accepted).toBe(true);
    expect(result.action).toBe("suggest");
    expect(result.routing).toContain("local-evidence-insufficient");
  });

  it("never renames destructive controls", () => {
    const danger = issue({
      evidence: [
        { id: "ev:role", kind: "role", value: "button", privacy: "cloud-eligible" },
        { id: "ev:name", kind: "accessible-name", value: "Delete account", privacy: "local-only" },
      ],
    });
    expect(looksDestructive(danger)).toBe(true);
    const result = validateRepair(input({ issue: danger }));
    expect(result.accepted).toBe(false);
    expect(result.routing).toContain("unsafe-action");
  });

  it("rejects cloud results when cloud is disabled", () => {
    const result = validateRepair(input({ proposal: proposal({ source: "in_cloud" }) }));
    expect(result.accepted).toBe(false);
    expect(result.routing).toContain("cloud-disabled-by-user");
  });

  it("records an abstention as accepted with no label", () => {
    const result = validateRepair(input({ proposal: proposal({ decision: "abstain", label: "", explanation: "Unclear" }) }));
    expect(result.accepted).toBe(true);
    expect(result.action).toBe("abstain");
  });

  it("detects changed naming attributes supplied by the caller", () => {
    const result = validateRepair(
      input({
        expectedAttributes: [{ name: "aria-label", present: true, value: "page-set" }],
      }),
    );
    expect(result.accepted).toBe(false);
    expect(result.routing).toContain("stale-target");
  });

  it("snapshots attributes exactly", () => {
    expect(snapshotOf(live())).toEqual([
      { name: "aria-label", present: false, value: null },
      { name: "aria-labelledby", present: false, value: null },
    ]);
  });
});
