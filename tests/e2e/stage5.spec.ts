import path from "node:path";
import { chromium, expect, test as base, type BrowserContext, type Page, type Worker } from "@playwright/test";

/**
 * Stage 5 browser tests.
 *
 * The real content script runs on the Stage 5 playground with a Chrome API stub.
 * These tests prove observed evidence, field association, duplicate suppression,
 * page-owned announcement suppression, explicit focus recovery and live-region
 * output without simulating an AI response.
 */

const extensionPath = path.resolve(process.cwd(), "dist");
const RECOVERY_PAGE = "http://127.0.0.1:4318/recovery.html";

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

interface RecoveryEventLike {
  id: string;
  interactionId: string | null;
  documentId: string;
  pageUrl: string;
  category: string;
  severity: string;
  message: string;
  related: { locator: string; name: string; tagName: string } | null;
  association: string;
  existingAnnouncement: string;
  announcementStatus: string;
  actions: string[];
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

async function dispatch(page: Page, message: unknown): Promise<unknown> {
  return page.evaluate((payload) => (window as unknown as { __clearcueDispatch: (value: unknown) => Promise<unknown> }).__clearcueDispatch(payload), message);
}

async function recoveryEvents(page: Page): Promise<RecoveryEventLike[]> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const events = await page.evaluate(
      () =>
        (window as unknown as { __clearcueMessages?: Array<{ kind: string; event?: RecoveryEventLike }> }).__clearcueMessages
          ?.filter((message) => message.kind === "content:recovery")
          .map((message) => message.event)
          .filter((event): event is RecoveryEventLike => Boolean(event)) ?? [],
    );
    if (events.length > 0) return events;
    await page.waitForTimeout(100);
  }
  return [];
}

async function waitForRecovery(page: Page, predicate: (event: RecoveryEventLike) => boolean): Promise<RecoveryEventLike> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const events = await recoveryEvents(page);
    const match = events.find(predicate);
    if (match) return match;
    await page.waitForTimeout(100);
  }
  throw new Error("The expected recovery outcome was not observed.");
}

async function openRecovery(page: Page): Promise<void> {
  await page.goto(RECOVERY_PAGE);
  await page.addScriptTag({ path: path.join(extensionPath, "content.js") });
  await expect(page.getByRole("heading", { name: "Interaction recovery lab" })).toBeVisible();
}

async function submitScholarship(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Continue application" }).click();
}

test.describe("Stage 5 recovery in the real content script", () => {
  test("detects a silent validation outcome, offers a real field link and focuses only on request", async ({ context }) => {
    await installContentStub(context);
    const page = await context.newPage();
    await openRecovery(page);
    await submitScholarship(page);

    const events = await recoveryEvents(page);
    expect(events.length).toBeGreaterThan(0);
    const fieldEvent = await waitForRecovery(page, (event) => event.related?.name === "Registration number" && event.message.includes("eight-character"));
    expect(fieldEvent).toBeTruthy();
    if (!fieldEvent) return;
    expect(fieldEvent.interactionId).not.toBeNull();
    expect(fieldEvent.existingAnnouncement).toBe("none");
    expect(fieldEvent.announcementStatus).toBe("pending");
    expect(fieldEvent.actions).toContain("jump");
    expect(fieldEvent.actions).toContain("replay");

    // The page itself never steals focus; the test asserts this before asking.
    expect(await page.evaluate(() => document.activeElement?.id ?? "")).not.toBe("reg-number");

    const focused = (await dispatch(page, {
      kind: "bg:focusRecovery",
      eventId: fieldEvent.id,
      documentId: fieldEvent.documentId,
      locator: fieldEvent.related?.locator ?? "",
    })) as { ok: boolean; data: { focused: boolean; reason: string } };
    expect(focused.ok).toBe(true);
    expect(focused.data.focused).toBe(true);
    expect(await page.evaluate(() => document.activeElement?.id ?? "")).toBe("reg-number");
    expect(await page.inputValue("#reg-number")).toBe("");
  });

  test("writes a live-region update and retains an identical error from a new submission", async ({ context }) => {
    await installContentStub(context);
    const page = await context.newPage();
    await openRecovery(page);
    await submitScholarship(page);
    const events = await recoveryEvents(page);
    const event = events.find((item) => item.related?.name === "Registration number" && item.message.includes("eight-character"));
    expect(event).toBeTruthy();
    if (!event) return;

    const announced = (await dispatch(page, { kind: "bg:announceRecovery", event, replay: false })) as { ok: boolean; data: { scheduled: boolean } };
    expect(announced.ok).toBe(true);
    expect(announced.data.scheduled).toBe(true);
    await page.waitForTimeout(80);
    const region = page.locator('[data-clearcue-live="polite"]');
    await expect(region).toHaveText(/eight-character registration number/);
    expect(await page.locator('[data-clearcue-live="assertive"]').textContent()).toBe("");

    const replay = (await dispatch(page, { kind: "bg:announceRecovery", event, replay: true })) as { ok: boolean; data: { scheduled: boolean } };
    expect(replay.data.scheduled).toBe(true);
    await page.waitForTimeout(80);
    await expect(region).toHaveText(/Repeated message/);

    const before = (await recoveryEvents(page)).length;
    await page.getByRole("button", { name: "Reset workflow" }).click();
    await submitScholarship(page);
    const repeated = await waitForRecovery(page, (item) => item.message === event.message &&
      item.interactionId !== null && item.interactionId !== event.interactionId);
    expect(repeated.id).not.toBe(event.id);
    expect((await recoveryEvents(page)).length).toBeGreaterThan(before);
  });

  test("does not duplicate a page-owned alert and keeps the accessible comparison honest", async ({ context }) => {
    await installContentStub(context);
    const page = await context.newPage();
    await openRecovery(page);
    await page.getByRole("button", { name: "Accessible comparison: off" }).click();
    await submitScholarship(page);
    const event = await waitForRecovery(page, (item) => item.category === "error-summary");
    expect(event.existingAnnouncement).toBe("aria-live-assertive");
    expect(event.announcementStatus).toBe("announced-by-page");
  });

  test("recovers an aria-hidden visual toast and reports a failure as failure", async ({ context }) => {
    await installContentStub(context);
    const page = await context.newPage();
    await openRecovery(page);
    await page.getByRole("button", { name: "Add driftwood lantern" }).click();
    const success = await waitForRecovery(page, (item) => item.category === "success-confirmation" && item.message.includes("Driftwood lantern"));
    expect(success.message).toContain("added to your basket");

    await page.getByRole("button", { name: "Add sold-out item" }).click();
    const failure = await waitForRecovery(page, (item) => item.category === "operation-failure" && item.message.includes("sold out"));
    expect(failure.severity).toBe("error");
  });

  test("refuses to guess between two invalid account fields", async ({ context }) => {
    await installContentStub(context);
    const page = await context.newPage();
    await openRecovery(page);
    await page.getByRole("button", { name: "Save changes" }).click();
    const event = await waitForRecovery(page, (item) => item.message.includes("Check the highlighted fields"));
    expect(event.related).toBeNull();
    expect(event.association).toBe("none");
    expect(event.actions).not.toContain("jump");
  });

  test("captures native validation before submit and excludes another form", async ({ context }) => {
    await installContentStub(context);
    const page = await context.newPage();
    await page.goto(RECOVERY_PAGE);
    await page.setContent(`
      <form><label for="day">Arrival day</label><input id="day" required>
        <button>Reserve seat</button></form>
      <form><label for="email">Newsletter address</label><input id="email" required>
        <button>Subscribe</button></form>`);
    await page.addScriptTag({ path: path.join(extensionPath, "content.js") });
    await page.getByRole("button", { name: "Reserve seat" }).click();
    const event = await waitForRecovery(page, (item) => item.existingAnnouncement === "native-validation");
    expect(event.related?.name).toBe("Arrival day");
    expect(event.interactionId).not.toBeNull();
    expect((await recoveryEvents(page)).some((item) => item.related?.name === "Newsletter address")).toBe(false);
  });

  test("detects a visual-only success after correction", async ({ context }) => {
    await installContentStub(context);
    const page = await context.newPage();
    await openRecovery(page);
    await page.fill("#reg-number", "NF-12345");
    await page.fill("#applicant-email", "student@example.com");
    await submitScholarship(page);
    await expect(page.getByRole("heading", { name: "Registration accepted" })).toBeVisible();
    const event = await waitForRecovery(page, (item) => item.category === "success-confirmation");
    expect(event.message).toContain("Registration accepted");
    expect(event.existingAnnouncement).toBe("none");
  });
});
