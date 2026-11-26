import type { PageNavigator } from "../../content/navigator";

export type SortOption = { element: HTMLOptionElement; label: string };
export type PracticeCapability =
  | { kind: "disclosure"; target: HTMLElement; details: HTMLDetailsElement; name: string }
  | { kind: "sort"; target: HTMLSelectElement; options: readonly SortOption[];
    render: (index: number) => void; ordered: (index: number) => boolean };

export type PracticeAction = { kind: "open" | "close" | "toggle" } | { kind: "sort"; option: number };
export type ActionOutcome = { status: "blocked" | "observed" | "uncertain"; message: string };
export type ActionAuthorization = Readonly<{
  commandId: string; documentKey: string; snapshotId: string; candidateId: string;
  action: Readonly<PracticeAction>; authorization: "explicit"; expiresAt: number;
}>;

const blocked = (message: string): ActionOutcome => ({ status: "blocked", message });
const observed = (message: string): ActionOutcome => ({ status: "observed", message });

export class PracticeActions {
  private readonly documentKey = crypto.randomUUID();
  private pending: ActionAuthorization | null = null;

  constructor(
    private readonly doc: Document,
    private readonly trustedUrl: string,
    private readonly navigator: Pick<PageNavigator, "resolve">,
    private readonly capabilities: ReadonlyMap<Element, PracticeCapability>,
    private readonly clock = Date.now,
  ) {}

  private trusted(): boolean {
    const view = this.doc.defaultView;
    return this.doc.URL === this.trustedUrl && Boolean(view && view === view.top && !this.doc.hidden);
  }

  authorize(snapshotId: string, candidateId: string, action: PracticeAction,
    input: { trustedSubmit: boolean; enabled: boolean }): ActionAuthorization | null {
    this.cancel();
    if (!this.trusted() || !input.trustedSubmit || !input.enabled) return null;
    this.pending = Object.freeze({ commandId: crypto.randomUUID(), documentKey: this.documentKey, snapshotId,
      candidateId, action: Object.freeze({ ...action }), authorization: "explicit", expiresAt: this.clock() + 15000 });
    return this.pending;
  }

  cancel(): void { this.pending = null; }

  execute(command: ActionAuthorization): ActionOutcome {
    if (command !== this.pending) return blocked("This command is cancelled, already used, or from another document.");
    this.cancel();
    if (!this.trusted() || command.documentKey !== this.documentKey || command.expiresAt <= this.clock()) {
      return blocked("Command expired or the practice page is no longer active.");
    }
    const target = this.navigator.resolve(command.snapshotId, command.candidateId);
    if ("reason" in target) return blocked(target.reason);
    if (typeof target.element.checkVisibility === "function" && !target.element.checkVisibility()) {
      return blocked("The target is no longer visible.");
    }
    const capability = this.capabilities.get(target.element);
    if (!capability || capability.target !== target.element) return blocked("This control has no supported action. Use it manually.");

    if (command.action.kind === "sort" && capability.kind === "sort") {
      const { target: select, options, render, ordered } = capability;
      const index = command.action.option;
      if (select.form || select.multiple || select.options.length !== options.length || !options[index] ||
        options.some(({ element, label }, position) => select.options[position] !== element ||
          element.label !== label || element.disabled || element.hidden || element.parentElement !== select)) {
        return blocked("The sorting options changed. Review the current control before trying again.");
      }
      select.selectedIndex = index;
      try {
        render(index);
      } catch {
        return { status: "uncertain", message: "The selection changed, but the product update could not be verified." };
      }
      return select.selectedIndex === index && ordered(index) ? observed(`Selected ${options[index].label}. Product order verified.`)
        : { status: "uncertain", message: "The sorting update ran, but the selected option and product order could not both be verified." };
    }
    if (command.action.kind !== "sort" && capability.kind === "disclosure") {
      const { details, target: summary, name } = capability;
      if (summary.parentElement !== details || details.firstElementChild !== summary || details.hasAttribute("name") ||
        summary.localName !== "summary" || details.localName !== "details" || details.closest("form")) {
        return blocked("The disclosure changed. Review the current control before trying again.");
      }
      const open = command.action.kind === "toggle" ? !details.open : command.action.kind === "open";
      if (details.open === open) return observed(`${name} is already ${open ? "open" : "closed"}.`);
      details.open = open;
      return details.open === open && details.isConnected ? observed(`${name} ${open ? "opened" : "closed"}.`)
        : { status: "uncertain", message: "The disclosure state could not be verified after the update." };
    }
    return blocked("That action is unsupported for this control. Use the control manually.");
  }
}
