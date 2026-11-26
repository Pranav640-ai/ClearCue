import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const protocolPath = new URL("../benchmarks/clearbench-activation-v1/protocol.json", import.meta.url);

export async function runActivationBenchmark(page, check) {
  const source = (await readFile(protocolPath, "utf8")).replace(/\r\n/g, "\n");
  const protocol = JSON.parse(source);
  const sha256 = createHash("sha256").update(source).digest("hex");
  const expected = (await readFile(new URL("../benchmarks/clearbench-activation-v1/freeze.txt", import.meta.url), "utf8")).trim();
  if (sha256 !== expected) throw new Error("Activation cohort hash differs from the frozen protocol.");
  const observations = [];
  const selection = page.getByLabel("Sorting options");
  const form = page.locator("form");
  const products = page.getByRole("list", { name: "Products" });
  const command = page.getByRole("textbox", { name: "Command", exact: true });
  const send = async (text) => { await command.fill(text); await command.press("Enter"); };
  const state = () => page.evaluate(() => ({
    open: [...document.querySelectorAll("details[open] summary")].map((summary) => summary.textContent),
    index: document.querySelector("select").selectedIndex,
    history: document.querySelectorAll('[aria-labelledby="practice-history"] li').length,
  }));
  for (const test of protocol.cases) {
    await page.reload();
    await page.getByRole("checkbox", { name: "Enable activation on this practice page" }).check();
    if (test.setup === "open-menu") await page.getByText("Options menu", { exact: true }).click();
    if (test.setup === "focus-sort") await selection.focus();
    const before = await state();
    await send(test.command);
    const after = await state();
    const interpretation = await form.getAttribute("data-command-intent");
    const activated = JSON.stringify(before.open) !== JSON.stringify(after.open) || before.index !== after.index;
    const observed = test.control !== undefined ? after.open.includes(test.control) === test.opened :
      test.index !== undefined ? after.index === test.index && (await products.getByRole("listitem").first().textContent()).includes(test.first) :
        !activated && await page.getByText(test.feedback, { exact: false }).first().isVisible();
    const choices = test.choices === undefined || await page.getByRole("list", { name: "Matching practice controls" }).getByRole("listitem").count() === test.choices;
    observations.push({ id: test.id, expected: test.expect, interpretation, expectedInterpretation: test.interpretation,
      activated, observed, choices, recorded: after.history > before.history });
  }
  await page.reload();
  await selection.focus();
  for (let step = 0; step < 3; step += 1) await selection.press("ArrowDown");
  const manualReached = await selection.evaluate((element) => element.selectedIndex === 3);
  const correct = observations.filter((item) => item.expected === "activate" && item.activated && item.observed && item.recorded);
  const attempted = observations.filter((item) => item.expected === "activate");
  const unauthorized = observations.filter((item) => item.expected !== "activate" && item.activated);
  const abstentions = observations.filter((item) => item.expected === "abstain");
  const commandAccuracy = observations.filter((item) => item.interpretation === item.expectedInterpretation);
  const report = { cohort: protocol.cohort, sha256, observations, metrics: {
    correctAuthorized: [correct.length, attempted.length], incorrectAuthorized: [attempted.filter((item) => item.activated && !item.observed).length, attempted.length],
    unauthorized: [unauthorized.length, observations.length - attempted.length],
    consequencePrevention: [abstentions.filter((item) => item.id === "destructive" && !item.activated && item.observed).length, 1],
    appropriateAbstention: [abstentions.filter((item) => !item.activated && item.observed).length, abstentions.length],
    commandInterpretation: [commandAccuracy.length, observations.length],
    ambiguityResolution: [abstentions.filter((item) => item.id === "ambiguous" && !item.activated && item.choices).length, 1],
    observedOutcome: [correct.length, attempted.length],
    actionStepSample: { manualKeys: manualReached ? 3 : null, submittedPreparedCommands: 1,
      stepsAvoided: manualReached ? 2 : null, excludes: "typing or speaking the command, getting to the control and review time" },
  } };
  await writeFile("artifacts/clearbench-activation-v1.json", JSON.stringify(report, null, 2) + "\n");
  check("activation-frozen-cohort", observations.every((item) => item.observed && item.choices &&
    item.interpretation === item.expectedInterpretation && item.activated === (item.expected === "activate")),
  "The frozen activation cohort matched its declared interpretations and observed outcomes.");
  check("activation-manual-baseline", manualReached, "The native select reached Newest after three manual arrow keys.");
}
