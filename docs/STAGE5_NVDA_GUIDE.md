# Stage 5 NVDA Walkthrough (user verification)

The user has NVDA 2026.3.1 on Windows. Speech verification is pending. The browser checks
confirm live-region DOM updates and focus movement.

Use this guide in your own Chrome profile. It does not require Gemini Nano, cloud consent or any
network access. **Do not** load a release archive or paste the App Check debug token into a page.

## Before you start

1. `npm run typecheck && npm test && npm run build`
2. Load `dist/` unpacked at `chrome://extensions` (Developer mode).
3. Start the playground: `npm run playground` → `http://127.0.0.1:4318/recovery.html`
4. Start NVDA from Windows Start. Right-click the NVDA icon in the Windows notification area
   (expand the hidden-icons arrow if needed), then choose **Tools → Speech Viewer**. No Insert
   key or configuration change is needed. The keyboard alternative is **Windows+B**, arrow to
   NVDA, then **Enter** or **Shift+F10**. Keep focus in Chrome and the pointer outside the viewer
   during the test. [NV Access guide](https://download.nvaccess.org/documentation/userGuide.html#SpeechViewer)
5. Click the **ClearCue toolbar icon** (or press `Alt+Shift+C`) so Chrome grants `activeTab`.
   Do not open the panel from Chrome's side-panel menu; that path intentionally shows an
   explanation instead of the Enable action. This is a known Chrome behaviour, not a ClearCue bug.
6. Press **Enable on http://127.0.0.1:4318** and accept Chrome's permission prompt.
7. Keep the panel open beside the page. The panel polls state every 3 s, so a short delay is normal.

## A. Baseline with ClearCue off

1. In `chrome://extensions`, turn ClearCue **off** (or disable the site in the panel first).
2. Reload `recovery.html`.
3. Focus **Continue application** and press Enter with an empty registration number.
4. Observe what NVDA says and where focus goes.

Expected baseline: the page shows a red inline error and summary visually. Because the demo has
`novalidate`, there is no native browser message; the summary has no `role="alert"` or `aria-live`.
NVDA is likely to stay silent and focus stays on the submit button. Record exactly what you hear;
do not assume silence.

## B. Silent field error with ClearCue on

1. Re-enable ClearCue on the site.
2. Reload the page so the content script starts with the current document.
3. Focus **Continue application**, press Enter with the empty field.
4. Without moving focus, wait about one second.

Expected:

- NVDA announces the validation outcome through ClearCue's polite live region, approximately:
  “There is a problem. Enter the eight-character registration number from your invitation.”
- Focus does **not** jump.
- The side panel's **Interaction recovery** section shows the latest outcome, severity
  “Needs attention”, the related field **Registration number**, and the status
  “Page live region updated”.
- The panel source text says the outcome was observed from page semantics and no model call was
  needed.

Actual speech varies by NVDA version, voice and verbosity. Record the wording you hear.

## C. Jump only on request

1. In the panel, activate **Jump to affected field: Registration number**.
2. Observe NVDA and the caret.

Expected: focus moves to the registration input and the field's existing value is unchanged. The
panel does not set a value, submit, or click. If the field was removed or hidden, ClearCue refuses
and states the reason instead.

## D. Repeat suppression and replay

1. Press Enter on the empty form again, or clear the field and submit twice within 20 seconds.
2. Watch the history count.

Within one submission, repeated mutation records should produce one entry for the same message
and field. Reset the workflow so the message becomes visible again on the second submission.
Confirm that the same error appears again and record what Speech Viewer shows.

3. With keyboard focus inside the side panel, activate **Replay message**. Keep focus there.
   Record if the Speech Viewer stays silent even when the page region updates. Repeat with Chrome
   focusing the webpage after activating Replay and record the difference.

Expected: NVDA speaks the message again, ending with “Repeated message.” The replay count in the
panel increases.

## E. Preference off

1. In the panel, uncheck **Announce outcomes through the page live region**.
2. Submit the empty form again.
3. Check the panel status.

Expected: the event is still recorded, the panel status says the preference is off, and NVDA does
not speak a ClearCue announcement. Turning the checkbox back on restores announcements.

## F. Page-owned alert must not be duplicated

1. On the scholarship panel, activate **Use accessible comparison** (pressed state becomes true).
2. Submit the empty form again.
3. Listen for one announcement, not two.

Expected: the page itself now exposes `role="alert"` with `aria-live="assertive"`. ClearCue records
`announced-by-page` and does **not** write its own live region. The panel should not claim it
announced the message. If you hear the message twice, stop and record it as a defect with the
speech order.

## G. Success after correction

1. Turn the accessible comparison off or leave it on; either is valid.
2. Enter a valid eight-character registration number starting with `NF-` and a valid email.
3. Activate **Continue application**.

Expected: the success panel appears. ClearCue detects a `success-confirmation`
from the real heading “Registration accepted” and the thank-you text. If the page does not expose a
live region, ClearCue announces it and the panel status says so. No field is guessed.

## H. `aria-hidden` visual toast

1. In the shopping panel, activate **Add driftwood lantern**.
2. Activate **Add sold-out item**.

Expected: the lantern toast is announced as a success. The sold-out toast is classified as
`operation-failure`, severity high, even though the toast is `aria-hidden="true"` and visually
styled. ClearCue announces it because an `aria-hidden` visual toast is inaccessible to the page's
own screen-reader path. The page is not changed.

## I. Ambiguous account summary

1. In the account panel, activate **Save changes** with both fields empty.

Expected: the summary names two fields. ClearCue records the outcome but shows **no reliable field
association** and disables **Jump**. It must not pick Email or Phone. If a Jump is offered, record
it as a safety defect.

## What to record

| Step | Heard (verbatim or close) | Focus behaviour | Panel status | Pass? |
| --- | --- | --- | --- | --- |
| A baseline | | | | |
| B silent error | | | | |
| C jump | | | | |
| D duplicate / replay | | | | |
| E preference off | | | | |
| F page-owned alert | | | | |
| G success | | | | |
| H toast / sold out | | | | |
| I ambiguous | | | | |

Also record:

- NVDA version and voice,
- Chrome version,
- whether the panel was a real side panel or a separate window,
- any speech that was cut off, repeated, or attributed to the wrong control.

## Honest limits

- DOM inspection proves a live region exists and contains the text. It does not prove NVDA speaks
  it. Only this walkthrough does.
- If NVDA does not announce a polite live region while focus remains on a button, try moving focus
  to the page body and repeat. Record that behaviour rather than changing the code to force an
  assertive announcement.
- The demo is fictional and local. No form data leaves the device on this path.

To exit NVDA without Insert, right-click its Windows notification-area icon and choose **Exit**.
Confirm **Exit** in the dialog if it appears. [NV Access user guide](https://download.nvaccess.org/documentation/userGuide.html#NVDAMenu)
