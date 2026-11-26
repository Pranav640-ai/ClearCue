import type { ScannedIssue, ScanCategory, ScanEvidence } from "../../shared/scan";
import type { ElementReference } from "../../shared/types";
import { buildCandidates } from "./candidates";
import {
  associatedLabelTexts,
  hasGraphicContent,
  iconHint,
  isButtonLike,
  isDestructiveAction,
  isHidden,
  isLinkLike,
  isNativeFormControl,
  nearbyHeading,
  nearbyText,
  normalizeName,
  roleOf,
  sanitizedDestination,
  textOfNode,
  type CollectedElement,
} from "./dom";
import { buildEvidence } from "./evidence";

/**
 * Deterministic detection rules.
 *
 * The rules use only standard accessible-name computation and authored
 * metadata. They never look for `data-defect`, demo ids, class names or any
 * playground-specific marker.
 */

const VAGUE_LINK_NAMES = new Set([
  "here",
  "click here",
  "more",
  "read more",
  "learn more",
  "details",
  "this",
  "link",
  "continue",
  "go",
  "see more",
  "view more",
  "click",
  "this link",
  "this page",
]);

export interface RuleContext {
  /** Number of elements carrying each id, across the document and open shadow roots. */
  idCounts: ReadonlyMap<string, number>;
  documentId: string;
  /** Full-scan index of `label[for]` text; omitted for incremental scans. */
  labelTextsById?: ReadonlyMap<string, string[]>;
}

function referencedIds(element: Element): string[] {
  const raw = element.getAttribute("aria-labelledby");
  if (!raw) return [];
  return Array.from(new Set(raw.trim().split(/\s+/).filter(Boolean)));
}

function labelTargetIds(element: Element): string[] {
  const target = element.getAttribute("for");
  return target ? [target] : [];
}

function referenceStatus(ids: string[], idCounts: ReadonlyMap<string, number>) {
  const missing = ids.filter((id) => (idCounts.get(id) ?? 0) === 0);
  const duplicates = ids.filter((id) => (idCounts.get(id) ?? 0) > 1);
  const valid = ids.filter((id) => (idCounts.get(id) ?? 0) === 1);
  return { missing, duplicates, valid };
}

function issue(
  category: ScanCategory,
  path: string,
  ruleId: string,
  severity: ScannedIssue["severity"],
  element: Element,
  accessibleName: string,
  evidence: ScanEvidence[],
  candidates: ScannedIssue["candidates"],
  needsReasoning: boolean,
  detectedAt: string,
  knownRole = "",
): ScannedIssue {
  const role = (knownRole || roleOf(element)) || undefined;
  const reference: ElementReference = {
    ref: path,
    tagName: element.tagName.toLowerCase(),
    ...(role ? { role } : {}),
    locator: path,
  };
  return {
    id: `${category}:${path}`,
    category,
    severity,
    ruleId,
    element: reference,
    accessibleName,
    evidence,
    candidates,
    needsReasoning,
    status: "open",
    detectedAt,
  };
}

interface BaseFacts {
  element: Element;
  entry: CollectedElement;
  category: ScanCategory;
  labelTexts: string[];
  missingRefIds: string[];
  validRefIds: string[];
  duplicateRefIds: string[];
  conflicts: string[];
  dangerous: boolean;
}

function finish(base: BaseFacts, ruleId: string, severity: ScannedIssue["severity"], detectedAt: string): ScannedIssue {
  const { element, entry, category } = base;
  const evidence = buildEvidence({
    element,
    category,
    role: entry.role,
    accessibleName: entry.name,
    labelTexts: base.labelTexts,
    missingRefIds: base.missingRefIds,
    referencedIds: [...base.validRefIds, ...base.missingRefIds, ...base.duplicateRefIds],
    duplicateRefIds: base.duplicateRefIds,
    disabled: entry.disabled,
    conflicts: base.conflicts,
  });
  const candidates = buildCandidates({
    element,
    category,
    role: entry.role,
    accessibleName: entry.name,
    labelTexts: base.labelTexts,
    validRefIds: base.validRefIds,
    missingRefIds: base.missingRefIds,
    duplicateRefIds: base.duplicateRefIds,
    icon: iconHint(element),
    destination: sanitizedDestination(element),
    dangerous: base.dangerous,
    conflicts: base.conflicts,
  });
  const needsReasoning = candidates.length === 0 || base.conflicts.length > 0;
  return issue(
    category,
    entry.path,
    ruleId,
    severity,
    element,
    entry.name,
    evidence,
    candidates,
    needsReasoning,
    detectedAt,
    entry.role,
  );
}

export function detectIssues(entry: CollectedElement, context: RuleContext): ScannedIssue[] {
  const { element, name } = entry;
  if (entry.hidden || !element.isConnected) return [];

  const detectedAt = new Date().toISOString();
  const issues: ScannedIssue[] = [];

  const isLabel = entry.tag === "label";
  const labelTexts = isLabel ? [] : associatedLabelTexts(element, context.labelTextsById);
  const references = referencedIds(element);
  const status = referenceStatus(references, context.idCounts);

  const base: BaseFacts = {
    element,
    entry,
    category: "button-name",
    labelTexts,
    missingRefIds: status.missing,
    validRefIds: status.valid,
    duplicateRefIds: status.duplicates,
    conflicts: [],
    dangerous: isDestructiveAction(element, name),
  };

  if (status.duplicates.length > 0) {
    base.conflicts.push("More than one element carries a referenced id, so the name is ambiguous.");
  }
  if (labelTexts.length > 1) {
    base.conflicts.push("Several associated labels provide different text.");
  }

  if (isLabel) {
    const targetIds = labelTargetIds(element);
    const missing = targetIds.filter((id) => (context.idCounts.get(id) ?? 0) === 0);
    const duplicates = targetIds.filter((id) => (context.idCounts.get(id) ?? 0) > 1);
    if (missing.length > 0 || duplicates.length > 0) {
      const brokenBase: BaseFacts = {
        ...base,
        category: "broken-relationship",
        conflicts: [
          ...base.conflicts,
          ...(missing.length > 0 ? [`label[for] points to a missing id: ${missing.join(", ")}`] : []),
          ...(duplicates.length > 0 ? [`label[for] points to a duplicated id: ${duplicates.join(", ")}`] : []),
        ],
      };
      brokenBase.missingRefIds = missing;
      issues.push(finish(brokenBase, missing.length > 0 ? "label.for.missing" : "label.for.duplicate", "heuristic", detectedAt));
    }
    return issues;
  }

  if (status.missing.length > 0) {
    const invalidBase: BaseFacts = { ...base, category: "invalid-aria-reference" };
    issues.push(
      finish(invalidBase, "aria.labelledby.invalid", name === "" ? "failure" : "heuristic", detectedAt),
    );
    // The broken reference is the actionable defect; do not also report the
    // same element as an unnamed control.
    if (name === "") return issues;
  }

  if (status.duplicates.length > 0 && references.length > 0) {
    issues.push(
      finish(
        { ...base, category: "broken-relationship" },
        "aria.labelledby.duplicate",
        name === "" ? "failure" : "heuristic",
        detectedAt,
      ),
    );
    if (name === "") return issues;
  }

  if (references.length > 0 && name === "" && status.missing.length === 0 && status.duplicates.length === 0) {
    const emptyBase: BaseFacts = { ...base, category: "broken-relationship" };
    emptyBase.conflicts = [...emptyBase.conflicts];
    issues.push(finish(emptyBase, "aria.labelledby.empty", "failure", detectedAt));
    return issues;
  }

  if (name === "") {
    if (isNativeFormControl(element)) {
      const type = (element.getAttribute("type") ?? "text").toLowerCase();
      const buttonType = ["button", "submit", "reset", "image"].includes(type);
      const category: ScanCategory = buttonType ? (hasGraphicContent(element) ? "icon-control-name" : "button-name") : "form-control-name";
      const ruleId = buttonType ? "name.button.empty" : "name.form.empty";
      issues.push(finish({ ...base, category }, ruleId, "failure", detectedAt));
      return issues;
    }

    if (isLinkLike(element, entry.role)) {
      issues.push(finish({ ...base, category: "link-name" }, "name.link.empty", "failure", detectedAt));
      return issues;
    }

    if (isButtonLike(element, entry.role)) {
      const iconOnly = hasGraphicContent(element) && textOfNode(element) === "";
      const category: ScanCategory = iconOnly ? "icon-control-name" : "button-name";
      issues.push(
        finish(
          { ...base, category },
          iconOnly ? "name.icon.empty" : "name.button.empty",
          "failure",
          detectedAt,
        ),
      );
      return issues;
    }

    if (entry.role && entry.role !== "label") {
      const iconOnly = hasGraphicContent(element) && textOfNode(element) === "";
      issues.push(
        finish(
          { ...base, category: iconOnly ? "icon-control-name" : "custom-control-name" },
          iconOnly ? "name.icon.empty" : "name.custom.empty",
          "failure",
          detectedAt,
        ),
      );
      return issues;
    }

    return issues;
  }

  // A name exists. Only conservative usability heuristics apply from here.
  if (isLinkLike(element, entry.role) && normalizeName(name).length > 0) {
    const normalized = normalizeName(name);
    const explicitContext =
      element.hasAttribute("aria-describedby") ||
      element.hasAttribute("title") ||
      (element.getAttribute("aria-label") ?? "").trim() !== "";
    const destination = sanitizedDestination(element);
    const contextAvailable =
      Boolean(nearbyHeading(element)) ||
      Boolean(nearbyText(element)) ||
      Boolean(destination && destination.slug.length >= 3);
    if (VAGUE_LINK_NAMES.has(normalized) && name.length <= 24 && !explicitContext && contextAvailable) {
      issues.push(finish({ ...base, category: "vague-link" }, "link.vague", "heuristic", detectedAt));
    }
  }

  return issues;
}

/** Local guard so a hidden or removed element can never be scanned. */
export function isScannable(element: Element): boolean {
  return element.isConnected && !isHidden(element);
}
