import type { ElementReference } from "../../shared/types";
import { accessibleNameOf, buildPath, roleOf } from "../scanner/dom";

export type TrackedInteractionType = "click" | "keyboard" | "submit" | "change" | "input" | "focus";

export interface TrackedInteraction {
  id: string;
  type: TrackedInteractionType;
  at: number;
  element: Element | null;
  target: ElementReference | null;
}

export interface InteractionTrackerOptions {
  maxAgeMs?: number;
  maxEntries?: number;
  now?: () => number;
  document?: Document;
}

const INTERACTION_SELECTOR = "button, a[href], input, select, textarea, summary, [role='button'], [role='link'], [role='menuitem'], [role='tab'], [role='switch'], [role='checkbox']";

function isOwned(element: Element | null): boolean {
  return Boolean(element?.closest("[data-clearcue-owned]"));
}

function referenceFor(element: Element | null): ElementReference | null {
  if (!element || element.nodeType !== 1) return null;
  return {
    ref: buildPath(element),
    tagName: element.tagName.toLowerCase(),
    role: roleOf(element) || undefined,
    locator: buildPath(element),
  };
}

/**
 * Bounded, metadata-only interaction tracking.
 *
 * It never reads input values, keystrokes, clipboard content or field text. A
 * change/input event records only that an interaction happened on an element.
 */
export class InteractionTracker {
  private readonly entries: TrackedInteraction[] = [];
  private readonly maxAgeMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly doc: Document;
  private started = false;
  private lastInputAt = 0;
  private listeners: Array<{ type: string; handler: EventListener; capture: boolean }> = [];

  constructor(options: InteractionTrackerOptions = {}) {
    this.maxAgeMs = options.maxAgeMs ?? 12_000;
    this.maxEntries = options.maxEntries ?? 16;
    this.now = options.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    this.doc = options.document ?? document;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const add = (type: string, handler: EventListener, capture = true): void => {
      this.doc.addEventListener(type, handler, capture);
      this.listeners.push({ type, handler, capture });
    };

    add("click", (event) => {
      if (!event.isTrusted) return;
      const target = event.target instanceof Element ? event.target.closest(INTERACTION_SELECTOR) ?? (event.target as Element) : null;
      this.record("click", target);
    });
    add("keydown", (event) => {
      if (!event.isTrusted) return;
      const key = (event as KeyboardEvent).key;
      if (key !== "Enter" && key !== " ") return;
      const target = event.target instanceof Element ? event.target : null;
      this.record("keyboard", target);
    });
    add("submit", (event) => {
      if (!event.isTrusted) return;
      const target = event.target instanceof Element ? event.target : null;
      this.record("submit", target);
    });
    add("change", (event) => {
      if (!event.isTrusted) return;
      const target = event.target instanceof Element ? event.target : null;
      this.record("change", target);
    });
    add(
      "input",
      (event) => {
        if (!event.isTrusted) return;
        // Metadata only, throttled so typing cannot flood the tracker.
        const at = this.now();
        if (at - this.lastInputAt < 800) return;
        this.lastInputAt = at;
        const target = event.target instanceof Element ? event.target : null;
        this.record("input", target);
      },
      false,
    );
    add("focusin", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const previous = this.entries.at(-1);
      if (previous?.type === "focus" && previous.element === target) return;
      this.record("focus", target);
    });
  }

  stop(): void {
    if (!this.started) return;
    for (const listener of this.listeners) {
      this.doc.removeEventListener(listener.type, listener.handler, listener.capture);
    }
    this.listeners = [];
    this.started = false;
    this.entries.length = 0;
  }

  reset(): void {
    this.entries.length = 0;
    this.lastInputAt = 0;
  }

  record(type: TrackedInteractionType, element: Element | null): TrackedInteraction {
    if (isOwned(element)) {
      return { id: "", type, at: this.now(), element: null, target: null };
    }
    const entry: TrackedInteraction = {
      id: globalThis.crypto?.randomUUID?.() ?? `interaction-${Math.random().toString(36).slice(2)}`,
      type,
      at: this.now(),
      element,
      target: referenceFor(element),
    };
    this.entries.push(entry);
    this.prune();
    return entry;
  }

  /** Nearest interaction that can plausibly cause DOM outcomes. Focus alone is weak. */
  latestOutcomeInteraction(maxAgeMs = this.maxAgeMs): TrackedInteraction | null {
    const cutoff = this.now() - maxAgeMs;
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      const entry = this.entries[index];
      if (!entry || entry.at < cutoff || entry.type === "focus") continue;
      return entry;
    }
    return null;
  }

  recentFocus(maxAgeMs = 4000): TrackedInteraction | null {
    const cutoff = this.now() - maxAgeMs;
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      const entry = this.entries[index];
      if (!entry || entry.at < cutoff) continue;
      if (entry.type === "focus") return entry;
    }
    return null;
  }

  all(): readonly TrackedInteraction[] {
    return this.entries;
  }

  private prune(): void {
    const cutoff = this.now() - this.maxAgeMs;
    while (this.entries.length > 0 && (this.entries[0]?.at ?? 0) < cutoff) this.entries.shift();
    if (this.entries.length > this.maxEntries) this.entries.splice(0, this.entries.length - this.maxEntries);
  }
}

export function interactionLabel(element: Element | null): string {
  if (!element) return "";
  const name = accessibleNameOf(element).trim();
  return name || element.tagName.toLowerCase();
}
