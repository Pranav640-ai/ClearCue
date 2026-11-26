import { describe, expect, it } from "vitest";
import { z } from "zod";
import { evaluateLabelProposal, extractJsonObject, parseStructuredResponse } from "../validation";
import type { AccessibilityLabelProposal } from "../schemas";

const schema = z.object({ summary: z.string().min(1), confidence: z.enum(["high", "low"]) });

const validProposal: AccessibilityLabelProposal = {
  label: "Search products",
  evidenceIds: ["E2", "E3"],
  confidence: "high",
  abstained: false,
  reason: "The adjacent search field and region heading both name product search.",
};

describe("extractJsonObject", () => {
  it("unwraps fenced JSON", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("returns null when there is no JSON object", () => {
    expect(extractJsonObject("I cannot do that.")).toBeNull();
  });

  it("ignores trailing commentary after the object", () => {
    expect(extractJsonObject('{"a":1} hope that helps')).toBe('{"a":1}');
  });
});

describe("parseStructuredResponse", () => {
  it("accepts schema-valid JSON", () => {
    const result = parseStructuredResponse('{"summary":"Fictional bakery","confidence":"high"}', schema);
    expect(result.jsonParsed).toBe(true);
    expect(result.schemaValid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("reports invalid JSON without throwing", () => {
    const result = parseStructuredResponse("{not json}", schema);
    expect(result.jsonParsed).toBe(false);
    expect(result.schemaValid).toBe(false);
    expect(result.issues[0]).toMatch(/Invalid JSON/);
  });

  it("reports schema violations with paths", () => {
    const result = parseStructuredResponse('{"summary":"x","confidence":"medium"}', schema);
    expect(result.jsonParsed).toBe(true);
    expect(result.schemaValid).toBe(false);
    expect(result.issues[0]).toContain("confidence");
  });
});

describe("evaluateLabelProposal", () => {
  const evidence = ["E1", "E2", "E3", "E4"];

  it("accepts a specific label that cites real evidence", () => {
    expect(evaluateLabelProposal(validProposal, evidence)).toEqual({ accepted: true, abstained: false, issues: [] });
  });

  it("rejects citations that do not exist in the evidence set", () => {
    const result = evaluateLabelProposal({ ...validProposal, evidenceIds: ["E9"] }, evidence);
    expect(result.accepted).toBe(false);
    expect(result.issues.join(" ")).toContain("E9");
  });

  it("rejects a guessed label with no evidence", () => {
    const result = evaluateLabelProposal({ ...validProposal, evidenceIds: [], confidence: "low" }, evidence);
    expect(result.accepted).toBe(false);
    expect(result.issues).toContain("No evidence was cited for the label.");
  });

  it("rejects generic role words", () => {
    const result = evaluateLabelProposal({ ...validProposal, label: "Button" }, evidence);
    expect(result.accepted).toBe(false);
  });

  it("requires two citations for high confidence", () => {
    const result = evaluateLabelProposal({ ...validProposal, evidenceIds: ["E2"] }, evidence);
    expect(result.accepted).toBe(false);
    expect(result.issues.join(" ")).toContain("High confidence");
  });

  it("accepts a justified abstention with no label", () => {
    const result = evaluateLabelProposal(
      {
        label: "",
        evidenceIds: ["E1"],
        confidence: "low",
        abstained: true,
        reason: "The control has no surrounding context that identifies its purpose.",
      },
      evidence,
    );
    expect(result).toEqual({ accepted: true, abstained: true, issues: [] });
  });

  it("rejects an abstention that still carries a label", () => {
    const result = evaluateLabelProposal({ ...validProposal, abstained: true }, evidence);
    expect(result.accepted).toBe(false);
  });
});
