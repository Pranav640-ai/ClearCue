import { execSync } from "node:child_process";
import path from "node:path";
import { chromium, expect, test as base, type BrowserContext, type Page, type Worker } from "@playwright/test";

/**
 * Stage 3 browser tests.
 *
 * The scanner is exercised three ways:
 * 1. through the real content script on the playground,
 * 2. through the standalone scanner bundle on controlled, unfamiliar fixtures,
 * 3. against axe-core's independent results on the same page (cross-check).
 */

const extensionPath = path.resolve(process.cwd(), "dist");
const scannerBundle = path.resolve(process.cwd(), "dist-test/scanner.js");
const axeBundle = path.resolve(process.cwd(), "node_modules/axe-core/axe.min.js");
const PLAYGROUND = "http://127.0.0.1:4318/scholarship.html";

interface Fixtures {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
}

const test = base.extend<Fixtures>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    const existing = context.serviceWorkers()[0];
    await use(existing ?? (await context.waitForEvent("serviceworker")));
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
});

test.beforeAll(() => {
  execSync("npx vite build --config vite.scanner-test.config.ts", { cwd: process.cwd(), stdio: "pipe" });
});

interface ScanSummaryLike {
  documentId: string;
  url: string;
  issueTotal: number;
  interactiveCount: number;
  durationMs: number;
  counts: {
    missingButtonLabels: number;
    missingFormLabels: number;
    missingLinkLabels: number;
    vagueLinks: number;
    other: number;
  };
  issues: Array<{
    id: string;
    category: string;
    severity: string;
    accessibleName: string;
    element: { locator: string; tagName: string };
    candidates: Array<{ proposedValue: string }>;
    needsReasoning: boolean;
  }>;
}

async function installContentStub(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const store: unknown[] = [];
    Object.defineProperty(window, "__clearcueMessages", { value: store, configurable: true });
    const stub = {
      runtime: {
        sendMessage: (message: unknown) => {
          store.push(message);
          return Promise.resolve({ ok: true });
        },
        onMessage: { addListener: () => undefined },
      },
      permissions: { request: () => Promise.resolve(true), contains: () => Promise.resolve(true), remove: () => Promise.resolve(true) },
    };
    (window as unknown as { chrome: unknown }).chrome = stub;
  });
}

async function scans(page: Page): Promise<ScanSummaryLike[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __clearcueMessages?: Array<{ kind: string; summary?: unknown }> }).__clearcueMessages
        ?.filter((message) => message.kind === "content:scan")
        .map((message) => message.summary as ScanSummaryLike) ?? [],
  );
}

async function waitForScan(page: Page, predicate: (summary: ScanSummaryLike) => boolean, timeoutMs = 15_000): Promise<ScanSummaryLike> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = (await scans(page)).find(predicate);
    if (found) return found;
    await page.waitForTimeout(150);
  }
  const all = await page.evaluate(() => (window as unknown as { __clearcueMessages?: Array<{ kind: string; error?: string; code?: string }> }).__clearcueMessages ?? []);
  throw new Error(`No matching content:scan message arrived. Messages: ${JSON.stringify(all)}`);
}

test.describe("panel scan surface", () => {
  test("shows an honest empty scan state before any page is connected", async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/panel.html`);
    await expect(page.getByRole("heading", { name: "Accessibility scan" })).toBeVisible();
    await expect(page.getByText("No scan result yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Scan Again" })).toBeDisabled();
  });
});

test.describe("content script scanning on the playground", () => {
  test("detects real issues, respects existing names, and never duplicates", async ({ context }) => {
    await installContentStub(context);
    const page = await context.newPage();
    await page.goto(PLAYGROUND);
    await page.addScriptTag({ path: path.join(extensionPath, "content.js") });

    const summary = await waitForScan(page, (entry) => entry.issueTotal >= 0);

    expect(summary.issueTotal).toBeGreaterThan(0);
    expect(summary.counts.missingFormLabels).toBeGreaterThanOrEqual(1);
    expect(summary.counts.vagueLinks).toBeGreaterThanOrEqual(1);
    expect(summary.durationMs).toBeGreaterThan(0);
    expect(summary.interactiveCount).toBeGreaterThan(10);

    // No duplicate issue identifiers.
    const ids = summary.issues.map((issue) => issue.id);
    expect(new Set(ids).size).toBe(ids.length);

    // Walk the real workflow: step 2 reveals the icon-only remove control.
    await page.locator("#full-name").fill("Jordan Avery");
    await page.getByLabel("Email address").fill("jordan@example.test");
    await page.getByRole("button", { name: "Continue to statement" }).click();
    await expect(page.getByRole("heading", { name: "Personal statement" })).toBeVisible();
    await page.setInputFiles("#transcript", {
      name: "transcript.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 fixture"),
    });
    await expect(page.locator("#file-row")).toBeVisible();

    const stepTwo = await waitForScan(page, (entry) => entry.counts.missingButtonLabels >= 1);
    // Step 1 is hidden, so its two issues are withdrawn and the revealed icon
    // control takes their place; totals must reflect that, not accumulate.
    expect(stepTwo.counts.missingFormLabels).toBe(0);
    expect(stepTwo.counts.vagueLinks).toBe(0);
    expect(stepTwo.issueTotal).toBe(1);

    // Every missing-name failure has an empty accessible name; nothing with a
    // valid name is reported as unnamed.
    for (const issue of stepTwo.issues) {
      if (["button-name", "icon-control-name", "link-name", "form-control-name", "custom-control-name"].includes(issue.category)) {
        expect(issue.accessibleName).toBe("");
      }
    }

    // Named controls on the page must never be reported.
    const reportedNamed = await page.evaluate(
      (locators) =>
        locators.filter((locator) => {
          const element = document.querySelector(locator);
          return element?.matches("[data-action='next'], #email, #full-name") ?? false;
        }),
      stepTwo.issues.map((issue) => issue.element.locator),
    );
    expect(reportedNamed).toEqual([]);
  });

  test("tracks dynamic insertion, removal and SPA navigation", async ({ context }) => {
    await installContentStub(context);
    const page = await context.newPage();
    await page.goto(PLAYGROUND);
    await page.addScriptTag({ path: path.join(extensionPath, "content.js") });
    const initial = await waitForScan(page, (entry) => entry.issueTotal >= 0);

    await page.evaluate(() => {
      const button = document.createElement("button");
      button.id = "injected-unlabelled";
      button.textContent = "";
      document.querySelector("main")?.appendChild(button);
    });
    const inserted = await waitForScan(page, (entry) => entry.issueTotal === initial.issueTotal + 1);
    expect(inserted.counts.missingButtonLabels).toBe(initial.counts.missingButtonLabels + 1);

    await page.evaluate(() => document.getElementById("injected-unlabelled")?.remove());
    await waitForScan(page, (entry) => entry.issueTotal === initial.issueTotal);

    await page.evaluate(() => history.pushState({}, "", "/scholarship.html?step=2"));
    await page.waitForFunction(
      () =>
        (window as unknown as { __clearcueMessages?: Array<{ kind: string; snapshot?: { url: string } }> })
          .__clearcueMessages?.some((message) => message.kind === "content:pageChanged" && message.snapshot?.url.includes("step=2")) ??
        false,
    );
    const navigated = await waitForScan(page, (entry) => entry.documentId === initial.documentId && entry.issueTotal >= 0);
    // Query strings are stripped from scan summaries by design.
    expect(navigated.url).not.toContain("?");
    expect(navigated.url).toBe(initial.url);
  });

  test("agrees with axe-core on unnamed buttons and unlabelled fields", async ({ context }) => {
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:4318/shopping.html");
    await page.addScriptTag({ path: axeBundle });
    await page.addScriptTag({ path: scannerBundle });

    const result = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (root: Document, options: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } }).axe;
      const results = await axe.run(document, { runOnly: { type: "rule", values: ["button-name", "label"] } });
      const scanner = (window as unknown as { ClearCueScanner: { scan: (id: string) => ScanSummaryLike } }).ClearCueScanner;
      const summary = scanner.scan("axe-comparison");
      const all = Array.from(document.querySelectorAll("*"));
      const index = new Map(all.map((element, position) => [element, position]));
      const ours = new Set(
        summary.issues
          .map((issue) => document.querySelector(issue.element.locator))
          .filter((element): element is Element => element !== null)
          .map((element) => index.get(element)),
      );
      const axeFindings = results.violations.flatMap((violation) =>
        violation.nodes.map((node) => {
          const element = document.querySelector(node.target[0] ?? "");
          return { rule: violation.id, index: element ? index.get(element) : undefined, target: node.target[0] ?? "" };
        }),
      );
      return { axeFindings, ours: Array.from(ours) };
    });

    expect(result.axeFindings.length).toBeGreaterThan(0);
    const missed = result.axeFindings.filter((finding) => finding.index !== undefined && !result.ours.includes(finding.index));
    expect(missed, `axe findings missed by ClearCue: ${JSON.stringify(missed)}`).toEqual([]);
  });
});

test.describe("controlled unfamiliar fixtures", () => {
  async function scanFixture(page: Page, name: string): Promise<ScanSummaryLike> {
    await page.goto(`file://${path.resolve(process.cwd(), "tests/fixtures", name)}`);
    await page.addScriptTag({ path: scannerBundle });
    return page.evaluate(
      () => (window as unknown as { ClearCueScanner: { scan: (id: string) => ScanSummaryLike } }).ClearCueScanner.scan("fixture"),
    );
  }

  test("news article: catches icon-only controls and vague links, leaves named controls alone", async ({ context }) => {
    const page = await context.newPage();
    const summary = await scanFixture(page, "news-article.html");
    expect(summary.counts.missingButtonLabels).toBeGreaterThanOrEqual(1);
    expect(summary.counts.vagueLinks).toBeGreaterThanOrEqual(3);
    expect(summary.counts.missingLinkLabels).toBeGreaterThanOrEqual(1);

    const falsePositives = await page.evaluate(
      (locators) =>
        locators.filter((locator) => {
          const element = document.querySelector(locator);
          return element?.matches("[aria-label='Open menu'], .visually-hidden");
        }),
      summary.issues.map((issue) => issue.element.locator),
    );
    expect(falsePositives).toEqual([]);
  });

  test("dashboard: catches unlabelled select, broken and duplicated references", async ({ context }) => {
    const page = await context.newPage();
    const summary = await scanFixture(page, "dashboard.html");
    expect(summary.counts.missingFormLabels).toBeGreaterThanOrEqual(1);
    expect(summary.issues.some((issue) => issue.category === "invalid-aria-reference")).toBe(true);
    expect(summary.issues.some((issue) => issue.category === "broken-relationship")).toBe(true);

    const labelledControlsFlagged = await page.evaluate(
      (locators) =>
        locators.filter((locator) => document.querySelector(locator)?.matches("#order-search, #account")),
      summary.issues.map((issue) => issue.element.locator),
    );
    expect(labelledControlsFlagged).toEqual([]);
  });

  test("checkout: catches placeholder-only field and destructive unnamed icon, skips hidden content", async ({ context }) => {
    const page = await context.newPage();
    const summary = await scanFixture(page, "checkout.html");
    expect(summary.counts.missingFormLabels).toBeGreaterThanOrEqual(1);
    expect(summary.counts.vagueLinks).toBeGreaterThanOrEqual(1);
    expect(summary.counts.missingButtonLabels).toBeGreaterThanOrEqual(1);

    const hiddenFlagged = await page.evaluate(
      (locators) => locators.filter((locator) => document.querySelector(locator)?.closest("section[hidden]") !== null),
      summary.issues.map((issue) => issue.element.locator),
    );
    expect(hiddenFlagged).toEqual([]);

    const labelledFlagged = await page.evaluate(
      (locators) => locators.filter((locator) => document.querySelector(locator)?.matches("#email, #card, #expiry")),
      summary.issues.map((issue) => issue.element.locator),
    );
    expect(labelledFlagged).toEqual([]);
  });
});
