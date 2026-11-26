import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

/**
 * Preliminary pilot evaluation.
 *
 * Runs the real scanner bundle in Chromium over 24 controlled, unfamiliar
 * fixtures. It records what the deterministic layer can resolve without
 * inference, what genuinely needs a model, and whether private evidence stays
 * local. Local/cloud inference is NOT simulated here: those cases are reported
 * as `needs-inference` / `not-run`, never as successes.
 *
 * Output: artifacts/pilot-results.json
 */

const bundle = path.resolve(process.cwd(), "dist-test/scanner.js");
if (!existsSync(bundle)) {
  execSync("npx vite build --config vite.scanner-test.config.ts", { stdio: "inherit" });
}
const bundleSource = await readFile(bundle, "utf8");

const button = (inner, attributes = "") => `<button type="button" ${attributes}>${inner}</button>`;
const icon = (name) => `<svg width="16" height="16" aria-hidden="true" focusable="false" aria-label="${name}"><title>${name}</title></svg>`;

const cases = [
  {
    id: "search-icon",
    name: "Icon-only search button with a nearby search field",
    html: `<main><h1>Product search</h1><form role="search"><label for="q">Search products</label><input id="q" type="search">${button(icon("search"))}</form></main>`,
    expect: { categories: ["icon-control-name", "button-name"], candidate: ["Search"] },
  },
  {
    id: "close-icon",
    name: "Icon-only dismiss button with a dialog heading",
    html: `<div role="dialog" aria-labelledby="t"><h2 id="t">Cookie settings</h2>${button(icon("close"))}</div>`,
    expect: { categories: ["icon-control-name", "button-name"], candidate: ["Close", "Close cookie settings"] },
  },
  {
    id: "read-more-heading",
    name: "Vague “Read more” link inside an article with a heading",
    html: `<article><h2>Housing application guide</h2><p>Steps and deadlines.</p><a href="/guide">Read more</a></article>`,
    expect: { categories: ["vague-link"], candidate: ["Read more: Housing application guide", "Read more about housing application guide"] },
  },
  {
    id: "click-here",
    name: "Vague “Click here” link beside program text",
    html: `<section><h3>Emergency rent help</h3><p>Apply before Friday.</p><a href="/rent">Click here</a></section>`,
    expect: { categories: ["vague-link"], candidate: ["Click here: Emergency rent help"] },
  },
  {
    id: "placeholder-email",
    name: "Placeholder-only email field",
    html: `<form><input id="email" type="email" placeholder="Email address"><button type="submit">Subscribe</button></form>`,
    expect: { categories: ["form-control-name"], candidate: null },
  },
  {
    id: "named-input-control",
    name: "Correctly labelled input (control case)",
    html: `<form><label for="name">Full name</label><input id="name"><button type="submit">Continue</button></form>`,
    expect: { categories: null },
  },
  {
    id: "named-button-control",
    name: "Named button (control case)",
    html: `<main><button type="button">Save changes</button></main>`,
    expect: { categories: null },
  },
  {
    id: "role-switch",
    name: "Unnamed custom switch with adjacent text",
    html: `<div><span id="news">Email newsletters</span><span role="switch" tabindex="0" aria-checked="false"></span></div>`,
    expect: { categories: ["custom-control-name"], candidate: null },
  },
  {
    id: "labelledby-names",
    name: "Control named by aria-labelledby (control case)",
    html: `<span id="lbl">Delete draft</span><button type="button" aria-labelledby="lbl"></button>`,
    expect: { categories: null },
  },
  {
    id: "broken-relationship",
    name: "Broken aria-labelledby reference",
    html: `<button type="button" aria-labelledby="missing-label"></button>`,
    expect: { categories: ["broken-relationship", "invalid-aria-reference"] },
  },
  {
    id: "duplicate-reference",
    name: "aria-labelledby pointing at a duplicated id",
    html: `<span id="dup">Save</span><span id="dup">Discard</span><button type="button" aria-labelledby="dup"></button>`,
    expect: { categories: ["invalid-aria-reference", "broken-relationship"] },
  },
  {
    id: "menu-icon",
    name: "Icon-only menu button with an allowlisted hint",
    html: `<header><h1>Dashboard</h1>${button(icon("menu"), 'aria-haspopup="true"')}</header>`,
    expect: { categories: ["icon-control-name", "button-name"], candidate: ["Menu", "Open menu"] },
  },
  {
    id: "sparkle-icon",
    name: "Ambiguous sparkle icon without text",
    html: `<main><h1>Editor</h1>${button(icon("sparkles"))}</main>`,
    expect: { categories: ["icon-control-name", "button-name"], candidate: null },
  },
  {
    id: "trash-icon",
    name: "Destructive trash icon with private note nearby",
    html: `<div><h2>Saved items</h2><p>Confidential account note 4417</p>${button(icon("trash"))}</div>`,
    expect: { categories: ["icon-control-name", "button-name"], candidate: null, privateEvidence: true },
  },
  {
    id: "payment-control",
    name: "Unlabeled payment control (must never be guessed)",
    html: `<form><label for="amount">Amount</label><input id="amount" inputmode="decimal">${button(icon("pay"))}</form>`,
    expect: { categories: ["icon-control-name", "button-name"], candidate: null },
  },
  {
    id: "select-unlabelled",
    name: "Unlabelled select element",
    html: `<form><select><option>One</option><option>Two</option></select><button type="submit">Apply</button></form>`,
    expect: { categories: ["form-control-name"], candidate: null },
  },
  {
    id: "search-icon-with-heading",
    name: "Icon-only search beside an h2",
    html: `<section><h2>Find a course</h2>${button(icon("search"))}</section>`,
    expect: { categories: ["icon-control-name", "button-name"], candidate: ["Search", "Search courses"] },
  },
  {
    id: "file-remove",
    name: "Icon-only remove control in a file row",
    html: `<div><p>transcript.pdf</p>${button(icon("close"))}</div>`,
    expect: { categories: ["icon-control-name", "button-name"], candidate: ["Close", "Remove"] },
  },
  {
    id: "link-image-only",
    name: "Link containing only a decorative image",
    html: `<a href="/home"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" alt=""></a>`,
    expect: { categories: ["link-name"], candidate: null },
  },
  {
    id: "vague-more-list",
    name: "Multiple “More” links in a list",
    html: `<ul><li><h3>Rent support</h3><a href="/a">More</a></li><li><h3>Food support</h3><a href="/b">More</a></li></ul>`,
    expect: { categories: ["vague-link"], candidate: null },
  },
  {
    id: "nested-button",
    name: "Nested icon inside a named button (control case)",
    html: `<main>${button(`${icon("search")}<span>Search</span>`)}</main>`,
    expect: { categories: null },
  },
  {
    id: "aria-label-empty",
    name: "Empty aria-label on an icon button",
    html: `<main>${button(icon("settings"), 'aria-label=""')}</main>`,
    expect: { categories: ["icon-control-name", "button-name"], candidate: ["Settings", "Open settings"] },
  },
  {
    id: "fieldset-legend",
    name: "Radio group with a fieldset legend (control case)",
    html: `<fieldset><legend>Contact method</legend><label><input type="radio" name="c"> Email</label><label><input type="radio" name="c"> Phone</label></fieldset>`,
    expect: { categories: null },
  },
  {
    id: "private-placeholder",
    name: "Private note next to a placeholder-only field",
    html: `<form><p>Private message from caseworker: reference 93112</p><input type="text" placeholder="Reply"></form>`,
    expect: { categories: ["form-control-name"], candidate: null, privateEvidence: true },
  },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const results = [];

for (const item of cases) {
  const errors = [];
  page.removeAllListeners("pageerror");
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.setContent(`<!doctype html><html lang="en"><head><title>Pilot ${item.id}</title></head><body>${item.html}</body></html>`);
    await page.evaluate(bundleSource);
    const summary = await page.evaluate(() => window.ClearCueScanner.scan("pilot-case"));
    const issues = summary.issues;
    const categories = [...new Set(issues.map((issue) => issue.category))];
    const expectedCategories = item.expect.categories;
    const detectionCorrect =
      expectedCategories === null ? issues.length === 0 : expectedCategories.some((category) => categories.includes(category));
    const candidates = issues.flatMap((issue) => issue.candidates ?? []);
    const deterministic = candidates.filter((candidate) => candidate.support === "direct" && candidate.confidence === "high");
    let resolution;
    if (expectedCategories === null) {
      resolution = issues.length === 0 ? "control-clean" : "false-positive";
    } else if (deterministic.length > 0) {
      const accepted = item.expect.candidate
        ? deterministic.some((candidate) => item.expect.candidate.some((label) => candidate.proposedValue === label))
        : true;
      resolution = accepted ? "deterministic-resolved" : "deterministic-unexpected-label";
    } else {
      resolution = "needs-inference";
    }
    const evidence = issues.flatMap((issue) => issue.evidence);
    const eligible = evidence.some((item) => item.privacy === "cloud-eligible");
    const privateTextLocal =
      !item.expect.privateEvidence ||
      (evidence.some((entry) => entry.privacy === "local-only") &&
        evidence.filter((entry) => entry.kind === "nearby-text").every((entry) => entry.privacy === "local-only"));
    results.push({
      id: item.id,
      name: item.name,
      detectedCategories: categories,
      issueCount: issues.length,
      detectionCorrect,
      deterministicCandidates: deterministic.map((candidate) => candidate.proposedValue),
      resolution,
      cloudEligibleEvidenceAvailable: eligible,
      privateEvidenceExpected: Boolean(item.expect.privateEvidence),
      privateTextStayedLocal: privateTextLocal,
      inferenceStatus: "not-run",
      pageErrors: errors,
    });
  } catch (error) {
    results.push({
      id: item.id,
      name: item.name,
      error: error instanceof Error ? error.message : String(error),
      detectionCorrect: false,
      resolution: "error",
      inferenceStatus: "not-run",
    });
  }
}

await browser.close();

const counts = results.reduce(
  (accumulator, result) => {
    accumulator.total += 1;
    if (result.detectionCorrect) accumulator.detectionCorrect += 1;
    if (result.resolution === "deterministic-resolved") accumulator.deterministicResolved += 1;
    if (result.resolution === "needs-inference") accumulator.needsInference += 1;
    if (result.resolution === "false-positive") accumulator.falsePositives += 1;
    if (result.resolution === "error") accumulator.errors += 1;
    return accumulator;
  },
  { total: 0, detectionCorrect: 0, deterministicResolved: 0, needsInference: 0, falsePositives: 0, errors: 0 },
);

const privateCases = results.filter((result) => result.privateEvidenceExpected);
const privacyBlocked = privateCases.filter((result) => result.privateTextStayedLocal).length;

const report = {
  generatedAt: new Date().toISOString(),
  environment: "Playwright Chromium, real scanner bundle, controlled fixtures",
  inference:
    "Local and cloud inference were not simulated. Cases that need a model are marked needs-inference/not-run and require the user's Chrome with Gemini Nano for real proposals.",
  counts: { ...counts, privateCases: privateCases.length, privacyBlocked },
  results,
};

await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/pilot-results.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.counts, null, 2));
console.log("Wrote artifacts/pilot-results.json");
