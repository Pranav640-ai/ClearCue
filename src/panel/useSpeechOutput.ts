import { experimental } from "./experimental";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ExtensionSettings } from "../shared/types";
import { localSpeechVoices, localUtterance } from "./localSpeech";

export function useSpeechOutput(settings: ExtensionSettings | undefined, scope: string) {
  const enabled = experimental && settings?.speechOutput === "local_voice";
  const synthesis = experimental ? globalThis.speechSynthesis : undefined;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [status, setStatus] = useState("");
  const [active, setActive] = useState(false);
  const [canRepeat, setCanRepeat] = useState(false);
  const current = useRef<SpeechSynthesisUtterance | null>(null);
  const last = useRef<{ text: string; scope: string } | null>(null);

  const cancel = useCallback(() => {
    if (!current.current) return;
    current.current = null;
    synthesis?.cancel();
  }, [synthesis]);

  useEffect(() => {
    if (!enabled || !synthesis) return;
    const refresh = () => setVoices(localSpeechVoices(synthesis));
    refresh();
    synthesis.addEventListener("voiceschanged", refresh);
    return () => synthesis.removeEventListener("voiceschanged", refresh);
  }, [enabled, synthesis]);

  useEffect(() => {
    if (!experimental) return;
    const clear = () => {
      cancel();
      last.current = null;
      setActive(false);
      setCanRepeat(false);
      setStatus("");
    };
    const visibility = () => { if (document.hidden) clear(); };
    clear();
    document.addEventListener("visibilitychange", visibility);
    return () => { document.removeEventListener("visibilitychange", visibility); cancel(); };
  }, [scope, enabled, cancel]);

  function speak(text: string): void {
    if (!enabled || !settings || document.hidden) return;
    cancel();
    setActive(false);
    try {
      const utterance = synthesis && typeof SpeechSynthesisUtterance === "function"
        ? localUtterance(localSpeechVoices(synthesis), settings.speechVoice, settings.speechRate, text,
          (value) => new SpeechSynthesisUtterance(value))
        : null;
      if (!utterance || !synthesis) {
        setStatus("The selected local voice is unavailable. The text is still available.");
        return;
      }
      current.current = utterance;
      utterance.onstart = () => {
        if (current.current !== utterance) return;
        last.current = { text: utterance.text, scope };
        setCanRepeat(true);
      };
      const finish = (message: string) => {
        if (current.current !== utterance) return;
        current.current = null;
        setActive(false);
        setStatus(message);
      };
      utterance.onend = () => finish("");
      utterance.onerror = () => finish("Local speech could not play. The text is still available.");
      setStatus("");
      setActive(true);
      synthesis.speak(utterance);
    } catch {
      cancel();
      setActive(false);
      setStatus("Local speech could not play. The text is still available.");
    }
  }

  return {
    enabled, voices, status, active, canRepeat,
    speak,
    stop: () => { cancel(); setActive(false); setStatus("Speech stopped."); },
    repeat: () => { if (last.current?.scope === scope) speak(last.current.text); },
  };
}
