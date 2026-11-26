import { mkdir, access } from "node:fs/promises";
import { chromium } from "playwright";

/**
 * Loads the built extension into real Chrome (Playwright's persistent context),
 * opens the diagnostics document and reports what is actually observable.
 *
 * This script never runs inference: without Firebase configuration there is
 * nothing to authenticate. It verifies packaging, CSP, rendering, the service
 * worker, and the real `LanguageModel` capability of the extension origin.
 */
const local = (path) => new URL(path, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const distPath = local("../dist/");

async function main() {
  await access(distPath);
  await mkdir(new URL("../artifacts/", import.meta.url), { recursive: true });

  // Playwright's bundled Chromium honours --load-extension, but MV3 extension
  // loading only works with a visible window here, so the check runs headed.
  // Branded Google Chrome 137+ ignores --load-extension entirely, which is why
  // this uses Playwright's own Chromium build.
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [`--disable-extensions-except=${distPath}`, `--load-extension=${distPath}`, "--no-first-run"],
  });

  const consoleMessages = [];
  const pageErrors = [];

  try {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) serviceWorker = await context.waitForEvent("serviceworker", { timeout: 15000 });
    const extensionId = new URL(serviceWorker.url()).host;

    const page = await context.newPage();
    page.on("console", (message) => {
      const text = message.text();
      if (/App Check debug token:/i.test(text)) return;
      consoleMessages.push({ type: message.type(), text });
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`chrome-extension://${extensionId}/diagnostics.html`, { waitUntil: "load" });
    await page.waitForSelector("h1", { timeout: 15000 });

    const heading = await page.locator("h1").innerText();
    const firebaseState = await page.locator("[aria-labelledby='firebase-heading']").innerText();
    const deviceState = await page.locator("[aria-labelledby='device-heading']").innerText();

    const geometry = await page.evaluate(() => {
      const overlaps = [];
      for (const kv of document.querySelectorAll(".kv")) {
        const children = Array.from(kv.children);
        for (let i = 0; i < children.length - 1; i += 1) {
          const a = children[i].getBoundingClientRect();
          const b = children[i + 1].getBoundingClientRect();
          const overlapW = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overlapH = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (overlapW > 2 && overlapH > 2) {
            overlaps.push({ a: children[i].textContent?.slice(0, 40), b: children[i + 1].textContent?.slice(0, 40) });
          }
        }
      }
      const overflow = Array.from(document.querySelectorAll("body *"))
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 5)
        .map((el) => el.tagName + "." + el.className);
      return { horizontalScroll: document.documentElement.scrollWidth - window.innerWidth, overlaps, overflow };
    });

    const capability = await page.evaluate(async () => {
      const options = {
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
      };
      if (typeof LanguageModel === "undefined") return { present: false };
      try {
        const availability = await LanguageModel.availability(options);
        return { present: true, availability };
      } catch (error) {
        return { present: true, error: String(error) };
      }
    });

    // Exercise the "not configured" error path: this must fail fast without
    // downloading a model or sending a request.
    const initialize = page.getByRole("button", { name: "Initialize Local AI" });
    await initialize.click();
    await page.waitForTimeout(1200);
    const deviceStateAfterInit = await page.locator("[aria-labelledby='device-heading']").innerText();

    await page.screenshot({
      path: local("../artifacts/extension-diagnostics.png"),
      fullPage: true,
    });

    const report = {
      extensionId,
      origin: `chrome-extension://${extensionId}`,
      heading,
      capability,
      geometry,
      serviceWorker: serviceWorker.url(),
      firebaseConfigured: !firebaseState.includes("Firebase is not configured"),
      devicePanelReportsAvailability: deviceState.includes("Availability"),
      initializeErrorPathShown: /not configured|failed/i.test(deviceStateAfterInit),
      consoleMessages,
      pageErrors,
      screenshot: "artifacts/extension-diagnostics.png",
    };

    console.log(JSON.stringify(report, null, 2));

    if (pageErrors.length > 0) {
      console.error("FAIL: page errors were thrown");
      process.exitCode = 1;
    }
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error("VERIFY FAILED:", error);
  process.exitCode = 1;
});
