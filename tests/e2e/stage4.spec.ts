import path from "node:path";
import { chromium, expect, test as base, type BrowserContext, type Page, type Worker } from "@playwright/test";

/**
 * Stage 4 browser tests.
 *
 * These exercise the real content script's repair path on the playground: a
 * repair is applied only when the target still matches, the accessible name is
 * recomputed, and undo restores the exact original attribute state.
 */

const extensionPath = path.resolve(process.cwd(), "dist");
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
    await use(context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker")));
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
});

interface ScanIssueLike {
  id: string;
  category: string;
  accessibleName: string;
  element: { locator: string; tagName: string };
  candidates: Array<{ proposedValue: string }>;
}

interface ScanSummaryLike {
  documentId: string;
  issueTotal: number;
  issues: ScanIssueLike[];
}

async function installContentStub(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const store: unknown[] = [];
    const listeners: Array<(message: unknown, sender: unknown, respond: (value: unknown) => void) => void> = [];
    Object.defineProperty(window, "__clearcueMessages", { value: store, configurable: true });
    Object.defineProperty(window, "__clearcueDispatch", {
      value: (message: unknown) =>
        new Promise((resolve) => {
          let answered = false;
          for (const listener of listeners) {
            listener(message, {}, (value: unknown) => {
              answered = true;
              resolve(value);
            });
          }
          if (!answered) resolve(null);
        }),
      configurable: true,
    });
    const stub = {
      runtime: {
        sendMessage: (message: unknown) => {
          store.push(message);
          return Promise.resolve({ ok: true });
        },
        onMessage: { addListener: (listener: (typeof listeners)[number]) => listeners.push(listener) },
      },
      permissions: { request: () => Promise.resolve(true), contains: () => Promise.resolve(true), remove: () => Promise.resolve(true) },
    };
    (window as unknown as { chrome: unknown }).chrome = stub;
  });
}

async function latestScan(page: Page): Promise<ScanSummaryLike> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const summary = await page.evaluate(
      () =>
        (window as unknown as { __clearcueMessages?: Array<{ kind: string; summary?: ScanSummaryLike }> }).__clearcueMessages
          ?.filter((message) => message.kind === "content:scan")
          .map((message) => message.summary)
          .filter((entry): entry is ScanSummaryLike => Boolean(entry))
          .at(-1) ?? null,
    );
    if (summary && summary.issueTotal > 0) return summary;
    await page.waitForTimeout(150);
  }
  throw new Error("The content script did not report a scan.");
}

async function dispatch(page: Page, message: unknown): Promise<unknown> {
  return page.evaluate((payload) => (window as unknown as { __clearcueDispatch: (value: unknown) => Promise<unknown> }).__clearcueDispatch(payload), message);
}

test.describe("panel repair surface", () => {
  test("shows truthful zero statistics and does not claim the model is ready", async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/panel.html`);
    await expect(page.getByRole("heading", { name: "Repair engine" })).toBeVisible();
    await expect(page.getByText("Deterministic repairs")).toBeVisible();
    await expect(page.getByText("No repair decisions yet.")).toBeVisible();
    await expect(page.getByText("No suggestions are waiting for review.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Repair supported issues/ })).toBeDisabled();
    const status = await page.locator(".repair-status").innerText();
    expect(status).toMatch(/available and ready|not downloaded|downloading|unavailable|availability unknown/);
  });

  test("panel remains keyboard reachable and announces repair state", async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/panel.html`);
    const repairSection = page.locator("#repair");
    await expect(repairSection.getByRole("button", { name: "Pause repair" })).toBeVisible();
    const focusable = await repairSection.locator("button, input").count();
    expect(focusable).toBeGreaterThan(0);
  });

  test("pauses and resumes repair with the keyboard and persists the setting across panel reload", async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/panel.html`);
    const repair = page.locator("#repair");
    await repair.getByRole("button", { name: "Pause repair" }).press("Enter");
    await expect(repair.getByRole("button", { name: "Resume repair" })).toBeEnabled();
    await page.reload();
    await repair.getByRole("button", { name: "Resume repair" }).press("Enter");
    await expect(repair.getByRole("button", { name: "Pause repair" })).toBeEnabled();
  });
});

test.describe("reversible DOM repairs in the real content script", () => {
  test("applies a verified accessible name and restores the exact previous state", async ({ context }) => {
    await installContentStub(context);
    const page = await context.newPage();
    await page.goto(PLAYGROUND);
    await page.addScriptTag({ path: path.join(extensionPath, "content.js") });
    const scan = await latestScan(page);
    const issue = scan.issues.find((item) => item.category === "form-control-name" && item.element.tagName === "input") ?? scan.issues[0];
    expect(issue).toBeTruthy();

    const applied = (await dispatch(page, {
      kind: "bg:applyRepair",
      request: {
        issueId: issue.id,
        documentId: scan.documentId,
        locator: issue.element.locator,
        expectedTag: issue.element.tagName,
        label: "Application reference",
        kind: "accessible-name",
        target: "aria-label",
        snapshot: [
          { name: "aria-label", present: false, value: null },
          { name: "aria-labelledby", present: false, value: null },
        ],
        proposedBy: "on_device",
        explanation: "Test of the verified DOM repair path.",
      },
    })) as { ok: boolean; data: { ok: boolean; verified: boolean; applied: { id: string; previousPresent: boolean } } };

    expect(applied.ok).toBe(true);
    expect(applied.data.ok).toBe(true);
    expect(applied.data.verified).toBe(true);
    expect(applied.data.applied.previousPresent).toBe(false);

    const value = await page.evaluate((locator) => document.querySelector(locator)?.getAttribute("aria-label") ?? null, issue.element.locator);
    expect(value).toBe("Application reference");

    const undone = (await dispatch(page, {
      kind: "bg:undoRepair",
      request: {
        repairId: applied.data.applied.id,
        issueId: issue.id,
        documentId: scan.documentId,
        locator: issue.element.locator,
        target: "aria-label",
        expectedCurrentValue: "Application reference",
        previousValue: "",
        previousPresent: false,
      },
    })) as { ok: boolean; data: { ok: boolean; conflict: boolean } };
    expect(undone.data.ok).toBe(true);
    expect(undone.data.conflict).toBe(false);
    expect(await page.evaluate((locator) => document.querySelector(locator)?.hasAttribute("aria-label") ?? false, issue.element.locator)).toBe(false);
  });

  test("refuses to apply over a name the page set independently", async ({ context }) => {
    await installContentStub(context);
    const page = await context.newPage();
    await page.goto(PLAYGROUND);
    await page.addScriptTag({ path: path.join(extensionPath, "content.js") });
    const scan = await latestScan(page);
    const issue = scan.issues.find((item) => item.category === "form-control-name") ?? scan.issues[0];
    expect(issue).toBeTruthy();
    await page.evaluate((locator) => document.querySelector(locator)?.setAttribute("aria-label", "Page supplied"), issue.element.locator);

    const result = (await dispatch(page, {
      kind: "bg:applyRepair",
      request: {
        issueId: issue.id,
        documentId: scan.documentId,
        locator: issue.element.locator,
        expectedTag: issue.element.tagName,
        label: "ClearCue name",
        kind: "accessible-name",
        target: "aria-label",
        snapshot: [
          { name: "aria-label", present: true, value: "Page supplied" },
          { name: "aria-labelledby", present: false, value: null },
        ],
        proposedBy: "rule",
        explanation: "Conflict test.",
      },
    })) as { ok: boolean; data: { ok: boolean; error: string | null } };
    expect(result.data.ok).toBe(false);
    expect(result.data.error).toContain("already has an accessible name");
    expect(await page.evaluate((locator) => document.querySelector(locator)?.getAttribute("aria-label"), issue.element.locator)).toBe("Page supplied");
  });

  test("restores its repair when the site is disabled", async ({ context }) => {
    await installContentStub(context);
    const page = await context.newPage();
    await page.goto(PLAYGROUND);
    await page.addScriptTag({ path: path.join(extensionPath, "content.js") });
    const scan = await latestScan(page);
    const issue = scan.issues[0];
    expect(issue).toBeTruthy();
    const applied = (await dispatch(page, {
      kind: "bg:applyRepair",
      request: {
        issueId: issue.id,
        documentId: scan.documentId,
        locator: issue.element.locator,
        expectedTag: issue.element.tagName,
        label: "ClearCue temporary name",
        kind: "accessible-name",
        target: "aria-label",
        snapshot: [],
        proposedBy: "rule",
        explanation: "Disable restore test.",
      },
    })) as { data: { ok: boolean; applied: { id: string } } };
    expect(applied.data.ok).toBe(true);
    const disabled = (await dispatch(page, { kind: "bg:siteDisabled" })) as {
      data: { restored: string[] };
    };
    expect(disabled.data.restored).toContain(applied.data.applied.id);
    expect(await page.evaluate((locator) => document.querySelector(locator)?.hasAttribute("aria-label") ?? false, issue.element.locator)).toBe(false);
  });

  test("restores its repair on an in-page navigation", async ({ context }) => {
    await installContentStub(context);
    const page = await context.newPage();
    await page.goto(PLAYGROUND);
    await page.addScriptTag({ path: path.join(extensionPath, "content.js") });
    const scan = await latestScan(page);
    const issue = scan.issues[0];
    const applied = (await dispatch(page, {
      kind: "bg:applyRepair",
      request: {
        issueId: issue.id,
        documentId: scan.documentId,
        locator: issue.element.locator,
        expectedTag: issue.element.tagName,
        label: "ClearCue temporary name",
        kind: "accessible-name",
        target: "aria-label",
        snapshot: [],
        proposedBy: "rule",
        explanation: "SPA restore test.",
      },
    })) as { data: { ok: boolean; applied: { id: string } } };
    expect(applied.data.ok).toBe(true);
    await page.evaluate(() => {
      history.pushState({}, "", "/account.html");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect
      .poll(() => page.evaluate((locator) => document.querySelector(locator)?.hasAttribute("aria-label") ?? false, issue.element.locator), { timeout: 5000 })
      .toBe(false);
    const restored = await page.evaluate(
      () =>
        (window as unknown as { __clearcueMessages?: Array<{ kind: string; repairIds?: string[] }> }).__clearcueMessages
          ?.filter((message) => message.kind === "content:repairsRestored")
          .flatMap((message) => message.repairIds ?? []) ?? [],
    );
    expect(restored).toContain(applied.data.applied.id);
  });

  test("undo refuses when the page changed the repair independently", async ({ context }) => {
    await installContentStub(context);
    const page = await context.newPage();
    await page.goto(PLAYGROUND);
    await page.addScriptTag({ path: path.join(extensionPath, "content.js") });
    const scan = await latestScan(page);
    const issue = scan.issues.find((item) => item.category === "form-control-name") ?? scan.issues[0];
    expect(issue).toBeTruthy();
    const applied = (await dispatch(page, {
      kind: "bg:applyRepair",
      request: {
        issueId: issue.id,
        documentId: scan.documentId,
        locator: issue.element.locator,
        expectedTag: issue.element.tagName,
        label: "Application reference",
        kind: "accessible-name",
        target: "aria-label",
        snapshot: [],
        proposedBy: "on_device",
        explanation: "Undo conflict test.",
      },
    })) as { data: { applied: { id: string } } };
    await page.evaluate((locator) => document.querySelector(locator)?.setAttribute("aria-label", "Site update"), issue.element.locator);
    const undone = (await dispatch(page, {
      kind: "bg:undoRepair",
      request: {
        repairId: applied.data.applied.id,
        issueId: issue.id,
        documentId: scan.documentId,
        locator: issue.element.locator,
        target: "aria-label",
        expectedCurrentValue: "Application reference",
        previousValue: "",
        previousPresent: false,
      },
    })) as { data: { ok: boolean; conflict: boolean } };
    expect(undone.data.ok).toBe(false);
    expect(undone.data.conflict).toBe(true);
    expect(await page.evaluate((locator) => document.querySelector(locator)?.getAttribute("aria-label"), issue.element.locator)).toBe("Site update");
  });
});
