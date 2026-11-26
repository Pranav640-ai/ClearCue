import { useCallback, useEffect, useMemo, useState } from "react";
import { TestCard } from "./components/TestCard";
import { runtimeConfig } from "./inference/config";
import { probeDeviceCapability } from "./inference/deviceCapability";
import { DIAGNOSTIC_CASES, checkOutcome, type CheckResult, type DiagnosticCase } from "./inference/diagnostics";
import { createEngine } from "./inference/engineInstance";
import { toInferenceFailure } from "./inference/errors";
import { getFirebaseRuntime, refreshAppCheckToken, type AppCheckTokenReport } from "./inference/firebase";
import type { DeviceCapability, DeviceInitializationState, InferenceOutcome } from "./inference/types";

const INITIAL_DEVICE_STATE: DeviceInitializationState = {
  status: "idle",
  progress: 0,
  message: null,
  completedAt: null,
};

function extensionVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return "not running as an extension";
  }
}

async function cloudDiagnosticsAllowed(): Promise<boolean> {
  try {
    const reply = await chrome.runtime.sendMessage({ kind: "diagnostics:cloudAllowed" });
    return reply?.ok === true && reply.data === true;
  } catch {
    return false;
  }
}

export function App() {
  const engine = useMemo(() => createEngine(), []);
  const runtime = useMemo(() => getFirebaseRuntime(), []);

  const [capability, setCapability] = useState<DeviceCapability | null>(null);
  const [deviceInit, setDeviceInit] = useState<DeviceInitializationState>(INITIAL_DEVICE_STATE);
  const [results, setResults] = useState<Record<string, InferenceOutcome>>({});
  const [checks, setChecks] = useState<Record<string, CheckResult>>({});
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [suiteRunning, setSuiteRunning] = useState(false);
  const [checkingAppCheck, setCheckingAppCheck] = useState(false);
  const [appCheckReport, setAppCheckReport] = useState<AppCheckTokenReport | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const announce = useCallback((message: string) => {
    setAnnouncement("");
    window.setTimeout(() => setAnnouncement(message), 30);
  }, []);

  useEffect(() => {
    let cancelled = false;
    probeDeviceCapability().then((probed) => {
      if (!cancelled) setCapability(probed);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const checkCloudConnection = useCallback(async () => {
    setCheckingAppCheck(true);
    try {
      if (!(await cloudDiagnosticsAllowed())) {
        setAppCheckReport({ ok: false, tokenLength: null, error: "Cloud diagnostics are disabled in ClearCue settings." });
        return;
      }
      setAppCheckReport(await refreshAppCheckToken(runtime.appCheck));
    } finally {
      setCheckingAppCheck(false);
    }
  }, [runtime.appCheck]);

  const availabilityFor = useCallback(
    (testCase: DiagnosticCase): { available: boolean; reason: string | null } => {
      if (testCase.requirement === "device") {
        if (!runtime.configured) {
          return {
            available: false,
            reason: "Firebase is not configured in this build, so no on-device model handle exists. Add the values from .env.example and rebuild.",
          };
        }
        if (deviceInit.status === "ready") return { available: true, reason: null };
        if (capability?.availability === "unavailable") {
          return {
            available: false,
            reason: `This Chrome reports the on-device model as unavailable: ${capability.detail}`,
          };
        }
        // The click itself is the user gesture the Prompt API requires, so a
        // forced on-device run can initialize the model instead of making the
        // person press a separate button first.
        return { available: true, reason: null };
      }
      if (!runtime.configured) {
        return {
          available: false,
          reason: "Firebase is not configured in this build. Add the values from .env.example, rebuild and reload.",
        };
      }
      return { available: true, reason: null };
    },
    [capability?.availability, capability?.detail, deviceInit.status, runtime.configured],
  );

  const initializeLocalAI = useCallback(async (): Promise<boolean> => {
    setDeviceInit({ status: "initializing", progress: 0, message: "Requesting the on-device model…", completedAt: null });
    announce("Initializing the on-device model. A first-time download can take several minutes.");
    try {
      await engine.initializeDeviceModel((progressValue) => {
        setDeviceInit({
          status: "initializing",
          progress: Math.round(progressValue * 100),
          message: "Preparing the on-device model…",
          completedAt: null,
        });
      });
      const probed = await probeDeviceCapability();
      setCapability(probed);
      setDeviceInit({
        status: "ready",
        progress: 100,
        message: probed.detail,
        completedAt: new Date().toISOString(),
      });
      announce("Local AI initialization completed. On-device tests are now available.");
      return true;
    } catch (error) {
      const failure = toInferenceFailure(error);
      setDeviceInit({
        status: "error",
        progress: 0,
        message: `${failure.message} ${failure.hint}`,
        completedAt: null,
      });
      announce(`Local AI initialization failed: ${failure.message}`);
      return false;
    }
  }, [announce, engine]);

  const runCase = useCallback(
    async (testCase: DiagnosticCase) => {
      setRunning((current) => ({ ...current, [testCase.id]: true }));
      announce(`Running ${testCase.label}.`);
      try {
        if (testCase.requirement === "device" && deviceInit.status !== "ready") {
          const ready = await initializeLocalAI();
          if (!ready) return;
        }
        if (testCase.requirement !== "device" && !(await cloudDiagnosticsAllowed())) {
          announce("Cloud diagnostics are disabled in ClearCue settings.");
          return;
        }
        const outcome = await engine.run(testCase.request);
        const check = checkOutcome(outcome, testCase);
        setResults((current) => ({ ...current, [testCase.id]: outcome }));
        setChecks((current) => ({ ...current, [testCase.id]: check }));
        announce(
          outcome.status === "success"
            ? `${testCase.label} finished from ${outcome.actualSource} in ${outcome.latencyMs ?? "?"} milliseconds. Check ${check.passed ? "passed" : "failed"}.`
            : `${testCase.label} failed: ${outcome.error?.message ?? "unknown error"}.`,
        );
      } finally {
        setRunning((current) => ({ ...current, [testCase.id]: false }));
      }
    },
    [announce, deviceInit.status, engine, initializeLocalAI],
  );

  const runAll = useCallback(async () => {
    setSuiteRunning(true);
    try {
      for (const testCase of DIAGNOSTIC_CASES) {
        if (availabilityFor(testCase).available) await runCase(testCase);
      }
    } finally {
      setSuiteRunning(false);
    }
  }, [availabilityFor, runCase]);

  const initializeLocalAIClick = useCallback(async () => {
    await initializeLocalAI();
  }, [initializeLocalAI]);

  const copyReport = useCallback(async () => {
    const report = {
      product: "ClearCue",
      stage: 1,
      generatedAt: new Date().toISOString(),
      extensionVersion: extensionVersion(),
      buildChannel: runtimeConfig.buildChannel,
      cloudModel: runtimeConfig.cloudModel,
      appCheckMode: runtime.appCheckMode,
      firebaseConfigured: runtime.configured,
      deviceInitialization: deviceInit,
      deviceCapability: capability,
      appCheckReport,
      results,
      checks,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopyStatus("Report copied to the clipboard.");
      announce("Diagnostic report copied to the clipboard.");
    } catch (error) {
      const message = `Could not copy the report: ${error instanceof Error ? error.message : String(error)}`;
      setCopyStatus(message);
      announce(message);
    }
  }, [announce, appCheckReport, capability, checks, deviceInit, results, runtime]);

  const availableCount = DIAGNOSTIC_CASES.filter((testCase) => availabilityFor(testCase).available).length;
  const resultList = Object.values(results);
  const deviceObserved = resultList.some((outcome) => outcome.actualSource === "on_device");
  const cloudObserved = resultList.some((outcome) => outcome.actualSource === "in_cloud");
  const structuredValid =
    checks["device-json"]?.passed === true || checks["cloud-json"]?.passed === true ? true : null;
  const accessibilityAccepted = checks["accessibility-label"]?.passed ?? null;

  return (
    <div className="page">
      <header className="page__header">
        <p className="eyebrow">ClearCue</p>
        <h1>Hybrid inference diagnostics</h1>
        <p className="muted">
          Diagnostics run fictional prompts through Firebase AI Logic and report the actual inference source.
          A private configured build is required for these tests. The clean release supports offline accessibility assistance.
        </p>
        <ul className="pill-row" aria-label="Build facts">
          <li>
            Extension <code>v{extensionVersion()}</code>
          </li>
          <li>
            Build channel <code>{runtimeConfig.buildChannel}</code>
          </li>
          <li>
            Cloud model <code>{runtimeConfig.cloudModel}</code>
          </li>
        </ul>
      </header>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <main>
        <section aria-labelledby="runtime-heading">
          <h2 id="runtime-heading">Runtime and setup</h2>
          <div className="grid">
            <article className="card" aria-labelledby="firebase-heading">
              <h3 id="firebase-heading">Firebase AI Logic</h3>
              {runtime.configured ? (
                <dl className="kv">
                  <dt>Project</dt>
                  <dd>{runtimeConfig.firebase.projectId}</dd>
                  <dt>Status</dt>
                  <dd>Configured — inference goes through the Firebase AI Logic SDK</dd>
                  <dt>Cloud model</dt>
                  <dd>
                    <code>{runtimeConfig.cloudModel}</code>
                  </dd>
                  <dt>App Check</dt>
                  <dd>
                    {runtime.appCheckProvider === "debug"
                      ? "Debug provider (local development)"
                      : runtime.appCheckProvider === "custom"
                        ? "Custom token endpoint (production path)"
                        : "Not initialized"}
                  </dd>
                  <dt>App Check token</dt>
                  <dd>
                    {runtime.initError && <span>{runtime.initError} </span>}
                    {checkingAppCheck
                      ? "Requesting…"
                      : appCheckReport === null
                        ? "Unchecked"
                        : appCheckReport.ok
                        ? `Acquired (${appCheckReport.tokenLength} characters; value never displayed)`
                        : `Failed: ${appCheckReport.error}`}
                    <button type="button" className="button" disabled={checkingAppCheck || !runtime.appCheck}
                      onClick={() => void checkCloudConnection()}>
                      Check cloud connection
                    </button>
                  </dd>
                </dl>
              ) : (
                <div>
                  <p className="warn">
                    Firebase is not configured in this build
                    {runtime.missingFields.length > 0 ? `: missing ${runtime.missingFields.join(", ")}` : ""}.
                    {runtime.initError ? ` Initialization error: ${runtime.initError}` : ""}
                  </p>
                  <p className="muted">
                    Copy <code>.env.example</code> to <code>.env</code>, fill in the web app config, run{" "}
                    <code>npm run build</code> and reload the extension. Cloud and hybrid tests stay disabled until
                    then; nothing is faked in the meantime.
                  </p>
                </div>
              )}
              {runtimeConfig.releaseDebugTokenRejected && (
                <p className="warn">
                  This is a release build and an App Check debug token was configured. The debug token was refused and
                  App Check is not initialized. Use a production attestation provider for release builds.
                </p>
              )}
            </article>

            <article className="card" aria-labelledby="device-heading">
              <h3 id="device-heading">On-device model</h3>
              <dl className="kv">
                <dt>Chrome</dt>
                <dd>{capability?.chromeVersion ?? "unknown"}</dd>
                <dt>window.LanguageModel</dt>
                <dd>{capability ? (capability.languageModelGlobalPresent ? "present" : "absent") : "probing…"}</dd>
                <dt>Availability</dt>
                <dd>
                  <code>{capability?.availability ?? "unknown"}</code>
                  {capability?.detail ? <span className="muted"> — {capability.detail}</span> : null}
                </dd>
                <dt>Initialization</dt>
                <dd>
                  {deviceInit.status === "idle" && "Not initialized this session"}
                  {deviceInit.status === "initializing" && `In progress (${deviceInit.progress}%)`}
                  {deviceInit.status === "ready" && `Ready at ${new Date(deviceInit.completedAt ?? Date.now()).toLocaleTimeString()}`}
                  {deviceInit.status === "error" && "Failed"}
                </dd>
              </dl>

              {deviceInit.status === "initializing" && (
                <div className="progress">
                  <progress max={100} value={deviceInit.progress} aria-label="On-device model download progress" />
                  <span>{deviceInit.progress}%</span>
                </div>
              )}
              {deviceInit.message && <p className={deviceInit.status === "error" ? "warn" : "muted"}>{deviceInit.message}</p>}

              <button type="button" onClick={initializeLocalAIClick} disabled={deviceInit.status === "initializing"}>
                {deviceInit.status === "initializing" ? "Initializing…" : "Initialize Local AI"}
              </button>
              <p className="muted small">
                Calls <code>model.initializeDeviceModel()</code> from this click. A first download can take several
                minutes; the extension never starts it without a user gesture.
              </p>
            </article>

            <article className="card" aria-labelledby="manual-heading">
              <h3 id="manual-heading">Pending manual verification</h3>
              <p className="muted small">
                These cannot be proven by the extension alone. They are listed here so they are never reported as done
                by default.
              </p>
              <ul className="checklist">
                <li>
                  <strong>App Check enforcement:</strong> Firebase console → App Check → APIs → Firebase AI Logic must
                  read “Enforced”, and this build's debug token must be registered.
                </li>
                <li>
                  <strong>Cloud model availability:</strong> confirm <code>{runtimeConfig.cloudModel}</code> is enabled
                  for the project in Firebase console → AI Logic → Models.
                </li>
                <li>
                  <strong>Offline on-device run:</strong> after initialization, disconnect the network and re-run the
                  on-device tests.
                </li>
                <li>
                  <strong>Production cloud access:</strong> a public cloud-enabled build requires a separately
                  verified App Check provider compatible with the extension content security policy.
                </li>
              </ul>
            </article>
          </div>
        </section>

        <section aria-labelledby="tests-heading">
          <div className="section-head">
            <h2 id="tests-heading">Diagnostic tests</h2>
            <div className="toolbar">
              <button type="button" onClick={runAll} disabled={suiteRunning || availableCount === 0}>
                {suiteRunning ? "Running suite…" : `Run all available (${availableCount})`}
              </button>
              <button type="button" className="secondary" onClick={copyReport} disabled={resultList.length === 0}>
                Copy results JSON
              </button>
            </div>
          </div>
          {copyStatus && <p className="muted small">{copyStatus}</p>}

          <div className="grid grid--tests">
            {DIAGNOSTIC_CASES.map((testCase) => {
              const availability = availabilityFor(testCase);
              return (
                <TestCard
                  key={testCase.id}
                  testCase={testCase}
                  outcome={results[testCase.id]}
                  check={checks[testCase.id] ?? null}
                  running={running[testCase.id] === true || suiteRunning}
                  available={availability.available}
                  unavailableReason={availability.reason}
                  onRun={() => void runCase(testCase)}
                />
              );
            })}
          </div>
        </section>

        <section aria-labelledby="summary-heading">
          <h2 id="summary-heading">Session summary</h2>
          <div className="card">
            <dl className="kv kv--wide">
              <dt>Tests completed</dt>
              <dd>{resultList.length} of {DIAGNOSTIC_CASES.length}</dd>
              <dt>On-device inference observed</dt>
              <dd>{deviceObserved ? "yes — an actual response reported ON_DEVICE" : "not yet observed"}</dd>
              <dt>Cloud inference observed</dt>
              <dd>{cloudObserved ? "yes — an actual response reported IN_CLOUD" : "not yet observed"}</dd>
              <dt>Structured JSON validated</dt>
              <dd>{structuredValid === null ? "not yet run" : structuredValid ? "yes" : "no — see failed checks"}</dd>
              <dt>Accessibility label accepted</dt>
              <dd>
                {accessibilityAccepted === null
                  ? "not yet run"
                  : accessibilityAccepted
                    ? "yes — evidence-backed or justified abstention"
                    : "no — see failed checks"}
              </dd>
              <dt>Offline on-device behaviour</dt>
              <dd>pending manual verification (see above)</dd>
            </dl>
            <p className="muted small">
              Every value on this page comes from a real SDK response, a real error, or Chrome's own capability API.
              There is no mock inference path in this build, and the requested mode is never used to guess the actual
              source.
            </p>
          </div>
        </section>
      </main>

      <footer className="page__footer">
        <p>
          ClearCue · Firebase AI Logic diagnostics. Diagnostic prompts contain only fictional content.
        </p>
      </footer>
    </div>
  );
}
