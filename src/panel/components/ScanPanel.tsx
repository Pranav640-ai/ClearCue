import type { TabScanState } from "../../shared/scan";
import { SCAN_CATEGORY_LABELS } from "../../shared/scan";
import { Section } from "./Section";

/**
 * Accessibility scan panel.
 *
 * Every number and every row below comes from the scanner's real result. When
 * no scan exists, the panel says so instead of showing zeros that could be
 * mistaken for a clean page.
 */

function formatTime(iso: string | null): string {
  if (!iso) return "unknown time";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown time";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function summaryLine(state: TabScanState): string {
  const summary = state.summary;
  if (!summary) return "";
  const parts = [
    `${summary.interactiveCount} interactive control${summary.interactiveCount === 1 ? "" : "s"}`,
    `${Math.round(summary.durationMs)} ms`,
    `scanned ${formatTime(summary.scannedAt)}`,
  ];
  if (summary.truncated) parts.push("results truncated");
  return parts.join(" · ");
}

export function ScanPanel({
  scan,
  pending,
  canScan,
  onRescan,
}: {
  scan: TabScanState;
  pending: string | null;
  canScan: boolean;
  onRescan: () => void;
}): React.JSX.Element {
  const busy = pending === "rescan" || scan.status === "scanning";
  const summary = scan.summary;
  const counts = summary?.counts;

  return (
    <Section id="scan" title="Accessibility scan" description="Deterministic checks run locally on this page. Nothing is sent anywhere and nothing is repaired.">
      {scan.status === "error" ? (
        <p className="notice notice-error" role="alert">
          {scan.error ?? "The scan failed."}
        </p>
      ) : null}

      {!summary ? (
        <>
          <p className="empty">
            {scan.status === "scanning"
              ? "Scanning this page…"
              : "No scan result yet. ClearCue scans automatically once the page is connected."}
          </p>
          <button type="button" className="button button-primary" onClick={onRescan} disabled={busy || !canScan} aria-busy={busy}>
            {busy ? "Scanning…" : "Scan Again"}
          </button>
        </>
      ) : (
        <>
          <dl className="facts">
            <div>
              <dt>Issues found</dt>
              <dd>{summary.issueTotal}</dd>
            </div>
            <div>
              <dt>Missing button labels</dt>
              <dd>{counts?.missingButtonLabels ?? 0}</dd>
            </div>
            <div>
              <dt>Missing form labels</dt>
              <dd>{counts?.missingFormLabels ?? 0}</dd>
            </div>
            <div>
              <dt>Missing link labels</dt>
              <dd>{counts?.missingLinkLabels ?? 0}</dd>
            </div>
            <div>
              <dt>Vague links</dt>
              <dd>{counts?.vagueLinks ?? 0}</dd>
            </div>
            <div>
              <dt>Other issues</dt>
              <dd>{counts?.other ?? 0}</dd>
            </div>
          </dl>

          <p className="fine-print">{summaryLine(scan)}</p>
          {summary.issueTotal === 0 ? (
            <p className="empty">No accessibility issues were detected on this page by the supported checks.</p>
          ) : (
            <p className="fine-print">
              Showing {summary.issues.length} of {summary.issueTotal} issues.
            </p>
          )}

          <button type="button" className="button button-small" onClick={onRescan} disabled={busy || !canScan} aria-busy={busy}>
            {busy ? "Scanning…" : "Scan Again"}
          </button>

          {summary.issues.length > 0 ? (
            <ul className="issue-list" aria-label="Detected accessibility issues">
              {summary.issues.map((issue) => {
                const candidate = issue.candidates[0];
                const keyEvidence = issue.evidence.filter((item) => item.kind === "label" || item.kind === "icon" || item.kind === "nearby-text" || item.kind === "relationship").slice(0, 3);
                return (
                  <li key={issue.id} className="issue">
                    <p className="issue-title">
                      {SCAN_CATEGORY_LABELS[issue.category]}
                      <span className={`severity severity-${issue.severity}`}>
                        {issue.severity === "failure" ? "failure" : "needs context"}
                      </span>
                    </p>
                    <p className="fine-print">
                      {issue.accessibleName ? `Current name: “${issue.accessibleName}”` : "No accessible name"}
                      {` · <${issue.element.tagName}${issue.element.role ? ` role=${issue.element.role}` : ""}>`}
                    </p>
                    {keyEvidence.length > 0 ? (
                      <ul className="evidence" aria-label={`Evidence for ${SCAN_CATEGORY_LABELS[issue.category]}`}>
                        {keyEvidence.map((item) => (
                          <li key={item.id}>
                            <span className="evidence-kind">{item.kind}</span> {item.value}
                            {item.privacy === "local-only" ? <span className="fine-print"> (stays on device)</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="fine-print">
                      {candidate
                        ? `Deterministic candidate: “${candidate.proposedValue}” (${candidate.confidence} confidence, ${candidate.support})`
                        : issue.needsReasoning
                          ? "No deterministic candidate. Further reasoning is required."
                          : "No deterministic candidate."}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      )}
    </Section>
  );
}
