import { experimental } from "../experimental";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { PageNavigator } from "../../content/navigator";
import { PageAnnouncer } from "../../content/recovery/announcer";
import { parseNavigatorCommand, refersToCurrentControl } from "../../shared/activation";
import { navigationWords, rankNavigation, type NavigationControl, type NavigationSnapshot } from "../../shared/navigator";
import { useLocalVoice } from "../useLocalVoice";
import { PracticeActions, type PracticeAction, type PracticeCapability } from "./actions";
import "../panel.css";

const options = ["Relevance", "Price from low to high", "Price from high to low", "Newest"];
const products = [
  { name: "Notebook", price: 8, added: 2 },
  { name: "Pencil set", price: 4, added: 3 },
  { name: "Desk lamp", price: 15, added: 1 },
];
const purpose = new Map([
  ["Sorting options", "Changes the order of the fictional products. The sort choices are shown below."],
  ["Options menu", "Shows display options for these fictional results."],
  ["Product help", "Explains the product list and prices."],
  ["Delivery help", "Explains delivery in this fictional catalogue."],
]);
const normal = (text: string) => navigationWords(text).filter((word) => word !== "from").join(" ");
const ordinal = ["first", "second", "third", "fourth"];

function Practice() {
  const navigator = useRef(new PageNavigator(document));
  const announcer = useRef(new PageAnnouncer(document));
  const engine = useRef<PracticeActions | null>(null);
  const select = useRef<HTMLSelectElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const catalogue = useRef<HTMLElement>(null);
  const sort = useRef<((index: number) => void) | null>(null);
  const remembered = useRef<Element | null>(null);
  const overview = useRef<NavigationSnapshot | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [command, setCommand] = useState("");
  const [notice, setNotice] = useState("Ask for the page overview or find a control.");
  const [intent, setIntent] = useState("");
  const [target, setTarget] = useState<NavigationControl | null>(null);
  const [choices, setChoices] = useState<NavigationControl[]>([]);
  const [history, setHistory] = useState<{ id: string; message: string }[]>([]);
  const voice = useLocalVoice(setCommand);

  useEffect(() => {
    const menu = select.current;
    const productList = list.current;
    const section = catalogue.current;
    if (!menu || !productList || !section) return;
    const rows = products.flatMap((product, index) => {
      const element = productList.children[index];
      return element ? [{ product, element }] : [];
    });
    if (rows.length !== products.length) return;
    const order = (index: number) => [...rows].sort((a, b) => index === 1 ? a.product.price - b.product.price :
      index === 2 ? b.product.price - a.product.price : index === 3 ? b.product.added - a.product.added : 0);
    sort.current = (index) => { productList.replaceChildren(...order(index).map(({ element }) => element)); };
    if (experimental) {
      const capabilities = new Map<Element, PracticeCapability>();
      capabilities.set(menu, { kind: "sort", target: menu,
        options: Array.from(menu.options).map((element) => ({ element, label: element.label })),
        render: sort.current, ordered: (index) => productList.children.length === rows.length &&
          order(index).every(({ element }, row) => productList.children[row] === element) });
      for (const details of section.querySelectorAll("details")) {
        const summary = details.firstElementChild;
        if (summary instanceof HTMLElement) capabilities.set(summary, {
          kind: "disclosure", target: summary, details, name: summary.textContent?.trim() ?? "Section",
        });
      }
      if (typeof chrome !== "undefined" && chrome.runtime?.id) {
        engine.current = new PracticeActions(document, chrome.runtime.getURL("practice.html"), navigator.current, capabilities);
      }
    }
    const pageAnnouncer = announcer.current;
    pageAnnouncer.prepare();
    return () => { engine.current?.cancel(); pageAnnouncer.dispose(); };
  }, []);

  function report(message: string) {
    setNotice(message);
    announcer.current.announce({ message, category: "status-update", severity: "info" });
  }

  function describe(control: NavigationControl) {
    setTarget(control);
    const information = purpose.get(control.name) ?? "Purpose unavailable.";
    report(`${control.name}. ${information}${control.choices?.length ?
      " Options: " + control.choices.map((choice, index) => `${index + 1}. ${choice}`).join(". ") + "." : ""}`);
  }

  function focus(control: NavigationControl) {
    if (!overview.current) return;
    const resolved = navigator.current.resolve(overview.current.id, control.id);
    const result = navigator.current.focus(overview.current.id, control.id);
    if (result.focused && !("reason" in resolved)) {
      remembered.current = resolved.element;
      setTarget(control);
    }
    report(result.reason);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChoices([]);
    engine.current?.cancel();
    const trustedSubmit = event.nativeEvent.isTrusted && window.navigator.userActivation.isActive;
    if (!trustedSubmit) return;
    const request = parseNavigatorCommand(command);
    setIntent(request.kind);
    const page = navigator.current.read();
    overview.current = page;
    const controls = page.controls.filter((control) => purpose.has(control.name));
    if (request.kind === "cancel") {
      if (voice.recording) voice.cancel();
      setCommand("");
      report("Command cancelled.");
      return;
    }
    if (request.kind === "overview") {
      report("This page has a fictional product list, sorting choices, a display options menu and two help sections.");
      return;
    }
    if (!("target" in request)) return;
    const current = controls.find((control) => {
      const resolved = navigator.current.resolve(page.id, control.id);
      return !("reason" in resolved) && resolved.element === remembered.current;
    });
    const currentTarget = refersToCurrentControl(request.target);
    const targetName = currentTarget ? request.target : request.target.replace(/\s+(?:section|button)$/, "");
    let matches = currentTarget ? (current ? [current] : []) :
      rankNavigation(targetName, controls).map(({ control }) => control);
    const exact = matches.filter((control) => normal(control.name) === normal(targetName));
    if (exact.length > 0) matches = exact;
    const readOnly = request.kind === "find" || request.kind === "focus" || request.kind === "describe";
    if (request.kind === "blocked") {
      report("Action blocked. Forms, downloads and consequential actions require manual interaction.");
      if (matches.length) setChoices(matches);
      return;
    }
    if (readOnly) {
      const [match] = matches;
      if (match && matches.length === 1 && request.kind === "describe") describe(match);
      else if (match && matches.length === 1 && request.kind === "focus") focus(match);
      else {
        setChoices(matches);
        report(matches.length ? "Choose a control to move focus or describe it." : "No supported control matched.");
      }
      return;
    }
    if (!experimental) {
      report("Use the control manually. Typed commands can describe controls and move focus.");
      return;
    }
    if (request.kind === "select") {
      matches = current?.choices?.length ? [current] : [];
    } else if (!currentTarget) {
      const words = navigationWords(targetName);
      matches = matches.filter((control) => words.length > 0 && words.every((word) => navigationWords(control.name).includes(word)));
    }
    const [control] = matches;
    if (!control || matches.length !== 1) {
      setChoices(matches);
      report(matches.length ? "Several controls match. Choose one to focus, then submit a new command." :
        "Action blocked. Focus a supported control or use its name.");
      return;
    }
    setTarget(control);
    let action: PracticeAction;
    if (request.kind === "select") {
      const optionName = request.target.replace(/\s+option$/, "");
      const position = ordinal.indexOf(optionName);
      const matchingOptions = control.choices?.flatMap((choice, index) =>
        normal(choice) === normal(optionName) ? [index] : []) ?? [];
      const index = position >= 0 ? position : matchingOptions.length === 1 ? matchingOptions[0] ?? -1 : -1;
      if (index < 0 || !control.choices?.[index]) {
        describe(control);
        return;
      }
      action = { kind: "sort", option: index };
    } else {
      action = { kind: request.kind === "open" ? "open" : request.kind === "close" ? "close" : "toggle" };
    }
    const authorization = engine.current?.authorize(page.id, control.id, action, { trustedSubmit, enabled });
    if (!authorization || !engine.current) {
      report("Action blocked. Enable activation for this practice tab or focus the control and use it manually.");
      setChoices([control]);
      return;
    }
    const outcome = engine.current.execute(authorization);
    setHistory((previous) => [{ id: authorization.commandId, message: outcome.message }, ...previous].slice(0, 8));
    report(outcome.message);
    if (outcome.status === "blocked") setChoices([control]);
  }

  return <div className="panel practice-page">
    <h1>{experimental ? "Practice voice and text commands" : "Practice typed navigation"}</h1>
    <p>Explore a fictional campus catalogue and use commands to find, describe and focus controls.</p>
    <p>Try “Take me to the sorting options”, then “What are my options?”.</p>
    {experimental && <label><input type="checkbox" checked={enabled} onChange={(event) => {
      engine.current?.cancel();
      setEnabled(event.target.checked);
    }} /> Enable activation on this practice page</label>}
    <form onSubmit={submit} data-command-intent={intent}>
      <label htmlFor="practice-command">Command</label>
      <input id="practice-command" value={command} maxLength={200} autoComplete="off" spellCheck={false}
        onChange={(event) => setCommand(event.target.value)} />
      <button className="button button-primary" type="submit" disabled={!command.trim() || voice.recording}>Run command</button>
      <button className="button" type="button" onClick={() => {
        engine.current?.cancel();
        if (voice.recording) voice.cancel();
        setCommand("");
        setChoices([]);
        report("Command cancelled.");
      }}>Cancel command</button>
    </form>
    {experimental && <><div className="button-row">
      {voice.availability === "available" && <button className="button" type="button" disabled={voice.recording} onClick={() => {
        setCommand("");
        voice.start();
      }}>Start local voice input</button>}
      {voice.recording && <><button className="button" type="button" onClick={voice.stop}>Stop recording</button>
        <button className="button" type="button" onClick={voice.cancel}>Cancel recording</button></>}
      {voice.canInstall && <button className="button" type="button" onClick={() => void voice.install()}>Download English speech pack</button>}
    </div>
    <p role="status">{voice.status || (voice.availability === "unavailable" ? "Local voice input is unavailable. You can type commands." : "")}</p></>}
    <p>{notice}</p>
    {target && <p><strong>Target</strong> {target.name}. {purpose.get(target.name)}</p>}
    {choices.length > 0 && <ul aria-label="Matching practice controls">{choices.map((control) => <li key={control.id}>
      {control.name} in {control.section}{" "}
      <button className="button" type="button" onClick={() => focus(control)}>Focus {control.name}</button>{" "}
      <button className="button" type="button" onClick={() => describe(control)}>Describe {control.name}</button>
    </li>)}</ul>}
    <section ref={catalogue} aria-labelledby="catalogue-heading" onFocus={(event) => { remembered.current = event.target; }}>
      <h2 id="catalogue-heading">Campus supplies</h2>
      <label htmlFor="practice-sort">Sorting options</label>
      <select ref={select} id="practice-sort" onChange={(event) => sort.current?.(event.target.selectedIndex)}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
      <ul ref={list} aria-label="Products">
        {products.map(({ name, price }) => <li key={name}>{name} · {price} credits</li>)}
      </ul>
      <details><summary>Options menu</summary><p>Sort by relevance, price or when a product was added.</p></details>
      <details><summary>Product help</summary><p>Prices use fictional campus credits.</p></details>
      <h2>Delivery information</h2>
      <details><summary>Delivery help</summary><p>This practice catalogue does not accept orders.</p></details>
    </section>
    {experimental && <section aria-labelledby="practice-history"><h2 id="practice-history">Recent action results</h2>
      {history.length ? <ol>{history.map(({ id, message }) => <li key={id}>{message}</li>)}</ol> :
        <p>Results appear here after an action runs.</p>}
    </section>}
  </div>;
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Practice />);
