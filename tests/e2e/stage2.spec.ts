import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect, test as base, type BrowserContext, type Worker } from "@playwright/test";

/**
 * Browser integration tests for the built extension.
 *
 * They run against `dist/` in a real Chromium profile, so they prove that the
 * manifest loads, the side panel renders, the background answers typed messages,
 * and the content script reports honest page facts. Chrome's native permission
 * prompt cannot be automated, so "enable on site" is covered by unit tests plus
 * the manual checklist in docs/PROGRESS.md.
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
    const userDataDir = await mkdtemp(path.join(tmpdir(), "clearcue-e2e-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  },
  serviceWorker: async ({ context }, use) => {
    const existing = context.serviceWorkers()[0];
    const worker = existing ?? (await context.waitForEvent("serviceworker"));
    await use(worker);
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
});

test.describe("extension surface", () => {
  test("built manifest stays minimal and uses the side panel", async () => {
    const manifest = JSON.parse(await readFile(path.join(extensionPath, "manifest.json"), "utf8")) as {
      manifest_version: number;
      permissions: string[];
      host_permissions?: string[];
      optional_host_permissions?: string[];
      side_panel?: { default_path?: string };
      content_security_policy?: { extension_pages?: string };
    };

    expect(manifest.manifest_version).toBe(3);
    expect([...manifest.permissions].sort()).toEqual(["activeTab", "scripting", "sidePanel", "storage"]);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toEqual(["https://*/*", "http://*/*"]);
    expect(manifest.side_panel?.default_path).toBe("panel.html");
    expect(manifest.content_security_policy?.extension_pages).toContain("script-src 'self'");
  });

  test("action click is the side-panel trigger, not implicit panel behaviour", async ({ serviceWorker }) => {
    const behavior = await serviceWorker.evaluate(async () => {
      const api = (globalThis as unknown as {
        chrome?: {
          sidePanel: { getPanelBehavior: () => Promise<{ openPanelOnActionClick?: boolean }> };
          action: { onClicked: { hasListeners: () => boolean } };
        };
      }).chrome;
      if (!api) return null;
      return {
        behavior: await api.sidePanel.getPanelBehavior(),
        actionListener: api.action.onClicked.hasListeners(),
      };
    });
    expect(behavior?.behavior.openPanelOnActionClick).toBe(false);
    expect(behavior?.actionListener).toBe(true);

    const manifest = JSON.parse(await readFile(path.join(extensionPath, "manifest.json"), "utf8")) as { permissions: string[] };
    expect(manifest.permissions).not.toContain("tabs");
  });

  test("panel renders every section with local-only privacy by default", async ({ context, extensionId }) => {
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`chrome-extension://${extensionId}/panel.html`);

    await expect(page.getByRole("heading", { level: 1, name: "ClearCue" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "This page" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
    await expect(page.getByText("Local only", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Site access" })).toBeVisible();
    await expect(page.getByText("No sites are enabled")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Interaction recovery" })).toBeVisible();
    await expect(page.getByText("No meaningful outcome has been observed on this page yet", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Repair history" })).toBeVisible();
    await expect(page.getByText("No repairs yet")).toBeVisible();
    await page.getByText("Advanced verification", { exact: true }).click();
    await expect(page.getByRole("heading", { name: "Statistics" })).toBeVisible();
    await expect(page.getByText("No activity recorded yet")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Keyboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Firebase diagnostics" })).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("cloud opt-in is explicit and reversible through the background", async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/panel.html`);

    await page.getByRole("button", { name: /Allow cloud inference/ }).click();
    await expect(page.getByRole("button", { name: "Yes, allow cloud inference" })).toBeVisible();
    await page.getByRole("button", { name: "Yes, allow cloud inference" }).click();

    await expect(page.getByText("Cloud allowed", { exact: true })).toBeVisible();
    await expect(page.getByText(/Cloud allowed since/)).toBeVisible();

    await page.getByRole("button", { name: "Switch back to local-only" }).click();
    await expect(page.getByText("Local only", { exact: true })).toBeVisible();
  });

  test("the first-run introduction supports keyboard skip, persistence and revisit", async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/panel.html`);
    const intro = page.getByRole("region", { name: "Get started with ClearCue" });
    const skip = intro.getByRole("button", { name: "Skip introduction" });
    const review = intro.getByRole("button", { name: "Revisit introduction" });
    const settings = () => page.evaluate(async () => {
      const api = (window as unknown as { chrome: { runtime: { sendMessage(message: { kind: string }):
        Promise<{ data?: { settings?: { onboardingSeen?: boolean; explanationDetail?: string } } }> } } }).chrome;
      return (await api.runtime.sendMessage({ kind: "panel:getState" })).data?.settings;
    });
    await expect(intro.getByRole("heading", { name: "Guided practice" })).toBeVisible();
    await expect(intro.getByRole("link", { name: "Open guided practice" })).toHaveAttribute("href", "./practice.html");
    await expect(page.getByRole("combobox", { name: "Preferred speech output" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Stop speech" })).toHaveCount(0);
    await skip.focus();
    await skip.press("Enter");
    await expect(review).toBeFocused();
    await expect.poll(async () => (await settings())?.onboardingSeen).toBe(true);
    await page.reload();
    await expect(review).toBeVisible();
    await expect(skip).toBeHidden();
    await review.press("Enter");
    await expect(skip).toBeVisible();
    await expect(page.getByText("No sites are enabled")).toBeVisible();
    await page.getByRole("combobox", { name: "Explanation detail" }).selectOption("concise");
    await expect.poll(async () => (await settings())?.explanationDetail).toBe("concise");
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Explanation detail" })).toHaveValue("concise");
  });

  test("no content script is registered before a site is enabled", async ({ serviceWorker }) => {
    const scripts = await serviceWorker.evaluate(() =>
      (
        globalThis as unknown as {
          chrome: { scripting: { getRegisteredContentScripts: () => Promise<unknown[]> } };
        }
      ).chrome.scripting.getRegisteredContentScripts(),
    );
    expect(scripts).toEqual([]);
  });
});

test.describe("page inspector", () => {
  test("reports honest page facts, guards double injection and tracks SPA navigation", async ({ context }) => {
    await context.addInitScript(() => {
      if (location.protocol !== "http:" && location.protocol !== "https:") return;
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

    const page = await context.newPage();
    await page.goto(PLAYGROUND);
    await page.addScriptTag({ path: path.join(extensionPath, "content.js") });

    await page.waitForFunction(
      () =>
        (window as unknown as { __clearcueMessages?: Array<{ kind: string }> }).__clearcueMessages?.some(
          (message) => message.kind === "content:hello",
        ) ?? false,
    );

    const first = await page.evaluate(
      () =>
        (window as unknown as {
          __clearcueMessages: Array<{
            kind: string;
            snapshot: { origin: string; documentId: string; counts: { forms: number; fields: number }; url: string };
          }>;
        }).__clearcueMessages.find((message) => message.kind === "content:hello")!,
    );

    expect(first?.kind).toBe("content:hello");
    expect(first?.snapshot.origin).toBe("http://127.0.0.1:4318");
    expect(first?.snapshot.counts.forms).toBe(1);
    expect(first?.snapshot.counts.fields).toBe(5);
    expect(first?.snapshot.documentId).toMatch(/[0-9a-f-]{16,}/);

    // Injecting the same bundle again must not start a second inspector.
    const beforeDoubleInjection = await page.evaluate(
      () => (window as unknown as { __clearcueMessages: unknown[] }).__clearcueMessages.length,
    );
    await page.addScriptTag({ path: path.join(extensionPath, "content.js") });
    await page.waitForTimeout(400);
    const helloCount = await page.evaluate(
      () =>
        (window as unknown as { __clearcueMessages: Array<{ kind: string }> }).__clearcueMessages.filter(
          (message) => message.kind === "content:hello",
        ).length,
    );
    expect(helloCount).toBe(1);
    const afterDoubleInjection = await page.evaluate(
      () => (window as unknown as { __clearcueMessages: unknown[] }).__clearcueMessages.length,
    );
    expect(afterDoubleInjection).toBeGreaterThanOrEqual(beforeDoubleInjection);

    // The playground rewrites history for SPA-style navigation.
    await page.evaluate(() => history.pushState({}, "", "/scholarship.html?step=2"));
    await page.waitForFunction(
      () =>
        (
          window as unknown as { __clearcueMessages?: Array<{ kind: string; snapshot?: { url: string } }> }
        ).__clearcueMessages?.some(
          (message) => message.kind === "content:pageChanged" && message.snapshot?.url.includes("?step=2"),
        ) ?? false,
    );

    const second = await page.evaluate(
      () =>
        (window as unknown as { __clearcueMessages: Array<{ kind: string; snapshot: { url: string; documentId: string } }> })
          .__clearcueMessages.find((message) => message.kind === "content:pageChanged")!,
    );
    expect(second?.kind).toBe("content:pageChanged");
    expect(second?.snapshot.url).toContain("?step=2");
    expect(second?.snapshot.documentId).toBe(first?.snapshot.documentId);
  });
});
