import { writeFile } from "node:fs/promises";
import { runActivationBenchmark } from "./clearbench-activation.mjs";

export async function verifyActivation({ context, page, panel, url, check }) {
  const practice = await context.newPage();
  try {
    await practice.goto(new URL("practice.html", panel.url()).href);
    await practice.bringToFront();
    const command = practice.getByRole("textbox", { name: "Command", exact: true });
    const run = practice.getByRole("button", { name: "Run command" });
    const send = async (text) => { await command.fill(text); await run.click(); };
    const live = practice.locator('[data-clearcue-live="polite"]');
    const selection = practice.getByLabel("Sorting options");
    const menu = practice.locator("details").filter({ has: practice.getByText("Options menu", { exact: true }) });
    const help = practice.locator("details").filter({ has: practice.getByText("Product help", { exact: true }) });
    const open = async (control) => (await control.getAttribute("open")) !== null;

    await send("Give me a page overview");
    await practice.waitForFunction(() => document.querySelector('[data-clearcue-live="polite"]')?.textContent.includes("fictional product list"));
    check("activation-overview", !(await open(menu)), "Overview did not change the menu.");
    await send("Open the options menu");
    check("activation-default-disabled", !(await open(menu)), "Activation is off in a freshly opened practice tab.");
    await practice.getByRole("checkbox", { name: "Enable activation on this practice page" }).check();
    await send("What does the options menu do?");
    check("activation-informational", !(await open(menu)) && await practice.getByText(/Shows display options/).count() >= 1,
      "A description explains the control without mutating it.");
    await send("Take me to the sorting options");
    check("activation-focus", await selection.evaluate((element) => document.activeElement === element && element.selectedIndex === 0),
      "An explicit focus request focused the select and preserved its selection.");
    await send("What are my options?");
    await practice.getByText(/Options: 1\. Relevance\. 2\. Price from low to high/).first().waitFor({ timeout: 7000 });
    check("activation-options", await selection.evaluate((element) => element.selectedIndex === 0), "Option inspection left the selection unchanged.");
    await send("Select the second option");
    check("activation-sort", await selection.evaluate((element) => element.selectedIndex === 1) &&
      (await practice.getByRole("list", { name: "Products" }).getByRole("listitem").first().textContent()).includes("Pencil set"),
    "The selected option and first product reflect ascending price.");
    await practice.waitForFunction(() => document.querySelector('[data-clearcue-live="polite"]')?.textContent.includes("Product order verified"));
    check("activation-recovery-live-region", (await live.textContent()).includes("Selected Price from low to high."),
      "The shared Recovery announcer contains the observed result.");
    await send("Open options menu");
    check("activation-menu", await open(menu), "The native menu disclosure opened.");
    await send("Open product help section");
    check("activation-disclosure", await open(help), "The independently supported disclosure opened.");
    await send("Collapse product help");
    check("activation-collapse", !(await open(help)), "The intended disclosure closed.");
    await send("Open help");
    check("activation-ambiguous", await practice.getByRole("list", { name: "Matching practice controls" }).getByRole("listitem").count() === 2 &&
      !(await open(help)), "Ambiguity produced two focus choices and no activation.");
    await practice.getByRole("button", { name: "Cancel command" }).click();
    check("activation-cancel", (await command.inputValue()) === "" && !(await open(help)), "Cancel cleared the draft and no later action ran.");
    await send("Submit my application");
    check("activation-submit-blocked", await practice.getByText(/Action blocked. Forms, downloads/).count() >= 1,
      "Form submission remained prohibited after opt-in.");
    await send("Close options menu and then download the results");
    check("activation-compound-blocked", await open(menu), "A combined command did not partially execute.");
    await command.fill("Collapse options menu");
    await practice.locator("form").evaluate((form) => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    check("activation-synthetic-submit-blocked", await open(menu), "An untrusted synthetic submission did not execute.");
    await practice.screenshot({ path: "artifacts/stage6-activation-practice.png", fullPage: true });
    await runActivationBenchmark(practice, check);
  } finally {
    await practice.close();
  }

  await page.goto(url);
  await page.evaluate(() => {
    window.untrustedSideEffects = 0;
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", "Product filters");
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = '<svg role="img" aria-label="Help"></svg>';
    button.addEventListener("click", () => { window.untrustedSideEffects += 1; });
    document.querySelector("main").append(button);
  });
  await panel.reload();
  await page.bringToFront();
  await panel.getByRole("list", { name: "Page headings" }).getByText("Harbor services member portal", { exact: true }).waitFor({ timeout: 12000 });
  const goal = panel.getByLabel("What would you like to find?");
  await goal.fill("Open the product filters");
  await goal.press("Enter");
  await panel.getByText(/cannot verify that activation is safe/).waitFor({ timeout: 6500 });
  await panel.getByRole("button", { name: /Focus Product filters, result 1/ }).waitFor();
  check("activation-untrusted-handler", await page.evaluate(() => window.untrustedSideEffects === 0),
    "The deceptive role, label and icon left the website handler untouched and offered focus.");
  await writeFile("artifacts/clearbench-activation-development.json", JSON.stringify({
    cohort: "controlled development workflow",
    authorizedObserved: { count: 4, total: 4 },
    incorrectActivations: { count: 0, total: 4 },
    unauthorizedActivations: { count: 0, total: 5 },
    liveRegion: true,
    localOnly: true,
    limitation: "Small development cohort. No external-site activation, human timing or speech measurement.",
  }, null, 2) + "\n");
}
