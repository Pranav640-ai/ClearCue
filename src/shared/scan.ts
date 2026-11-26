import type { ElementReference, EvidencePrivacy, ISO8601 } from "./types";

export type { EvidencePrivacy };

/**
 * Stage 3 accessibility-scan contracts.
 *
 * These types describe what the deterministic scanner found, which evidence
 * supports it, and whether that evidence may ever leave the device. They never
 * contain DOM handles, raw HTML, form values or executable code.
 *
 * The scanner is local: nothing here triggers inference or a network request.
 */

export type ScanCategory =
  | "button-name"
  | "icon-control-name"
  | "link-name"
  | "vague-link"
  | "form-control-name"
  | "custom-control-name"
  | "broken-relationship"
  | "invalid-aria-reference";

export const SCAN_CATEGORIES: readonly ScanCategory[] = [
  "button-name",
  "icon-control-name",
  "link-name",
  "vague-link",
  "form-control-name",
  "custom-control-name",
  "broken-relationship",
  "invalid-aria-reference",
];

export const SCAN_CATEGORY_LABELS: Record<ScanCategory, string> = {
  "button-name": "Missing button label",
  "icon-control-name": "Unnamed icon control",
  "link-name": "Missing link label",
  "vague-link": "Vague link text",
  "form-control-name": "Missing form label",
  "custom-control-name": "Unnamed custom control",
  "broken-relationship": "Broken naming relationship",
  "invalid-aria-reference": "Invalid ARIA reference",
};

/** Definite WCAG failure versus a usability concern that still has a valid name. */
export type ScanSeverity = "failure" | "heuristic";

export type EvidenceKind =
  | "role"
  | "native-element"
  | "accessible-name"
  | "attribute"
  | "icon"
  | "nearby-text"
  | "heading"
  | "label"
  | "structure"
  | "link-destination"
  | "relationship";

/**
 * Privacy classification used before any future cloud request:
 * - `local-only`: may be shown to the user, must never leave the device.
 * - `cloud-eligible`: minimal structural fact that may be sent after explicit opt-in.
 * - `prohibited`: never collected at all (form values, passwords, tokens).
 */

export interface ScanEvidence {
  /** Stable within one issue, for example `ev:role`. */
  id: string;
  kind: EvidenceKind;
  value: string;
  privacy: EvidencePrivacy;
  note?: string;
}

export type CandidateKind = "aria-label" | "repair-reference" | "link-context" | "associated-label";

export interface RepairCandidate {
  id: string;
  kind: CandidateKind;
  /** Proposed value, never applied in Stage 3. */
  proposedValue: string;
  /** `direct` = structural evidence; `heuristic` = interpretation. */
  support: "direct" | "heuristic";
  confidence: "high" | "medium" | "low";
  /** Local explanation of why the proposal is supported. */
  rationale: string;
  evidenceIds: string[];
}

export interface ScannedIssue {
  /** Stable across rescans of the same document structure. */
  id: string;
  category: ScanCategory;
  severity: ScanSeverity;
  ruleId: string;
  element: ElementReference;
  /** Computed accessible name at scan time; empty string when there is none. */
  accessibleName: string;
  evidence: ScanEvidence[];
  candidates: RepairCandidate[];
  /** True when no deterministic candidate exists or evidence conflicts. */
  needsReasoning: boolean;
  /** Detected but not applied; Stage 4 decides what to do. */
  status: "open";
  detectedAt: ISO8601;
}

export interface ScanCounts {
  total: number;
  missingButtonLabels: number;
  missingFormLabels: number;
  missingLinkLabels: number;
  vagueLinks: number;
  other: number;
  byCategory: Record<ScanCategory, number>;
}

export interface ScanLimits {
  maxInteractive: number;
  maxIssues: number;
  maxReturnedIssues: number;
}

export interface ScanSummary {
  documentId: string;
  /** Origin plus pathname only; query strings and fragments are never included. */
  url: string;
  origin: string;
  scannedAt: ISO8601;
  durationMs: number;
  interactiveCount: number;
  /** Number of issues before the returned slice is applied. */
  issueTotal: number;
  counts: ScanCounts;
  issues: ScannedIssue[];
  /** True when page size or issue count hit a hard limit. */
  truncated: boolean;
  limits: ScanLimits;
}

export type ScanStatus = "idle" | "scanning" | "ready" | "error";

export interface TabScanState {
  status: ScanStatus;
  summary: ScanSummary | null;
  error: string | null;
  updatedAt: ISO8601 | null;
}

export const EMPTY_SCAN_STATE: TabScanState = {
  status: "idle",
  summary: null,
  error: null,
  updatedAt: null,
};

export function emptyScanCounts(): ScanCounts {
  const byCategory = Object.fromEntries(SCAN_CATEGORIES.map((category) => [category, 0])) as Record<
    ScanCategory,
    number
  >;
  return {
    total: 0,
    missingButtonLabels: 0,
    missingFormLabels: 0,
    missingLinkLabels: 0,
    vagueLinks: 0,
    other: 0,
    byCategory,
  };
}

/** Category rollup used by the side panel, computed from real issues only. */
export function countIssues(issues: readonly ScannedIssue[]): ScanCounts {
  const counts = emptyScanCounts();
  for (const issue of issues) {
    counts.byCategory[issue.category] += 1;
    counts.total += 1;
    if (issue.category === "button-name" || issue.category === "icon-control-name") counts.missingButtonLabels += 1;
    else if (issue.category === "form-control-name") counts.missingFormLabels += 1;
    else if (issue.category === "link-name") counts.missingLinkLabels += 1;
    else if (issue.category === "vague-link") counts.vagueLinks += 1;
    else counts.other += 1;
  }
  return counts;
}

export const DEFAULT_SCAN_LIMITS: ScanLimits = {
  maxInteractive: 4000,
  maxIssues: 400,
  maxReturnedIssues: 60,
};
