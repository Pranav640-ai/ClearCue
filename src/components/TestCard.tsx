import type { CheckResult, DiagnosticCase } from "../inference/diagnostics";
import type { InferenceOutcome } from "../inference/types";
import { ResultBlock } from "./ResultBlock";

interface TestCardProps {
  testCase: DiagnosticCase;
  outcome: InferenceOutcome | undefined;
  check: CheckResult | null;
  running: boolean;
  available: boolean;
  unavailableReason: string | null;
  onRun: () => void;
}

export function TestCard({ testCase, outcome, check, running, available, unavailableReason, onRun }: TestCardProps) {
  return (
    <article className="card test" aria-labelledby={`test-${testCase.id}-title`}>
      <div className="test__head">
        <div>
          <h3 id={`test-${testCase.id}-title`}>{testCase.label}</h3>
          <p className="muted">{testCase.description}</p>
        </div>
        <button type="button" onClick={onRun} disabled={running || !available} aria-describedby={`test-${testCase.id}-expect`}>
          {running ? "Running…" : "Run test"}
        </button>
      </div>

      <p className="expectation" id={`test-${testCase.id}-expect`}>
        <strong>Expected:</strong> {testCase.expectation}
      </p>

      {!available && unavailableReason && <p className="warn">{unavailableReason}</p>}

      {outcome ? (
        <ResultBlock outcome={outcome} check={check} />
      ) : (
        <p className="muted">No result yet. Nothing is simulated: this card stays empty until a real request runs.</p>
      )}
    </article>
  );
}
