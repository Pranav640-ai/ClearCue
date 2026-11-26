import { useCallback, useState } from "react";
import type { PanelController } from "./usePanelState";
import { sendRecoveryRequest } from "./client";

export interface RecoveryFeedback {
  tone: "info" | "error";
  text: string;
}

export interface RecoveryController {
  busy: string | null;
  feedback: RecoveryFeedback | null;
  jump: (eventId: string) => Promise<void>;
  replay: (eventId: string) => Promise<void>;
  dismiss: (eventId: string) => Promise<void>;
  setAutomatic: (enabled: boolean) => Promise<void>;
  clearFeedback: () => void;
}

export function useRecovery(panel: PanelController): RecoveryController {
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<RecoveryFeedback | null>(null);

  const run = useCallback(
    async (name: string, work: () => Promise<RecoveryFeedback>) => {
      setBusy(name);
      try {
        setFeedback(await work());
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const jump = useCallback(
    async (eventId: string) => {
      await run(`jump:${eventId}`, async () => {
        const result = await sendRecoveryRequest({ kind: "panel:focusRecovery", eventId });
        if (!result.ok) return { tone: "error", text: result.error };
        await panel.refresh();
        return {
          tone: result.data.kind === "focus" && result.data.focused ? "info" : "error",
          text: result.data.message,
        };
      });
    },
    [panel, run],
  );

  const replay = useCallback(
    async (eventId: string) => {
      await run(`replay:${eventId}`, async () => {
        const result = await sendRecoveryRequest({ kind: "panel:replayRecovery", eventId });
        if (!result.ok) return { tone: "error", text: result.error };
        await panel.refresh();
        return { tone: "info", text: result.data.message };
      });
    },
    [panel, run],
  );

  const dismiss = useCallback(
    async (eventId: string) => {
      await run(`dismiss:${eventId}`, async () => {
        const result = await sendRecoveryRequest({ kind: "panel:dismissRecovery", eventId });
        if (!result.ok) return { tone: "error", text: result.error };
        await panel.refresh();
        return { tone: "info", text: result.data.message };
      });
    },
    [panel, run],
  );

  const setAutomatic = useCallback(
    async (enabled: boolean) => {
      await run("recovery-preference", async () => {
        await panel.updateSettings({ announceRecoveryMessages: enabled });
        return {
          tone: "info",
          text: enabled
            ? "ClearCue will announce outcomes only when the page itself does not expose them."
            : "Automatic announcements are off. Replay message still works on request.",
        };
      });
    },
    [panel, run],
  );

  return {
    busy,
    feedback,
    jump,
    replay,
    dismiss,
    setAutomatic,
    clearFeedback: () => setFeedback(null),
  };
}
