import { experimental } from "../experimental";
import { useEffect, useRef, useState, useCallback } from "react";
import type { TabContext } from "../../shared/types";
import { navigationWords, rankNavigation, type NavigationContext, type NavigationMatch, type NavigationSnapshot } from "../../shared/navigator";
import { guidanceCommand, guideStep } from "../../shared/guidance";
import type { RecoveryEvent } from "../../shared/recovery";
import { parseNavigatorCommand, refersToCurrentControl } from "../../shared/activation";
import { enhanceNavigation } from "../../inference/navigation";
import { send } from "../client";
import { useLocalVoice } from "../useLocalVoice";
import { Section } from "./Section";

export function NavigatorPanel({ context, barriers, recovery, outcome, concise, onRead }: {
  context: TabContext; barriers: number; recovery: number; outcome: RecoveryEvent | null;
  concise: boolean; onRead?: (text: string) => void;
}): React.JSX.Element {
  const { tabId, documentId, status } = context;
  const [page, setPage] = useState<NavigationSnapshot | null>(null);
  const [goal, setGoal] = useState("");
  const [matches, setMatches] = useState<NavigationMatch[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [reasoning, setReasoning] = useState(false);
  const [focusing, setFocusing] = useState(false);
  const [submitted, setSubmitted] = useState("");
  const [focusedId, setFocusedId] = useState("");
  const [describing, setDescribing] = useState(false);
  const [sessionGoal, setSessionGoal] = useState("");
  const focusHistory = useRef<string[]>([]);
  const suggested = useRef("");
  const commandSequence = useRef(0);
  const focusPending = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const voice = useLocalVoice(setGoal);

  const refresh = useCallback(async () => {
    if (tabId === null || !documentId || status !== "connected") return;
    const sequence = ++requestId.current;
    commandSequence.current++;
    focusHistory.current = [];
    suggested.current = "";
    pending.current?.abort();
    pending.current = null;
    setReasoning(false);
    setPage(null);
    setMatches([]);
    setSubmitted("");
    setFocusedId("");
    setDescribing(false);
    setLoading(true);
    const result = await send<NavigationSnapshot>({ kind: "panel:navigationOverview", tabId, documentId });
    if (requestId.current !== sequence) return;
    setLoading(false);
    if (result.ok && result.data) { setPage(result.data); setNotice(""); }
    else setNotice(result.ok ? "Could not read the page overview." : result.error);
  }, [tabId, documentId, status]);

  useEffect(() => {
    void refresh();
    return () => { requestId.current++; commandSequence.current++; pending.current?.abort(); };
  }, [refresh]);

  async function enhance() {
    if (!matches.length || !submitted || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setReasoning(true);
    const timeout = setTimeout(() => {
      controller.abort();
      if (pending.current === controller) {
        pending.current = null;
        setReasoning(false);
        setNotice("Local AI took too long. Page matches remain available.");
      }
    }, 45000);
    try {
      const result = await enhanceNavigation(submitted, matches, controller.signal);
      if (!controller.signal.aborted) { setMatches(result.matches); setNotice(result.status); }
    } catch {
      if (!controller.signal.aborted) setNotice("Local AI could not rank these controls. Page matches remain available.");
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) { pending.current = null; setReasoning(false); }
    }
  }

  async function focus(candidateId: string, back = false) {
    if (tabId === null || !documentId || !page || focusPending.current) return;
    const generation = requestId.current;
    focusPending.current = true;
    setFocusing(true);
    try {
      const result = await send<{ focused: boolean; reason: string }>({ kind: "panel:navigationFocus", tabId,
        documentId, snapshotId: page.id, candidateId });
      if (requestId.current !== generation) return;
      if (result.ok && result.data?.focused) {
        const previous = focusHistory.current.at(-1);
        if (back) focusHistory.current.pop();
        else if (previous !== candidateId) focusHistory.current = [...focusHistory.current, candidateId].slice(-8);
        setFocusedId(candidateId);
        suggested.current = "";
      }
      setNotice(result.ok ? result.data?.reason || "The page could not confirm focus." : result.error);
    } finally { focusPending.current = false; setFocusing(false); }
  }

  async function readContext(sequence: number): Promise<NavigationContext | undefined> {
    if (tabId === null || !documentId) return;
    const result = await send<NavigationContext>({ kind: "panel:navigationContext", tabId, documentId });
    if (commandSequence.current !== sequence) return;
    if (!result.ok || !result.data) {
      setNotice(result.ok ? "The page did not return current context." : result.error);
      return;
    }
    if (page && page.id === result.data.snapshotId) setPage({ ...page, fields: result.data.fields });
    return result.data;
  }

  async function guide(command: NonNullable<ReturnType<typeof guidanceCommand>>, sequence: number) {
    if (!page) return;
    if (command === "take" || command === "back") {
      const candidate = command === "take" ? suggested.current : focusHistory.current.at(-2);
      if (candidate) await focus(candidate, command === "back");
      else setNotice(command === "take" ? "Ask what's next or choose a matching control first." : "There is no earlier ClearCue focus step on this page.");
      return;
    }
    suggested.current = "";
    const context = await readContext(sequence);
    if (!context || commandSequence.current !== sequence) return;
    if (command === "where") { setNotice(context.text); return; }
    if (!sessionGoal) { setNotice("Enter a goal to start guided navigation."); return; }
    if (context.snapshotId !== page.id) { setNotice("Refresh the page overview before continuing."); return; }
    const next = guideStep(sessionGoal, { ...page, fields: context.fields }, context.focusedId ?? "");
    setMatches(next.matches);
    setSubmitted("");
    suggested.current = next.candidate ?? "";
    setNotice(next.message);
  }

  return <Section id="navigator" title="Context Navigator">
    {status !== "connected" ? <p>Enable ClearCue on the current site to find controls.</p> : <>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (focusPending.current) return;
        pending.current?.abort();
        pending.current = null;
        setReasoning(false);
        if (!page || !goal.trim()) return;
        const sequence = ++commandSequence.current;
        const followUp = guidanceCommand(goal);
        if (followUp) {
          setDescribing(false);
          void guide(followUp, sequence);
          return;
        }
        suggested.current = "";
        const command = parseNavigatorCommand(goal);
        setDescribing(command.kind === "describe");
        if (command.kind === "cancel" || command.kind === "overview") {
          setMatches([]);
          setSubmitted("");
          if (command.kind === "cancel") {
            if (voice.recording) voice.cancel();
            setGoal("");
            setSessionGoal("");
          }
          setNotice(command.kind === "cancel" ? "Command cancelled." : "Review the page overview below.");
          return;
        }
        if (!("target" in command)) return;
        const contextTarget = refersToCurrentControl(command.target) ? page.controls.find((control) => control.id === focusedId) : undefined;
        const ranked = rankNavigation(contextTarget?.name || command.target, contextTarget ? [contextTarget] : page.controls);
        const canRank = command.kind === "find" || command.kind === "focus";
        if (canRank) setSessionGoal(command.target.trim());
        setSubmitted(canRank ? command.target : "");
        setMatches(ranked);
        const overviewGoal = navigationWords(command.target).length === 0;
        setNotice(command.kind === "describe" ? (ranked.length ? "Review the observed control information below."
          : "No verified control to describe. Find a named control and move focus first.")
          : !canRank ? "ClearCue cannot verify that activation is safe on this website. You can move focus and operate the control yourself."
          : ranked.length ? `${ranked.length} matching controls. Choose one to move focus.`
          : overviewGoal ? "Review the page overview below." : "No grounded matches. Try a control label or section name.");
        const exact = ranked.filter(({ quality }) => quality === "Exact");
        if (command.kind === "focus" && exact.length === 1 && exact[0]) void focus(exact[0].control.id);
      }}>
        <label htmlFor="navigation-goal">What would you like to find?</label>
        <input id="navigation-goal" value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={200}
          autoComplete="off" spellCheck={false} placeholder="For example, find the registration field" />
        <button className="button button-primary" type="submit" disabled={!page || !goal.trim() || focusing}>Find controls</button>
      </form>
      {sessionGoal && <p>Current goal: {sessionGoal}</p>}
      {sessionGoal && <p className="fine-print">Try “What’s next?”, “Take me there”, “Go back”, “Where am I?” or “Continue my task”.</p>}
      {experimental && <><div className="button-row">
        {voice.availability === "available" && <button className="button" type="button" disabled={voice.recording} onClick={voice.start}>Start local voice input</button>}
        {voice.recording && <>
          <button className="button" type="button" onClick={voice.stop}>Stop recording</button>
          <button className="button" type="button" onClick={voice.cancel}>Cancel recording</button>
        </>}
        {voice.canInstall && <button className="button" type="button" onClick={() => void voice.install()}>Download English speech pack</button>}
      </div>
      <p className="fine-print" role="status">{voice.status || (voice.availability === "unavailable"
        ? "Local voice input is unavailable in this browser. You can type your goal."
        : voice.availability === "downloading" ? "Downloading the local speech pack." : "")}</p></> }
      <p role="status">{loading ? "Reading page structure…" : notice}</p>
      {onRead && !loading && notice && <button type="button" className="button" onClick={() => onRead(notice)}>
        Read Navigator message aloud
      </button>}
      {matches.length > 0 && <>
        <h3>Matching controls</h3>
        {matches[0]?.score === matches[1]?.score && <p>Several controls match equally well. Review their sections before choosing.</p>}
        <ol className="navigation-matches">
          {matches.map(({ control, quality, reason }, index) => <li key={control.id}>
            <strong>{control.name || "Unnamed " + control.role}</strong>
            <p>{control.role}{control.section ? " in " + control.section : ""}{!concise && <> · {quality}. {reason}</>}</p>
            {describing && Boolean(control.choices?.length) && <ol aria-label={`Options for ${control.name}`}>
              {control.choices?.map((choice, choiceIndex) => <li key={choiceIndex}>{choice}</li>)}
            </ol>}
            <button type="button" className="button" disabled={focusing} onClick={() => void focus(control.id)}
              aria-label={`Focus ${control.name || "unnamed " + control.role}, result ${index + 1}`}>Move focus</button>
            {onRead && <button type="button" className="button" onClick={() => onRead([
              control.name || `Unnamed ${control.role}`,
              control.section ? `${control.role} in ${control.section}` : control.role,
              concise ? "" : reason,
              describing && control.choices?.length ? `Options: ${control.choices.join(", ")}` : "",
            ].filter(Boolean).join(". "))} aria-label={`Read explanation for result ${index + 1} aloud`}>Read explanation aloud</button>}
          </li>)}
        </ol>
        <p className="fine-print">After moving focus, use the website to enter information or activate the control.</p>
        {reasoning ? <button className="button" type="button" onClick={() => {
          pending.current?.abort(); pending.current = null; setReasoning(false); setNotice("Ranking cancelled. Page matches remain available.");
        }}>Cancel local ranking</button> : submitted && <button className="button" type="button" onClick={() => void enhance()}>Refine ranking with local AI</button>}
      </>}
      <h3>Page overview</h3>
      {page && <>
        <p>{page.title || "Untitled page"}. {page.forms} forms, {page.controls.length} available controls, {barriers} detected accessibility barriers.</p>
        {page.limited && <p>Overview covers part of this page.</p>}
        {page.headings.length > 0 && <ul aria-label="Page headings">
          {(page.sections ?? page.headings.map((name) => ({ name, controls: [] }))).map((section, index) => {
            const first = page.controls.find((control) => section.controls.includes(control.id) && control.name);
            return <li key={index}><span>{section.name}</span>
              {first && <> · {section.controls.length} controls{" "}
                <button type="button" className="button" disabled={focusing} onClick={() => void focus(first.id)}>
                  Focus {first.name} in {section.name}
                </button></>}
            </li>;
          })}
        </ul>}
        {page.landmarks.length > 0 && <p>Landmarks · {page.landmarks.join(", ")}</p>}
        {page.forms > 0 && <>
          <h3>Form requirements</h3>
          <button type="button" className="button" disabled={focusing} onClick={() => {
            const sequence = ++commandSequence.current;
            suggested.current = "";
            void readContext(sequence).then((result) => {
              if (result && commandSequence.current === sequence) setNotice(result.snapshotId === page.id ?
                "Checked current form requirements." : "Refresh the page overview to check form requirements.");
            });
          }}>Check current form requirements</button>
          {page.fields?.some((field) => field.required || field.issue) ?
            <ul aria-label="Required fields and validation">
              {page.fields.filter((field) => field.required || field.issue).map((field) => {
                const control = page.controls.find((item) => item.id === field.id);
                return <li key={field.id}>{control?.name || "Unnamed field"}{control?.section ? ` in ${control.section}` : ""}
                  {field.required ? " · required" : ""}{field.issue === "missing" ? " · incomplete" : field.issue ? " · needs validation review" : ""}
                  {control?.name && field.issue && <>{" "}<button type="button" className="button" disabled={focusing}
                    onClick={() => void focus(control.id)}>Focus {control.name}</button></>}
                </li>;
              })}
            </ul> : <p>No supported required fields or validation issues were detected in this overview.</p>}
        </>}
        {outcome && <p>Latest page observation: {outcome.message}</p>}
        {recovery > 0 && <p><a href="#recovery">Review {recovery} recovery outcomes</a> for recent errors and confirmations.</p>}
      </>}
      <button type="button" className="button" disabled={loading || focusing} onClick={() => void refresh()}>Refresh page overview</button>
    </>}
    <p className="fine-print">Use focus assistance to find real webpage controls. You decide how to interact with them.</p>
    <p><a href="./practice.html" target="_blank" rel="noreferrer">Practice typed navigation</a></p>
  </Section>;
}
