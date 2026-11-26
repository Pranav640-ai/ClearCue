// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { AccessibilityScanner } from "../scan";
import { ScanObserver } from "../observer";

const DOC_ID = "doc-test-00000003";
const wait = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

function mount(html: string, path = "/page"): void {
  window.history.replaceState({}, "", path);
  document.body.innerHTML = html;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("incremental scanning", () => {
  it("detects a dynamically inserted control", () => {
    mount(`<button>Save</button>`);
    const scanner = new AccessibilityScanner(document, DOC_ID);
    expect(scanner.scanAll().summary.issueTotal).toBe(0);

    const added = document.createElement("button");
    document.body.appendChild(added);
    const outcome = scanner.scanTargets([added]);
    expect(outcome.summary.issueTotal).toBe(1);
    expect(outcome.summary.counts.missingButtonLabels).toBe(1);
  });

  it("invalidates issues for removed elements", () => {
    mount(`<div id="host"><button></button></div>`);
    const scanner = new AccessibilityScanner(document, DOC_ID);
    expect(scanner.scanAll().summary.issueTotal).toBe(1);

    document.getElementById("host")?.replaceChildren();
    const outcome = scanner.scanTargets([document.getElementById("host") as Element]);
    expect(outcome.summary.issueTotal).toBe(0);
  });

  it("does not duplicate issues when the same element is scanned repeatedly", () => {
    mount(`<button></button>`);
    const scanner = new AccessibilityScanner(document, DOC_ID);
    scanner.scanAll();
    const target = document.querySelector("button") as Element;
    scanner.scanTargets([target]);
    const outcome = scanner.scanTargets([target]);
    expect(outcome.summary.issueTotal).toBe(1);
  });

  it("updates the reported URL after client-side navigation", () => {
    mount(`<button>Save</button>`, "/first");
    const scanner = new AccessibilityScanner(document, DOC_ID);
    expect(scanner.scanAll().summary.url).toBe("http://localhost:3000/first");
    window.history.replaceState({}, "", "/second");
    expect(scanner.scanAll().summary.url).toBe("http://localhost:3000/second");
  });

  it("scans interactive elements inside open shadow roots", () => {
    mount(`<div id="host"></div>`);
    const host = document.getElementById("host") as HTMLElement;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<button></button>`;
    const outcome = new AccessibilityScanner(document, DOC_ID).scanAll();
    expect(outcome.summary.issueTotal).toBe(1);
    expect(outcome.summary.issues[0]?.element.ref).toContain("::shadow");
  });
});

describe("Stage 4 on-device demonstration evidence", () => {
  it("keeps the evidence-supported bell control for on-device reasoning", () => {
    mount(`<section>
      <h3>Notification settings</h3>
      <p>Manage alerts for order updates and delivery changes.</p>
      <button class="icon-button" type="button">
        <svg width="18" height="18" aria-hidden="true" focusable="false"><path d="M9 2a5 5 0 0 0-5 5v3l-1 2h12l-1-2V7a5 5 0 0 0-5-5z" fill="none" /></svg>
      </button>
    </section>`);
    const outcome = new AccessibilityScanner(document, DOC_ID).scanAll();
    const issue = outcome.summary.issues[0];
    expect(issue?.category).toBe("icon-control-name");
    expect(issue?.candidates).toHaveLength(0);
    expect(issue?.needsReasoning).toBe(true);
    expect(issue?.evidence.some((item) => item.kind === "nearby-text" && item.value.includes("Notification settings"))).toBe(true);
    expect(issue?.id.length).toBeGreaterThan(60);
  });
});

describe("mutation observation", () => {
  it("reports an inserted unlabelled control after the debounce", async () => {
    mount(`<main></main>`);
    const scanner = new AccessibilityScanner(document, DOC_ID);
    scanner.scanAll();
    const outcomes: unknown[] = [];
    const observer = new ScanObserver(document, scanner, (outcome) => outcomes.push(outcome), { debounceMs: 10 });
    observer.start();

    const button = document.createElement("button");
    document.querySelector("main")?.appendChild(button);
    await wait(80);

    expect(outcomes.length).toBeGreaterThan(0);
    expect(scanner.getIssues()).toHaveLength(1);
    observer.stop();
  });

  it("re-evaluates a control when the text it is labelled by changes", async () => {
    mount(`<span id="lbl">Save changes</span><button aria-labelledby="lbl"></button>`);
    const scanner = new AccessibilityScanner(document, DOC_ID);
    expect(scanner.scanAll().summary.issueTotal).toBe(0);
    const observer = new ScanObserver(document, scanner, () => undefined, { debounceMs: 10 });
    observer.start();

    const label = document.getElementById("lbl") as HTMLElement;
    label.textContent = "";
    await wait(80);

    expect(scanner.getIssues().length).toBeGreaterThan(0);
    expect(scanner.getIssues()[0]?.category).toBe("broken-relationship");
    observer.stop();
  });

  it("re-evaluates newly revealed descendants when a container stops being hidden", async () => {
    mount(`<div id="file-row" hidden><button></button></div>`);
    const scanner = new AccessibilityScanner(document, DOC_ID);
    expect(scanner.scanAll().summary.issueTotal).toBe(0);
    const observer = new ScanObserver(document, scanner, () => undefined, { debounceMs: 10 });
    observer.start();

    (document.getElementById("file-row") as HTMLElement).hidden = false;
    await wait(80);

    expect(scanner.getIssues()).toHaveLength(1);
    observer.stop();
  });

  it("stops observing after stop()", async () => {
    mount(`<main></main>`);
    const scanner = new AccessibilityScanner(document, DOC_ID);
    scanner.scanAll();
    const observer = new ScanObserver(document, scanner, () => undefined, { debounceMs: 10 });
    observer.start();
    observer.stop();

    const button = document.createElement("button");
    document.querySelector("main")?.appendChild(button);
    await wait(60);
    expect(scanner.getIssues()).toHaveLength(0);
  });

  it("ignores ClearCue-owned mutations to prevent observation loops", async () => {
    mount(`<main></main>`);
    const scanner = new AccessibilityScanner(document, DOC_ID);
    scanner.scanAll();
    const observer = new ScanObserver(document, scanner, () => undefined, { debounceMs: 10 });
    observer.start();

    const owned = document.createElement("span");
    owned.setAttribute("data-clearcue-owned", "true");
    owned.innerHTML = `<button></button>`;
    document.querySelector("main")?.appendChild(owned);
    await wait(80);

    expect(scanner.getIssues()).toHaveLength(0);
    observer.stop();
  });

  it("marks a large mutation burst as a bounded full scan", async () => {
    mount(`<main></main>`);
    const scanner = new AccessibilityScanner(document, DOC_ID);
    scanner.scanAll();
    const fullScans: string[] = [];
    const observer = new ScanObserver(document, scanner, (_outcome, reason) => fullScans.push(reason), {
      debounceMs: 10,
      maxMutationsBeforeFullScan: 3,
    });
    observer.start();

    const main = document.querySelector("main") as HTMLElement;
    for (let index = 0; index < 6; index += 1) {
      const button = document.createElement("button");
      button.textContent = `Action ${index}`;
      main.appendChild(button);
    }
    await wait(80);

    expect(fullScans).toContain("full");
    observer.stop();
  });
});
