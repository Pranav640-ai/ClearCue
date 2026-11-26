import type { ExtensionSettings } from "../shared/types";
import type { ScanCategory, ScannedIssue } from "../shared/scan";
import type { RepairProposal, RoutingReason } from "../shared/repair";
import type { AttributeSnapshot, LiveTargetCheck } from "../shared/repair";

/**
 * Evidence-based repair validation.
 *
 * Deterministic checks compare the proposal with the live page and the scan.
 * Heuristic checks (semantic overlap, generic wording, risk) are recorded
 * separately and are never presented as proof.
 */

export interface ValidationInput {
  issue: ScannedIssue;
  proposal: RepairProposal;
  live: LiveTargetCheck | null;
  currentDocumentId: string;
  expectedDocumentId: string;
  authorized: boolean;
  settings: ExtensionSettings;
  scanIssueIds: ReadonlySet<string>;
  /** Exact naming attributes the caller saw when it decided to apply. */
  expectedAttributes?: AttributeSnapshot[];
}

export interface ValidationResult {
  accepted: boolean;
  /** Final action after validation, never more permissive than the proposal. */
  action: RepairProposal["decision"];
  deterministicChecks: string[];
  heuristicNotes: string[];
  routing: RoutingReason[];
  reasons: string[];
}

const CATEGORY_ROLES: Record<ScanCategory, readonly string[]> = {
  "button-name": ["button", "switch", "tab", "menuitem", "checkbox", "radio", "option"],
  "icon-control-name": ["button", "link", "switch", "tab", "menuitem", "checkbox", "radio", "option"],
  "link-name": ["link"],
  "vague-link": ["link"],
  "form-control-name": ["textbox", "searchbox", "combobox", "listbox", "slider", "spinbutton", "checkbox", "radio"],
  "custom-control-name": ["switch", "tab", "checkbox", "radio", "option", "menuitem", "slider", "combobox", "button"],
  "broken-relationship": ["button", "link", "textbox", "searchbox", "combobox", "switch", "tab", "checkbox", "radio", "option"],
  "invalid-aria-reference": ["button", "link", "textbox", "searchbox", "combobox", "switch", "tab", "checkbox", "radio", "option"],
};

const GENERIC_LABELS = new Set([
  "button",
  "link",
  "click",
  "click here",
  "here",
  "more",
  "read more",
  "learn more",
  "icon",
  "image",
  "graphic",
  "control",
  "action",
  "item",
  "submit",
  "go",
  "open",
  "close",
  "this",
  "it",
  "untitled",
]);

const DESTRUCTIVE_TOKENS = [
  "delete",
  "remove",
  "erase",
  "destroy",
  "purchase",
  "buy",
  "pay",
  "checkout",
  "transfer",
  "send money",
  "withdraw",
  "cancel account",
  "deactivate",
  "unsubscribe",
  "logout",
  "log out",
  "sign out",
  "wipe",
  "reset",
  "revoke",
  "disable account",
];

const STOP_WORDS = new Set(["the", "a", "an", "for", "to", "of", "and", "or", "in", "on", "with", "this", "that", "your", "my", "please"]);

export function isGenericLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase().replace(/[.!:;]+$/g, "");
  return normalized.length < 3 || GENERIC_LABELS.has(normalized);
}

export function looksDestructive(issue: ScannedIssue): boolean {
  const haystack = [
    issue.accessibleName,
    issue.element.tagName,
    issue.element.role ?? "",
    ...issue.evidence.map((item) => item.value),
  ]
    .join(" ")
    .toLowerCase();
  return DESTRUCTIVE_TOKENS.some((token) => haystack.includes(token));
}

/** Role words that a screen reader already announces and must not be repeated. */
function repeatsRole(label: string, issue: ScannedIssue, tagName: string): boolean {
  const lower = label.trim().toLowerCase();
  const native = tagName.toLowerCase();
  if (native === "button" && /\bbutton\b/.test(lower)) return true;
  if (native === "a" && /\blink\b/.test(lower) && issue.category !== "vague-link") return true;
  return false;
}

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

function evidenceSupports(label: string, evidenceText: string, requireAll: boolean): boolean {
  const labelWords = words(label);
  if (labelWords.length === 0) return false;
  const evidenceWords = new Set(words(evidenceText));
  return requireAll ? labelWords.every((word) => evidenceWords.has(word)) : labelWords.some((word) => evidenceWords.has(word));
}

function normalized(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function snapshotMatches(live: LiveTargetCheck, expected: AttributeSnapshot[]): boolean {
  for (const item of expected) {
    const actual = live.attributes.find((attribute) => attribute.name === item.name);
    if (!actual) return false;
    if (actual.present !== item.present) return false;
    if ((actual.value ?? null) !== (item.value ?? null)) return false;
  }
  return true;
}

export function validateRepair(input: ValidationInput): ValidationResult {
  const deterministic: string[] = [];
  const heuristic: string[] = [];
  const routing: RoutingReason[] = [];
  const reasons: string[] = [];
  const { issue, proposal, live } = input;

  const fail = (reason: string, routingReason: RoutingReason): ValidationResult => {
    reasons.push(reason);
    if (!routing.includes(routingReason)) routing.push(routingReason);
    return { accepted: false, action: "abstain", deterministicChecks: deterministic, heuristicNotes: heuristic, routing, reasons };
  };

  if (input.currentDocumentId !== input.expectedDocumentId) {
    return fail("The page changed after the issue was scanned.", "stale-target");
  }
  deterministic.push("Document id matches the active page.");
  if (!input.authorized) return fail("The site is no longer authorized.", "stale-target");
  deterministic.push("Site authorization is still granted.");
  if (!input.scanIssueIds.has(issue.id)) return fail("The issue is no longer in the current scan.", "stale-target");
  deterministic.push("The issue still exists in the current scan.");

  if (!live || !live.found) return fail("The target element no longer exists.", "stale-target");
  deterministic.push("The target element was resolved live.");
  if (live.replaced) return fail("The target element was replaced by another element.", "stale-target");
  deterministic.push("The target is the same element instance, not a replacement.");
  if ((live.tagName ?? "").toLowerCase() !== issue.element.tagName.toLowerCase()) {
    return fail("The target tag no longer matches the scanned element.", "stale-target");
  }
  deterministic.push("Tag name is unchanged.");

  const role = (live.role ?? issue.element.role ?? "").toLowerCase();
  if (role && !CATEGORY_ROLES[issue.category].includes(role)) {
    return fail(`Role ${role} is not compatible with a ${issue.category} repair.`, "unsafe-action");
  }
  deterministic.push("Element role is compatible with this repair.");

  if (live.accessibleName.trim().length > 0 && issue.category !== "vague-link") {
    deterministic.push("An existing accessible name is present and will not be overwritten.");
    return fail("The element now has a valid accessible name.", "stale-target");
  }

  // The panel sends the exact attributes from its scan decision; a page that
  // rewrote them independently must not be overwritten.
  if (input.expectedAttributes && input.expectedAttributes.length > 0) {
    if (!snapshotMatches(live, input.expectedAttributes)) {
      return fail("The naming attributes changed after the proposal was validated.", "stale-target");
    }
    deterministic.push("Naming attributes are unchanged since validation.");
  }

  // Safety first: no proposal may rename a destructive or consequential control,
  // regardless of how well the evidence supports a label.
  if (looksDestructive(issue)) {
    heuristic.push("The control looks destructive or consequential.");
    return fail("ClearCue does not rename destructive, financial or security-sensitive controls.", "unsafe-action");
  }

  const label = (proposal.label ?? "").trim().replace(/\s+/g, " ");
  if (proposal.decision === "abstain" || label.length === 0) {
    reasons.push(proposal.explanation || "The model abstained.");
    return { accepted: true, action: "abstain", deterministicChecks: deterministic, heuristicNotes: heuristic, routing, reasons };
  }
  const cited = issue.evidence.filter((item) => item.privacy !== "prohibited" && proposal.evidenceIds.includes(item.id));
  if (cited.length === 0 || cited.length !== new Set(proposal.evidenceIds).size) {
    return fail("The proposal must cite evidence allowed for this issue.", "insufficient-evidence");
  }
  deterministic.push("Every cited evidence id exists in the issue.");
  deterministic.push("A non-empty label was supplied.");

  if (DESTRUCTIVE_TOKENS.some((token) => label.toLowerCase().includes(token))) {
    return fail("The proposed label describes a consequential action.", "unsafe-action");
  }
  if (label.length > 60) return fail("The label is longer than 60 characters.", "insufficient-evidence");
  if (/[\u0000-\u001f\u007f<>\u202a-\u202e\u2066-\u2069]/.test(proposal.label ?? "")) return fail("The label contains markup or line breaks.", "unsafe-action");
  deterministic.push("Label length and characters are within limits.");

  if (isGenericLabel(label)) return fail("The label is generic and does not describe this control.", "insufficient-evidence");
  if (repeatsRole(label, issue, live.tagName ?? issue.element.tagName)) {
    return fail("The label repeats the role the screen reader already announces.", "insufficient-evidence");
  }
  deterministic.push("Label is specific and does not repeat the announced role.");

  if (issue.category === "vague-link") {
    const visible = issue.accessibleName.trim();
    if (visible.length > 0 && !normalized(label).includes(normalized(visible))) {
      return fail("The repaired link name no longer contains its visible text.", "insufficient-evidence");
    }
    deterministic.push("Repaired link name preserves the visible text.");
  }

  if (normalized(label) === normalized(live.accessibleName) && live.accessibleName.length > 0 && issue.category !== "vague-link") {
    return fail("The label would not change the accessible name.", "insufficient-evidence");
  }

  heuristic.push("No destructive or financial signal was found.");

  if (proposal.source === "in_cloud" && (input.settings.privacyMode !== "cloud_allowed" || input.settings.cloudOptInAt === null)) {
    return fail("Cloud results cannot be used while cloud inference is off.", "cloud-disabled-by-user");
  }
  deterministic.push("The inference source is permitted by current settings.");

  if (proposal.risk === "high") return fail("The model rated this repair high risk.", "unsafe-action");
  if (proposal.ambiguity === "high") return fail("The evidence is highly ambiguous.", "conflicting-evidence");
  if (proposal.ambiguity === "medium" || proposal.risk === "medium") {
    heuristic.push("Ambiguity or risk is medium; the proposal needs review.");
    if (proposal.decision === "apply") {
      return {
        accepted: true,
        action: "suggest",
        deterministicChecks: deterministic,
        heuristicNotes: heuristic,
        routing: [...routing, "conflicting-evidence"],
        reasons: [...reasons, "Validated but ambiguous: user review is required."],
      };
    }
  }

  const modelEvidence = cited.filter((item) =>
    (item.kind === "icon" && !item.value.startsWith("graphic-only")) ||
    ["label", "nearby-text", "heading", "link-destination", "accessible-name"].includes(item.kind) ||
    item.id === "ev:placeholder");
  const supported = evidenceSupports(
    label,
    (proposal.source === "rule" ? issue.evidence : modelEvidence).map((item) => item.value).join(" "),
    proposal.source !== "rule",
  );
  if (!supported) {
    if (proposal.visual) return fail("The icon needs corroborating textual evidence.", "insufficient-evidence");
    heuristic.push("The label uses words not found in the cited evidence.");
    if (proposal.decision === "apply") {
      return {
        accepted: true,
        action: "suggest",
        deterministicChecks: deterministic,
        heuristicNotes: heuristic,
        routing: [...routing, "local-evidence-insufficient"],
        reasons: [...reasons, "The label is not clearly supported by the evidence; review it before applying."],
      };
    }
  } else {
    heuristic.push("The label shares meaningful words with the evidence.");
  }

  // Independent proposals are compared by the caller; a single low-risk proposal
  // may apply only when deterministic checks pass and the model did not abstain.
  return {
    accepted: true,
    action: proposal.decision === "apply" ? "apply" : "suggest",
    deterministicChecks: deterministic,
    heuristicNotes: heuristic,
    routing,
    reasons,
  };
}

/** Build the exact attribute snapshot used in validation and rollback. */
export function snapshotOf(live: LiveTargetCheck): AttributeSnapshot[] {
  return live.attributes.filter((attribute) => attribute.name === "aria-label" || attribute.name === "aria-labelledby");
}

export const snapshotsFromLive = snapshotOf;
