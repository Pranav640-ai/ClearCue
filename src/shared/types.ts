/**
 * Shared ClearCue domain contracts.
 *
 * These types are the vocabulary used by the content script, the background
 * service worker, the side panel and (in later stages) the inference engine.
 * They deliberately describe *data*, never DOM handles or executable code.
 */

import type { TabScanState } from "./scan";
import type { RepairView } from "./repair";
import type { RecoveryView } from "./recovery";

export type ISO8601 = string;

/** A reference to a page element that survives message passing but not navigation. */
export interface ElementReference {
  /** ClearCue-generated id, unique for one document instance. */
  ref: string;
  tagName: string;
  /** ARIA role when the element exposes one. */
  role?: string;
  /** Short, non-sensitive locator summary (never full HTML). */
  locator: string;
}

export type EvidenceClassification =
  | "structural"
  | "visible-text"
  | "attribute"
  | "neighbouring-text"
  | "model-inference";

/**
 * Privacy classification applied before anything may leave the device.
 * - `local-only`: displayed to the user only.
 * - `cloud-eligible`: minimal structural fact, still gated by explicit opt-in.
 * - `prohibited`: must never be collected.
 */
export type EvidencePrivacy = "local-only" | "cloud-eligible" | "prohibited";

/** A minimal, sanitised observation used to justify a repair. */
export interface Evidence {
  id: string;
  classification: EvidenceClassification;
  elementRef: string | null;
  value: string;
  /** Whether this evidence is safe to include in a cloud request under policy. */
  cloudSafe: boolean;
  /** Conservative privacy classification; absent on legacy Stage 1 fixtures. */
  privacy?: EvidencePrivacy;
}

export type IssueKind =
  | "missing-accessible-name"
  | "vague-link-text"
  | "unlabeled-form-field"
  | "silent-validation-error"
  | "unannounced-state-change"
  | "ambiguous-destructive-action";

export type IssueSeverity = "blocking" | "serious" | "moderate" | "minor";

export interface AccessibilityIssue {
  id: string;
  kind: IssueKind;
  severity: IssueSeverity;
  element: ElementReference;
  evidence: Evidence[];
  /** Deterministic rule that produced this issue, or null for AI-only findings. */
  ruleId: string | null;
  description: string;
}

export type RepairKind = "accessible-name" | "error-announcement" | "state-announcement" | "focus-assist";

export type RepairSource = "rule" | "on_device" | "in_cloud";

export interface ProposedRepair {
  id: string;
  issueId: string;
  kind: RepairKind;
  /** Proposed accessible name. Never applied over an existing valid name. */
  accessibleName: string | null;
  evidenceIds: string[];
  confidence: "high" | "medium" | "low";
  source: RepairSource;
  reversible: boolean;
  rationale: string;
}

export type RepairDecisionStatus = "apply" | "suggest" | "abstain";

export interface RepairDecision {
  proposedRepairId: string;
  status: RepairDecisionStatus;
  reasons: string[];
  decidedAt: ISO8601;
  decidedBy: "rule" | "validation" | "user";
}

export interface AppliedRepair {
  id: string;
  issueId: string;
  elementRef: ElementReference;
  kind: RepairKind;
  tabId?: number;
  pageUrl?: string;
  appliedAt: ISO8601;
  /** The value that existed before the repair, so it can be restored exactly. */
  previousValue: string | null;
  /** The attribute or property that was changed (for example `aria-label`). */
  target: string;
  newValue: string;
  undoneAt: ISO8601 | null;
  /** Exactly whether the attribute existed before the repair. */
  previousPresent?: boolean;
  accessibleNameBefore?: string | null;
  accessibleNameAfter?: string | null;
  /** Who proposed the repair; deterministic rules are never called AI. */
  source?: RepairSource;
  explanation?: string | null;
  /** Document that contained the repaired element, for stale-undo protection. */
  documentId?: string;
}

export type InteractionType = "click" | "input" | "submit" | "navigation" | "dom-change";

export interface InteractionEvent {
  id: string;
  tabId: number;
  documentId: string;
  type: InteractionType;
  targetRef: ElementReference | null;
  at: ISO8601;
}

export interface RecoveryMessage {
  id: string;
  interactionId: string | null;
  severity: "info" | "success" | "warning" | "error";
  text: string;
  announcedAt: ISO8601 | null;
  relatedRef: string | null;
  replayable: boolean;
}

export type InferenceSource = "on_device" | "in_cloud" | "unknown";

export type RequestedInferenceMode = "prefer_on_device" | "only_on_device" | "only_in_cloud";

/** Product-level inference request. The SDK-level request lives in inference/types.ts. */
export interface InferenceRequest {
  id: string;
  purpose: "diagnostics" | "accessibility-label" | "validation-recovery";
  mode: RequestedInferenceMode;
  prompt: string;
  systemInstruction?: string;
  structuredContract?: string;
}

export interface InferenceResult {
  requestId: string;
  source: InferenceSource;
  text: string;
  latencyMs: number;
  model: string | null;
  error: { code: string; message: string } | null;
}

export type PrivacyMode = "local_only" | "cloud_allowed";

export interface PrivacyPolicy {
  mode: PrivacyMode;
  cloudOptInAt: ISO8601 | null;
  /** Diagnostics use hand-written fictional prompts; still explicit and visible. */
  allowCloudForDiagnostics: boolean;
  /** Hard cap on characters of evidence that may leave the device. */
  maxCloudEvidenceCharacters: number;
}

export interface ExtensionSettings {
  schemaVersion: 1;
  privacyMode: PrivacyMode;
  cloudOptInAt: ISO8601 | null;
  allowCloudForDiagnostics: boolean;
  maxCloudEvidenceCharacters: number;
  /** Announce ClearCue result summaries through the page's live region. */
  announceRecoveryMessages: boolean;
  explanationDetail: "concise" | "detailed";
  speechOutput: "screen_reader" | "local_voice";
  speechVoice: string | null;
  speechRate: number;
  onboardingSeen: boolean;
  /** Apply only strongly supported deterministic repairs automatically. */
  autoRepair: boolean;
  /** User-controlled pause for all repair work. */
  repairPaused: boolean;
}

export interface InferenceStatistics {
  ruleRepairs: number;
  onDeviceCalls: number;
  inCloudCalls: number;
}

export interface ActivityStats {
  repairsApplied: number;
  repairsUndone: number;
  recoveryMessages: number;
  inference: InferenceStatistics;
  /** Null until something has actually been recorded. */
  updatedAt: ISO8601 | null;
}

/** Per-origin authorisation. One record per explicitly enabled origin. */
export interface SiteAccess {
  origin: string;
  enabled: boolean;
  enabledAt: ISO8601 | null;
}

/** Read-only page facts reported by the content script. */
export interface PageSnapshot {
  documentId: string;
  url: string;
  origin: string;
  title: string;
  counts: {
    forms: number;
    fields: number;
    buttons: number;
    links: number;
  };
  at: ISO8601;
}

export type TabContextStatus =
  | "no-tab"
  | "restricted-url"
  | "permission-required"
  | "connecting"
  | "connected"
  | "error";

/** Everything the side panel needs to describe the current tab truthfully. */
export interface TabContext {
  tabId: number | null;
  url: string | null;
  origin: string | null;
  title: string | null;
  status: TabContextStatus;
  note: string | null;
  contentConnected: boolean;
  documentId: string | null;
  siteEnabled: boolean;
  hostPermissionGranted: boolean;
  pageSnapshot: PageSnapshot | null;
  updatedAt: ISO8601;
}

export interface KeyboardShortcut {
  name: string;
  description: string;
  shortcut: string;
}

export interface PanelState {
  context: TabContext;
  scan: TabScanState;
  settings: ExtensionSettings;
  /** Origins the user has enabled, alphabetically. Empty until consent exists. */
  enabledSites: SiteAccess[];
  activity: ActivityStats;
  repairs: AppliedRepair[];
  repair: RepairView;
  recovery: RecoveryView;
  shortcuts: KeyboardShortcut[];
  extensionVersion: string;
  /** True when a content script is registered for this origin. */
  contentScriptRegistered: boolean;
  checkedAt: ISO8601;
}
