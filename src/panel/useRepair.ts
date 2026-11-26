import { useCallback, useEffect, useRef, useState } from "react";
import type { ScannedIssue } from "../shared/scan";
import type {
  LiveTargetCheck,
  RepairAttempt,
  RepairSuggestion,
} from "../shared/repair";
import type { DeviceAvailability } from "../inference/types";
import type { InferenceOutcome, InferenceRequest } from "../inference/types";
import { InferenceMode } from "@firebase/ai";
import type { PanelController } from "./usePanelState";
import { createEngine } from "../inference/engineInstance";
import { probeDeviceCapability } from "../inference/deviceCapability";
import { HybridRepairPipeline, type RepairPlan } from "../repair/pipeline";
import { requestLocalIcon, sendPanelRequest } from "./client";

const LOCAL_BUDGET_PER_DOCUMENT = 12;
const CLOUD_BUDGET_PER_DOCUMENT = 6;
const CHUNK_SIZE = 4;

export interface RepairDeviceState {
  availability: DeviceAvailability;
  message: string | null;
  initializing: boolean;
}

export interface RepairController {
  device: RepairDeviceState;
  localVisual: boolean;
  setLocalVisual: (enabled: boolean) => void;
  busy: boolean;
  progress: { done: number; total: number } | null;
  error: string | null;
  notice: string | null;
  lastSummary: { deterministic: number; onDevice: number; cloud: number; suggestions: number; abstentions: number; failed: number } | null;
  repairIssues: (issues: readonly ScannedIssue[], deterministicOnly?: boolean) => Promise<void>;
  repairOne: (issue: ScannedIssue) => Promise<void>;
  applySuggestion: (suggestion: RepairSuggestion) => Promise<void>;
  dismissSuggestion: (suggestionId: string) => Promise<void>;
  undo: (repairId: string) => Promise<void>;
  undoAll: () => Promise<void>;
  setPaused: (paused: boolean) => Promise<void>;
  setAutoRepair: (enabled: boolean) => Promise<void>;
  initializeDevice: () => Promise<void>;
  refreshDevice: () => Promise<void>;
  clearNotice: () => void;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function hasDeterministicCandidate(issue: ScannedIssue): boolean {
  return issue.candidates.some(
    (item) =>
      (item.kind === "aria-label" || item.kind === "associated-label" || item.kind === "link-context") &&
      item.support === "direct" &&
      item.confidence === "high",
  );
}

export function useRepair(panel: PanelController): RepairController {
  const engineRef = useRef(createEngine());
  const budgetsRef = useRef(new Map<string, { local: number; cloud: number }>());
  const autoRunRef = useRef<string | null>(null);
  const localRunning = useRef(false);

  const [device, setDevice] = useState<RepairDeviceState>({
    availability: "unknown",
    message: "Checking whether this Chrome can run the on-device model.",
    initializing: false,
  });
  const [busy, setBusy] = useState(false);
  const [localVisual, setLocalVisual] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<RepairController["lastSummary"]>(null);
  const busyRef = useRef(false);
  const activeRun = useRef<AbortController | null>(null);

  const context = panel.state?.context;
  useEffect(() => {
    const stop = () => activeRun.current?.abort();
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [context?.tabId, context?.documentId, context?.url, context?.status, panel.state?.settings.repairPaused]);

  const refreshDevice = useCallback(async () => {
    try {
      const capability = await probeDeviceCapability();
      setDevice((current) => ({
        availability: capability.availability,
        message: capability.detail,
        initializing: current.initializing,
      }));
    } catch (probeError) {
      setDevice({
        availability: "unknown",
        message: `Could not check on-device availability: ${probeError instanceof Error ? probeError.message : String(probeError)}`,
        initializing: false,
      });
    }
  }, []);

  useEffect(() => {
    void refreshDevice();
  }, [refreshDevice]);

  const initializeDevice = useCallback(async () => {
    setDevice((current) => ({ ...current, initializing: true, message: "Requesting the on-device model from this click…" }));
    try {
      await engineRef.current.initializeDeviceModel((progressValue) => {
        setDevice((current) => ({
          ...current,
          message: `Preparing the on-device model… ${Math.round(progressValue * 100)}%`,
        }));
      });
      const capability = await probeDeviceCapability();
      setDevice({
        availability: capability.availability,
        message: capability.detail,
        initializing: false,
      });
      setNotice("The on-device model is ready for repair proposals.");
    } catch (initError) {
      const message = initError instanceof Error ? initError.message : String(initError);
      setDevice({ availability: "unavailable", message, initializing: false });
      setError(`On-device initialization failed: ${message}`);
    }
  }, []);

  const ensureBudget = useCallback((documentId: string) => {
    const existing = budgetsRef.current.get(documentId);
    if (existing) return existing;
    const fresh = { local: LOCAL_BUDGET_PER_DOCUMENT, cloud: CLOUD_BUDGET_PER_DOCUMENT };
    if (budgetsRef.current.size >= 32) {
      const oldest = budgetsRef.current.keys().next().value;
      if (oldest !== undefined) budgetsRef.current.delete(oldest);
    }
    budgetsRef.current.set(documentId, fresh);
    return fresh;
  }, []);

  const runInference = useCallback(
    async (request: InferenceRequest, documentId: string): Promise<InferenceOutcome> => {
      const local = request.mode === InferenceMode.ONLY_ON_DEVICE;
      // The installed Firebase adapter does not forward the request abort signal
      // to Nano. Keep the slot until the actual SDK promise settles.
      if (local && localRunning.current) throw new Error("The previous on-device request is still finishing.");
      const budget = ensureBudget(documentId);
      if (local) {
        localRunning.current = true;
        budget.local -= 1;
      } else {
        budget.cloud -= 1;
      }
      const started = now();
      const outcome = await engineRef.current.run(request).finally(() => {
        if (local) localRunning.current = false;
      });
      if (request.signal?.aborted) return outcome;
      const latencyMs = outcome.latencyMs ?? Math.round(now() - started);
      const source =
        outcome.actualSource === "on_device" || outcome.actualSource === "in_cloud" ? outcome.actualSource : "unknown";
      await sendPanelRequest({
        kind: "panel:recordInference",
        requestedSource: local ? "on_device" : "in_cloud",
        attempted: outcome.attempted === true,
        source,
        latencyMs,
        purpose: request.key,
        ok: outcome.status === "success",
        error: outcome.error?.code ?? null,
      });
      return outcome;
    },
    [ensureBudget],
  );

  const checkTarget = useCallback(async (issue: ScannedIssue, documentId: string): Promise<LiveTargetCheck | null> => {
    const result = await sendPanelRequest({
      kind: "panel:checkTarget",
      documentId,
      issueId: issue.id,
      locator: issue.element.locator,
      expectedTag: issue.element.tagName,
    });
    return result.ok ? (result.data as unknown as LiveTargetCheck) : null;
  }, []);

  const recordAttempt = useCallback(async (attempt: RepairAttempt) => {
    await sendPanelRequest({ kind: "panel:recordAttempt", attempt });
  }, []);

  const applyPlan = useCallback(
    async (plan: RepairPlan, signal?: AbortSignal): Promise<"applied" | "failed" | "suggested" | "abstained"> => {
      const started = now();
      const base = {
        issueId: plan.issue.id,
        category: plan.issue.category,
        tabId: panel.state?.context.tabId ?? null,
        documentId: panel.state?.context.documentId ?? "",
        pageUrl: "",
        source: plan.source,
        routing: plan.routing,
        checks: plan.checks.slice(0, 12),
        heuristicNotes: plan.heuristicNotes.slice(0, 8),
        proposedLabel: plan.label,
        createdAt: new Date().toISOString(),
      } as const;

      if (plan.action === "abstain" || !plan.label || plan.source === "unknown") {
        await recordAttempt({
          ...base,
          id: crypto.randomUUID(),
          status: "abstained",
          action: "abstain",
          appliedRepairId: null,
          latencyMs: Math.round(now() - started),
          inferenceMs: plan.inferenceMs,
          error: plan.error,
        });
        return "abstained";
      }

      const suggestion = async (): Promise<"suggested"> => {
        const item: RepairSuggestion = {
          id: crypto.randomUUID(),
          issueId: plan.issue.id,
          category: plan.issue.category,
          documentId: panel.state?.context.documentId ?? "",
          pageUrl: "",
          label: plan.label ?? "",
          source: base.source === "unknown" ? "rule" : base.source,
          reasons: plan.routing,
          heuristicNotes: plan.heuristicNotes.slice(0, 8),
          createdAt: new Date().toISOString(),
        };
        await sendPanelRequest({ kind: "panel:recordSuggestion", suggestion: item });
        await recordAttempt({
          ...base,
          id: crypto.randomUUID(),
          status: "suggested",
          action: "suggest",
          appliedRepairId: null,
          latencyMs: Math.round(now() - started),
          inferenceMs: plan.inferenceMs,
          error: null,
        });
        return "suggested";
      };

      if (plan.action === "suggest") return suggestion();

      const proposalCheck = await checkTarget(plan.issue, base.documentId);
      if (signal?.aborted) return "failed";
      if (!proposalCheck || !proposalCheck.found || proposalCheck.replaced) {
        const message = "The target changed before the repair could be applied.";
        await recordAttempt({
          ...base,
          id: crypto.randomUUID(),
          status: "failed",
          action: "apply",
          appliedRepairId: null,
          latencyMs: Math.round(now() - started),
          inferenceMs: plan.inferenceMs,
          error: message,
        });
        setError(message);
        return "failed";
      }
      if (proposalCheck.accessibleName.trim().length > 0) {
        const message = "The control gained an accessible name, so ClearCue did not overwrite it.";
        await recordAttempt({
          ...base,
          id: crypto.randomUUID(),
          status: "failed",
          action: "apply",
          appliedRepairId: null,
          latencyMs: Math.round(now() - started),
          inferenceMs: plan.inferenceMs,
          error: message,
        });
        setError(message);
        return "failed";
      }

      const result = await sendPanelRequest({
        kind: "panel:repairApply",
        request: {
          issueId: plan.issue.id,
          documentId: panel.state?.context.documentId ?? "",
          locator: plan.issue.element.locator,
          expectedTag: plan.issue.element.tagName,
          label: plan.label.slice(0, 120),
          kind: "accessible-name",
          target: "aria-label",
          snapshot: plan.attributes,
          proposedBy: plan.source,
          explanation: plan.explanation.slice(0, 300),
        },
      });
      if (!result.ok) {
        await recordAttempt({
          ...base,
          id: crypto.randomUUID(),
          status: "failed",
          action: "apply",
          appliedRepairId: null,
          latencyMs: Math.round(now() - started),
          inferenceMs: plan.inferenceMs,
          error: result.error.slice(0, 300),
        });
        setError(result.error);
        return "failed";
      }
      const applied =
        result.data.repairs.find(
          (repair) =>
            repair.issueId === plan.issue.id &&
            repair.newValue === plan.label &&
            repair.undoneAt === null &&
            (repair.documentId === undefined || repair.documentId === panel.state?.context.documentId),
        ) ?? null;
      await recordAttempt({
        ...base,
        id: crypto.randomUUID(),
        status: "applied",
        action: "apply",
        appliedRepairId: applied?.id ?? null,
        latencyMs: Math.round(now() - started),
        inferenceMs: plan.inferenceMs,
        error: null,
      });
      return "applied";
    },
    [panel.state?.context.documentId, panel.state?.context.tabId, panel.state?.context.url, recordAttempt, checkTarget],
  );

  const runIssues = useCallback(
    async (issues: readonly ScannedIssue[], deterministicOnly: boolean) => {
      if (busyRef.current) return;
      if (panel.state?.settings.repairPaused) {
        setNotice("Repair work is paused. Resume it before running repairs.");
        return;
      }
      if (!panel.state?.context.documentId || panel.state.context.status !== "connected") {
        setError("The page is not connected. Enable the site and reload the page first.");
        return;
      }
      const segment = Array.from(new Set(issues.map((issue) => issue.id)))
        .map((id) => issues.find((issue) => issue.id === id))
        .filter((issue): issue is ScannedIssue => Boolean(issue));
      let pool = segment;
      if (deterministicOnly) pool = pool.filter(hasDeterministicCandidate);
      if (pool.length === 0) {
        setNotice("No issues on this page match that repair mode.");
        return;
      }

      busyRef.current = true;
      const run = new AbortController();
      activeRun.current = run;
      setBusy(true);
      setError(null);
      setNotice(null);
      setProgress({ done: 0, total: pool.length });
      const summary = { deterministic: 0, onDevice: 0, cloud: 0, suggestions: 0, abstentions: 0, failed: 0 };
      const startingContext = panel.state.context;
      const documentId = panel.state.context.documentId;
      const getCurrentContext = async () => {
        if (run.signal.aborted) return null;
        const result = await sendPanelRequest({ kind: "panel:getState" });
        if (run.signal.aborted || !result.ok) return null;
        const { context, settings } = result.data;
        return context.tabId === startingContext.tabId && context.documentId === documentId &&
          context.url === startingContext.url && context.status === "connected" && !settings.repairPaused
          ? result.data : null;
      };
      const stop = () => {
        setLastSummary(summary);
        setNotice(run.signal.aborted
          ? "Repair work stopped. Remaining proposals were discarded."
          : "The page or repair settings changed. Remaining proposals were discarded.");
      };
      try {
        const capability = deterministicOnly ? null : await probeDeviceCapability();
        const localAvailable = capability?.availability === "available";
        console.debug("[ClearCue][repair] device capability before planning", {
          availability: capability?.availability,
          localAvailable,
        });
        if (capability) setDevice({ availability: capability.availability, message: capability.detail, initializing: false });
        let done = 0;
        for (let index = 0; index < pool.length; index += CHUNK_SIZE) {
          const chunk = pool.slice(index, index + CHUNK_SIZE);
          const current = await getCurrentContext();
          if (!current) return stop();
          const budget = ensureBudget(documentId);
          const pipeline = new HybridRepairPipeline({
            runInference: async (request) => {
              const fresh = await getCurrentContext();
              if (request.signal?.aborted || !fresh || (request.mode === InferenceMode.ONLY_IN_CLOUD &&
                (fresh.settings.privacyMode !== "cloud_allowed" || fresh.settings.cloudOptInAt === null ||
                  fresh.settings.cloudOptInAt !== current.settings.cloudOptInAt ||
                  fresh.settings.maxCloudEvidenceCharacters < current.settings.maxCloudEvidenceCharacters))) {
                throw new Error("Inference was cancelled because the page or privacy settings changed.");
              }
              return runInference(request, documentId);
            },
            checkTarget: (issue) => checkTarget(issue, documentId),
            getLocalIcon: localVisual && pool.length === 1 && !deterministicOnly ? async (issue) => {
              const visual = await probeDeviceCapability(true);
              if (visual.availability !== "available" || !(await getCurrentContext())) return null;
              return requestLocalIcon(documentId, issue.id);
            } : undefined,
          });
          const plans = await pipeline.plan(chunk, {
            tabId: panel.state.context.tabId,
            documentId,
            pageUrl: panel.state.context.url ?? "",
            settings: current.settings,
            deterministicOnly,
            authorized: true,
            scanIssueIds: new Set(panel.state.scan.summary?.issues.map((issue) => issue.id) ?? []),
            localAvailable,
            localBudgetRemaining: budget.local,
            cloudBudgetRemaining: budget.cloud,
            signal: run.signal,
          });
          if (plans.length === 0 && !(await getCurrentContext())) return stop();
          console.debug("[ClearCue][repair] plans ready", {
            requested: chunk.length,
            planned: plans.length,
            sources: plans.map((plan) => plan.source),
            actions: plans.map((plan) => plan.action),
            inferenceMs: plans.map((plan) => plan.inferenceMs),
          });
          for (const plan of plans) {
            if (!(await getCurrentContext()) || run.signal.aborted) return stop();
            const outcome = await applyPlan(plan, run.signal);
            if (run.signal.aborted && outcome === "failed") return stop();
            if (outcome === "abstained") summary.abstentions += 1;
            else if (outcome === "suggested") summary.suggestions += 1;
            else if (outcome === "failed") summary.failed += 1;
            else if (plan.source === "rule") summary.deterministic += 1;
            else if (plan.source === "in_cloud") summary.cloud += 1;
            else summary.onDevice += 1;
            done += 1;
            setProgress({ done, total: pool.length });
          }
        }
        if (run.signal.aborted) return stop();
        setLastSummary(summary);
        await panel.refresh();
        if (run.signal.aborted) return stop();
        setNotice(
          `${summary.deterministic + summary.onDevice + summary.cloud} applied, ${summary.suggestions} suggestions, ${summary.abstentions} abstentions${summary.failed > 0 ? `, ${summary.failed} failed` : ""}.`,
        );
      } catch (runError) {
        setError(`Repair run failed: ${runError instanceof Error ? runError.message : String(runError)}`);
      } finally {
        activeRun.current = null;
        busyRef.current = false;
        setBusy(false);
        setProgress(null);
      }
    },
    [applyPlan, checkTarget, ensureBudget, localVisual, panel, runInference],
  );

  const repairIssues = useCallback(
    (issues: readonly ScannedIssue[], deterministicOnly = false) => runIssues(issues, deterministicOnly),
    [runIssues],
  );

  const repairOne = useCallback((issue: ScannedIssue) => runIssues([issue], false), [runIssues]);

  const applySuggestion = useCallback(
    async (suggestion: RepairSuggestion) => {
      if (busyRef.current || suggestion.documentId !== panel.state?.context.documentId) return;
      const issue = panel.state?.scan.summary?.issues.find((item) => item.id === suggestion.issueId);
      if (!issue) {
        setError("That suggestion belongs to an issue that is no longer on the page.");
        return;
      }
      const live = await checkTarget(issue, suggestion.documentId);
      if (!live || !live.found) {
        setError("That suggestion belongs to an element that is no longer on the page.");
        return;
      }
      if (live.accessibleName.trim().length > 0) {
        setError("The control now has an accessible name, so the suggestion was not applied.");
        return;
      }
      const plan: RepairPlan = {
        issue,
        action: "apply",
        source: suggestion.source,
        label: suggestion.label,
        evidenceIds: issue.evidence.map((item) => item.id),
        routing: suggestion.reasons,
        checks: ["Reviewed and accepted by the user.", "Live target re-checked before applying."],
        heuristicNotes: suggestion.heuristicNotes,
        explanation: "Applied after explicit user review of a suggestion.",
        inferenceMs: null,
        error: null,
        attributes: live.attributes,
      };
      busyRef.current = true;
      setBusy(true);
      try {
        if (await applyPlan(plan) !== "applied") return;
        await sendPanelRequest({ kind: "panel:dismissSuggestion", suggestionId: suggestion.id });
        await panel.refresh();
        setNotice(`Applied suggestion "${suggestion.label}".`);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [applyPlan, checkTarget, panel],
  );

  const dismissSuggestion = useCallback(
    async (suggestionId: string) => {
      const result = await sendPanelRequest({ kind: "panel:dismissSuggestion", suggestionId });
      if (result.ok) await panel.refresh();
      else setError(result.error);
    },
    [panel],
  );

  const undo = useCallback(
    async (repairId: string) => {
      setError(null);
      const result = await sendPanelRequest({ kind: "panel:undoRepair", repairId });
      if (result.ok) {
        await panel.refresh();
        setNotice("Repair undone and the original attributes restored.");
      } else {
        setError(result.error);
      }
    },
    [panel],
  );

  const undoAll = useCallback(async () => {
    setError(null);
    const result = await sendPanelRequest({ kind: "panel:undoAllRepairs" });
    if (result.ok) {
      await panel.refresh();
      setNotice("All repairs on this page were undone where the page allowed it.");
    } else {
      setError(result.error);
    }
  }, [panel]);

  const setPaused = useCallback(
    async (paused: boolean) => {
      if (paused) activeRun.current?.abort();
      await panel.updateSettings({ repairPaused: paused });
      const result = await sendPanelRequest({ kind: "panel:getState" });
      if (!result.ok || result.data.settings.repairPaused !== paused) return;
      setNotice(paused ? "Repair work paused. Scanning continues." : "Repair work resumed.");
    },
    [panel],
  );

  const setAutoRepair = useCallback(
    async (enabled: boolean) => {
      await panel.updateSettings({ autoRepair: enabled });
      setNotice(
        enabled
          ? "Automatic repair will apply only repairs backed by a deterministic rule."
          : "Automatic repair is off.",
      );
    },
    [panel],
  );

  // Deterministic automatic mode: once per scan revision, apply only rule-backed
  // repairs. It never starts AI requests without an explicit user action.
  useEffect(() => {
    const summary = panel.state?.scan.summary;
    if (!panel.state?.settings.autoRepair || panel.state.settings.repairPaused) return;
    if (!summary || panel.state.context.status !== "connected" || busyRef.current) return;
    const key = `${summary.documentId}:${summary.scannedAt}:${summary.issueTotal}`;
    if (autoRunRef.current === key) return;
    const issues = summary.issues.filter(hasDeterministicCandidate);
    if (issues.length === 0) return;
    autoRunRef.current = key;
    const timer = setTimeout(() => {
      void runIssues(issues, true);
    }, 600);
    return () => clearTimeout(timer);
  }, [panel.state?.scan.summary, panel.state?.settings.autoRepair, panel.state?.settings.repairPaused, panel.state?.context.status, runIssues]);

  return {
    device,
    localVisual,
    setLocalVisual,
    busy,
    progress,
    error,
    notice,
    lastSummary,
    repairIssues,
    repairOne,
    applySuggestion,
    dismissSuggestion,
    undo,
    undoAll,
    setPaused,
    setAutoRepair,
    initializeDevice,
    refreshDevice,
    clearNotice: () => setNotice(null),
  };
}
