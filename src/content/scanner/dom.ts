import { computeAccessibleName, getRole, isDisabled, isInaccessible } from "dom-accessibility-api";

/**
 * DOM helpers shared by the accessibility scanner.
 *
 * Everything here is read-only. Form values are never read: no `.value`,
 * no `textContent` of a contenteditable element, no input state.
 */

const INTERACTIVE_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
]);

const FORM_TAGS = new Set(["input", "select", "textarea"]);

const BUTTON_ROLES = new Set(["button", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "option"]);

const DESTRUCTIVE_TOKENS = [
  "delete",
  "remove",
  "destroy",
  "erase",
  "pay",
  "payment",
  "purchase",
  "buy",
  "checkout",
  "transfer",
  "wire",
  "send money",
  "sign out",
  "log out",
  "logout",
  "unsubscribe",
  "cancel",
  "confirm",
  "submit",
  "reset",
  "withdraw",
  "donate",
];

const SAFE_ICON_WORDS = new Set([
  "add",
  "back",
  "cart",
  "close",
  "delete",
  "download",
  "edit",
  "email",
  "expand",
  "favorite",
  "filter",
  "help",
  "home",
  "info",
  "menu",
  "next",
  "pause",
  "play",
  "previous",
  "refresh",
  "remove",
  "search",
  "settings",
  "share",
  "upload",
  "user",
  "warning",
]);

export function accessibleNameOf(element: Element): string {
  try {
    return computeAccessibleName(element).replace(/\s+/g, " ").trim().slice(0, 200);
  } catch {
    return "";
  }
}

export function explicitRoleTokens(element: Element): string[] {
  const raw = element.getAttribute("role");
  if (!raw) return [];
  return raw
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function roleOf(element: Element): string {
  try {
    return getRole(element) ?? "";
  } catch {
    return "";
  }
}

export function isHidden(element: Element): boolean {
  try {
    return isInaccessible(element);
  } catch {
    return false;
  }
}

export function isDisabledControl(element: Element): boolean {
  if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") return true;
  try {
    return isDisabled(element);
  } catch {
    return false;
  }
}

export function nativeTag(element: Element): string {
  return element.tagName.toLowerCase();
}

export function isNativeFormControl(element: Element): boolean {
  const tag = nativeTag(element);
  if (!FORM_TAGS.has(tag)) return false;
  if (tag !== "input") return true;
  const type = (element.getAttribute("type") ?? "text").toLowerCase();
  return !["hidden", "button", "submit", "reset", "image"].includes(type);
}

export function isNativeButton(element: Element): boolean {
  return nativeTag(element) === "button";
}

export function isNativeLink(element: Element): boolean {
  return nativeTag(element) === "a" && element.hasAttribute("href");
}

export function isInteractive(element: Element): boolean {
  const tag = nativeTag(element);
  if (tag === "a" && element.hasAttribute("href")) return true;
  if (tag === "button" || tag === "select" || tag === "textarea" || tag === "summary") return true;
  if (tag === "input") return isNativeFormControl(element) || ["button", "submit", "reset", "image"].includes((element.getAttribute("type") ?? "text").toLowerCase());
  if (element.hasAttribute("contenteditable") && element.getAttribute("contenteditable") !== "false") return true;
  const role = roleOf(element);
  return INTERACTIVE_ROLES.has(role);
}

export function isButtonLike(element: Element, knownRole?: string): boolean {
  if (isNativeButton(element)) return true;
  return BUTTON_ROLES.has(knownRole ?? roleOf(element));
}

export function isLinkLike(element: Element, knownRole?: string): boolean {
  if (isNativeLink(element)) return true;
  return (knownRole ?? roleOf(element)) === "link";
}

/** True when the element has no human-readable text and only graphics inside. */
export function hasGraphicContent(element: Element): boolean {
  if (element.querySelector("svg, img, canvas, picture")) return true;
  return false;
}

export function textOfNode(node: Element, max = 120): string {
  const raw = (node.textContent ?? "").replace(/\s+/g, " ").trim();
  return raw.slice(0, max);
}

/** Extract an icon hint from authored metadata only (never class names). */
export function iconHint(element: Element): { hint: string; source: string; allowlisted: boolean } | null {
  const graphics = element.querySelectorAll("svg, img");
  for (const graphic of Array.from(graphics)) {
    const candidates: Array<[string | null, string]> = [
      [graphic.getAttribute("aria-label"), "aria-label"],
      [graphic.getAttribute("title"), "svg-title"],
    ];
    if (graphic.tagName.toLowerCase() === "img") {
      candidates.push([graphic.getAttribute("alt"), "img-alt"]);
    }
    const title = graphic.querySelector("title");
    if (title?.textContent) candidates.push([title.textContent, "svg-title"]);
    for (const [raw, source] of candidates) {
      const hint = (raw ?? "").replace(/\s+/g, " ").trim();
      if (!hint) continue;
      const words = hint.toLowerCase().split(/[^a-z]+/).filter(Boolean);
      const allowlisted = words.length > 0 && words.every((word) => SAFE_ICON_WORDS.has(word));
      return { hint: hint.slice(0, 60), source, allowlisted };
    }
  }
  return null;
}

export function isDestructiveAction(element: Element, name: string): boolean {
  const haystack = `${name} ${element.getAttribute("href") ?? ""} ${element.getAttribute("title") ?? ""}`.toLowerCase();
  return DESTRUCTIVE_TOKENS.some((token) => haystack.includes(token));
}

export interface SanitizedDestination {
  hostname: string;
  /** Path segments, no query string and no fragment. */
  path: string;
  dangerous: boolean;
  /** Word-like final segment, usable only as a heuristic hint. */
  slug: string;
}

export function sanitizedDestination(element: Element): SanitizedDestination | null {
  const href = element.getAttribute("href");
  if (!href) return null;
  if (/^\s*javascript:/i.test(href)) return { hostname: "", path: "", dangerous: true, slug: "" };
  // A fragment-only link has no destination that could clarify vague text.
  if (href.trim().startsWith("#")) return { hostname: "", path: "", dangerous: false, slug: "" };
  try {
    const url = new URL(href, element.ownerDocument.baseURI || "https://invalid.local/");
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { hostname: "", path: "", dangerous: true, slug: "" };
    }
    const path = url.pathname.replace(/\/+$/, "").slice(0, 120);
    const last = path.split("/").filter(Boolean).pop() ?? "";
    const slug = last
      .replace(/\.[a-z0-9]{1,5}$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/[^a-zA-Z ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .slice(0, 60);
    return { hostname: url.hostname.slice(0, 120), path, dangerous: false, slug };
  } catch {
    return null;
  }
}

/** Nearest preceding heading text inside a small ancestor window. */
export function nearbyHeading(element: Element): { text: string; level: string } | null {
  let scope: Element | null = element.parentElement;
  for (let depth = 0; scope && depth < 3; depth += 1) {
    const headings = scope.querySelectorAll("h1, h2, h3, h4, h5, h6, [role='heading']");
    for (const heading of Array.from(headings)) {
      if (heading === element) continue;
      const text = textOfNode(heading, 100);
      if (!text) continue;
      const fromTag = heading.tagName.toLowerCase().match(/^h([1-6])$/)?.[1];
      const level = heading.getAttribute("aria-level") ?? fromTag ?? "2";
      return { text, level };
    }
    scope = scope.parentElement;
  }
  return null;
}

/** Immediate surrounding text, deliberately limited to one ancestor level. */
export function nearbyText(element: Element): string | null {
  const parent = element.parentElement;
  if (!parent) return null;
  const own = textOfNode(element, 160);
  const whole = textOfNode(parent, 220);
  if (!whole) return null;
  const remainder = own ? whole.replace(own, " ").replace(/\s+/g, " ").trim() : whole;
  return remainder ? remainder.slice(0, 120) : null;
}

export function associatedLabelTexts(element: Element, knownLabels?: ReadonlyMap<string, string[]>): string[] {
  const labels: string[] = [];
  if (element.id) {
    if (knownLabels) {
      labels.push(...(knownLabels.get(element.id) ?? []));
    } else {
      const escaped = element.id.replace(/["\\]/g, "\\$&");
      for (const label of Array.from(element.ownerDocument.querySelectorAll(`label[for="${escaped}"]`))) {
        const text = textOfNode(label, 80);
        if (text) labels.push(text);
      }
    }
  }
  const wrapping = element.closest("label");
  if (wrapping) {
    const clone = wrapping.cloneNode(true) as HTMLElement;
    for (const control of Array.from(clone.querySelectorAll("input, select, textarea"))) control.remove();
    const text = textOfNode(clone, 80);
    if (text) labels.push(text);
  }
  return Array.from(new Set(labels));
}

/**
 * Build a stable, bounded structural path for element identity.
 *
 * `nth-child` keeps each step O(1) to resolve on the browser side and avoids
 * the sibling walk that `nth-of-type` required for every scanned control. The
 * locator resolver still accepts historical `nth-of-type` paths.
 */
export function buildPath(element: Element, maxDepth = 8, knownIndex?: WeakMap<Element, number>): string {
  const parts: string[] = [];
  let current: Element | null = element;
  let depth = 0;
  while (current && depth < maxDepth) {
    const tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    let index = 1;
    if (parent) {
      const known = knownIndex?.get(current);
      if (known) index = known;
      else index = Array.prototype.indexOf.call(parent.children, current) + 1;
    }
    parts.unshift(`${tag}:nth-child(${index})`);
    if (!parent) {
      const root = current.getRootNode();
      if (root instanceof ShadowRoot) {
        parts.unshift("::shadow");
        current = root.host;
        depth += 1;
        continue;
      }
      break;
    }
    current = parent;
    depth += 1;
  }
  return parts.join(">");
}

export interface CollectedElement {
  element: Element;
  role: string;
  tag: string;
  name: string;
  hidden: boolean;
  disabled: boolean;
  path: string;
}

export interface CollectionResult {
  elements: CollectedElement[];
  interactiveCount: number;
  visited: number;
  truncated: boolean;
  /** How many elements carry each id, across the document and open shadow roots. */
  idCounts: Map<string, number>;
  /** Text of `label[for]` elements, indexed once per full scan. */
  labelTextsById: Map<string, string[]>;
}

/**
 * Walk the document and every open shadow root it contains. Closed shadow roots
 * and cross-origin iframes are unreachable by design and are documented limits.
 */
export function collectPageElements(doc: Document, maxInteractive: number, maxVisited = 30000): CollectionResult {
  const elements: CollectedElement[] = [];
  let visited = 0;
  let interactiveCount = 0;
  let truncated = false;
  const idCounts = new Map<string, number>();
  const labelTextsById = new Map<string, string[]>();
  const pathIndex = new WeakMap<Element, number>();

  const visit = (element: Element): "stop" | "continue" => {
    const previous = element.previousElementSibling;
    pathIndex.set(element, previous ? (pathIndex.get(previous) ?? 0) + 1 : 1);
    visited += 1;
    if (visited > maxVisited) {
      truncated = true;
      return "stop";
    }
    const id = element.getAttribute("id");
    if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    const interactive = isInteractive(element);
    const labelledTarget = element.tagName.toLowerCase() === "label" && element.hasAttribute("for");
    if (!interactive && !labelledTarget) return "continue";

    if (interactive) interactiveCount += 1;
    if (interactive && elements.length >= maxInteractive) {
      truncated = true;
      return "continue";
    }
    if (labelledTarget) {
      const target = element.getAttribute("for");
      if (target) {
        const text = textOfNode(element, 80);
        if (text) {
          const existing = labelTextsById.get(target) ?? [];
          existing.push(text);
          labelTextsById.set(target, existing);
        }
      }
    }
    // Hidden controls cannot produce issues. Skipping the accessible-name and
    // path work here avoids the most expensive per-element computation on pages
    // with many visually hidden controls.
    if (isHidden(element)) return "continue";
    if (interactive) {
      const role = roleOf(element);
      elements.push({
        element,
        role,
        tag: nativeTag(element),
        name: accessibleNameOf(element),
        hidden: false,
        disabled: isDisabledControl(element),
        path: buildPath(element, 8, pathIndex),
      });
    } else {
      elements.push({
        element,
        role: "label",
        tag: "label",
        name: "",
        hidden: false,
        disabled: false,
        path: buildPath(element, 8, pathIndex),
      });
    }
    return "continue";
  };

  const walk = (root: Document | ShadowRoot): void => {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      const element = node as Element;
      if (visit(element) === "stop") return;
      if (element.shadowRoot) walk(element.shadowRoot);
      node = walker.nextNode();
    }
  };

  walk(doc);
  return { elements, interactiveCount, visited, truncated, idCounts, labelTextsById };
}

/** Fast id count map used by incremental scans (no accessible-name work). */
export function collectIdCounts(doc: Document, maxVisited = 30000): Map<string, number> {
  const counts = new Map<string, number>();
  let visited = 0;
  const walk = (root: Document | ShadowRoot): boolean => {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      visited += 1;
      if (visited > maxVisited) return false;
      const element = node as Element;
      const id = element.getAttribute("id");
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      if (element.shadowRoot && !walk(element.shadowRoot)) return false;
      node = walker.nextNode();
    }
    return true;
  };
  walk(doc);
  return counts;
}

export function isSafeIconHint(hint: string): boolean {
  return hint
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
    .every((word) => SAFE_ICON_WORDS.has(word));
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
