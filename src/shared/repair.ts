import type { AppliedRepair, ISO8601, RepairSource } from "./types";
import type { ScanCategory } from "./scan";

export type { AppliedRepair, RepairSource };

/**
 * Stage 4 shared contracts: routing, proposals, validation and attempts.
 *
 * These types are deliberately data-only. They cross the panel/background/content
 * boundaries and are stored in chrome.storage, so they never contain DOM handles,
 * functions or raw HTML.
 */

export const ROUTING_REASONS = [
  "deterministic-supported",
  "local-preferred",
  "local-visual",
  "local-evidence-insufficient",
  "local-validation-failed",
  "local-unavailable",
  "cloud-permitted",
  "cloud-denied-by-policy",
  "cloud-disabled-by-user",
  "unsafe-action",
  "conflicting-evidence",
  "insufficient-evidence",
  "stale-target",
  "budget-exhausted",
] as const;

export type RoutingReason = (typeof ROUTING_REASONS)[number];

export const ROUTING_REASON_LABELS: Record<RoutingReason, string> = {
  "deterministic-supported": "Fixed by a deterministic rule",
  "local-preferred": "On-device AI was preferred",
  "local-visual": "Local visual inference used an isolated icon",
  "local-evidence-insufficient": "Local evidence was insufficient",
  "local-validation-failed": "Local proposal failed validation",
  "local-unavailable": "On-device AI was unavailable",
  "cloud-permitted": "Cloud escalation was permitted",
  "cloud-denied-by-policy": "Cloud policy rejected the evidence",
  "cloud-disabled-by-user": "Cloud is turned off",
  "unsafe-action": "Unsafe or consequential control",
  "conflicting-evidence": "Evidence conflicts",
  "insufficient-evidence": "Not enough evidence",
  "stale-target": "The page changed before the repair",
  "budget-exhausted": "Inference or evidence budget exhausted",
};

export type RepairAction = "apply" | "suggest" | "abstain";

export type RepairAttemptStatus = "applied" | "suggested" | "abstained" | "failed";

export type AmbiguityLevel = "none" | "low" | "medium" | "high";
export type RiskLevel = "low" | "medium" | "high";

/** A validated proposal from any source (rule, local model or cloud model). */
export interface RepairProposal {
  issueId: string;
  label: string | null;
  evidenceIds: string[];
  ambiguity: AmbiguityLevel;
  risk: RiskLevel;
  decision: RepairAction;
  explanation: string;
  source: RepairSource;
  visual?: boolean;
}

/** One routing/validation record, stored so every outcome is explainable. */
export interface RepairAttempt {
  id: string;
  issueId: string;
  category: ScanCategory;
  tabId: number | null;
  documentId: string;
  pageUrl: string;
  status: RepairAttemptStatus;
  action: RepairAction;
  source: RepairSource | "unknown";
  routing: RoutingReason[];
  /** Concrete deterministic checks that passed or failed. */
  checks: string[];
  /** Heuristic notes. Never presented as deterministic verification. */
  heuristicNotes: string[];
  proposedLabel: string | null;
  appliedRepairId: string | null;
  latencyMs: number;
  inferenceMs: number | null;
  error: string | null;
  createdAt: ISO8601;
}

/** A repair proposal waiting for explicit user review. */
export interface RepairSuggestion {
  id: string;
  issueId: string;
  category: ScanCategory;
  documentId: string;
  pageUrl: string;
  label: string;
  source: RepairSource;
  reasons: RoutingReason[];
  heuristicNotes: string[];
  createdAt: ISO8601;
}

export interface RepairStatistics {
  detectedIssues: number;
  appliedRepairs: number;
  deterministicRepairs: number;
  onDeviceRepairs: number;
  cloudRepairs: number;
  suggestions: number;
  abstentions: number;
  inferenceRequests: number;
  cloudEscalations: number;
  failedRequests: number;
  undone: number;
}

export function emptyRepairStatistics(): RepairStatistics {
  return {
    detectedIssues: 0,
    appliedRepairs: 0,
    deterministicRepairs: 0,
    onDeviceRepairs: 0,
    cloudRepairs: 0,
    suggestions: 0,
    abstentions: 0,
    inferenceRequests: 0,
    cloudEscalations: 0,
    failedRequests: 0,
    undone: 0,
  };
}

/** Everything the side panel needs to describe repair activity honestly. */
export interface RepairView {
  attempts: RepairAttempt[];
  suggestions: RepairSuggestion[];
  statistics: RepairStatistics;
  paused: boolean;
  autoRepair: boolean;
  /** Latest real inference outcome recorded by the panel document. */
  lastInference: {
    requestedSource?: "on_device" | "in_cloud";
    attempted?: boolean;
    source: RepairSource | "unknown";
    latencyMs: number;
    at: ISO8601;
    purpose: string;
    ok: boolean;
    error: string | null;
  } | null;
}

export const EMPTY_REPAIR_VIEW: RepairView = {
  attempts: [],
  suggestions: [],
  statistics: emptyRepairStatistics(),
  paused: false,
  autoRepair: false,
  lastInference: null,
};

/** Attribute value captured exactly before a repair, including absence. */
export interface AttributeSnapshot {
  name: "aria-label" | "aria-labelledby";
  present: boolean;
  value: string | null;
}

export interface RepairApplyRequest {
  issueId: string;
  documentId: string;
  locator: string;
  expectedTag: string;
  label: string;
  kind: "accessible-name" | "repair-reference";
  target: "aria-label" | "aria-labelledby";
  /** Exact original attributes the panel saw when it decided to apply. */
  snapshot: AttributeSnapshot[];
  proposedBy: RepairSource;
  explanation: string;
}

export interface RepairApplyResult {
  ok: boolean;
  /** True when every applied attribute was verified by recomputing the name. */
  verified: boolean;
  applied: AppliedRepair | null;
  error: string | null;
  accessibleNameBefore: string | null;
  accessibleNameAfter: string | null;
  conflict: boolean;
}

export interface RepairUndoRequest {
  repairId: string;
  issueId: string;
  documentId: string;
  locator: string;
  target: "aria-label" | "aria-labelledby";
  expectedCurrentValue: string;
  previousValue: string | null;
  previousPresent: boolean;
}

export interface RepairUndoResult {
  ok: boolean;
  conflict: boolean;
  error: string | null;
  restoredValue: string | null;
}

/** Facts captured from the live page just before applying a repair. */
export interface LiveTargetCheck {
  found: boolean;
  tagName: string | null;
  role: string | null;
  accessibleName: string;
  attributes: AttributeSnapshot[];
  replaced: boolean;
}
