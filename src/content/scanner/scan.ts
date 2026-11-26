import { countIssues, DEFAULT_SCAN_LIMITS, type ScanLimits, type ScanSummary, type ScannedIssue } from "../../shared/scan";
import {
  accessibleNameOf,
  buildPath,
  collectIdCounts,
  collectPageElements,
  isDisabledControl,
  isHidden,
  isInteractive,
  roleOf,
  type CollectedElement,
} from "./dom";
import { detectIssues, isScannable } from "./rules";

/**
 * Scanner orchestration.
 *
 * A full scan computes accessible names for every interactive element. An
 * incremental scan only re-evaluates the elements a mutation can affect
 * (including elements that depend on a changed id through aria-labelledby or
 * label[for]), so typing on a large page does not trigger a full-page scan.
 */

export interface ScanOutcome {
  summary: ScanSummary;
  full: boolean;
}

export class AccessibilityScanner {
  private issues = new Map<string, ScannedIssue>();
  private issueIdsByPath = new Map<string, Set<string>>();
  private elementsByPath = new Map<string, Element>();
  private dependents = new Map<string, Set<Element>>();
  private idCounts = new Map<string, number>();
  private labelTextsById = new Map<string, string[]>();
  private interactiveCount = 0;
  private truncated = false;
  private scannedAt = new Date().toISOString();
  private lastDurationMs = 0;

  constructor(
    private readonly doc: Document,
    readonly documentId: string,
    private readonly limits: ScanLimits = DEFAULT_SCAN_LIMITS,
  ) {}

  private now(): number {
    const view = this.doc.defaultView;
    return view?.performance?.now() ?? Date.now();
  }

  /** Ids whose change affects an element's name. */
  dependentsOf(id: string): Set<Element> {
    return this.dependents.get(id) ?? new Set<Element>();
  }

  getIssues(): ScannedIssue[] {
    return Array.from(this.issues.values());
  }

  /** The exact element instance detected for an issue, used to detect replacement. */
  getElementForIssue(issueId: string): Element | null {
    const issue = this.issues.get(issueId);
    if (!issue) return null;
    return this.elementsByPath.get(issue.element.locator) ?? null;
  }

  clear(): void {
    this.issues.clear();
    this.issueIdsByPath.clear();
    this.elementsByPath.clear();
    this.dependents.clear();
  }

  scanAll(): ScanOutcome {
    const started = this.now();
    const collected = collectPageElements(this.doc, this.limits.maxInteractive);
    this.interactiveCount = collected.interactiveCount;
    this.truncated = collected.truncated;
    this.idCounts = collected.idCounts;
    this.labelTextsById = collected.labelTextsById;
    this.clear();
    this.scannedAt = new Date().toISOString();

    for (const entry of collected.elements) {
      this.evaluate(entry);
    }
    this.removeDisconnected();

    this.lastDurationMs = Math.max(0, this.now() - started);
    return { summary: this.buildSummary(this.lastDurationMs), full: true };
  }

  /** Re-evaluate only the given elements (plus their naming dependents). */
  scanTargets(targets: Iterable<Element>): ScanOutcome {
    const started = this.now();
    this.idCounts = collectIdCounts(this.doc);
    this.scannedAt = new Date().toISOString();

    const queue = new Set<Element>();
    for (const target of targets) queue.add(target);
    for (const target of Array.from(queue)) {
      const id = target.getAttribute("id");
      if (!id) continue;
      for (const dependent of this.dependentsOf(id)) queue.add(dependent);
      if (queue.size > this.limits.maxInteractive) break;
    }

    for (const element of queue) {
      if (!element.isConnected) {
        this.removePath(buildPath(element));
        continue;
      }
      if (!isScannable(element)) {
        this.removePath(buildPath(element));
        continue;
      }
      const isLabel = element.tagName.toLowerCase() === "label" && element.hasAttribute("for");
      if (!isInteractive(element) && !isLabel) continue;
      const entry: CollectedElement = {
        element,
        role: isLabel ? "label" : roleOf(element),
        tag: element.tagName.toLowerCase(),
        name: accessibleNameOf(element),
        hidden: isHidden(element),
        disabled: isDisabledControl(element),
        path: buildPath(element),
      };
      this.removePath(entry.path);
      if (!entry.hidden) this.evaluate(entry);
    }

    this.removeDisconnected();
    this.lastDurationMs = Math.max(0, this.now() - started);
    return { summary: this.buildSummary(this.lastDurationMs), full: false };
  }

  private evaluate(entry: CollectedElement): void {
    if (this.issues.size >= this.limits.maxIssues) {
      this.truncated = true;
      return;
    }
    this.clearDependenciesFor(entry.element);
    const issues = detectIssues(entry, {
      idCounts: this.idCounts,
      documentId: this.documentId,
      labelTextsById: this.labelTextsById,
    });
    for (const detected of issues) this.register(detected, entry.element);
    this.registerDependencies(entry);
  }

  /** Rebuild the dependency edges for one element after its attributes changed. */
  clearDependenciesFor(element: Element): void {
    for (const [id, set] of Array.from(this.dependents.entries())) {
      if (set.delete(element) && set.size === 0) this.dependents.delete(id);
    }
  }

  private register(detected: ScannedIssue, element: Element): void {
    this.issues.set(detected.id, detected);
    this.elementsByPath.set(detected.element.ref, element);
    const existing = this.issueIdsByPath.get(detected.element.ref) ?? new Set<string>();
    existing.add(detected.id);
    this.issueIdsByPath.set(detected.element.ref, existing);
  }

  private registerDependencies(entry: CollectedElement): void {
    const { element } = entry;
    const labelledby = element.getAttribute("aria-labelledby");
    if (labelledby) {
      for (const id of labelledby.trim().split(/\s+/).filter(Boolean)) {
        const set = this.dependents.get(id) ?? new Set<Element>();
        set.add(element);
        this.dependents.set(id, set);
      }
    }
    if (entry.tag === "label") {
      const target = element.getAttribute("for");
      if (target) {
        const set = this.dependents.get(target) ?? new Set<Element>();
        set.add(element);
        this.dependents.set(target, set);
      }
    }
  }

  private removePath(path: string): void {
    const ids = this.issueIdsByPath.get(path);
    if (!ids) return;
    for (const id of ids) this.issues.delete(id);
    this.issueIdsByPath.delete(path);
    this.elementsByPath.delete(path);
  }

  /** Drop issues whose element left the document (removed or replaced). */
  removeDisconnected(): void {
    for (const [path, element] of Array.from(this.elementsByPath.entries())) {
      if (!element.isConnected) this.removePath(path);
    }
  }

  private buildSummary(durationMs: number): ScanSummary {
    const all = Array.from(this.issues.values());
    const counts = countIssues(all);
    const severityRank = { failure: 0, heuristic: 1 } as const;
    const ordered = [...all].sort((left, right) => {
      const severity = severityRank[left.severity] - severityRank[right.severity];
      if (severity !== 0) return severity;
      if (left.category !== right.category) return left.category.localeCompare(right.category);
      return left.element.ref.localeCompare(right.element.ref);
    });

    let url = "";
    let origin = "";
    try {
      const parsed = new URL(this.doc.location.href);
      url = `${parsed.origin}${parsed.pathname}`;
      origin = parsed.origin;
    } catch {
      url = this.doc.location?.href ?? "";
    }

    return {
      documentId: this.documentId,
      url,
      origin,
      scannedAt: this.scannedAt,
      durationMs,
      interactiveCount: this.interactiveCount,
      issueTotal: all.length,
      counts,
      issues: ordered.slice(0, this.limits.maxReturnedIssues),
      truncated: this.truncated || all.length > this.limits.maxReturnedIssues,
      limits: this.limits,
    };
  }
}
