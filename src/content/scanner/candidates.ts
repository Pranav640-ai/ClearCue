import type { RepairCandidate, ScanCategory } from "../../shared/scan";
import type { SanitizedDestination } from "./dom";
import { isDestructiveAction, isSafeIconHint } from "./dom";

/**
 * Conservative deterministic candidates.
 *
 * These are *proposals only*. Nothing here mutates the page, and a candidate is
 * produced only when authored, structural evidence supports it. Destructive or
 * financially consequential controls never receive a guessed label.
 */

export interface CandidateInput {
  element: Element;
  category: ScanCategory;
  role: string;
  accessibleName: string;
  labelTexts: string[];
  validRefIds: string[];
  missingRefIds: string[];
  duplicateRefIds: string[];
  icon: { hint: string; source: string; allowlisted: boolean } | null;
  destination: SanitizedDestination | null;
  dangerous: boolean;
  conflicts: string[];
}

function humanize(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function buildCandidates(input: CandidateInput): RepairCandidate[] {
  if (input.duplicateRefIds.length > 0 || input.conflicts.length > 0) return [];
  if (input.dangerous) return [];

  const candidates: RepairCandidate[] = [];
  const { element, labelTexts, accessibleName } = input;

  const isFormControl = ["input", "select", "textarea"].includes(element.tagName.toLowerCase());
  if (isFormControl && accessibleName === "" && labelTexts.length === 1) {
    const label = humanize(labelTexts[0] ?? "");
    if (label.length > 0 && label.length <= 80) {
      candidates.push({
        id: "candidate:associated-label",
        kind: "associated-label",
        proposedValue: label,
        support: "direct",
        confidence: "high",
        rationale: "Exactly one authored label is associated with this control, and the control has no accessible name.",
        evidenceIds: ["ev:label:0", "ev:label-association"],
      });
    }
  }

  if (input.validRefIds.length > 0 && input.missingRefIds.length > 0 && accessibleName === "") {
    candidates.push({
      id: "candidate:repair-reference",
      kind: "repair-reference",
      proposedValue: input.validRefIds.slice(0, 4).join(" "),
      support: "direct",
      confidence: "medium",
      rationale: "Some aria-labelledby references resolve and some do not; the valid references can be kept.",
      evidenceIds: ["ev:reference-count", "ev:missing-refs"],
    });
  }

  if (accessibleName === "" && input.icon && isSafeIconHint(input.icon.hint)) {
    const hint = humanize(input.icon.hint);
    if (!isDestructiveAction(element, hint)) {
      candidates.push({
        id: "candidate:icon-label",
        kind: "aria-label",
        proposedValue: hint,
        support: "direct",
        confidence: input.icon.source === "img-alt" ? "medium" : "high",
        rationale: `The control contains an icon whose authored ${input.icon.source} text describes it.`,
        evidenceIds: ["ev:icon"],
      });
    }
  }

  if (
    input.category === "vague-link" &&
    input.destination &&
    !input.destination.dangerous &&
    input.destination.slug.length >= 3 &&
    input.destination.slug.split(" ").length <= 6
  ) {
    candidates.push({
      id: "candidate:link-context",
      kind: "link-context",
      proposedValue: `Open ${input.destination.slug}`,
      support: "heuristic",
      confidence: "medium",
      rationale: "The destination path contains descriptive words that clarify the vague link text.",
      evidenceIds: ["ev:destination-host", "ev:destination-path", "ev:nearby"],
    });
  }

  return candidates;
}
