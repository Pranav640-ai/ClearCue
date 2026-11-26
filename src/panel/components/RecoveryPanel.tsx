import type { RecoveryEvent, RecoveryView } from "../../shared/recovery";
import {
  ANNOUNCEMENT_MECHANISM_LABELS,
  RECOVERY_CATEGORY_LABELS,
} from "../../shared/recovery";
import type { RecoveryController } from "../useRecovery";
import { Section } from "./Section";

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function excerpt(text: string, max = 70): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function statusText(event: RecoveryEvent): string {
  switch (event.announcementStatus) {
    case "announced-by-page":
      return "The page exposed this update through its own accessibility mechanism.";
    case "announced-by-clearcue":
      return "ClearCue updated the page live region.";
    case "preference-off":
      return "Automatic announcements are off. Use Replay message to hear it on request.";
    case "failed":
      return "ClearCue could not update its live region. The observed message is still shown here.";
    default:
      return "Waiting for the announcement result from the page.";
  }
}

function sourceText(event: RecoveryEvent): string {
  if (event.source === "on_device") return "AI interpretation (on-device), checked against the observed evidence.";
  if (event.source === "rule") return "Deterministic classification, no model call.";
  return "Observed directly from page semantics; no model call was needed.";
}

function Outcome({ event, recovery, concise, onRead }: {
  event: RecoveryEvent; recovery: RecoveryController; concise: boolean; onRead?: (text: string) => void;
}): React.JSX.Element {
  const jumpLabel = event.related
    ? `Jump to affected field: ${event.related.name || event.related.tagName}`
    : "Jump to affected field";
  return (
    <div className="recovery-latest">
      <div className="recovery-heading">
        <span className={`badge badge-${event.severity === "error" ? "error" : event.severity === "success" ? "success" : "info"}`}>
          {RECOVERY_CATEGORY_LABELS[event.category]}
        </span>
        {!concise && <span className="fine-print">{formatTime(event.observedAt)}</span>}
      </div>
      <p className="recovery-message">{event.message}</p>
      <dl className="recovery-facts">
        <div>
          <dt>Related control</dt>
          <dd>
            {event.related
              ? `${event.related.name || "Unnamed control"} (${event.related.tagName})`
              : "No reliable field association. ClearCue did not guess."}
          </dd>
        </div>
        {!concise && <div>
          <dt>Existing announcement</dt>
          <dd>{ANNOUNCEMENT_MECHANISM_LABELS[event.existingAnnouncement]}</dd>
        </div>}
        <div>
          <dt>Announcement</dt>
          <dd>{statusText(event)}</dd>
        </div>
      </dl>
      {(!concise || event.association === "inferred") && <p className="fine-print">
        {!concise && sourceText(event)} {event.association === "inferred" ? "The field link is inferred from a shared group, not an explicit reference." : ""}
      </p>}

      <div className="button-row">
        <button
          type="button"
          className="button button-primary"
          onClick={() => void recovery.jump(event.id)}
          disabled={!event.related || recovery.busy !== null}
          aria-label={jumpLabel}
          aria-describedby={event.related ? undefined : "recovery-jump-help"}
        >
          {recovery.busy === `jump:${event.id}` ? "Jumping…" : "Jump to affected field"}
        </button>
        {onRead && <button type="button" className="button" onClick={() => onRead(event.message)}>
          Read recovery message aloud
        </button>}
        <button
          type="button"
          className="button"
          onClick={() => void recovery.replay(event.id)}
          disabled={recovery.busy !== null}
          aria-label={`Replay message: ${excerpt(event.message)}`}
        >
          {recovery.busy === `replay:${event.id}` ? "Replaying…" : "Replay message"}
        </button>
        <button
          type="button"
          className="button button-quiet"
          onClick={() => void recovery.dismiss(event.id)}
          disabled={recovery.busy !== null}
          aria-label={`Dismiss this recovery message: ${excerpt(event.message)}`}
        >
          {recovery.busy === `dismiss:${event.id}` ? "Dismissing…" : "Dismiss"}
        </button>
      </div>
      {!event.related ? (
        <p id="recovery-jump-help" className="fine-print">
          Jump is disabled because more than one control could be responsible, or no control could be identified. ClearCue will not guess.
        </p>
      ) : null}
      <p className="fine-print">
        <a href="#recovery-history">Review all recent recovery outcomes</a>
      </p>
    </div>
  );
}

export function RecoveryPanel({
  recovery,
  controller,
  announceAutomatically,
  onToggleAutomatic,
  concise = false,
  onRead,
}: {
  recovery: RecoveryView;
  controller: RecoveryController;
  announceAutomatically: boolean;
  onToggleAutomatic: (enabled: boolean) => Promise<void>;
  concise?: boolean;
  onRead?: (text: string) => void;
}): React.JSX.Element {
  const latest = recovery.latest;
  return (
    <Section
      id="recovery"
      title="Interaction recovery"
      description="ClearCue observes meaningful page changes after your interaction and explains what happened without guessing."
    >
      {controller.feedback ? (
        <div className={`notice notice-${controller.feedback.tone}`} role="status">
          <p>{controller.feedback.text}</p>
          <button type="button" className="notice-dismiss" onClick={controller.clearFeedback} aria-label="Dismiss recovery update">
            ×
          </button>
        </div>
      ) : null}

      {latest ? (
        <Outcome event={latest} recovery={controller} concise={concise} onRead={onRead} />
      ) : (
        <p className="empty">
          No meaningful outcome has been observed on this page yet. Fill in a form or use a control and ClearCue will report a visible error,
          confirmation or status change here. Existing page live regions are respected and are not repeated.
        </p>
      )}

      <label className="check">
        <input
          type="checkbox"
          checked={announceAutomatically}
          onChange={(event) => void onToggleAutomatic(event.target.checked)}
          disabled={controller.busy !== null}
        />
        <span>
          Announce outcomes through the page live region
          <span className="fine-print block">
            Polite by default; urgent failures use assertive. ClearCue stays silent when the page already announces the same change.
          </span>
        </span>
      </label>

      <div className="stat-grid" role="group" aria-label="Recovery statistics">
        <div className="stat">
          <span className="stat-value">{recovery.statistics.detected}</span>
          <span className="stat-label">Outcomes observed</span>
        </div>
        <div className="stat">
          <span className="stat-value">{recovery.statistics.announcedByClearCue}</span>
          <span className="stat-label">Page live region updated</span>
        </div>
        <div className="stat">
          <span className="stat-value">{recovery.statistics.announcedByPage}</span>
          <span className="stat-label">Already announced by page</span>
        </div>
        <div className="stat">
          <span className="stat-value">{recovery.statistics.withRelatedField}</span>
          <span className="stat-label">Linked to a field</span>
        </div>
      </div>

      <div id="recovery-history">
        <h3>Recent outcomes</h3>
        {recovery.events.length === 0 ? (
          <p className="empty">No recovery history yet.</p>
        ) : (
          <ul className="history">
            {recovery.events.map((event) => (
              <li key={event.id} className="history-item">
                <div>
                  <p className="history-title">
                    {RECOVERY_CATEGORY_LABELS[event.category]}
                    {event.dismissedAt ? " · dismissed" : ""}
                  </p>
                  <p className="recovery-history-text">{excerpt(event.message, 100)}</p>
                  <p className="fine-print">
                    {formatTime(event.observedAt)}
                    {event.related ? ` · ${event.related.name || event.related.tagName}` : " · no field link"}
                    {event.replayCount > 0 ? ` · replayed ${event.replayCount} time${event.replayCount === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
