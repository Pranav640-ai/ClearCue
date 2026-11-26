import type { TabContext } from "../../shared/types";

interface StatusPanelProps {
  context: TabContext;
  pending: string | null;
  onEnable: () => void;
  onDisable: () => void;
  onRefresh: () => void;
}

const STATUS_LABEL: Record<TabContext["status"], string> = {
  connected: "Connected",
  connecting: "Connecting",
  "permission-required": "Access needed",
  "restricted-url": "Unsupported page",
  "no-tab": "No active tab",
  error: "Problem",
};

function describeSnapshot(context: TabContext): string | null {
  const snapshot = context.pageSnapshot;
  if (!snapshot) return null;
  const { forms, fields, buttons, links } = snapshot.counts;
  const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;
  return `Page reports ${plural(forms, "form", "forms")}, ${plural(fields, "field", "fields")}, ${plural(buttons, "button", "buttons")} and ${plural(links, "link", "links")}.`;
}

export function StatusPanel({ context, pending, onEnable, onDisable, onRefresh }: StatusPanelProps): React.JSX.Element {
  const canEnable = Boolean(context.origin) && !context.siteEnabled;
  const canDisable = Boolean(context.origin) && context.siteEnabled;
  const busy = pending === "enable" || pending === "disable";

  return (
    <section className="card status-card" aria-labelledby="status-heading">
      <div className="card-head">
        <div>
          <h2 id="status-heading">This page</h2>
          <p className="card-description">ClearCue inspects one site at a time, and only after you allow it.</p>
        </div>
        <span className={`badge badge-${context.status}`}>{STATUS_LABEL[context.status]}</span>
      </div>

      <dl className="facts">
        <div>
          <dt>Site</dt>
          <dd>{context.origin ?? "Not available"}</dd>
        </div>
        <div>
          <dt>Page</dt>
          <dd>{context.title ?? "Untitled"}</dd>
        </div>
      </dl>

      {context.note ? <p className="note">{context.note}</p> : null}
      {context.status === "permission-required" && context.tabId !== null && !context.origin ? (
        <div className="note note-quiet">
          <p>
            Click the ClearCue toolbar icon, or press <kbd>Alt+Shift+C</kbd>, while this page is active. Chrome grants
            access only when you invoke ClearCue directly; opening the panel from Chrome's side-panel menu does not.
          </p>
          <button type="button" className="button button-small" onClick={onRefresh} disabled={busy}>
            Check this tab again
          </button>
        </div>
      ) : null}
      {context.status === "connected" ? <p className="note note-quiet">{describeSnapshot(context)}</p> : null}

      <div className="actions">
        {canEnable ? (
          <button type="button" className="button button-primary" onClick={onEnable} disabled={busy} aria-busy={busy}>
            {busy ? "Requesting access…" : `Enable on ${context.origin ?? "this site"}`}
          </button>
        ) : null}
        {canDisable ? (
          <button type="button" className="button button-quiet" onClick={onDisable} disabled={busy} aria-busy={busy}>
            {busy ? "Disabling…" : "Disable on this site"}
          </button>
        ) : null}
      </div>

      {context.siteEnabled ? (
        <p className="fine-print">
          Disabling withdraws Chrome's site access and removes the page inspector. Nothing is left running on this site.
        </p>
      ) : null}
    </section>
  );
}
