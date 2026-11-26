import type { AttributeSnapshot, LiveTargetCheck, RepairApplyRequest, RepairUndoRequest } from "../../shared/repair";
import type { AppliedRepair } from "../../shared/types";
import { accessibleNameOf, isDisabledControl, isHidden, roleOf } from "../scanner/dom";

/**
 * DOM-side repair primitives. Every change is additive, attribute-scoped and
 * verified by recomputing the accessible name after applying it.
 */

export function resolveLocator(doc: Document, locator: string): Element | null {
  const segments = locator.split("::shadow");
  let root: ParentNode = doc.documentElement ?? doc;
  let current: Element | null = null;
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex] ?? "";
    const parts = segment.split(">").filter((part) => part.trim().length > 0);
    for (const raw of parts) {
      const part = raw.trim();
      const match = /^([a-z0-9-]+)(?::(nth-child|nth-of-type)\((\d+)\))?$/i.exec(part);
      if (!match) return null;
      const tag = (match[1] ?? "").toLowerCase();
      const indexKind = (match[2] ?? "nth-of-type").toLowerCase();
      const index = match[3] ? Number(match[3]) : 1;
      if (!Number.isInteger(index) || index < 1 || index > 10000) return null;
      if (root === doc.documentElement && tag === doc.documentElement.tagName.toLowerCase()) {
        current = doc.documentElement;
        root = current;
        continue;
      }
      const children =
        indexKind === "nth-of-type"
          ? Array.from(root.children).filter((child) => child.tagName.toLowerCase() === tag)
          : Array.from(root.children);
      const candidate = children[index - 1];
      if (candidate && indexKind === "nth-child" && candidate.tagName.toLowerCase() !== tag) return null;
      if (!candidate) return null;
      current = candidate;
      root = candidate;
    }
    if (segmentIndex < segments.length - 1) {
      const host = current as Element & { shadowRoot?: ShadowRoot | null };
      if (!host?.shadowRoot) return null;
      root = host.shadowRoot;
    }
  }
  return current;
}

export function captureAttribute(element: Element, name: "aria-label" | "aria-labelledby"): AttributeSnapshot {
  const present = element.hasAttribute(name);
  return { name, present, value: present ? element.getAttribute(name) : null };
}

export function captureLive(element: Element): LiveTargetCheck {
  return {
    found: true,
    tagName: element.tagName.toLowerCase(),
    role: roleOf(element) || null,
    accessibleName: accessibleNameOf(element),
    attributes: [captureAttribute(element, "aria-label"), captureAttribute(element, "aria-labelledby")],
    replaced: false,
  };
}

export function captureLiveFor(
  doc: Document,
  request: Pick<RepairApplyRequest, "locator" | "expectedTag">,
  expectedElement?: Element | null,
): { live: LiveTargetCheck; element: Element | null } {
  const element = resolveLocator(doc, request.locator);
  if (!element) {
    return {
      live: {
        found: false,
        tagName: null,
        role: null,
        accessibleName: "",
        attributes: [],
        replaced: false,
      },
      element: null,
    };
  }
  const live = captureLive(element);
  if (element.tagName.toLowerCase() !== request.expectedTag.toLowerCase()) {
    return { live: { ...live, replaced: true }, element };
  }
  if (expectedElement && expectedElement !== element) {
    return { live: { ...live, replaced: true }, element };
  }
  return { live, element };
}

function restoreAttributes(element: Element, snapshots: AttributeSnapshot[]): void {
  for (const snapshot of snapshots) {
    if (snapshot.present && snapshot.value !== null) element.setAttribute(snapshot.name, snapshot.value);
    else element.removeAttribute(snapshot.name);
  }
}

export interface ApplyOutcome {
  ok: boolean;
  verified: boolean;
  error: string | null;
  repair: AppliedRepair | null;
  accessibleNameBefore: string;
  accessibleNameAfter: string;
  conflict: boolean;
}

export function applyAccessibleName(
  element: Element,
  request: RepairApplyRequest,
  issueElement: AppliedRepair["elementRef"],
): ApplyOutcome {
  const before = accessibleNameOf(element);
  const snapshots = [
    captureAttribute(element, "aria-label"),
    captureAttribute(element, "aria-labelledby"),
  ];

  if (request.kind === "repair-reference") {
    return {
      ok: false,
      verified: false,
      error: "Relationship-only repairs are not applied automatically in this stage.",
      repair: null,
      accessibleNameBefore: before,
      accessibleNameAfter: before,
      conflict: false,
    };
  }

  if (request.target !== "aria-label") {
    return {
      ok: false,
      verified: false,
      error: "Only aria-label repairs are supported.",
      repair: null,
      accessibleNameBefore: before,
      accessibleNameAfter: before,
      conflict: false,
    };
  }

  if (before.trim().length > 0) {
    return {
      ok: false,
      verified: false,
      error: "The element already has an accessible name; ClearCue will not overwrite it.",
      repair: null,
      accessibleNameBefore: before,
      accessibleNameAfter: before,
      conflict: true,
    };
  }

  if (!element.isConnected || isHidden(element) || isDisabledControl(element)) {
    return {
      ok: false, verified: false, repair: null,
      error: "The control is hidden, disabled or disconnected.",
      accessibleNameBefore: before, accessibleNameAfter: before, conflict: true,
    };
  }
  element.setAttribute("aria-label", request.label);
  const after = accessibleNameOf(element);
  const verified = after.trim() === request.label.trim();
  if (!verified) {
    // Custom elements may synchronously react to attribute changes.
    if (element.getAttribute("aria-label") === request.label) restoreAttributes(element, snapshots.slice(0, 1));
    return {
      ok: false,
      verified: false,
      error: "The accessible name did not update as expected; the change was rolled back.",
      repair: null,
      accessibleNameBefore: before,
      accessibleNameAfter: accessibleNameOf(element),
      conflict: false,
    };
  }

  const repair: AppliedRepair = {
    id: crypto.randomUUID(),
    issueId: request.issueId,
    elementRef: issueElement,
    kind: "accessible-name",
    target: "aria-label",
    previousValue: snapshots[0]?.value ?? "",
    previousPresent: snapshots[0]?.present ?? false,
    newValue: request.label,
    appliedAt: new Date().toISOString(),
    undoneAt: null,
    accessibleNameBefore: before,
    accessibleNameAfter: after,
    source: request.proposedBy,
    explanation: request.explanation,
  };

  return {
    ok: true,
    verified: true,
    error: null,
    repair,
    accessibleNameBefore: before,
    accessibleNameAfter: after,
    conflict: false,
  };
}

export interface UndoOutcome {
  ok: boolean;
  conflict: boolean;
  error: string | null;
  restoredValue: string | null;
}

export function undoAccessibleName(element: Element, request: RepairUndoRequest): UndoOutcome {
  const current = element.getAttribute(request.target);
  if (current !== request.expectedCurrentValue) {
    return {
      ok: false,
      conflict: true,
      error: "The page changed this attribute after ClearCue applied its repair, so it was left untouched.",
      restoredValue: current,
    };
  }
  if (request.previousPresent && request.previousValue !== null) {
    element.setAttribute(request.target, request.previousValue);
  } else {
    element.removeAttribute(request.target);
  }
  const after = element.getAttribute(request.target);
  const expected = request.previousPresent ? request.previousValue : null;
  if (after !== expected) {
    return { ok: false, conflict: false, error: "The original value could not be restored.", restoredValue: after };
  }
  return { ok: true, conflict: false, error: null, restoredValue: after };
}
