import type { AnnouncementMechanism, RecoveryCategory, RecoveryEvent, RecoveryEvidence, RecoverySeverity } from "../../shared/recovery";
import {
  isUrgentRecovery,
  normalizeRecoveryText,
  RECOVERY_EVENT_TTL_MS,
  recoveryDedupeKey,
} from "../../shared/recovery";
import { redactSensitiveText } from "../../shared/privacy";
import type { ISO8601 } from "../../shared/types";
import { accessibleNameOf, buildPath, roleOf, textOfNode } from "../scanner/dom";
import type { TrackedInteraction } from "./interactions";

const MAX_MESSAGE_LENGTH = 300;
const TEXT_TAGS = new Set(["p", "div", "span", "li", "output", "strong", "em", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article"]);
const MESSAGE_TOKENS = /(error|alert|status|message|notice|feedback|success|confirm|toast|validation|summary|result|saved|warning)/i;
const OUTCOME_START =
  /^(there is a problem|error|please|enter|you must|invalid|failed|could not|couldn't|unable|sorry|thank you|success|saved|added|confirmed|submitted|updated|complete|changes saved)/i;
const INTERACTIVE = "button, a[href], input, select, textarea, [role='button'], [role='link'], [role='switch'], [role='checkbox']";

export interface RecoveryTarget {
  locator: string;
  tagName: string;
  role: string | null;
  name: string;
  documentId: string;
}

export interface MessageClassification {
  category: RecoveryCategory;
  severity: RecoverySeverity;
}

export interface Association {
  target: RecoveryTarget | null;
  confidence: "direct" | "inferred" | "none";
  reason: string;
}

export interface DetectionContext {
  documentId: string;
  pageUrl: string;
  interaction: TrackedInteraction | null;
  now?: number;
  makeId?: () => string;
}

function makeDefaultId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `recovery-${Math.random().toString(36).slice(2)}`;
}

function isOwned(element: Element): boolean {
  return Boolean(element.closest("[data-clearcue-owned]"));
}

/**
 * Visual visibility, not accessibility visibility. An aria-hidden toast is
 * exactly the kind of visually communicated outcome ClearCue must recover, so
 * aria-hidden must not hide it from detection.
 */
export function isVisuallyHidden(element: Element): boolean {
  if (!element.isConnected) return true;
  if (element.closest("[hidden]")) return true;
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  const styles = [element, ...Array.from(element.parentElement ? [element.parentElement] : [])];
  for (const item of styles) {
    const style = view.getComputedStyle(item);
    if (style.display === "none" || style.visibility === "hidden") return true;
  }
  return false;
}

function className(el: Element): string {
  return typeof el.className === "string" ? el.className : el.getAttribute("class") ?? "";
}

function isSemanticMessageElement(element: Element): boolean {
  if (element.matches("[role='alert'], [role='status'], [role='log']")) return true;
  const live = (element.getAttribute("aria-live") ?? "").toLowerCase();
  return live === "polite" || live === "assertive";
}

export function messageLooksRelevant(element: Element, text: string): boolean {
  if (!TEXT_TAGS.has(element.tagName.toLowerCase())) return false;
  if (text.length < 3 || text.length > MAX_MESSAGE_LENGTH) return false;
  if (element.querySelectorAll(INTERACTIVE).length > 4) return false;
  if (element.querySelector("form, main, nav, table")) return false;
  if (isSemanticMessageElement(element)) return true;
  if (MESSAGE_TOKENS.test(`${element.id} ${className(element)}`)) return true;
  return OUTCOME_START.test(text) && text.length <= 240;
}

export function detectAnnouncementMechanism(element: Element): AnnouncementMechanism {
  let current: Element | null = element;
  for (let depth = 0; current && depth < 7; depth += 1) {
    const role = (current.getAttribute("role") ?? "").toLowerCase();
    const live = (current.getAttribute("aria-live") ?? "").toLowerCase();
    if (live === "off" || current.closest("[aria-hidden='true'], [inert]")) return "none";
    if (live === "assertive") return "aria-live-assertive";
    if (live === "polite") return "aria-live-polite";
    if (role === "alert") return "role-alert";
    if (role === "status" || role === "log") return "role-status";
    if (role === "dialog" || current.tagName.toLowerCase() === "dialog") {
      if (current.contains(element.ownerDocument.activeElement)) return "dialog-focus";
    }
    current = current.parentElement;
  }
  return "none";
}

function fieldName(field: Element): string {
  const name = accessibleNameOf(field).trim();
  if (name) return name.slice(0, 120);
  const placeholder = field.getAttribute("placeholder") ?? "";
  return normalizeRecoveryText(placeholder || field.getAttribute("name") || field.tagName.toLowerCase(), 120);
}

function targetFor(field: Element, documentId: string): RecoveryTarget {
  return {
    locator: buildPath(field),
    tagName: field.tagName.toLowerCase(),
    role: roleOf(field) || null,
    name: redactSensitiveText(fieldName(field), 120),
    documentId,
  };
}

function textForIds(doc: Document, ids: string[]): string {
  const parts: string[] = [];
  for (const id of ids) {
    const ref = doc.getElementById(id);
    if (ref && !isVisuallyHidden(ref)) {
      const text = normalizeRecoveryText(textOfNode(ref, 300));
      if (text) parts.push(text);
    }
  }
  return normalizeRecoveryText(Array.from(new Set(parts)).join(" "));
}

function errorTextForField(field: Element): string {
  const doc = field.ownerDocument;
  const ids = `${field.getAttribute("aria-errormessage") ?? ""} ${field.getAttribute("aria-describedby") ?? ""}`
    .split(/\s+/)
    .filter(Boolean);
  const described = textForIds(doc, ids);
  if (described) return described;
  return "";
}

/**
 * Associate a message with a field only when the DOM provides an explicit
 * reference or a single unambiguous grouping. Multiple possible fields yield
 * no association rather than a guess.
 */
export function associateRecoveryTarget(
  doc: Document,
  messageElement: Element,
  documentId: string,
  preferInvalid = false,
): Association {
  const messageId = messageElement.id;
  if (messageId) {
    const referenced = Array.from(
      doc.querySelectorAll(
        `[aria-errormessage~="${cssEscape(messageId)}"], [aria-describedby~="${cssEscape(messageId)}"]`,
      ),
    ).filter((element) => element.matches("input, select, textarea, [contenteditable='true']"));
    if (referenced.length === 1 && referenced[0]) {
      return { target: targetFor(referenced[0], documentId), confidence: "direct", reason: "The field explicitly references this message." };
    }
    if (referenced.length > 1) {
      return { target: null, confidence: "none", reason: "Several fields reference this message, so the field cannot be chosen safely." };
    }
  }

  const group = messageElement.closest("label, .field-row, .form-group, fieldset, [role='group'], li");
  if (group) {
    const controls = Array.from(group.querySelectorAll("input, select, textarea, [contenteditable='true']"));
    if (controls.length === 1 && controls[0] && !isVisuallyHidden(controls[0])) {
      return { target: targetFor(controls[0], documentId), confidence: "inferred", reason: "The message and control share a field group." };
    }
  }

  if (preferInvalid) {
    // Never import an invalid field from another form on the page.
    const scope: ParentNode = messageElement.closest("form") ?? doc;
    const invalid = Array.from(
      scope.querySelectorAll("[aria-invalid='true'], input:invalid, select:invalid, textarea:invalid"),
    ).filter((element) => !isVisuallyHidden(element));
    if (invalid.length === 1 && invalid[0]) {
      return { target: targetFor(invalid[0], documentId), confidence: "inferred", reason: "Only one invalid field is present on the page." };
    }
    if (invalid.length > 1) {
      return { target: null, confidence: "none", reason: "Several fields could be responsible, so no field is selected." };
    }
  }
  return { target: null, confidence: "none", reason: "No reliable field relationship was found." };
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

export function classifyRecoveryMessage(text: string, options: { semantic?: boolean; errorSummary?: boolean } = {}): MessageClassification {
  const normalized = normalizeRecoveryText(text);
  if (options.errorSummary) return { category: "error-summary", severity: "error" };
  if (/\b(failed|failure|could not|couldn't|unable to|try again|went wrong|not saved|not submitted|service unavailable)\b/i.test(normalized)) {
    return { category: "operation-failure", severity: "error" };
  }
  if (/\b(error|invalid|required|please enter|must enter|enter your|incorrect|missing|there is a problem|check the|check your)\b/i.test(normalized)) {
    return { category: "validation-error", severity: /error|invalid|incorrect/i.test(normalized) ? "error" : "warning" };
  }
  if (/\b(thank you|success|successfully|submitted|saved|added|confirmed|complete|completed|has been sent|we received|updated|ready)\b/i.test(normalized)) {
    return { category: "success-confirmation", severity: "success" };
  }
  if (options.semantic) return { category: "status-update", severity: "info" };
  return { category: "uncertain-outcome", severity: "info" };
}

export function looksLikeErrorSummary(element: Element, text: string): boolean {
  if (!/(error|problem|invalid|attention|check)/i.test(`${element.id} ${className(element)} ${text}`)) return false;
  const messages = Array.from(element.querySelectorAll("li, p")).filter((item) => normalizeRecoveryText(item.textContent ?? "").length > 2);
  const errorSentences = (text.match(/(?:enter|please|must|invalid|required|error|missing)[^.!?]*[.!?]/gi) ?? []).length;
  return messages.length >= 2 || errorSentences >= 2;
}

function evidenceFor(element: Element, text: string, kind: RecoveryEvidence["kind"]): RecoveryEvidence[] {
  const evidence: RecoveryEvidence[] = [
    { id: "ev:message", kind: "message-text", value: normalizeRecoveryText(text, 300), privacy: "local-only" },
  ];
  if (kind === "newly-displayed" || kind === "text-change") {
    evidence.push({ id: "ev:display", kind, value: kind === "newly-displayed" ? "The message became visible after an interaction." : "The visible text changed.", privacy: "local-only" });
  }
  if (isSemanticMessageElement(element)) {
    evidence.push({
      id: "ev:semantics",
      kind: "role-or-live-region",
      value: `${element.getAttribute("role") ?? "aria-live"}=${element.getAttribute("role") ? element.getAttribute("role") : element.getAttribute("aria-live")}`,
      privacy: "local-only",
    });
  }
  return evidence;
}

function eventFor(input: {
  context: DetectionContext;
  category: RecoveryCategory;
  severity: RecoverySeverity;
  message: string;
  evidence: RecoveryEvidence[];
  related: RecoveryTarget | null;
  association: Association["confidence"];
  mechanism: AnnouncementMechanism;
  kind: "newly-displayed" | "text-change" | "attribute-change";
}): RecoveryEvent {
  const now = input.context.now ?? Date.now();
  const id = (input.context.makeId ?? makeDefaultId)();
  const message = redactSensitiveText(normalizeRecoveryText(input.message, MAX_MESSAGE_LENGTH), MAX_MESSAGE_LENGTH);
  const actions: RecoveryEvent["actions"] = ["replay", "dismiss"];
  if (input.related) actions.unshift("jump");
  return {
    id,
    interactionId: input.context.interaction?.id ?? null,
    documentId: input.context.documentId,
    pageUrl: input.context.pageUrl,
    category: input.category,
    severity: input.severity,
    message,
    evidence: [
      ...input.evidence.map((item) => ({ ...item, value: redactSensitiveText(item.value, 280) })),
      { id: "ev:association", kind: "error-reference" as const, value: input.association === "none" ? "No field association." : input.association, privacy: "local-only" as const },
    ].slice(0, 8),
    related: input.related,
    association: input.association,
    existingAnnouncement: input.mechanism,
    announcementStatus: input.mechanism === "none" ? "pending" : "announced-by-page",
    actions,
    observedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + RECOVERY_EVENT_TTL_MS).toISOString(),
    dedupeKey: recoveryDedupeKey({ category: input.category, message, relatedLocator: input.related?.locator ?? null }),
    dismissedAt: null,
    replayCount: 0,
    source: "observed",
  };
}

function closestMessageContainer(element: Element): Element {
  return (
    element.closest("[role='alert'], [role='status'], [aria-live], [id*='error' i], [id*='message' i], [id*='status' i], [class*='error' i], [class*='toast' i], [class*='message' i], [class*='notice' i]") ??
    element
  );
}

function withoutCrossFormCorrelation(context: DetectionContext, outcome: Element): DetectionContext {
  const target = context.interaction?.element;
  const outcomeForm = outcome.closest("form");
  const triggerForm = target && ((target as HTMLInputElement).form ?? target.closest("form"));
  return outcomeForm && triggerForm && outcomeForm !== triggerForm ? { ...context, interaction: null } : context;
}

function candidateFromNode(context: DetectionContext, element: Element, kind: "newly-displayed" | "text-change"): RecoveryEvent | null {
  if (isOwned(element) || isVisuallyHidden(element)) return null;
  const candidate = closestMessageContainer(element);
  if (isOwned(candidate) || isVisuallyHidden(candidate)) return null;
  if (candidate.tagName.toLowerCase() === "body" || candidate.tagName.toLowerCase() === "html") return null;
  const text = normalizeRecoveryText(textOfNode(candidate, MAX_MESSAGE_LENGTH));
  if (!messageLooksRelevant(candidate, text)) return null;
  const summary = looksLikeErrorSummary(candidate, text);
  const classified = classifyRecoveryMessage(text, {
    semantic: isSemanticMessageElement(candidate),
    errorSummary: summary,
  });
  if (classified.category === "uncertain-outcome" && !isSemanticMessageElement(candidate)) return null;
  // A page-wide toast must never inherit an unrelated invalid field.
  const formScopedError = classified.category === "validation-error" || classified.category === "error-summary";
  const association = associateRecoveryTarget(
    candidate.ownerDocument,
    candidate,
    context.documentId,
    formScopedError && candidate.closest("form") !== null,
  );
  return eventFor({
    context: withoutCrossFormCorrelation(context, candidate),
    category: classified.category,
    severity: classified.severity,
    message: text,
    evidence: evidenceFor(candidate, text, kind),
    related: association.target,
    association: association.confidence,
    mechanism: detectAnnouncementMechanism(candidate),
    kind,
  });
}

function fieldFromInvalid(context: DetectionContext, field: Element): RecoveryEvent | null {
  if (isOwned(field) || isVisuallyHidden(field)) return null;
  const text = errorTextForField(field) || "This field is marked invalid.";
  const related = targetFor(field, context.documentId);
  return eventFor({
    context: withoutCrossFormCorrelation(context, field),
    category: "validation-error",
    severity: "error",
    message: text,
    evidence: [
      { id: "ev:invalid", kind: "aria-invalid", value: "The field became invalid.", privacy: "local-only" },
      { id: "ev:message", kind: "message-text", value: text, privacy: "local-only" },
    ],
    related,
    association: "direct",
    mechanism: "none",
    kind: "attribute-change",
  });
}

function expandedEvent(context: DetectionContext, element: Element): RecoveryEvent | null {
  if (isOwned(element) || isVisuallyHidden(element)) return null;
  const name = accessibleNameOf(element).trim() || normalizeRecoveryText(textOfNode(element, 120)) || element.tagName.toLowerCase();
  const controls = element.getAttribute("aria-controls");
  let detail = "";
  if (controls) {
    const region = element.ownerDocument.getElementById(controls);
    if (region && !isVisuallyHidden(region)) detail = normalizeRecoveryText(textOfNode(region, 180));
  }
  return eventFor({
    context,
    category: "menu-expanded",
    severity: "info",
    message: `${name} expanded${detail ? `: ${detail}` : "."}`,
    evidence: [
      { id: "ev:expanded", kind: "attribute-change", value: "aria-expanded changed to true.", privacy: "local-only" },
      { id: "ev:message", kind: "message-text", value: name, privacy: "local-only" },
    ],
    related: targetFor(element, context.documentId),
    association: "direct",
    mechanism: detectAnnouncementMechanism(element),
    kind: "attribute-change",
  });
}

function busyCompletedEvent(context: DetectionContext, element: Element): RecoveryEvent | null {
  if (isOwned(element) || isVisuallyHidden(element)) return null;
  return eventFor({
    context,
    category: "loading-completed",
    severity: "info",
    message: "Loading finished.",
    evidence: [
      { id: "ev:busy", kind: "busy-to-idle", value: "aria-busy changed from true to false.", privacy: "local-only" },
    ],
    related: null,
    association: "none",
    mechanism: "none",
    kind: "attribute-change",
  });
}

function dialogEvent(context: DetectionContext, element: Element): RecoveryEvent | null {
  if (isOwned(element) || isVisuallyHidden(element)) return null;
  const labelledBy = (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  const labelText = labelledBy.map((id) => textForIds(element.ownerDocument, [id])).find(Boolean) ?? "";
  const heading = element.querySelector("h1, h2, h3");
  const name = normalizeRecoveryText(labelText || (element.getAttribute("aria-label") ?? "") || (heading ? textOfNode(heading, 140) : ""));
  return eventFor({
    context,
    category: "dialog-opened",
    severity: "info",
    message: name ? `Dialog opened: ${name}` : "A dialog opened.",
    evidence: [{ id: "ev:dialog", kind: "dialog", value: "A dialog became visible.", privacy: "local-only" }],
    related: null,
    association: "none",
    mechanism: detectAnnouncementMechanism(element),
    kind: "newly-displayed",
  });
}

function isDialog(element: Element): boolean {
  return element.tagName.toLowerCase() === "dialog" || (element.getAttribute("role") ?? "").toLowerCase() === "dialog";
}

export function detectRecoveryOutcomes(_doc: Document, records: readonly MutationRecord[], context: DetectionContext): RecoveryEvent[] {
  const events: RecoveryEvent[] = [];
  const seen = new Set<Element>();

  const add = (event: RecoveryEvent | null): void => {
    if (event && !events.some((item) => item.dedupeKey === event.dedupeKey)) events.push(event);
  };

  const consider = (element: Element | null, kind: "newly-displayed" | "text-change" = "newly-displayed"): void => {
    if (!element || seen.has(element)) return;
    seen.add(element);
    if (isDialog(element)) add(dialogEvent(context, element));
    else add(candidateFromNode(context, element, kind));
  };

  for (const record of records) {
    if (record.type === "childList") {
      for (const node of Array.from(record.addedNodes)) {
        if (node.nodeType === 1) {
          const element = node as Element;
          consider(element);
          for (const child of Array.from(element.querySelectorAll("[role='alert'], [role='status'], [aria-live], [role='dialog'], dialog[open]"))) {
            consider(child);
          }
        } else if (node.nodeType === 3 && node.parentElement) {
          consider(node.parentElement);
        }
      }
      continue;
    }
    if (record.type === "characterData") {
      consider(record.target.parentElement, "text-change");
      continue;
    }
    if (record.type !== "attributes" || !(record.target instanceof Element)) continue;
    const element = record.target;
    if (isOwned(element)) continue;

    if (record.attributeName === "aria-invalid" && element.getAttribute("aria-invalid") === "true") {
      add(fieldFromInvalid(context, element));
    } else if (record.attributeName === "aria-expanded" && element.getAttribute("aria-expanded") === "true") {
      add(expandedEvent(context, element));
    } else if (record.attributeName === "aria-busy" && element.getAttribute("aria-busy") !== "true" && record.oldValue === "true") {
      add(busyCompletedEvent(context, element));
    } else if (record.attributeName === "hidden" || record.attributeName === "style" ||
      (record.attributeName === "open" && element.tagName === "DIALOG" && element.hasAttribute("open"))) {
      if (!isVisuallyHidden(element)) consider(element);
    } else if (record.attributeName === "role" || record.attributeName === "aria-live") {
      consider(element);
    }
  }
  return events;
}

export function detectNativeValidation(
  doc: Document, context: DetectionContext, fields: readonly Element[],
): RecoveryEvent | null {
  const invalid = fields.filter(
    (element) => element.ownerDocument === doc && element.matches("input:invalid, select:invalid, textarea:invalid") &&
      !isOwned(element) && !isVisuallyHidden(element),
  );
  if (invalid.length === 0) return null;
  const messages = invalid.map((element) => {
    // validationMessage may include arbitrary script-provided strings or user input.
    const validity = (element as HTMLInputElement).validity;
    if (validity.valueMissing) return "Fill in the required field.";
    if (validity.typeMismatch) return "Enter a value in the expected format.";
    return "Check the value in this field.";
  });
  const summary = Array.from(new Set(messages.filter(Boolean))).join(" ");
  const text = invalid.length === 1
    ? summary || "A form field did not pass validation."
    : `The form has ${invalid.length} fields that need attention.${summary ? ` ${summary}` : ""}`;
  const association = invalid.length === 1 && invalid[0] ? { target: targetFor(invalid[0], context.documentId), confidence: "direct" as const, reason: "Only one field is invalid." } : { target: null, confidence: "none" as const, reason: "Several fields are invalid, so no field is selected." };
  return eventFor({
    context,
    category: invalid.length === 1 ? "validation-error" : "error-summary",
    severity: "error",
    message: text,
    evidence: [
      { id: "ev:native", kind: "aria-invalid", value: "The browser reports invalid fields after submission.", privacy: "local-only" },
      { id: "ev:message", kind: "message-text", value: text, privacy: "local-only" },
    ],
    related: association.target,
    association: association.confidence,
    mechanism: "native-validation",
    kind: "attribute-change",
  });
}

export function detectSelectionChange(doc: Document, context: DetectionContext, target: Element): RecoveryEvent | null {
  if (context.interaction?.type !== "change" || context.interaction.element !== target ||
    target.ownerDocument !== doc || !(target instanceof HTMLSelectElement) || !target.isConnected ||
    target.disabled || target.matches(":disabled") || isOwned(target) || isVisuallyHidden(target)) return null;
  return eventFor({
    context, category: "status-update", severity: "info", message: "A selection changed.",
    evidence: [{ id: "ev:selection", kind: "attribute-change", value: "The native control emitted a selection change.", privacy: "local-only" }],
    related: null, association: "none", mechanism: "native-selection", kind: "attribute-change",
  });
}

export function eventIsUrgent(event: RecoveryEvent): boolean {
  return isUrgentRecovery(event);
}

export function observedAtIso(now: number): ISO8601 {
  return new Date(now).toISOString();
}
