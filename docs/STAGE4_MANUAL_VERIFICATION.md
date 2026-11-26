# ClearCue Stage 4 — manual on-device verification

For release 0.5.0, use [the final Nano walkthrough](FINAL_MANUAL_RUNBOOK.md#4-genuine-nano-text-image-and-disconnected-verification).
This page describes the historical 0.4.2 build. The final procedure uses external
network isolation because Chrome DevTools' page-level Offline setting cannot establish
that the extension and its service worker were also offline.

This workflow is only for the two paths that automation could not verify:

- a genuine on-device Gemini Nano proposal,
- a genuine offline on-device repair.

Everything else has real browser/cloud evidence in `docs/STAGE4_VERIFICATION.md`. Do not repeat
cloud tests here, and do not download a model merely to complete a checklist. The model already
present in the regular Chrome profile is sufficient if Chrome reports it as available.

## Before starting

1. Run `npm run build`.
2. Run `npm run playground` and leave it running.
3. In regular Google Chrome, open `chrome://extensions`, enable Developer mode, choose
   **Load unpacked**, and select this repository's `dist/` directory. Confirm the card shows
   version **0.4.2**. If you already had ClearCue loaded, press its **Reload** button.
4. Open `http://127.0.0.1:4318/stage4.html` and make sure that tab is active.
5. **Open the panel by clicking the ClearCue toolbar icon**, or press `Alt+Shift+C` while the page
   is focused. Do not open it from Chrome's side-panel menu; that path does not grant the temporary
   `activeTab` access ClearCue needs to see the address.
6. The panel should now show `http://127.0.0.1:4318` as the site and an **Enable on
   http://127.0.0.1:4318** button. Press it and accept Chrome's native permission prompt.
7. Confirm the panel says **Connected**.
8. In Privacy, keep **Local only**. This test must not send page content to the cloud.
9. In **Repair engine**, check the **On-device model** line.
   - If it says **available and ready**, continue.
   - If it says **unavailable**, stop. Record it as blocked; do not claim a Nano result.
   - If it says **not downloaded**, stop. Do not download a model for this verification.

If the panel still shows **Access needed**, **Site: Not available** and **Page: Untitled** after
clicking the toolbar icon, press **Reload** on the extension card at `chrome://extensions`, reload
the playground tab, then click the toolbar icon again. Do not grant all-sites access to work around
it; ClearCue deliberately does not request a `tabs` permission.

If the decision still says **deterministic rule** and 0 ms while the model is available, that is a
bug, not an abstention: open the side panel's DevTools console and look for `[ClearCue][repair]`
lines showing the on-device request, actual source and elapsed time.

## A. Genuine on-device proposal (demo case 2)

1. Scroll to case 2, the bell icon under the visible heading "Notification settings".
2. In the panel, under **Issues available for repair**, choose the matching unnamed icon control.
   Use the page location if several look identical; the list follows the page order.
3. Press **Repair this issue**.
4. Watch **Recent repair decisions** and **The last inference used…**.
5. Record exactly:
   - actual source shown (`on-device AI`, `cloud AI`, `deterministic rule`, or no source),
   - latency in milliseconds,
   - decision (Applied / Suggestion / Abstained / Failed),
   - routing reason text,
   - proposed label, if any.
6. A valid on-device result must show **on-device AI** and must either apply a specific,
   evidence-supported name (for example "Notification settings") or abstain. The decision row must
   show the inference latency, not just a 0 ms decision time. Do not accept "Button", a repeated role
   word, or a label with no cited evidence.
7. If it abstains, that is a valid result. Do not retry until it produces a name.
8. If a label was applied, press **Undo** and confirm the icon has no `aria-label` again.

## B. Genuine offline on-device repair (demo case 8)

Keep the already-loaded page open. Do **not** reload while offline.

1. Open DevTools (`F12`) → **Network** → set throttling to **Offline**.
2. Return to the page and find case 8, the "Find an order" search icon.
3. In the panel, repair that issue.
4. Expected if Nano is ready: an **on-device AI** attempt with no cloud request. An abstention is
   still a valid on-device outcome.
5. Confirm the panel does **not** claim `cloud AI` and does not report a fabricated success.
6. If a label was applied, press **Undo**.
7. Set Network back to **No throttling** and close DevTools.

A local failure while offline is acceptable evidence only if the panel reports it honestly. It is
not proof that Nano works.

## C. Record the result

Append real values to `docs/PROGRESS.md` under the Stage 4 on-device record:

- date/time,
- Chrome version,
- whether availability was `available`,
- requested path (local-first / offline),
- actual source,
- latency,
- decision and routing reason,
- applied/undone state.

Never write `ON_DEVICE` unless the panel displayed it. Never infer the source from the fact that
cloud was off. Do not paste the App Check debug token; this workflow does not require it.

## What this proves

A successful run proves only that the on-device path worked in that Chrome profile on that date.
It does not prove cloud inference, release App Check, screen-reader announcements, or offline
behaviour after a page reload. Those remain separately scoped.

## Stage 5.5 regular-profile follow-up

Reload the rebuilt unpacked extension and use Local only. Verify Nano availability via diagnostics
before selecting the reasoning issue, then run one repair. Record the displayed requested route,
actual source, schema outcome, latency, computed accessible name and Undo restoration. If Nano
abstains, retain that outcome. For an offline pass, load the local playground first, disconnect
Wi-Fi and Ethernet in Windows, confirm a separate external page cannot load, and repeat the same
fixture before reconnecting.

For a hardware comparison, use the same Chrome version, model, settings, test inputs and temperature.
In Windows **Settings → System → Display → Graphics**, first record the existing Chrome preference
and choose **Power saving** for the first condition. Fully exit and reopen Chrome. Record one first
call after startup and three subsequent runs for the same text and structured diagnostics. Repeat
with **High performance**, then restore the original preference. Inspect `chrome://on-device-internals`
for any explicit model execution backend and record it if shown. `chrome://gpu` can identify browser
graphics adapters and cannot establish Nano's backend by itself. Where no backend is shown, report
only the Windows preference and observed latency. [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
