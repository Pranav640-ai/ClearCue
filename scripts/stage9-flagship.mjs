export async function verifyFlagship({ page, panel, url, waitForState, check }) {
  await page.goto(url);
  await panel.reload();
  await page.bringToFront();
  const help = page.locator("#scholarship-help-toggle");
  check("scholarship-unnamed", await help.getAttribute("aria-label") === null &&
    await page.getByRole("button", { name: "Help", exact: true }).count() === 0,
  "The original icon button has no accessible name.");
  const matchesHelp = (issue) => issue.evidence.some((item) => item.id === "ev:icon" && item.value === "Help (aria-label)");
  const state = await waitForState(panel, (next) => next.scan.summary?.issues.some(matchesHelp), 12000, "scholarship scan");
  const issue = state.scan.summary.issues.find(matchesHelp);
  const prefs = await panel.evaluate(() => chrome.runtime.sendMessage({
    kind: "panel:updateSettings", patch: { announceRecoveryMessages: true },
  }));
  if (!prefs?.ok) throw new Error("Could not enable the recovery announcement preference.");
  await panel.getByTestId("repair-issue-" + issue.id).getByRole("button", { name: /^Repair this issue:/ }).click();
  await waitForState(panel, (next) => next.repairs.some((repair) => repair.issueId === issue.id && repair.source === "rule"),
    8000, "scholarship rule");
  check("scholarship-rule", await page.getByRole("button", { name: "Help", exact: true }).count() === 1,
    "Smart Repair supplied the accessible name using a deterministic rule.");

  const goal = panel.getByLabel("What would you like to find?");
  await goal.fill("Where can I enter my registration number?");
  await goal.press("Enter");
  const candidate = panel.getByRole("button", { name: /Focus Registration number, result 1/ });
  await candidate.waitFor({ timeout: 10000 });
  check("scholarship-search-is-passive", await page.evaluate(() => document.activeElement?.id !== "reg-number"),
    "The typed search did not move focus.");
  await candidate.click();
  await panel.getByText(/Focused the textbox labelled Registration number/).waitFor({ timeout: 8000 });
  check("scholarship-focus", await page.evaluate(() => document.activeElement?.id === "reg-number"),
    "The explicit focus command reached the original field.");

  const registration = page.locator("#reg-number");
  await registration.fill("BAD");
  await page.locator("#applicant-email").fill("candidate@example.test");
  const submit = page.getByRole("button", { name: "Continue application" });
  await submit.click();
  await waitForState(panel, (next) => next.recovery.latest?.related?.name === "Registration number" &&
    next.recovery.latest.announcementStatus === "announced-by-clearcue", 8000, "scholarship validation");
  check("scholarship-silent-error", await page.locator("#reg-summary").isVisible() &&
    await page.locator("#reg-summary").getAttribute("aria-live") === null,
  "Manual submission produced a visual error with no page live announcement.");
  check("scholarship-observed-announcement",
    (await page.locator('[data-clearcue-live="polite"]').textContent())?.includes("eight-character"),
  "ClearCue's page live region contained the observed error.");
  await panel.getByRole("button", { name: "Jump to affected field: Registration number" }).click();
  await page.waitForFunction(() => document.activeElement?.id === "reg-number");
  check("scholarship-jump-preserves-value", await registration.inputValue() === "BAD", "Jump returned to the field and preserved its value.");
  await registration.fill("NF-12345");
  await submit.click();
  const accepted = page.getByRole("heading", { name: "Registration accepted" });
  await accepted.waitFor({ timeout: 8000 });
  await waitForState(panel, (next) => next.recovery.events.some((event) =>
    event.category === "success-confirmation" && event.message.includes("Registration accepted")), 8000, "scholarship success");
  check("scholarship-observed-success", await accepted.isVisible() && !(await registration.isVisible()),
    "Manual correction and resubmission produced the observed success.");
  await page.screenshot({ path: "artifacts/stage9-scholarship-success.png", fullPage: true });
}
