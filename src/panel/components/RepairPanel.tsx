import type { PanelState } from "../../shared/types";
import type { ScannedIssue } from "../../shared/scan";
import { SCAN_CATEGORY_LABELS } from "../../shared/scan";
import { ROUTING_REASON_LABELS } from "../../shared/repair";
import type { RepairController } from "../useRepair";
import { Section } from "./Section";

/**
 * Stage 4 repair controls.
 *
 * Every counter and every row comes from stored attempts, applied repairs and
 * real inference records. Nothing here is estimated, and a request that failed
 * is never presented as a repair.
 */

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function attemptTiming(attempt: Pick<import("../../shared/repair").RepairAttempt, "inferenceMs" | "latencyMs">): string {
  return attempt.inferenceMs !== null ? `${attempt.inferenceMs} ms inference` : `${attempt.latencyMs} ms decision`;
}

function sourceLabel(source: string): string {
  if (source === "rule") return "deterministic rule";
  if (source === "on_device") return "on-device AI";
  if (source === "in_cloud") return "cloud AI";
  return "unknown source";
}

const STATUS_LABEL: Record<string, string> = {
  applied: "Applied",
  suggested: "Suggestion",
  abstained: "Abstained",
  failed: "Failed",
};

export function RepairPanel({
  state,
  controller,
  pending,
  onRepairIssue,
}: {
  state: PanelState;
  controller: RepairController;
  pending: string | null;
  onRepairIssue: (issue: ScannedIssue) => void;
}): React.JSX.Element {
  const { repair } = state;
  const issues = state.scan.summary?.issues ?? [];
  const connected = state.context.status === "connected";
  const busy = controller.busy || pending === "rescan";
  const device = controller.device;

  return (
    <Section
      id="repair"
      title="Repair engine"
      description="Rules work offline. Supported single-icon repairs can use local visual AI. Cloud assistance requires your permission."
    >
      <div className="repair-status">
        <p>
          <strong>On-device model:</strong>{" "}
          {device.availability === "available"
            ? "available and ready for proposals"
            : device.availability === "downloadable"
              ? "not downloaded"
              : device.availability === "downloading"
                ? "downloading"
                : device.availability === "unavailable"
                  ? "unavailable in this browser"
                  : "availability unknown"}
          .
        </p>
        <p className="fine-print">{device.message}</p>
        {device.availability !== "available" ? (
          <button
            type="button"
            className="button button-small"
            onClick={() => void controller.initializeDevice()}
            disabled={device.initializing}
            aria-busy={device.initializing}
          >
            {device.initializing ? "Initializing…" : "Initialize on-device AI"}
          </button>
        ) : (
          <button type="button" className="button button-small" onClick={() => void controller.refreshDevice()}>
            Check again
          </button>
        )}
        <p className="fine-print">
          Cloud consent: {state.settings.privacyMode === "cloud_allowed" && state.settings.cloudOptInAt ? "allowed" : "not allowed"} · The last
          actual SDK source {state.repair.lastInference ? sourceLabel(state.repair.lastInference.source) : "no inference yet"}
          {state.repair.lastInference?.requestedSource && (
            <> · requested {sourceLabel(state.repair.lastInference.requestedSource)} · {state.repair.lastInference.attempted ? "sent to SDK" : "stopped before SDK call"}</>
          )}
          {state.repair.lastInference ? ` (${state.repair.lastInference.latencyMs} ms, ${state.repair.lastInference.purpose})` : ""}.
        </p>
      </div>

      {controller.error ? (
        <p className="notice notice-error" role="alert">
          {controller.error}
        </p>
      ) : null}
      {controller.notice ? (
        <div className="notice notice-info" role="status">
          <p>{controller.notice}</p>
          <button type="button" className="notice-dismiss" onClick={controller.clearNotice} aria-label="Dismiss repair message">
            ×
          </button>
        </div>
      ) : null}

      <div className="repair-actions">
        <button
          type="button"
          className="button button-primary"
          onClick={() => void controller.repairIssues(issues)}
          disabled={!connected || busy || repair.paused || issues.length === 0}
          aria-busy={controller.busy}
        >
          {controller.busy ? "Repairing…" : `Repair supported issues (${issues.length})`}
        </button>
        <button type="button" className="button button-small" onClick={() => void controller.setPaused(!repair.paused)} disabled={pending !== null}>
          {repair.paused ? "Resume repair" : "Pause repair"}
        </button>
        <button
          type="button"
          className="button button-small"
          onClick={() => void controller.repairIssues(issues, true)}
          disabled={!connected || busy || repair.paused}
        >
          Rules only
        </button>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={repair.autoRepair}
          onChange={(event) => void controller.setAutoRepair(event.target.checked)}
          disabled={busy}
        />
        <span>
          Repair rule-supported issues automatically
          <span className="fine-print block">Only deterministic, high-confidence rules run automatically. AI proposals always need you.</span>
        </span>
      </label>

      <label className="check">
        <input type="checkbox" checked={controller.localVisual} disabled={busy}
          onChange={(event) => controller.setLocalVisual(event.target.checked)} />
        Use local icon images for individual repairs
      </label>

      {controller.progress ? (
        <div className="repair-progress" role="status" aria-live="polite">
          <p>
            Repairing {controller.progress.done} of {controller.progress.total} issues…
          </p>
          <progress max={controller.progress.total} value={controller.progress.done} aria-label="Repair progress" />
        </div>
      ) : null}

      {controller.lastSummary ? (
        <p className="fine-print" role="status">
          Last run: {controller.lastSummary.deterministic} deterministic, {controller.lastSummary.onDevice} on-device,{" "}
          {controller.lastSummary.cloud} cloud, {controller.lastSummary.suggestions} suggestions, {controller.lastSummary.abstentions} abstentions,{" "}
          {controller.lastSummary.failed} failed.
        </p>
      ) : null}

      <dl className="facts repair-stats">
        <div>
          <dt>Detected</dt>
          <dd>{repair.statistics.detectedIssues}</dd>
        </div>
        <div>
          <dt>Applied now</dt>
          <dd>{repair.statistics.appliedRepairs}</dd>
        </div>
        <div>
          <dt>Deterministic repairs</dt>
          <dd>{repair.statistics.deterministicRepairs}</dd>
        </div>
        <div>
          <dt>On-device repairs</dt>
          <dd>{repair.statistics.onDeviceRepairs}</dd>
        </div>
        <div>
          <dt>Cloud repairs</dt>
          <dd>{repair.statistics.cloudRepairs}</dd>
        </div>
        <div>
          <dt>Suggestions</dt>
          <dd>{repair.statistics.suggestions}</dd>
        </div>
        <div>
          <dt>Abstentions</dt>
          <dd>{repair.statistics.abstentions}</dd>
        </div>
        <div>
          <dt>Inference requests</dt>
          <dd>{repair.statistics.inferenceRequests}</dd>
        </div>
        <div>
          <dt>Cloud escalations</dt>
          <dd>{repair.statistics.cloudEscalations}</dd>
        </div>
        <div>
          <dt>Failed requests</dt>
          <dd>{repair.statistics.failedRequests}</dd>
        </div>
      </dl>

      <h3 className="subheading">Suggestions to review</h3>
      {repair.suggestions.length === 0 ? (
        <p className="empty">No suggestions are waiting for review.</p>
      ) : (
        <ul className="repair-list">
          {repair.suggestions.map((suggestion) => (
            <li key={suggestion.id} className="repair-item">
              <p className="repair-title">“{suggestion.label}”</p>
              <p className="fine-print">
                {SCAN_CATEGORY_LABELS[suggestion.category]} · {sourceLabel(suggestion.source)} · {formatTime(suggestion.createdAt)}
              </p>
              <p className="fine-print">{suggestion.heuristicNotes.join(" ")}</p>
              <div className="repair-actions">
                <button type="button" className="button button-small" onClick={() => void controller.applySuggestion(suggestion)} disabled={busy}>
                  Apply suggestion
                </button>
                <button type="button" className="button button-small" onClick={() => void controller.dismissSuggestion(suggestion.id)} disabled={busy}>
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="subheading">Recent repair decisions</h3>
      {repair.attempts.length === 0 ? (
        <p className="empty">No repair decisions yet.</p>
      ) : (
        <ul className="repair-list">
          {repair.attempts.slice(0, 8).map((attempt) => (
            <li key={attempt.id} className="repair-item">
              <p className="repair-title">
                {STATUS_LABEL[attempt.status] ?? attempt.status}
                {attempt.proposedLabel ? `: “${attempt.proposedLabel}”` : ""}
              </p>
              <p className="fine-print">
                {SCAN_CATEGORY_LABELS[attempt.category]} · {sourceLabel(attempt.source)} · {attemptTiming(attempt)} ·{" "}
                {formatTime(attempt.createdAt)}
              </p>
              <p className="fine-print">
                Why: {attempt.routing.length > 0 ? attempt.routing.map((reason) => ROUTING_REASON_LABELS[reason]).join("; ") : "not recorded"}
              </p>
              {attempt.error ? <p className="fine-print">Error: {attempt.error}</p> : null}
            </li>
          ))}
        </ul>
      )}

      <div className="repair-actions">
        <button
          type="button"
          className="button button-small"
          onClick={() => void controller.undoAll()}
          disabled={busy || repair.statistics.appliedRepairs === 0}
        >
          Undo all repairs on this page
        </button>
        <button type="button" className="button button-small" onClick={() => void controller.repairIssues(issues)} disabled={!connected || busy || repair.paused}>
          Repair individual issues below
        </button>
      </div>

      {issues.length > 0 ? (
        <ul className="repair-issues" aria-label="Issues available for repair">
          {issues.map((issue, index) => {
            const heading = issue.evidence.find((item) => item.kind === "heading")?.value.replace(/^h[1-6]:\s*/i, "").slice(0, 60);
            const detail = heading ? ", " + heading : "";
            return (
            <li key={issue.id} data-testid={`repair-issue-${issue.id}`}>
              <span>
                {SCAN_CATEGORY_LABELS[issue.category]} · {issue.element.tagName.toLowerCase()}
              </span>
              <button
                type="button"
                className="button button-small"
                aria-label={`Repair this issue: ${SCAN_CATEGORY_LABELS[issue.category]}, ${issue.element.tagName}${detail}, ${index + 1} of ${issues.length}`}
                onClick={() => onRepairIssue(issue)}
                disabled={!connected || busy || repair.paused}
              >
                Repair this issue
              </button>
            </li>
            );
          })}
        </ul>
      ) : null}
    </Section>
  );
}
