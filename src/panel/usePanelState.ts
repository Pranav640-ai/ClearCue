import { useCallback, useEffect, useRef, useState } from "react";
import { originPattern } from "../shared/sites";
import type { ExtensionSettings, PanelState } from "../shared/types";
import { sendPanelRequest } from "./client";

export type Notice = { tone: "info" | "error"; text: string } | null;

export interface PanelController {
  state: PanelState | null;
  phase: "loading" | "ready" | "error";
  error: string | null;
  notice: Notice;
  pending: string | null;
  refresh: () => Promise<void>;
  enableSite: () => Promise<void>;
  disableSite: () => Promise<void>;
  disableOrigin: (origin: string) => Promise<void>;
  rescan: () => Promise<void>;
  updateSettings: (patch: Partial<Omit<ExtensionSettings, "schemaVersion">>) => Promise<void>;
  undo: (repairId: string) => Promise<void>;
  openDiagnostics: () => Promise<void>;
  dismissNotice: () => void;
}

const POLL_INTERVAL_MS = 3000;

export function usePanelState(): PanelController {
  const [state, setState] = useState<PanelState | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mutating = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current || mutating.current) return;
    inFlight.current = true;
    try {
      const result = await sendPanelRequest({ kind: "panel:getState" });
      if (result.ok) {
        setState(result.data);
        setPhase("ready");
        setError(null);
      } else {
        setPhase("error");
        setError(result.error);
      }
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const tick = (): void => {
      if (document.visibilityState === "visible") void refresh();
    };
    let update: number | undefined;
    const onMessage = (message: { kind?: string }, sender: chrome.runtime.MessageSender): void => {
      if (sender.id !== chrome.runtime.id || sender.tab || message?.kind !== "bg:panelContextChanged") return;
      window.clearTimeout(update);
      update = window.setTimeout(() => void refresh(), 100);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    const interval = window.setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(update);
      chrome.runtime.onMessage.removeListener(onMessage);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  const run = useCallback(
    async (name: string, work: () => Promise<void>) => {
      setPending(name);
      setNotice(null);
      mutating.current = true;
      try {
        await work();
      } finally {
        mutating.current = false;
        setPending(null);
      }
    },
    [],
  );

  const enableSite = useCallback(async () => {
    const origin = state?.context.origin;
    if (!origin) {
      setNotice({ tone: "error", text: "This tab has no site ClearCue can enable." });
      return;
    }
    await run("enable", async () => {
      let granted = false;
      try {
        granted = await chrome.permissions.request({ origins: [originPattern(origin)] });
      } catch (requestError) {
        setNotice({
          tone: "error",
          text: `Chrome refused the permission request: ${requestError instanceof Error ? requestError.message : String(requestError)}`,
        });
        return;
      }
      if (!granted) {
        setNotice({ tone: "info", text: `Chrome did not grant access to ${origin}. ClearCue cannot inspect the page without it.` });
        return;
      }
      const result = await sendPanelRequest({ kind: "panel:setSiteEnabled", origin, enabled: true });
      if (result.ok) {
        setState(result.data);
        setNotice({ tone: "info", text: `ClearCue is enabled on ${origin}. Reload the page if it does not connect within a few seconds.` });
      } else {
        setNotice({ tone: "error", text: result.error });
      }
    });
  }, [run, state?.context.origin]);

  const disableSite = useCallback(async () => {
    const origin = state?.context.origin;
    if (!origin) return;
    await run("disable", async () => {
      const result = await sendPanelRequest({ kind: "panel:setSiteEnabled", origin, enabled: false });
      if (result.ok) {
        setState(result.data);
        setNotice({ tone: "info", text: `ClearCue is disabled on ${origin} and site access was withdrawn.` });
      } else {
        setNotice({ tone: "error", text: result.error });
      }
    });
  }, [run, state?.context.origin]);

  /** Revoke consent for any origin, not only the active tab. */
  const disableOrigin = useCallback(
    async (origin: string) => {
      await run(`disable:${origin}`, async () => {
        const result = await sendPanelRequest({ kind: "panel:setSiteEnabled", origin, enabled: false });
        if (result.ok) {
          setState(result.data);
          setNotice({ tone: "info", text: `ClearCue is disabled on ${origin} and site access was withdrawn.` });
        } else {
          setNotice({ tone: "error", text: result.error });
        }
      });
    },
    [run],
  );

  const updateSettings = useCallback(
    async (patch: Partial<Omit<ExtensionSettings, "schemaVersion">>) => {
      await run("settings", async () => {
        const result = await sendPanelRequest({ kind: "panel:updateSettings", patch });
        if (result.ok) {
          setState(result.data);
          if (patch.privacyMode) {
            setNotice({
              tone: "info",
              text:
                patch.privacyMode === "cloud_allowed"
                  ? "Cloud inference is now allowed. Only minimal, evidence-classified content can be sent, and only when a repair needs it."
                  : "ClearCue is back to local-only. Page content will not leave the device.",
            });
          }
        } else {
          setNotice({ tone: "error", text: result.error });
        }
      });
    },
    [run],
  );

  const rescan = useCallback(async () => {
    await run("rescan", async () => {
      const result = await sendPanelRequest({ kind: "panel:rescan" });
      if (result.ok) {
        setState(result.data);
      } else {
        setNotice({ tone: "error", text: result.error });
      }
    });
  }, [run]);

  const undo = useCallback(
    async (repairId: string) => {
      await run("undo", async () => {
        const result = await sendPanelRequest({ kind: "panel:undoRepair", repairId });
        if (result.ok) {
          setState(result.data);
          setNotice({ tone: "info", text: "The repair was undone and the page is back to its previous state." });
        } else {
          setNotice({ tone: "error", text: result.error });
        }
      });
    },
    [run],
  );

  const openDiagnostics = useCallback(async () => {
    const result = await sendPanelRequest({ kind: "panel:openDiagnostics" });
    if (!result.ok) setNotice({ tone: "error", text: result.error });
  }, []);

  return {
    state,
    phase,
    error,
    notice,
    pending,
    refresh,
    enableSite,
    disableSite,
    disableOrigin,
    rescan,
    updateSettings,
    undo,
    openDiagnostics,
    dismissNotice: () => setNotice(null),
  };
}
