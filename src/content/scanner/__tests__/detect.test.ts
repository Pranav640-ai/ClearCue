// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { AccessibilityScanner, type ScanOutcome } from "../scan";
import type { ScanCategory } from "../../../shared/scan";

/**
 * Deterministic detection tests. Fixtures are ordinary HTML with no
 * playground markers, so passing them demonstrates generalisation rather than
 * memorising the demo site.
 */

const DOC_ID = "doc-test-00000001";

function mount(html: string, path = "/page"): void {
  window.history.replaceState({}, "", path);
  document.body.innerHTML = html;
}

function run(html: string): ScanOutcome {
  mount(html);
  const scanner = new AccessibilityScanner(document, DOC_ID);
  return scanner.scanAll();
}

function byCategory(outcome: ScanOutcome, category: ScanCategory) {
  return outcome.summary.issues.filter((issue) => issue.category === category);
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("accessible names that already exist", () => {
  it("does not flag a correctly labelled button", () => {
    const outcome = run(`<button type="button">Save changes</button>`);
    expect(outcome.summary.issueTotal).toBe(0);
  });

  it("respects aria-label on a button", () => {
    const outcome = run(`<button aria-label="Close dialog"><svg aria-hidden="true"></svg></button>`);
    expect(outcome.summary.issueTotal).toBe(0);
  });

  it("respects a native associated label", () => {
    const outcome = run(`<label for="email">Email address</label><input id="email" type="email">`);
    expect(outcome.summary.issueTotal).toBe(0);
  });

  it("respects a wrapping label", () => {
    const outcome = run(`<label>Postcode <input type="text"></label>`);
    expect(outcome.summary.issueTotal).toBe(0);
  });

  it("respects valid aria-labelledby", () => {
    const outcome = run(`<span id="lbl">Search the catalogue</span><button aria-labelledby="lbl"></button>`);
    expect(outcome.summary.issueTotal).toBe(0);
  });

  it("does not treat every icon as an interactive control", () => {
    const outcome = run(`<div><svg aria-hidden="true"><title>decoration</title></svg><p>Text</p></div>`);
    expect(outcome.summary.issueTotal).toBe(0);
  });

  it("does not flag a descriptive short link", () => {
    const outcome = run(`<nav><a href="/pricing">Pricing</a></nav>`);
    expect(byCategory(outcome, "vague-link")).toHaveLength(0);
    expect(outcome.summary.issueTotal).toBe(0);
  });
});

describe("missing names", () => {
  it("detects an unlabelled native button", () => {
    const outcome = run(`<button type="button"></button>`);
    const issues = byCategory(outcome, "button-name");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("failure");
    expect(issues[0]?.accessibleName).toBe("");
  });

  it("detects an unlabelled SVG icon button as an icon control", () => {
    const outcome = run(`<button type="button"><svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"></path></svg></button>`);
    const issues = byCategory(outcome, "icon-control-name");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.evidence.some((item) => item.kind === "icon")).toBe(true);
  });

  it("accepts an SVG title as the button's name", () => {
    const outcome = run(`<button aria-label="Search"><svg><title>Search</title></svg></button>`);
    expect(outcome.summary.issueTotal).toBe(0);
  });

  it("detects a nameless link", () => {
    const outcome = run(`<a href="/article/42"><span aria-hidden="true"></span></a>`);
    expect(byCategory(outcome, "link-name")).toHaveLength(1);
  });

  it("detects an unlabelled text input", () => {
    const outcome = run(`<input type="text" id="q">`);
    const issues = byCategory(outcome, "form-control-name");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.candidates).toHaveLength(0);
  });

  it("does not accept placeholder text as a label", () => {
    const outcome = run(`<input type="search" placeholder="Search orders">`);
    expect(byCategory(outcome, "form-control-name")).toHaveLength(1);
  });

  it("detects an unnamed ARIA checkbox", () => {
    const outcome = run(`<div role="checkbox" aria-checked="false" tabindex="0"></div>`);
    expect(byCategory(outcome, "custom-control-name")).toHaveLength(1);
  });

  it("skips hidden controls", () => {
    const outcome = run(`
      <button style="display:none"></button>
      <div aria-hidden="true"><button></button></div>
      <button hidden></button>
    `);
    expect(outcome.summary.issueTotal).toBe(0);
  });

  it("still reports a disabled but unnamed control", () => {
    const outcome = run(`<button disabled></button>`);
    const issues = byCategory(outcome, "button-name");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.evidence.some((item) => item.value.includes("disabled"))).toBe(true);
  });
});

describe("naming relationships", () => {
  it("reports a missing aria-labelledby target without also reporting a second issue", () => {
    const outcome = run(`<button aria-labelledby="nope"></button>`);
    expect(byCategory(outcome, "invalid-aria-reference")).toHaveLength(1);
    expect(byCategory(outcome, "button-name")).toHaveLength(0);
  });

  it("reports a valid reference that resolves to empty text as a broken relationship", () => {
    const outcome = run(`<span id="empty"></span><button aria-labelledby="empty"></button>`);
    expect(byCategory(outcome, "broken-relationship").length).toBeGreaterThan(0);
  });

  it("reports duplicate ids as ambiguous instead of guessing a label", () => {
    const outcome = run(`<span id="dup">Save</span><span id="dup">Delete</span><button aria-labelledby="dup"></button>`);
    const ambiguous = outcome.summary.issues.find((issue) => issue.category === "broken-relationship");
    expect(ambiguous).toBeDefined();
    expect(ambiguous?.candidates).toHaveLength(0);
  });

  it("reports a label whose for target is missing", () => {
    const outcome = run(`<label for="ghost">Account number</label>`);
    expect(byCategory(outcome, "broken-relationship")).toHaveLength(1);
  });
});

describe("vague links", () => {
  it("detects a vague link when context could clarify it", () => {
    const outcome = run(`
      <section>
        <h2>Engineering scholarship</h2>
        <p>Applications close soon. <a href="/scholarships/engineering">click here</a></p>
      </section>
    `);
    const issues = byCategory(outcome, "vague-link");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("heuristic");
    expect(issues[0]?.candidates[0]?.proposedValue).toContain("engineering");
  });

  it("does not flag a vague name that has an explicit description", () => {
    const outcome = run(`<h2>Report</h2><a href="/report/2025" aria-describedby="desc">More</a><p id="desc">Download the 2025 report</p>`);
    expect(byCategory(outcome, "vague-link")).toHaveLength(0);
  });

  it("does not flag a vague-looking link when there is no context at all", () => {
    const outcome = run(`<a href="#">More</a>`);
    expect(byCategory(outcome, "vague-link")).toHaveLength(0);
  });
});

describe("bounded work and limits", () => {
  it("caps interactive elements and reports truncation", () => {
    mount(Array.from({ length: 60 }, (_, index) => `<button>Action ${index}</button>`).join(""));
    const scanner = new AccessibilityScanner(document, DOC_ID, {
      maxInteractive: 10,
      maxIssues: 10,
      maxReturnedIssues: 5,
    });
    const outcome = scanner.scanAll();
    expect(outcome.summary.interactiveCount).toBeGreaterThan(10);
    expect(outcome.summary.truncated).toBe(true);
    expect(outcome.summary.issues.length).toBeLessThanOrEqual(5);
  });

  it("returns issues in a stable order across scans", () => {
    mount(`<button></button><input type="text"><a href="/x"></a>`);
    const scanner = new AccessibilityScanner(document, DOC_ID);
    const first = scanner.scanAll().summary.issues.map((issue) => issue.id);
    const second = scanner.scanAll().summary.issues.map((issue) => issue.id);
    expect(second).toEqual(first);
  });
});
