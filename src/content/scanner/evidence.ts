import type { EvidenceKind, ScanCategory, ScanEvidence } from "../../shared/scan";
import type { EvidencePrivacy } from "../../shared/types";
import {
  hasGraphicContent,
  iconHint,
  nearbyHeading,
  nearbyText,
  sanitizedDestination,
} from "./dom";

/**
 * Evidence extraction.
 *
 * Conservative by default: page text is `local-only`, only minimal structural
 * facts are `cloud-eligible`, and sensitive values are never read at all.
 * No form values, no password fields, no contenteditable text, no URL query
 * strings, no raw HTML.
 */

export interface EvidenceInput {
  element: Element;
  category: ScanCategory;
  role: string;
  accessibleName: string;
  labelTexts: string[];
  missingRefIds: string[];
  referencedIds: string[];
  duplicateRefIds: string[];
  disabled: boolean;
  conflicts: string[];
}

function make(id: string, kind: EvidenceKind, value: string, privacy: EvidencePrivacy, note?: string): ScanEvidence {
  return { id, kind, value: value.slice(0, 180), privacy, ...(note ? { note } : {}) };
}

function isProhibitedValue(value: string): boolean {
  // Defence in depth in case a caller ever passes page text here.
  if (/\b(password|passwd|secret|token|api[_-]?key)\b/i.test(value)) return true;
  if (/\b[\w.+-]+@[\w-]+\.[\w.]+\b/.test(value) && value.length > 40) return true;
  return false;
}

/** Drop anything that must never be stored or displayed. */
export function assertEvidenceSafe(items: readonly ScanEvidence[]): ScanEvidence[] {
  return items.filter((item) => item.privacy !== "prohibited" && !isProhibitedValue(item.value));
}

const CLOUD_ROLES = new Set(["none", "button", "link", "textbox", "searchbox", "combobox",
  "checkbox", "radio", "switch", "slider", "spinbutton", "option", "tab", "menuitem", "listbox"]);
const CLOUD_TAGS = new Set(["a", "button", "input", "select", "textarea", "summary", "div", "span"]);
const STRUCTURAL_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  type: new Set(["button", "submit", "reset", "text", "email", "search", "tel", "url", "number", "checkbox", "radio"]),
  "aria-haspopup": new Set(["true", "false", "menu", "listbox", "tree", "grid", "dialog"]),
  "aria-expanded": new Set(["true", "false"]),
  inputmode: new Set(["none", "text", "decimal", "numeric", "tel", "search", "email", "url"]),
};

export function buildEvidence(input: EvidenceInput): ScanEvidence[] {
  const { element, category, role, accessibleName, labelTexts, missingRefIds, referencedIds, duplicateRefIds, disabled } =
    input;

  const items: ScanEvidence[] = [];
  const tag = element.tagName.toLowerCase();

  items.push(make(`ev:role`, "role", role || "none", CLOUD_ROLES.has(role || "none") ? "cloud-eligible" : "local-only"));
  items.push(make(`ev:element`, "native-element", tag, CLOUD_TAGS.has(tag) ? "cloud-eligible" : "local-only"));

  if (accessibleName) {
    items.push(make(`ev:name`, "accessible-name", accessibleName, "local-only", "May contain page-specific text."));
  } else {
    items.push(make(`ev:name`, "accessible-name", "none", "cloud-eligible"));
  }

  if (hasGraphicContent(element)) {
    const hint = iconHint(element);
    if (hint) {
      items.push(
        make(
          `ev:icon`,
          "icon",
          `${hint.hint} (${hint.source})`,
          hint.allowlisted ? "cloud-eligible" : "local-only",
          hint.allowlisted ? "Authored icon metadata from a known UI vocabulary." : "Authored icon text; may be page-specific.",
        ),
      );
    } else {
      items.push(make(`ev:icon`, "icon", "graphic-only, no authored name", "cloud-eligible"));
    }
  }

  // Allowlisted attributes only; ids/paths stay local because they can leak structure.
  const attributeFacts: string[] = [];
  for (const attribute of Object.keys(STRUCTURAL_ATTRIBUTES)) {
    const value = element.getAttribute(attribute);
    if (value && STRUCTURAL_ATTRIBUTES[attribute]?.has(value)) attributeFacts.push(`${attribute}=${value.slice(0, 40)}`);
  }
  if (element.hasAttribute("placeholder")) attributeFacts.push("placeholder present");
  if (attributeFacts.length > 0) {
    items.push(make(`ev:attrs`, "attribute", attributeFacts.join("; "), "cloud-eligible"));
  }
  if (element.hasAttribute("placeholder")) {
    items.push(
      make(
        `ev:placeholder`,
        "attribute",
        (element.getAttribute("placeholder") ?? "").replace(/\s+/g, " ").slice(0, 60) || "present",
        "local-only",
        "Placeholder text is not a label and may contain private hints.",
      ),
    );
  }

  if (disabled) items.push(make(`ev:disabled`, "structure", "control is disabled", "cloud-eligible"));

  for (const [index, label] of labelTexts.entries()) {
    items.push(make(`ev:label:${index}`, "label", label, "local-only", "Page-authored label text."));
  }
  if (labelTexts.length > 0) {
    items.push(make(`ev:label-association`, "structure", "control has an associated label", "cloud-eligible"));
  }

  if (referencedIds.length > 0) {
    items.push(
      make(
        `ev:reference-count`,
        "relationship",
        `${referencedIds.length} aria-labelledby reference(s), ${missingRefIds.length} missing`,
        "cloud-eligible",
      ),
    );
    if (missingRefIds.length > 0) {
      items.push(
        make(`ev:missing-refs`, "relationship", missingRefIds.slice(0, 4).join(", "), "local-only", "Element ids can reveal page structure."),
      );
    }
    if (duplicateRefIds.length > 0) {
      items.push(
        make(`ev:duplicate-refs`, "relationship", duplicateRefIds.slice(0, 4).join(", "), "local-only", "Duplicate ids make the name ambiguous."),
      );
    }
  }

  const heading = nearbyHeading(element);
  if (heading) {
    items.push(make(`ev:heading`, "heading", `${heading.level}: ${heading.text}`, "local-only", "Section heading text."));
  }

  const nearby = nearbyText(element);
  if (nearby) items.push(make(`ev:nearby`, "nearby-text", nearby, "local-only", "Surrounding text may contain private information."));

  if (category === "vague-link" || category === "link-name" || tag === "a") {
    const destination = sanitizedDestination(element);
    if (destination) {
      items.push(make(`ev:destination-host`, "link-destination", destination.hostname || "none", "local-only"));
      if (destination.path) {
        items.push(make(`ev:destination-path`, "link-destination", destination.path, "local-only", "Paths can contain names or identifiers."));
      }
      if (destination.dangerous) {
        items.push(make(`ev:destination-risk`, "structure", "destination is not an ordinary web link", "cloud-eligible"));
      }
    }
  }

  for (const conflict of input.conflicts) {
    items.push(make(`ev:conflict:${items.length}`, "structure", conflict, "local-only"));
  }

  return assertEvidenceSafe(items);
}
