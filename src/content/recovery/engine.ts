import { recoveryOutcomeScope, type RecoveryEvent } from "../../shared/recovery";
import { detectNativeValidation, detectRecoveryOutcomes, detectSelectionChange } from "./classify";
import type { DetectionContext } from "./classify";
import { InteractionTracker } from "./interactions";

export interface RecoveryEngineOptions {
  documentId: string;
  pageUrl: string | (() => string);
  onEvent: (event: RecoveryEvent) => void;
  onMetrics?: (metric: { records: number; emitted: number; processingMs: number }) => void;
  now?: () => number;
  debounceMs?: number;
  document?: Document;
}

const MAX_PENDING_RECORDS = 250;
const MAX_RECORDS_PER_FLUSH = 80;
const LOCAL_DEDUPE_MS = 15_000;

/**
 * Content-side observation engine. Deterministic detection happens
 * immediately; no model call is on this path and no announcement waits for AI.
 */
export class RecoveryEngine {
  private readonly doc: Document;
  private readonly tracker: InteractionTracker;
  private readonly options: RecoveryEngineOptions;
  private readonly pending: MutationRecord[] = [];
  private readonly dedupe = new Map<string, number>();
  private observer: MutationObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private invalidFields = new Set<Element>();
  private invalidTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: RecoveryEngineOptions) {
    this.options = options;
    this.doc = options.document ?? document;
    this.tracker = new InteractionTracker({ document: this.doc, now: options.now });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.tracker.start();
    this.observer = new MutationObserver((records) => this.enqueue(records));
    this.observer.observe(this.doc.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["hidden", "style", "open", "aria-invalid", "aria-expanded", "aria-busy", "role", "aria-live"],
    });
    this.doc.addEventListener("invalid", this.onInvalid, true);
    this.doc.addEventListener("change", this.onSelection, true);
  }

  stop(): void {
    this.started = false;
    this.observer?.disconnect();
    this.observer = null;
    this.tracker.stop();
    this.doc.removeEventListener("invalid", this.onInvalid, true);
    this.doc.removeEventListener("change", this.onSelection, true);
    this.reset();
  }

  /** Start a fresh observation window after an in-document navigation. */
  reset(): void {
    this.observer?.takeRecords();
    if (this.timer) clearTimeout(this.timer);
    if (this.invalidTimer) clearTimeout(this.invalidTimer);
    this.timer = null;
    this.invalidTimer = null;
    this.invalidFields.clear();
    this.tracker.reset();
    this.pending.length = 0;
    this.dedupe.clear();
  }

  /** Test and live-harness hook: process queued records now. */
  flushNow(): void {
    if (!this.observer) return;
    const taken = this.observer.takeRecords();
    if (taken.length > 0) this.enqueue(taken);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.flush();
  }

  private readonly onInvalid = (event: Event): void => {
    // Failed native validation prevents submit. Only observe fields that
    // actually emitted invalid during a recent user activation of their form.
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const context = this.context();
    const trigger = context.interaction;
    if (!trigger || (trigger.type !== "click" && trigger.type !== "keyboard")) return;
    const field = event.target;
    const form = (field as HTMLInputElement).form;
    const triggerElement = trigger.element;
    if (!form || !triggerElement ||
      ((triggerElement as HTMLButtonElement).form !== form && triggerElement.closest("form") !== form)) return;
    this.invalidFields.add(field);
    if (this.invalidTimer) return;
    this.invalidTimer = setTimeout(() => {
      this.invalidTimer = null;
      const fields = [...this.invalidFields];
      this.invalidFields.clear();
      const detected = detectNativeValidation(this.doc, context, fields);
      if (detected) this.emit([detected]);
    }, 0);
  };

  private readonly onSelection = (event: Event): void => {
    if (!event.isTrusted || !(event.target instanceof HTMLSelectElement)) return;
    const observed = detectSelectionChange(this.doc, this.context(), event.target);
    if (observed) this.emit([observed]);
  };

  private enqueue(records: MutationRecord[]): void {
    for (const record of records) {
      if (this.pending.length >= MAX_PENDING_RECORDS) this.pending.shift();
      this.pending.push(record);
    }
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.options.debounceMs ?? 60);
  }

  private flush(): void {
    if (!this.started) return;
    const startedAt = this.options.now?.() ?? (typeof performance !== "undefined" ? performance.now() : Date.now());
    const records = this.pending.splice(0, MAX_RECORDS_PER_FLUSH);
    if (records.length === 0) return;
    if (this.pending.length > 0) this.enqueue([]);
    const context = this.context();
    const emitted = detectRecoveryOutcomes(this.doc, records, context);
    this.emit(emitted);
    const elapsed = (this.options.now?.() ?? (typeof performance !== "undefined" ? performance.now() : Date.now())) - startedAt;
    this.options.onMetrics?.({ records: records.length, emitted: emitted.length, processingMs: elapsed });
  }

  private context(): DetectionContext {
    const interaction = this.tracker.latestOutcomeInteraction();
    return {
      documentId: this.options.documentId,
      pageUrl: typeof this.options.pageUrl === "function" ? this.options.pageUrl() : this.options.pageUrl,
      interaction,
      now: this.options.now?.(),
    };
  }

  private emit(events: readonly RecoveryEvent[]): void {
    const now = Date.now();
    for (const event of events) {
      const last = this.dedupe.get(recoveryOutcomeScope(event));
      if (last !== undefined && now - last < LOCAL_DEDUPE_MS) continue;
      this.dedupe.set(recoveryOutcomeScope(event), now);
      if (this.dedupe.size > 80) {
        const oldest = this.dedupe.keys().next().value;
        if (oldest !== undefined) this.dedupe.delete(oldest);
      }
      try {
        this.options.onEvent(event);
      } catch {
        // A failed transport must not stop observation of later outcomes.
      }
    }
  }
}
