import type { CheckResult } from "../inference/diagnostics";
import type { InferenceOutcome } from "../inference/types";

const SOURCE_LABEL: Record<InferenceOutcome["actualSource"], string> = {
  on_device: "ON_DEVICE",
  in_cloud: "IN_CLOUD",
  unknown: "UNKNOWN",
};

function formatLatency(latencyMs: number | null): string {
  if (latencyMs === null) return "not measured";
  return latencyMs >= 1000 ? `${(latencyMs / 1000).toFixed(2)} s (${latencyMs} ms)` : `${latencyMs} ms`;
}

export function ResultBlock({ outcome, check }: { outcome: InferenceOutcome; check: CheckResult | null }) {
  return (
    <div className="result">
      <dl className="kv">
        <dt>Requested mode</dt>
        <dd>
          <code>{outcome.requestedMode}</code>
        </dd>
        <dt>Actual inferenceSource</dt>
        <dd>
          <span className={`badge badge--${outcome.actualSource}`}>{SOURCE_LABEL[outcome.actualSource]}</span>
        </dd>
        <dt>Latency</dt>
        <dd>{formatLatency(outcome.latencyMs)}</dd>
        <dt>Model</dt>
        <dd>{outcome.model ?? "not reported"}</dd>
        <dt>Recorded</dt>
        <dd>{new Date(outcome.startedAt).toLocaleTimeString()}</dd>
      </dl>

      {outcome.sourceMismatch && (
        <p className="warn">
          The SDK returned a different source than the requested mode. This is shown, not hidden: the request was not
          silently re-routed by ClearCue.
        </p>
      )}

      {outcome.error && (
        <div className="error" role="group" aria-label="Error details">
          <p>
            <strong>Error code:</strong> <code>{outcome.error.code}</code>
          </p>
          <p>
            <strong>Message:</strong> {outcome.error.message}
          </p>
          <p>
            <strong>What to do:</strong> {outcome.error.hint}
          </p>
        </div>
      )}

      {outcome.structured && (
        <div className="structured">
          <p>
            JSON parsed: <strong>{outcome.structured.jsonParsed ? "yes" : "no"}</strong> · Schema valid:{" "}
            <strong>{outcome.structured.schemaValid ? "yes" : "no"}</strong>
          </p>
          {outcome.structured.issues.length > 0 && (
            <ul className="issues">
              {outcome.structured.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {outcome.text !== null && outcome.text !== "" && (
        <>
          <h4>Raw model response</h4>
          <pre className="response">{outcome.text}</pre>
        </>
      )}

      {check && (
        <p className={check.passed ? "check check--pass" : "check check--fail"}>
          <strong>Deterministic check: {check.passed ? "passed" : "failed"}.</strong>{" "}
          {check.notes.length > 0 ? check.notes.join(" ") : "No additional notes."}
        </p>
      )}
    </div>
  );
}
