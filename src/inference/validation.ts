import type { AccessibilityLabelProposal } from "./schemas";
import type { StructuredValidation } from "./types";

/**
 * Strip optional Markdown code fences the model may add around JSON, then
 * return the widest `{...}` region. Returns null when no JSON object is present.
 */
export function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

export function parseStructuredResponse(
  text: string,
  schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
): StructuredValidation {
  const json = extractJsonObject(text);
  if (json === null) {
    return { jsonParsed: false, schemaValid: false, issues: ["No JSON object found in the model response."], data: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown JSON parse error";
    return { jsonParsed: false, schemaValid: false, issues: [`Invalid JSON: ${message}`], data: null };
  }
  const result = schema.safeParse(parsed);
  if (result.success) {
    return { jsonParsed: true, schemaValid: true, issues: [], data: result.data };
  }
  const issues = (result.error?.issues ?? []).map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
  return { jsonParsed: true, schemaValid: false, issues, data: parsed };
}

export interface LabelEvaluation {
  accepted: boolean;
  abstained: boolean;
  issues: string[];
}

/**
 * Deterministic, evidence-based validation of a generated accessible name.
 * This never edits the page: it only decides whether the proposal is safe to
 * present and, in later stages, to apply.
 */
export function evaluateLabelProposal(proposal: AccessibilityLabelProposal, availableEvidenceIds: readonly string[]): LabelEvaluation {
  const issues: string[] = [];
  const label = proposal.label.trim();
  const known = new Set(availableEvidenceIds);

  const unknownIds = proposal.evidenceIds.filter((id) => !known.has(id));
  if (unknownIds.length > 0) issues.push(`Cited evidence that does not exist: ${unknownIds.join(", ")}.`);

  if (proposal.abstained) {
    if (label !== "") issues.push("Abstained proposals must not include a label.");
    if (proposal.reason.trim() === "") issues.push("An abstention needs a reason.");
    return { accepted: issues.length === 0, abstained: true, issues };
  }

  if (label === "") issues.push("No label was produced and the model did not abstain.");
  if (label.length > 100) issues.push("Label exceeds 100 characters.");
  if (proposal.evidenceIds.length === 0) issues.push("No evidence was cited for the label.");
  if (proposal.confidence === "high" && proposal.evidenceIds.length < 2) {
    issues.push("High confidence requires at least two independent evidence citations.");
  }
  if (/^(button|link|icon|click|submit|search)$/i.test(label)) {
    issues.push("Label is a generic role or action word and is not more informative than no label.");
  }

  return { accepted: issues.length === 0, abstained: false, issues };
}
