import { writeFile } from "node:fs/promises";

export async function verifyAssistance({ page, panel, origin, waitForState, check }) {
  async function openFixture(path, heading) {
    await page.goto(origin + path);
    await panel.reload();
    await page.bringToFront();
    await panel.getByRole("list", { name: "Page headings" }).getByText(heading, { exact: true }).waitFor({ timeout: 12000 });
  }
  const output = panel.getByLabel("Preferred speech output");
  const navigator = panel.locator("#navigator");
  const localSpeech = panel.getByRole("region", { name: "Local speech", exact: true });
  const repeat = localSpeech.getByRole("button", { name: "Repeat last spoken message" });
  const readNav = navigator.getByRole("button", { name: "Read Navigator message aloud" });
  async function ask(text) {
    const input = navigator.getByLabel("What would you like to find?");
    await input.fill(text);
    await input.press("Enter");
  }

  await openFixture("/member-portal.html", "Harbor services member portal");
  await output.selectOption("local_voice");
  await waitForState(panel, (state) => state.settings.speechOutput === "local_voice", 5000, "local speech preference");
  const native = await panel.evaluate(async () => {
    const api = window.speechSynthesis;
    if (!api || typeof SpeechSynthesisUtterance !== "function") return { status: "unsupported", localVoices: 0 };
    let voices = api.getVoices();
    if (!voices.some((voice) => voice.localService === true)) {
      await new Promise((resolve) => {
        api.addEventListener("voiceschanged", resolve, { once: true });
        window.setTimeout(resolve, 1500);
      });
      voices = api.getVoices();
    }
    const report = { status: "waiting", localVoices: voices.filter((voice) => voice.localService === true).length, cancellations: 0, attempts: 0 };
    window.clearCueNativeSpeechProbe = report;
    if (report.localVoices === 0) return { ...report, status: "no-local-voice" };
    const speak = api.speak.bind(api);
    const cancel = api.cancel.bind(api);
    api.cancel = () => { report.cancellations++; cancel(); };
    api.speak = (utterance) => {
      const attempt = ++report.attempts;
      report.status = utterance.voice?.localService === true ? "queued-local" : "unexpected-voice";
      report.characters = utterance.text.length;
      if (report.status === "unexpected-voice") return;
      const status = (value) => { if (report.attempts === attempt) report.status = value; };
      utterance.addEventListener("start", () => status("started-local"), { once: true });
      utterance.addEventListener("end", () => status("ended-local"), { once: true });
      utterance.addEventListener("error", (event) => status(event.error), { once: true });
      speak(utterance);
    };
    return report;
  });
  if (native.localVoices > 0) {
    await ask("Show me the page overview");
    await readNav.click();
    await panel.waitForFunction(() => !["waiting", "queued-local", "started-local"].includes(window.clearCueNativeSpeechProbe.status),
      undefined, { timeout: 6500 }).catch(() => undefined);
    Object.assign(native, await panel.evaluate(() => window.clearCueNativeSpeechProbe));
    if (native.status === "ended-local") {
      await page.locator("#order-sort").focus();
      await ask("Where am I?");
      await navigator.getByText(/Display order, combobox/).waitFor();
      await readNav.click();
      const started = await panel.waitForFunction(() => window.clearCueNativeSpeechProbe.status === "started-local",
        undefined, { timeout: 3500 }).then(() => true, () => false);
      const stop = localSpeech.getByRole("button", { name: "Stop speech" });
      if (started && await stop.isEnabled()) {
        await stop.click();
        const stopped = await panel.waitForFunction(() => {
          const probe = window.clearCueNativeSpeechProbe;
          return probe.cancellations > 0 && !speechSynthesis.speaking && !speechSynthesis.pending;
        }, undefined, { timeout: 4000 }).then(() => true, () => false);
        await repeat.click();
        await panel.waitForFunction(() => !["waiting", "queued-local", "started-local"].includes(window.clearCueNativeSpeechProbe.status),
          undefined, { timeout: 22000 }).catch(() => undefined);
        const repeatProbe = await panel.evaluate(() => ({ ...window.clearCueNativeSpeechProbe,
          speaking: speechSynthesis.speaking, pending: speechSynthesis.pending }));
        native.stopAndRepeat = { stopped, repeated: repeatProbe.status === "ended-local", repeatProbe };
      } else {
        native.stopAndRepeat = { status: "could not intercept playing utterance" };
      }
    }
  }
  await writeFile("artifacts/assistance-native-speech.json", JSON.stringify(native, null, 2) + "\n");
  check("assistance-native-voice-boundary", native.status !== "unexpected-voice",
    "Genuine browser probe: " + native.status + ", " + native.localVoices + " reported local voices. Audible output requires manual confirmation.");

  // Test double for queue controls and refusal of remote-only voice lists.
  await panel.addInitScript(() => {
    const voice = { name: "Fixture local voice", lang: "en-US", voiceURI: "fixture-local", localService: true, default: true };
    const remote = { ...voice, name: "Fixture remote voice", voiceURI: "fixture-remote", localService: false };
    const log = { calls: [], cancels: 0, localAvailable: true };
    window.clearCueSpeechTest = log;
    const synthesis = Object.assign(new EventTarget(), {
      getVoices: () => log.localAvailable ? [remote, voice] : [remote],
      speak: (utterance) => {
        log.calls.push({ voice: utterance.voice?.voiceURI, rate: utterance.rate, text: utterance.text });
        utterance.onstart?.();
      },
      cancel: () => { log.cancels++; },
    });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synthesis });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: class {
      constructor(text) { this.text = text; }
    } });
  });

  await openFixture("/member-portal.html", "Harbor services member portal");
  await panel.getByLabel("Local voice").selectOption("fixture-local");
  await panel.getByLabel("Speech rate").selectOption("1.25");
  await waitForState(panel, (state) => state.settings.speechVoice === "fixture-local" && state.settings.speechRate === 1.25,
    5000, "local speech settings");
  await ask("Find registration number");
  await ask("What's next?");
  await navigator.getByText(/Suggested next step: Registration number/).waitFor();
  const log = () => panel.evaluate(() => window.clearCueSpeechTest);
  check("assistance-no-auto-speech", (await log()).calls.length === 0, "Guidance stayed silent until explicitly read.");
  await readNav.click();
  const first = (await log()).calls[0];
  check("assistance-local-preferences", first?.voice === "fixture-local" && first.rate === 1.25 && first.text.includes("Suggested next step"),
    "The speech test double received guidance with the selected local voice and rate.");
  await localSpeech.getByRole("button", { name: "Stop speech" }).click();
  await repeat.click();
  check("assistance-stop-repeat", (await log()).cancels === 1 && (await log()).calls[1]?.text === first.text,
    "Stop cancelled playback and Repeat reused the last spoken output.");
  await panel.evaluate(() => { window.clearCueSpeechTest.localAvailable = false; });
  await repeat.click();
  await localSpeech.getByText(/selected local voice is unavailable/).waitFor();
  check("assistance-no-remote-fallback", (await log()).calls.length === 2, "A disappeared local voice did not trigger remote speech.");

  await page.goto(origin + "/recovery.html");
  await page.bringToFront();
  await waitForState(panel, (state) => state.context.url?.endsWith("/recovery.html") && state.context.status === "connected",
    9000, "speech context changed");
  await panel.getByRole("list", { name: "Page headings" }).getByText("Interaction recovery lab", { exact: true }).waitFor();
  check("assistance-repeat-scoped", await repeat.isDisabled(), "The new page cannot repeat speech from the previous document.");
  await panel.evaluate(() => { window.clearCueSpeechTest.localAvailable = true; });
  await page.locator("#applicant-email").fill("candidate@example.test");
  await page.getByRole("button", { name: "Continue application" }).first().click();
  await waitForState(panel, (state) => state.recovery.events.some((event) =>
    event.message.includes("eight-character")), 8000, "spoken recovery fixture");
  await panel.getByRole("button", { name: "Read recovery message aloud" }).click();
  check("assistance-recovery-read", (await log()).calls[2]?.text.includes("eight-character"),
    "The speech test double received the observed recovery message only after an explicit read.");
}
