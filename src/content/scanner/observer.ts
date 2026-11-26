import type { ScanOutcome } from "./scan";
import { AccessibilityScanner } from "./scan";

/**
 * Incremental DOM monitoring.
 *
 * Mutations are batched, bounded and translated into a small set of elements to
 * re-evaluate. Changes to a label's text or to an element carrying a referenced
 * id re-evaluate the controls that depend on it, even when they are elsewhere in
 * the document. Elements marked as ClearCue-owned are ignored, so future repair
 * mutations cannot create an observation loop.
 */

const WATCHED_ATTRIBUTES = [
  "role",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-hidden",
  "aria-disabled",
  "hidden",
  "disabled",
  "type",
  "href",
  "title",
  "alt",
  "id",
  "for",
  "placeholder",
  "contenteditable",
];

const OWNED_MARKER = "[data-clearcue-owned]";

/** A control bound to a label through `for`, so its name changes with the label. */
function elementLabelFor(doc: Document, element: Element): Element | null {
  if (element.tagName.toLowerCase() !== "label") return null;
  const target = element.getAttribute("for");
  return target ? doc.getElementById(target) : null;
}

export interface ScanObserverOptions {
  debounceMs?: number;
  maxPendingElements?: number;
  maxMutationsBeforeFullScan?: number;
}

export class ScanObserver {
  private observers: MutationObserver[] = [];
  private pending = new Set<Element>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private mutationCount = 0;
  private needFullScan = false;
  private stopped = false;

  constructor(
    private readonly doc: Document,
    private readonly scanner: AccessibilityScanner,
    private readonly onOutcome: (outcome: ScanOutcome, reason: "mutation" | "full") => void,
    private readonly options: ScanObserverOptions = {},
  ) {}

  private get debounceMs(): number {
    return this.options.debounceMs ?? 250;
  }

  private get maxPending(): number {
    return this.options.maxPendingElements ?? 150;
  }

  private get maxMutations(): number {
    return this.options.maxMutationsBeforeFullScan ?? 400;
  }

  start(): void {
    this.stopped = false;
    this.observeRoot(this.doc);
    this.attachExistingShadowRoots();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (const observer of this.observers) observer.disconnect();
    this.observers = [];
    this.pending.clear();
  }

  private observeRoot(root: Document | ShadowRoot): void {
    const observer = new MutationObserver((mutations) => this.handle(mutations));
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: WATCHED_ATTRIBUTES,
      attributeOldValue: true,
      characterData: true,
    });
    this.observers.push(observer);
  }

  private attachExistingShadowRoots(): void {
    const walk = (root: Document | ShadowRoot): void => {
      const walker = this.doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      let node = walker.nextNode();
      while (node) {
        const element = node as Element;
        if (element.shadowRoot) {
          this.observeRoot(element.shadowRoot);
          walk(element.shadowRoot);
        }
        node = walker.nextNode();
      }
    };
    walk(this.doc);
  }

  private isOwned(node: Node): boolean {
    const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    return Boolean(element?.closest(OWNED_MARKER));
  }

  private queueSubtree(node: Node): void {
    if (this.isOwned(node)) return;
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const root = node as Element;
    if (this.isRelevant(root)) this.pending.add(root);
    const descendants = root.querySelectorAll("*");
    let count = 0;
    for (const descendant of Array.from(descendants)) {
      if (count >= 200) break;
      if (this.isOwned(descendant)) continue;
      if (descendant.shadowRoot) this.observeRoot(descendant.shadowRoot);
      if (this.isRelevant(descendant)) {
        this.pending.add(descendant);
        count += 1;
      }
    }
  }

  private isRelevant(element: Element): boolean {
    const tag = element.tagName.toLowerCase();
    if (tag === "label" && element.hasAttribute("for")) return true;
    if (element.hasAttribute("role") || element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby")) {
      return true;
    }
    return element.matches(
      "button, a[href], input, select, textarea, summary, [contenteditable], [tabindex]",
    );
  }

  private queueDependentsOfId(id: string | null): void {
    if (!id) return;
    for (const dependent of this.scanner.dependentsOf(id)) {
      if (dependent.isConnected) this.pending.add(dependent);
    }
  }

  private handle(mutations: MutationRecord[]): void {
    if (this.stopped) return;
    this.mutationCount += mutations.length;

    for (const mutation of mutations) {
      if (this.isOwned(mutation.target)) continue;

      if (mutation.type === "attributes") {
        const target = mutation.target as Element;
        if (mutation.attributeName === "id") {
          this.queueDependentsOfId(mutation.oldValue);
          this.queueDependentsOfId(target.getAttribute("id"));
        }
        if (this.isRelevant(target)) this.pending.add(target);
        // `hidden`, `disabled`, `type` and `role` can reveal or hide descendants
        // that were never queued themselves (for example a hidden file row).
        this.queueSubtree(target);
        this.queueDependentsOfId(target.getAttribute("id"));
        const boundLabel = elementLabelFor(this.doc, target);
        if (boundLabel) this.pending.add(boundLabel);
        continue;
      }

      if (mutation.type === "characterData") {
        const parent = mutation.target.parentElement;
        if (!parent) continue;
        let scope: Element | null = parent;
        for (let depth = 0; scope && depth < 3; depth += 1) {
          this.queueDependentsOfId(scope.getAttribute("id"));
          if (scope.tagName.toLowerCase() === "label") {
            const forId = scope.getAttribute("for");
            this.queueDependentsOfId(forId);
            const boundControl = forId ? this.doc.getElementById(forId) : scope.querySelector("input, select, textarea, button");
            if (boundControl) this.pending.add(boundControl);
          }
          scope = scope.parentElement;
        }
        if (this.isRelevant(parent)) this.pending.add(parent);
        continue;
      }

      // childList
      for (const removed of Array.from(mutation.removedNodes)) {
        if (removed.nodeType !== Node.ELEMENT_NODE) continue;
        const element = removed as Element;
        this.queueDependentsOfId(element.getAttribute("id"));
      }
      // A removal must still invalidate issues for the disappeared element.
      const parent = mutation.target;
      if (parent.nodeType === Node.ELEMENT_NODE && (parent as Element).isConnected) {
        this.pending.add(parent as Element);
      }
      for (const added of Array.from(mutation.addedNodes)) this.queueSubtree(added);
    }

    if (this.pending.size > this.maxPending || this.mutationCount > this.maxMutations) {
      this.needFullScan = true;
      this.pending.clear();
    }
    this.schedule();
  }

  private schedule(): void {
    if (this.stopped) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.debounceMs);
  }

  /** Exposed for tests and for an explicit "Scan again" request. */
  flush(): void {
    if (this.stopped) return;
    const full = this.needFullScan;
    const targets = Array.from(this.pending);
    this.pending.clear();
    this.needFullScan = false;
    this.mutationCount = 0;

    if (!full && targets.length === 0) return;
    const outcome = full || targets.length === 0 ? this.scanner.scanAll() : this.scanner.scanTargets(targets);
    this.onOutcome(outcome, full ? "full" : "mutation");
  }
}
