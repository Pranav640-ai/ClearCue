import type { NavigationContext, NavigationControl, NavigationField, NavigationSnapshot } from "../shared/navigator";
import { isDisabledControl, isHidden, isInteractive, roleOf } from "./scanner/dom";
import { focusVerifiedElement, isFocusable, type FocusRecoveryResult } from "./recovery/focus";

const excluded = "script, style, textarea, select, input, [contenteditable], [data-clearcue-owned]";
const headingSelector = "h1,h2,h3,h4,h5,h6,[role='heading']";
const landmarkSelector = "main,nav,aside,header,footer,[role='main'],[role='navigation'],[role='region']";
const bounded = (text: string | null | undefined): string => (text ?? "").replace(/\s+/g, " ").trim().slice(0, 100);

function staticText(element: Element): string {
  if (element.matches(excluded)) return "";
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => node instanceof Element && node.matches(excluded) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  let value = "";
  for (let i = 0, node = walker.nextNode(); node && i < 80 && value.length < 100; i++, node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) value += " " + (node.nodeValue ?? "").slice(0, 100);
  }
  return bounded(value);
}

function nameOf(element: Element): string {
  const root = element.getRootNode() as Document | ShadowRoot;
  const references = (element.getAttribute("aria-labelledby") ?? "").slice(0, 500).split(/\s+/).filter(Boolean).slice(0, 4);
  const referenced = references.map((id) => root.getElementById(id)).filter((ref): ref is HTMLElement => ref !== null).map(staticText).join(" ");
  if (bounded(referenced)) return bounded(referenced);
  const label = bounded(element.getAttribute("aria-label"));
  if (label) return label;
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    return bounded(Array.from(element.labels ?? []).slice(0, 3).map(staticText).join(" "));
  }
  return staticText(element) || bounded(element.getAttribute("title"));
}

function available(element: Element): boolean {
  return isInteractive(element) && isFocusable(element) && !element.closest("[inert], [data-clearcue-owned], [contenteditable]") &&
    !element.matches("input[type=password], input[autocomplete*='cc-'], input[autocomplete='one-time-code']") &&
    !isDisabledControl(element) && !isHidden(element);
}

function selectChoices(select: HTMLSelectElement): string[] {
  const choices: string[] = [];
  for (let index = 0; index < Math.min(12, select.length); index += 1) {
    const option = select.options.item(index);
    if (!option || option.hidden || option.disabled || option.closest("optgroup[disabled], optgroup[hidden]")) continue;
    const label = bounded(option.label.slice(0, 200));
    if (label) choices.push(label);
  }
  return choices;
}

function formField(element: Element, id: string): NavigationField | undefined {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) ||
      !element.form || !element.willValidate) return;
  const required = element.required || element.getAttribute("aria-required") === "true";
  const issue = element.validity.valueMissing ? "missing" :
    element.getAttribute("aria-invalid") === "true" || !element.validity.valid ? "invalid" : undefined;
  return { id, required, issue };
}

function currentElement(doc: Document): Element | null {
  let current = doc.activeElement;
  while (current?.shadowRoot?.activeElement) current = current.shadowRoot.activeElement;
  return current;
}

function formOwner(element: Element): HTMLFormElement | null {
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement || element instanceof HTMLButtonElement) return element.form;
  return element.closest("form");
}

type NavigationTarget = {
  element: Element; control: NavigationControl; container: Element | null; href: string | null; form: HTMLFormElement | null;
};

export class PageNavigator {
  private snapshot: { id: string; url: string; targets: Map<string, NavigationTarget> } | null = null;

  constructor(private readonly doc: Document) {}

  read(): NavigationSnapshot {
    const id = crypto.randomUUID();
    const targets = new Map<string, NavigationTarget>();
    const headings = new Set<string>();
    const landmarks = new Set<string>();
    const sections: NonNullable<NavigationSnapshot["sections"]> = [];
    const fields: NavigationField[] = [];
    const formKeys = new Map<HTMLFormElement, string>();
    let forms = 0;
    let visited = 0;
    let heading = "";
    let section: (typeof sections)[number] | undefined;
    const visit = (root: Document | ShadowRoot): void => {
      const walker = this.doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      for (let node = walker.nextNode(); node && visited < 4000; node = walker.nextNode()) {
        visited += 1;
        const element = node as Element;
        if (element.matches(headingSelector) && !isHidden(element)) {
          heading = nameOf(element);
          if (heading && headings.size < 10) headings.add(heading);
          section = heading && sections.length < 10 ? { name: heading, controls: [] } : undefined;
          if (section) sections.push(section);
        }
        if (element.matches(landmarkSelector) && !isHidden(element) && landmarks.size < 8) {
          const role = roleOf(element);
          if (role) landmarks.add([role, bounded(element.getAttribute("aria-label"))].filter(Boolean).join(" — "));
        }
        if (element.localName === "form" && !isHidden(element)) forms += 1;
        if (targets.size < 180 && available(element)) {
          const form = formOwner(element);
          if (form && !formKeys.has(form)) formKeys.set(form, String(formKeys.size + 1));
          const control = {
            id: String(targets.size + 1), name: nameOf(element), role: roleOf(element) || element.localName,
            section: heading, form: form ? bounded(form.getAttribute("aria-label")) || "form" : "",
            formKey: form ? formKeys.get(form) : undefined,
            ...(element instanceof HTMLSelectElement && !element.form && !element.multiple
              ? { choices: selectChoices(element) }
              : {}),
          };
          targets.set(control.id, { element, control, container: element.closest("form, section, nav, article, main"),
            href: element.getAttribute("href"), form });
          section?.controls.push(control.id);
          const field = formField(element, control.id);
          if (field) fields.push(field);
        }
        if (element.shadowRoot) visit(element.shadowRoot);
      }
    };
    visit(this.doc);
    this.snapshot = { id, url: this.doc.URL, targets };
    return { id, title: bounded(this.doc.title), headings: [...headings], landmarks: [...landmarks],
      forms, controls: [...targets.values()].map(({ control }) => control), sections, fields,
      limited: visited >= 4000 || targets.size >= 180 };
  }

  context(): NavigationContext {
    const snapshot = this.snapshot?.url === this.doc.URL ? this.snapshot : null;
    const active = currentElement(this.doc);
    let focusedId: string | undefined;
    const fields = snapshot ? [...snapshot.targets.keys()].flatMap((id) => {
      const target = this.resolve(snapshot.id, id);
      if ("reason" in target) return [];
      if (target.element === active) focusedId = id;
      const field = formField(target.element, id);
      return field ? [field] : [];
    }) : undefined;
    return { text: this.describeFocus(), snapshotId: snapshot?.id, fields, focusedId };
  }

  describeFocus(): string {
    const element = currentElement(this.doc);
    const title = bounded(this.doc.title);
    if (!element || !available(element)) return `${title ? title + ". " : ""}No supported webpage control has focus.`;
    let section = "";
    const root = element.getRootNode() as Document | ShadowRoot;
    const walker = this.doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let index = 0, node = walker.nextNode(); node && index < 4000 && node !== element; index++, node = walker.nextNode()) {
      const previous = node as Element;
      if (previous.matches(headingSelector) && !isHidden(previous)) section = nameOf(previous);
    }
    const name = nameOf(element);
    const role = roleOf(element) || element.localName;
    const field = formField(element, "");
    const choices = element instanceof HTMLSelectElement && !element.form && !element.multiple ? selectChoices(element) : [];
    return [
      title, `${name || "Unnamed control"}, ${role}`, section ? `Section: ${section}` : "",
      field?.required ? "Required field" : "",
      field?.issue === "missing" ? "The browser reports that this field is incomplete" : field?.issue ? "This field needs validation review" : "",
      element.getAttribute("aria-expanded") === "true" ? "Expanded" : element.getAttribute("aria-expanded") === "false" ? "Collapsed" : "",
      choices.length ? `Options: ${choices.slice(0, 4).join(", ")}` : "",
    ].filter(Boolean).join(". ") + ".";
  }

  reset(): void { this.snapshot = null; }

  resolve(id: string, candidate: string): { element: Element; control: NavigationControl } | { reason: string } {
    const snapshot = this.snapshot;
    const target = snapshot?.targets.get(candidate);
    if (!snapshot || snapshot.id !== id || snapshot.url !== this.doc.URL || !target?.element.isConnected || target.element.ownerDocument !== this.doc) {
      return { reason: "The page or control changed. Refresh the page overview and try again." };
    }
    const { element, control } = target;
    if (!available(element) || nameOf(element) !== control.name || (roleOf(element) || element.localName) !== control.role ||
      target.href !== element.getAttribute("href") || target.form !== formOwner(element) ||
      target.container !== element.closest("form, section, nav, article, main")) {
      return { reason: "The control changed or is unavailable. Refresh the page overview and try again." };
    }
    return { element, control };
  }

  focus(id: string, candidate: string): FocusRecoveryResult {
    const target = this.resolve(id, candidate);
    if ("reason" in target) return { focused: false, reason: target.reason, name: "" };
    return focusVerifiedElement(this.doc, target.element, target.control.name);
  }
}
