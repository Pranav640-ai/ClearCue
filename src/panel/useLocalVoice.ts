import { experimental } from "./experimental";
import { useEffect, useRef, useState } from "react";

const language = "en-US";
const options = { langs: [language], processLocally: true as const };

type RecognitionResult = ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean };

export function finalVoiceDraft(result: RecognitionResult | undefined): { text: string; uncertain: boolean } {
  const alternative = result?.isFinal === true ? result[0] : undefined;
  const uncertain = Boolean(alternative && alternative.confidence > 0 && alternative.confidence < 0.5);
  return { text: uncertain ? "" : alternative?.transcript.slice(0, 200) ?? "", uncertain };
}

type Recognizer = {
  processLocally: boolean;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type LocalSpeech = {
  new(): Recognizer;
  available?: (config: typeof options) => Promise<string>;
  install?: (config: typeof options) => Promise<boolean>;
};

export function useLocalVoice(onTranscript: (text: string) => void) {
  const Speech = (globalThis as typeof globalThis & { SpeechRecognition?: LocalSpeech; webkitSpeechRecognition?: LocalSpeech });
  const api = experimental ? Speech.SpeechRecognition ?? Speech.webkitSpeechRecognition : undefined;
  const [availability, setAvailability] = useState("checking");
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("");
  const current = useRef<Recognizer | null>(null);
  const limit = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!experimental) return;
    let live = true;
    if (!api?.available || !("processLocally" in api.prototype)) setAvailability("unavailable");
    else void api.available(options).then((value) => { if (live) setAvailability(value); },
      () => { if (live) setAvailability("unavailable"); });
    const visibilityChanged = () => {
      if (!document.hidden || !current.current) return;
      const recognition = current.current;
      current.current = null;
      window.clearTimeout(limit.current);
      recognition.abort();
      setRecording(false);
      setStatus("Voice input stopped when the panel was hidden.");
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.clearTimeout(limit.current);
      const recognition = current.current;
      current.current = null;
      recognition?.abort();
    };
  }, [api]);

  async function install() {
    if (!api?.install) return;
    setAvailability("downloading");
    try {
      const installed = await api.install(options);
      setAvailability(installed && await api.available?.(options) === "available" ? "available" : "unavailable");
    } catch { setAvailability("unavailable"); }
  }

  function start() {
    if (!api || availability !== "available" || current.current) return;
    try {
      const recognition = new api();
      recognition.processLocally = true;
      if (recognition.processLocally !== true) return;
      recognition.lang = language;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = ({ results }) => {
        if (current.current !== recognition) return;
        const draft = finalVoiceDraft(results[0]);
        if (draft.uncertain) setStatus("Voice input was uncertain. Try again or type the command.");
        if (draft.text) {
          onTranscript(draft.text);
          setStatus("Voice input added. Review it before submitting.");
        }
      };
      recognition.onerror = () => {
        if (current.current === recognition) setStatus("Local voice input failed. You can type your goal.");
      };
      recognition.onend = () => {
        if (current.current === recognition) {
          window.clearTimeout(limit.current);
          current.current = null;
          setRecording(false);
        }
      };
      current.current = recognition;
      recognition.start();
      limit.current = window.setTimeout(() => {
        if (current.current === recognition) stop();
      }, 20000);
      setRecording(true);
      setStatus("Listening on this device.");
    } catch {
      current.current = null;
      setRecording(false);
      setStatus("Could not start local voice input. You can type your goal.");
    }
  }

  function stop() {
    try {
      current.current?.stop();
      setStatus("Finishing voice input.");
    } catch { cancel(); }
  }

  function cancel() {
    const recognition = current.current;
    current.current = null;
    window.clearTimeout(limit.current);
    recognition?.abort();
    setRecording(false);
    setStatus("Cancelled voice input.");
  }

  return { availability, recording, status, canInstall: availability === "downloadable" && Boolean(api?.install), install,
    start, stop, cancel };
}
