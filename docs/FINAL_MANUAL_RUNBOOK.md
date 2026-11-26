# ClearCue 0.5.0 · Final manual verification and submission

Use the clean release for deterministic workflows and the configured build for Firebase inference. Keep owner evidence private. [Release evidence](evidence/RELEASE_VERIFICATION.md)

## 1. Start a private evidence log

For every test ID below, record the date and time, Git commit, build channel, Chrome and Windows
versions, fixture URL or section, settings, action, expected result, actual result and evidence
filename. Include NVDA version and voice for speech tests. Use one of **Pass**, **Fail**,
**Blocked** or **Not run**. Report **Blocked** when hardware, credentials or
external access prevent the test. If Nano executes and abstains, log the execution and the
abstention separately from successful application.

When a check fails, preserve the first result. Record the exact visible status or error,
whether the failure repeats after a fixture reset, and whether the same check works in the
other build or with the optional capability off. Name the failing test ID in a private issue
or local note and include minimal reproduction steps. For inference, record requested route,
actual SDK source, latency, schema result when shown, decision, and applied/undone state.
Copy only those sanitized fields. Keep screenshots, Speech Viewer excerpts and notes outside
the public checkout unless explicitly reviewed. Keep App Check token values, request headers,
raw HAR files, Firebase console views, real form values and private page content out of reports.

## 2. Build and launch

Run in PowerShell from the repository root. Execute commands in order and stop on any nonzero
exit. Use Node **20.19 or later** and desktop **Chrome 139 or later**. Nano
also depend on Chrome's runtime capability.

| Build | Command | Intended use |
| --- | --- | --- |
| **Clean release** | `npm.cmd run build:release` | Public ZIP. Scanner, Rules, Undo, privacy controls, recovery, deterministic Navigator and bundled practice. Firebase project settings are stripped, so this build cannot run Firebase-backed Nano or cloud inference. |
| **Configured hybrid** | `npm.cmd run build` with private `.env` | Nano diagnostics, text and visual repair, offline Nano, local reranking and App Check protected cloud. The compiled `dist` contains the supplied debug token. Keep it private. |

### B1 · Build the public package and verify first launch

```powershell
node --version
git status --short
git rev-parse --short HEAD
npm.cmd ci
npm.cmd run build:release
npm.cmd run zip
npm.cmd run verify:artifacts
Get-FileHash artifacts/clearcue-0.5.0.zip -Algorithm SHA256
```

Stop at a nonzero exit. In a checkout without a private token, the verifier can say the local
token is unconfigured. Use its exit status and release/archive verdict. Unzip to a fresh folder
outside the checkout and use that folder as the release install root.

```powershell
$releaseFolder = Join-Path $env:LOCALAPPDATA ("ClearCue-0.5.0-" + (Get-Date -Format yyyyMMdd-HHmmss))
Expand-Archive -LiteralPath artifacts/clearcue-0.5.0.zip -DestinationPath $releaseFolder
Test-Path (Join-Path $releaseFolder "manifest.json")
$releaseFolder
```

In a regular Chrome test profile, open `chrome://extensions`, enable **Developer mode**, choose
**Load unpacked**, and select the printed folder. Confirm **ClearCue — Accessible page repair**
and version **0.5.0**. In a second PowerShell window, from the repository root, run:

```powershell
npm.cmd run playground
```

Keep that window open. Open [the playground home](http://127.0.0.1:4318/), click the **ClearCue**
toolbar icon or press **Alt+Shift+C** with the webpage active. If needed, pin it from Chrome's
Extensions menu. Choose **Enable on http://127.0.0.1:4318** and accept the native host prompt.
Expect **Connected** and **Local only**. The shortcut page is `chrome://extensions/shortcuts`.
**Alt+Shift+D** opens diagnostics when the shortcut is assigned. The toolbar is the fallback
for the panel. Chrome's generic side-panel menu may lack the temporary site access.

**Evidence:** Version card, origin, connected state, ZIP SHA-256 and verifier result.
**If it fails:** Record the selected load folder and exact extension error. Check that
`manifest.json` is at its root. For **Access needed**, reload the extension and tab, invoke
the toolbar on that tab, then confirm site's actual permission. Avoid broadening permissions.

### B2 · Build the private hybrid copy

Use a separate checkout and regular Chrome profile or unload the other ClearCue copy before
switching. When creating a fresh checkout, run `git clone --no-hardlinks . ..\ClearCue-Judge`
from the source root, then enter `..\ClearCue-Judge`. Configure the private Firebase project
and token using section 9. Do this once in that checkout, preserving any existing private
`.env`:

```powershell
npm.cmd ci
if (-not (Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
notepad .env
```

Save the private Firebase values in the editor before building:

```powershell
npm.cmd run build
npm.cmd run smoke:cloud
```

Load that checkout's **dist** in `chrome://extensions`. After any configuration change, build
again, reload the extension,
and open a fresh diagnostics tab. Keep only one playground server running on port 4318.
Never package the hybrid directory for public distribution. If preserving both builds in
one checkout, extract the release first because both build commands replace `dist`.

**Expected and evidence:** Chrome loads the private copy, and the configured cloud smoke
reports `in_cloud-confirmed` with actual `IN_CLOUD` for text and JSON. Capture the verdict
and sanitized source badges. **If it fails:** Record the smoke exit code and error category.
Exit 2 is an external/setup blocker. Follow section 9. Rebuilding the clean release cannot
fix missing hybrid configuration.

## 3. Core playground tests

Use the clean release for these checks. In the panel, some controls only appear when
connected. Start with automatic repair unchecked. For icon repair, use **Issues available for repair**, find the row by section,
and choose its **Repair this issue** button. Open Chrome DevTools **Elements → Accessibility**
and select the actual **button** to inspect its computed **Name** and its `aria-label`.
Check the original state before applying, and use **Repair history → Undo** after each write.

| ID | Exact action and expected result | Evidence and failure report |
| --- | --- | --- |
| C1 · Permission lifecycle | From the connected playground, choose **Disable on this site**. Check that site state disconnects and recovery history clears. Reload the page, invoke the toolbar and re-enable only the loopback origin. On `chrome://extensions`, invoke the toolbar if available and check for the unsupported/access explanation. | Capture before/after status and the native grant result. Report continued collection, a lingering repair or any incorrect supported-page claim. |
| C2 · Scan, Rules, Undo | Open [Stage 4](http://127.0.0.1:4318/stage4.html). In case **1. Deterministic repair without AI**, repair the unnamed Search icon. Expect **deterministic rule** and computed name **Search**. Undo restores the original state. Repeat with case **7. Apply a repair, then undo it**, expected **Settings**. To exercise the batch, use **Rules only** and undo any remaining writes. Existing valid names such as the **Search products** input stay intact. | Capture issue, source and computed names before/apply/Undo. Report an incorrect name, inference on Rules, overwrite or residual attribute. |
| C3 · Private and destructive cases | On [Stage 4](http://127.0.0.1:4318/stage4.html), use **Local only** for case 4, then try case **5. Private context after a local failure** and case **6. Destructive control stays unchanged**. The clean build stays local. Case 6 stays unmodified with an unsafe-action decision when listed. On the hybrid build, only test consent on these fictional fixtures and turn cloud back off afterward. | Capture the routing reason and before/after target name. Report any destructive write or claim that private evidence is cloud eligible. A safe abstention is expected on insufficient evidence. |
| C4 · Stale target | In case **9. Stale inference result is rejected**, choose the original issue and immediately press **Replace this control** on the page. Inspect the replacement. A late result must never label it. If the repair completed before replacement, record that no late race was observed in this manual attempt. | Capture the time/order, decision and replacement's computed name. Report a ClearCue attribute on the replacement. A true late cloud race was separately verified in Stage 9. |
| C5 · Shopping recovery | Open [Interaction recovery lab](http://127.0.0.1:4318/recovery.html). Under **Basket updates and failures**, press **Add driftwood lantern** and wait for the recorded outcome. Then press **Add sold-out item**. Expect a basket increment and observed toast, then an error about stock without another increment. | Capture basket count and both outcome types. Report absent events, duplicate feedback or the sold-out outcome shown as success. |
| C6 · Account recovery | In the same lab press **Reset account demo**, then **Save changes** with both fields empty. Expect an ambiguous summary and no available Jump. Enter `student@example.com` and `0800 555 0142`, then save manually. Expect **Changes saved.** and an observed success. | Capture the first unlinked outcome and the success. Report a guessed field, premature success or changes before manual Save. |
| C7 · Offline core | With the clean release loaded, disconnect external Wi-Fi, Ethernet and tethering as in N3. Keep the local server running. Open the Stage 4 loopback URL in a new tab, open the panel, run C2, then run G1–G2 and C5. Reconnect afterward. Expect the scanner, Rule repair, Undo, focus and observed recovery to work without a configured Firebase project. | Capture the disconnection check and actual localhost results. If localhost fails, check the server separately. Report any dependency on App Check or network access for the deterministic operations. |
| C8 · Privacy controls | In **Privacy**, choose **Allow cloud inference…** and then **Keep local only**. Reopen the prompt and choose **Yes, allow cloud inference**. Confirm **Cloud allowed** and its consent timestamp. Choose **Switch back to local-only** before leaving the fixture. The diagnostics cloud preference under **Settings** is separate. | Capture both badges, consent timestamp and restored local-only state. Report if cancelling changes the setting, if explicit consent is skipped or if revocation does not apply. |
| C9 · Pause and automatic rules | Reload Stage 4 without any applied repairs. Choose **Pause repair** and confirm repair actions are disabled. Choose **Resume repair**, enable **Repair rule-supported issues automatically** and reload. Expect eligible Rule repairs such as Search or Settings. Check that case 2's reasoning button and case 6's destructive icon stay unchanged. Turn automatic repair off and undo its writes before continuing. | Capture paused controls, Rule provenance and the unchanged negative targets. Report a write while paused, use of a model for automatic repair or a residual attribute after Undo. |

[Playground home](http://127.0.0.1:4318/) also links the original
[scholarship](http://127.0.0.1:4318/scholarship.html),
[shopping](http://127.0.0.1:4318/shopping.html) and
[account](http://127.0.0.1:4318/account.html) pages. Use the recovery lab for the verified
combined scholarship demo. The [ClearBench fixture](http://127.0.0.1:4318/clearbench-waterline.html)
is for evaluation. Keep ad hoc runs separate from the frozen results. [ClearBench report](CLEARBENCH_REPORT.md)

## 4. Genuine Nano text, image and disconnected verification

Use the configured hybrid build with **Local only**. Open **Open Firebase diagnostics** from
the panel. Confirm `LanguageModel` is detected and model availability is ready. If the model
is downloadable and you choose to provision it, use **Initialize Local AI** while online and
wait for ready. Follow Chrome's current installation guidance if necessary. The documented
multimodal flag, when present, is
`chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`. Restart after a flag change.
An absent flag alone does not establish incompatibility. Use the capability result for the
actual input modality. [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api) ·
[Firebase hybrid setup](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started)

### N1 · Online text baseline and real Nano repair

1. Run the individual **On-device text** and **On-device structured JSON** diagnostic cards.
   Expect actual **ON_DEVICE**, a nonempty text result and a schema pass on the JSON card.
2. Open [Stage 4, Notification settings](http://127.0.0.1:4318/stage4.html#case-2).
   In **Repair engine**, clear **Use local icon images for individual repairs**, record the
   original unnamed state, then repair that one bell issue.
3. Read **Recent repair decisions** and the last-inference line. Expect **on-device AI** with
   purpose `repair-batch-local` and reported latency. If supported by evidence, a proposed or
   applied label should describe notification settings. Review a suggestion before choosing
   **Apply suggestion**. Check its computed name, then **Undo** and verify restoration.

**Evidence:** Diagnostic source badges and schema status, repair source, purpose, latency,
decision, computed name and Undo. **If it fails:** Record missing SDK/configuration, unavailable
hardware, schema error, unsupported label or missing source separately. A rule decision or
text output from diagnostics alone cannot prove that the product's text repair ran.

### N2 · Genuine visual repair

1. Open [Harbor workshop member tools](http://127.0.0.1:4318/visual-repair.html). Use the unnamed
   button under **Search workshop inventory**. Clear the image checkbox and run one text-only
   comparison. Record and undo any write so the same issue is available again.
2. Check **Use local icon images for individual repairs**. Choose the individual repair for the
   same button. The genuine visual path reports **on-device AI** and `repair-visual-local`.
   A text fallback reports `repair-batch-local`. Only an eligible, corroborated visual label
   may appear under **Suggestions to review**.
3. If the suggestion is specific and consistent with the heading, choose **Apply suggestion**,
   inspect the name, then Undo. Compare **Show extended hours** and **More tools** if checking
   ambiguity. They share a glyph. Test **Referenced mark**, **Form example**, and **Delete
   account and membership** as negative controls. They should reject the image route or
   safely abstain; the destructive control must stay unchanged.

**Evidence:** Text versus image purpose, actual SDK source, latency, decision, name and Undo;
record negative decisions. **If it fails:** Record modality availability, text fallback or
validation error. The ability to extract an icon or a correct text fallback cannot establish
visual inference. Keep images, image payloads and request captures out of reports.

### N3 · Genuine Nano while externally offline

1. While connected, establish N1's baseline. Preload the diagnostics tab and
   [Stage 4, Find an order](http://127.0.0.1:4318/stage4.html#case-8). Leave **Local only** on
   and the image checkbox clear. Keep the loopback server and Chrome open.
2. Disable Wi-Fi and disconnect Ethernet, or disconnect every external adapter and tether.
   In a separate tab try `https://example.com/?clearcue-offline=YOUR_TIMESTAMP` with a new
   timestamp. Record the network error. Keep the original fixture intact. A single tab's
   DevTools **Offline** setting gives weaker evidence because the extension has its own context.
3. After disconnecting, run the individual **On-device text** diagnostic again, then repair the
   **Find an order** icon. Verify actual **ON_DEVICE** in diagnostics and actual **on-device
   AI** plus `repair-batch-local` and latency for any real repair attempt. Verify any correct
   name and Undo offline. Record fresh results generated after disconnection. If N2 worked,
   repeat it independently offline with a preloaded visual fixture and record its own outcome.
4. Restore network access and normal Chrome throttling.

**Evidence:** External failure, disconnection time, actual sources and fresh result, repair
decision and Undo if applied. **If it fails:** Mark offline Nano blocked or failed based on
the actual result. Record a separate pass for deterministic offline behavior if it worked.
Record an on-device abstention as execution evidence when confirmed, with no applied repair.

## 5. Navigator, contextual explanations and practice

Open [Harbor services member portal](http://127.0.0.1:4318/member-portal.html). Confirm the
panel is connected. Use the input **What would you like to find?** and **Find controls**
or Enter. Use the clean release unless the test specifies the hybrid build.

| ID | Exact action and expected result | Evidence and failure report |
| --- | --- | --- |
| G1 · Overview and passive search | Submit `Show me the page overview` and confirm **Membership application** and **Orders and receipts**. Submit `Where can I enter my registration number?`. It finds Registration number, explains the match and leaves the page focus alone. | Capture headings, candidate/reason and baseline focus. Report invented controls or implicit focus. |
| G2 · Direct focus | Choose **Move focus** with accessible name **Focus Registration number, result 1**. Then submit `Take me to Registration number` separately to exercise a direct command with one exact match. Verify caret/focus in **Registration number** and value `HBR-902`, with no page submit or activation. | Capture actual focus and unchanged fictional value. Report the wrong focused element, a changed value or activation. |
| G3 · Context and ambiguity | Submit `What does Download receipt do?` for observed context. Submit `Find details`; two same-name **Details** controls tie. Inspect their order and result labels, choose one only if its identity is clear, and confirm focus. Submit `Find submarine insurance` and expect no grounded matches. | Capture descriptions, ambiguity notice and both result numbers. On this fixture the two Details share a section, so ordinal position may be the only distinction. Report automatic choice, a merged result or invented purpose. |
| G4 · Nano rerank | In the hybrid build with **Local only**, search `Find details`, record the two candidates, then choose **Refine ranking with local AI**. Expect **SDK confirmed on-device** with latency. A valid result preserves the same observed controls and can leave the order unchanged. Try **Cancel local ranking** while a separate request is in flight. | Capture baseline, status, final candidate set and any cancellation. **Kept the page matches** indicates fallback, even if the source confirms local execution. Report changed candidate membership, cloud source, stale updates after cancellation or lack of a confirmed result. |
| G6 · Typed practice | Open **Practice typed navigation**. Submit `Take me to the sorting options`, then `What are my options?`. Check actual focus and choices. Submit `Select the second option` and confirm the selection stays **Relevance**. | Capture focus, the options and the manual-control notice. |

For a real website, an activation request offers focus assistance. Keep form submission,
downloads and consequential actions manual.

### Guided navigation, Context Lens and form requirements

Use the clean release on [Harbor services member portal](http://127.0.0.1:4318/member-portal.html).
Keep the page active when using the Context Lens shortcut. The panel's existing **Keyboard
shortcuts** section and `chrome://extensions/shortcuts` show the Chrome assignment.

| ID | Exact action and expected result | Evidence and failure report |
| --- | --- | --- |
| G8 · Guided goal | Submit `Find registration number`, then `What's next?`. Expect a registration suggestion without a focus move. Submit `Take me there`. With the sample registration number still present, submit `Continue my task`. Expect **Contact email** as the incomplete field in the same form. Submit `Take me there`, then `Go back`. Expect focus at Registration number and the same URL. Reload and verify the temporary goal has cleared. | Capture the suggestions, actual focus after each explicit move, unchanged URL, and cleared goal. Report an automatic action, cross-form recommendation, stale focus or any unsupported completion claim. |
| G9 · Context Lens and page map | In **Page overview**, choose **Focus Display order in Orders and receipts**. With focus on Display order, press **Alt+Shift+L** or the configured **Explain the focused webpage control** shortcut. With NVDA Speech Viewer open, listen for the control, section and **Newest first**, **Oldest first** options. Submit `Where am I?` in the panel as the text path. | Capture focus before and after, the panel explanation and actual NVDA speech separately. If the shortcut stays silent, check its Chrome assignment, site permission and page focus. Record any live-region output separately from actual speech. |
| G10 · Form and recovery | Check **Form requirements**. Contact email should show **required** and **incomplete**. Enter `unfinished` there and choose **Check current form requirements**. Expect **needs validation review** with the typed value absent from the panel. Enter `candidate@example.test` and check again. Expect the requirement to remain and its error to clear, with no completion claim. Use the native Display order dropdown to choose **Oldest first**. Expect a generic **A selection changed.** recovery entry without the selected value. For a real observed success, run R3–R4 in the recovery lab. | Capture form statuses, the generic selection record and the observed scholarship success separately. Report leaked values, fabricated progress or an extra ClearCue live announcement of the native selection change. |

### First-run introduction and assistance preferences

Use a fresh profile. Open and skip the introduction by keyboard, then revisit it from Settings. Open guided practice and run G6. Compare Concise and Detailed explanations and confirm the setting persists after reopening. Use R5 for the Recovery announcement preference.

## 6. Complete NVDA scholarship recovery walkthrough

Use the clean release, regular Chrome, and the [recovery lab scholarship section](http://127.0.0.1:4318/recovery.html#scholarship-heading).
Start NVDA from Windows Start or use its installed shortcut. From the NVDA tray menu choose
**Tools → Speech Viewer**. A keyboard route is **Windows+B**, find the NVDA icon, then
**Shift+F10**. Leave Chrome focused while listening. Use Tab and Enter or Space, with NVDA
heading navigation available in browse mode. Use **F6** or **Shift+F6** to cycle Chrome
surfaces when moving between the page and side panel. Capture what NVDA spoke and its order. A DOM
live-region update and a spoken announcement are separate observations. [NVDA Speech Viewer](https://download.nvaccess.org/documentation/userGuide.html#SpeechViewer)

| ID | Exact action and expected result | Evidence and failure report |
| --- | --- | --- |
| R1 · Baseline | Disable ClearCue on the site, reload and leave **Accessible comparison: off**. Enter `BAD` in **Registration number** and `candidate@example.test` in **Email address**. Press **Continue application**. Observe the visual error and the absence of a page-owned live region. Focus should stay on the submit control. Record any speech you actually hear. | Capture Speech Viewer excerpt, focus and visual error. If the baseline differs, record the comparison state, any other accessibility extension and exact speech. |
| R2 · Repair and navigate | Press **Reset workflow**. Enable ClearCue from the toolbar with the native grant. Check **Announce outcomes through the page live region** in **Interaction recovery**. Repair the unnamed Help icon with **Repair this issue**. Verify **Help** and Rule provenance. Search `Where can I enter my registration number?`, then choose its **Move focus** control. | Capture name, provenance and NVDA's focus announcement. Report absent name, focus to the wrong element or unexpected page activation. |
| R3 · Silent error and Jump | Enter `BAD` and `candidate@example.test` again. Press **Continue application** manually. Wait for the outcome with focus still on the page. Expect ClearCue's registration validation announcement once, a link to **Registration number**, and panel status **ClearCue updated the page live region.** Choose **Jump to affected field: Registration number**. Expect real input focus with `BAD` preserved. | Capture speech and its count, panel status, focus before/after Jump and preserved value. Report silence, duplicate speech, unsupported field association, or a jump before the explicit action. If the panel says the live region updated but NVDA is silent, record both facts and which surface held focus. |
| R4 · Correct and finish | Replace `BAD` with `NF-12345`. Press **Continue application** manually. Expect heading **Registration accepted**, fictional ID `NF-2026-0481`, and an observed success through ClearCue. | Capture page success, panel outcome and actual speech. Report if acceptance appears without manual submit, if detection fails, or if the live region updates while speech is silent. |
| R5 · Replay, dedupe and preference | Choose **Start again** or reload. Cause the same error once and check the same message/field did not produce duplicate announcements for that submission. Choose **Replay message** and listen for the repeated message. Choose **Dismiss this recovery message** and check it leaves the current outcome display. Reset, turn off **Announce outcomes through the page live region**, then submit the invalid data again. The event remains visible with announcements off. Re-enable the preference. | Record per-submission counts, replay speech or silence, dismissal and preference-off status. Report stale replay, spontaneous repeats or an automatic ClearCue announcement with the preference off. Record whether the webpage or side panel held focus during replay. |
| R6 · Page-owned comparison | Reset; press **Accessible comparison: off** so it becomes **Accessible comparison: on**. Submit invalid data again. Expect the page-owned alert and its focus behavior, with ClearCue indicating the page's own accessibility mechanism. Correct and submit if checking the page-owned success too. | Capture the speech order and panel attribution. Report any duplicate ClearCue announcement of the same page-owned message. Restore the comparison to off for recording. |

Exit NVDA from its tray menu if desired. Keep the baseline, with-ClearCue, and page-owned
Speech Viewer excerpts separate so recording claims can be checked.

## 7. Unfamiliar public sites

Use **Local only**, a logged-out profile and a fresh permission grant per site. Manually test
one or two pages you have never used to tune ClearCue. The following are reproducible starting
points also used in the earlier read-only scan. A changed layout, consent interstitial or
removed page is a reason to record the environment and select another public page.

| ID | Exact action and expected result | Evidence and failure report |
| --- | --- | --- |
| T1 · Public navigation | Open [Wikipedia · Web accessibility](https://en.wikipedia.org/wiki/Web_accessibility) and [MDN · ARIA](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA). On each, invoke ClearCue from the toolbar, grant the origin and refresh the overview. Find an actual observed control, for example a visible **Search** control if present. Compare its reported name to the accessibility tree and request focus. | Record origin, public target name, whether scan/overview matched the page, and actual focus. Zero findings or a justified no-match are valid. Report inaccurate names, fake destinations or unauthorized activation. |
| T2 · Scope and revocation | Open [GOV.UK · Accessibility](https://www.gov.uk/help/accessibility). Confirm that enabling earlier sites did not enable this one. After its explicit grant, try an activation phrase such as `Open the search options`; expect a focus-only explanation. If testing a Rule repair, inspect only a genuinely unnamed low-risk public control, then Undo. Disable the site and confirm disconnect. | Record consent, actual decision or abstention, before/after name if relevant, and disable result. Report any automatic action, unexpected cloud traffic from ClearCue, unsafe repair or residual write. Normal site traffic is separate from extension traffic. |

If an unfamiliar page is sensitive or asks for sign-in, skip it. File minimal observations
privately and avoid screenshotting account or third-party personal data.

## 8. Judge testing and genuine cloud verification

Offer every judge the public GitHub repository, clean ZIP and public fictional playground
with no account required for the core workflow. For independent hybrid testing, the simplest
credential-safe option is a **judge-owned Firebase test project** following the steps below.
Each tester enters their own token locally. Also provide a short, genuine demonstration of
the configured build. If the organizer offers an approved private testing arrangement,
offer an owner-controlled live walkthrough with a dedicated test project during judging.
Keep all reusable credentials with their operator. The rules accept developer debug
configuration and prohibit exposing live secrets in submission materials.
[Official rules](https://firebasehybridaihackathon.devpost.com/rules) ·
[Firebase hybrid setup](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started)

### J1 · Verify configured App Check and real hybrid provenance

1. In the private build, open the panel's **Settings** and enable **Allow cloud requests from
   the Firebase diagnostics page**. Open **Open Firebase diagnostics**, then use **Check cloud
   connection**. Expect **App Check token: Acquired**. Capture the status only.
2. Run **Cloud text** and **Cloud structured JSON** separately. Expect **IN_CLOUD**, a smoke
   validation pass, and valid JSON for the structured case. Run **Automatic hybrid** online.
   Log the source the SDK reports. Also run N1 to demonstrate the on-device route on a
   supported regular Chrome profile.
3. Run `npm.cmd run smoke:cloud` and, on the private configured build,
   `npm.cmd run verify:stage4-live` for genuine repair and Undo. Close the playground server
   only if needed to resolve a port conflict. For the manual routing illustration, open
   [Stage 4, Quarterly revenue](http://127.0.0.1:4318/stage4.html#case-3) on the fictional site.
   Select **Allow cloud inference… → Yes, allow cloud inference** and repair that single issue.
   The engine may decide locally, escalate with eligible text, or abstain. Only a recorded
   actual cloud source with a verified name and Undo proves a cloud apply. Switch back to
   **local-only** and disable the diagnostics cloud preference afterward.

**Evidence:** Sanitized App Check status, actual source badges, schema status, smoke verdict,
and applied/Undo verification when observed. **If it fails:** For App Check/403 verify app
registration and token pairing. For service disabled, finish AI Logic setup. For model 404,
verify the project model. For quota/429 or a service 5xx, record the external blocker. A model
response rejected by validation is evidence of a safety decision. Retain the first failure.
The public build and its demo remain independently testable.

## 9. Configure Firebase and rotate the earlier token

1. In [Firebase Console](https://console.firebase.google.com/), use a dedicated, privately
   administered test project with no real user data. Under **Project settings → Your apps**,
   register a **Web** app. Under **AI Logic → Get started**, select **Gemini Developer API**
   and complete provisioning. Under **App Check → APIs**, confirm **Firebase AI Logic** is
   **Enforced**. Retain enforcement and use the test project's supported model and quotas.
2. In the private checkout's `.env`, populate `VITE_FIREBASE_API_KEY`,
   `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
   `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID` and
   `VITE_FIREBASE_APP_ID` using that Web app's config. Set `VITE_CLOUD_MODEL` to the model
   enabled in that project. The template defaults to `gemini-3.5-flash-lite`.
   Set `VITE_APPCHECK_DEBUG=true` and keep the custom provider URL unset in this test build.
3. To rotate, open **App Check → Apps → matching Web app → ⋮ → Manage debug tokens**.
   Add a fresh token with a recognizable private name. Use the value generated in the console,
   or, if it prompts for a value, generate a fresh UUID locally with `[guid]::NewGuid().Guid`
   away from any recording. Paste the same registered value only into the private
   `VITE_APPCHECK_DEBUG_TOKEN` entry. Using an explicit token avoids a generated token
   being printed by the SDK during auto-debug setup.
4. Build with `npm.cmd run build`, reload the private extension, and verify using J1 and
   `npm.cmd run smoke:cloud`. After the replacement works, revoke the previously exposed
   token in **Manage debug tokens** for its original project and app. Associated old builds,
   ZIPs and transcripts must stay private. If the old token presents an immediate exposure
   risk, revoke it first and record the temporary test interruption.
5. Confirm the old registration is gone and the new build still works. Clear the clipboard,
   close the console before recording, and retire any judge-only debug token when testing ends.
   Do not share a configured bundle: Vite compiles the token into the JavaScript. This
   repository's public build has no production attestation issuer.

**Evidence:** Redacted rotation timestamp, token names without values, enforcement state,
and fresh smoke status before and after revocation. **If it fails:** Stop before release,
record the failure category and check the exact project and Web app pairing. Do not relax
enforcement. [Firebase debug-provider instructions](https://firebase.google.com/docs/app-check/web/debug-provider)

## 10. Publish the clean source and pack on GitHub

Use the [sanitized source snapshot procedure](SUBMISSION.md#public-source-and-hosting). Confirm the public ZIP checksum and test the repository and package from a signed-out session.

## 11. Firebase Hosting deployment

Hosting is optional for the entry and serves only the fictional static site from
`playground/`. It does not host the extension, Firebase credentials or the hybrid build.
Use an owner-controlled Hosting project. From the repository root:

```powershell
npx.cmd --yes --package firebase-tools firebase --version
npx.cmd --yes --package firebase-tools firebase login
npx.cmd --yes --package firebase-tools firebase projects:list
$hostingProject = "YOUR_HOSTING_PROJECT_ID"
npx.cmd --yes --package firebase-tools firebase hosting:sites:list --project $hostingProject
Get-Content -LiteralPath firebase.json
```

Before deploying, verify the project ID and that the default Hosting site is the intended
demo target. Then run:

```powershell
npx.cmd --yes --package firebase-tools firebase deploy --only hosting --project $hostingProject
```

Use the Hosting URL printed by the CLI. In a logged-out Chrome window open
`/`, `/recovery.html`, `/stage4.html`, `/visual-repair.html`, and `/member-portal.html`;
confirm the styles, Help icon and form fixture behave. The new HTTPS origin needs its
own explicit ClearCue permission. Verify `/.env` and `/manifest.json` return 404.

**Evidence:** Hosting URL, project/site identity without credentials, successful smoke
navigation and negative URL results. **If it fails:** Stop on wrong project, wrong site,
unexpected private assets or broken fixtures. Resolve permissions or content scope before
sharing the link. [Firebase Hosting quickstart](https://firebase.google.com/docs/hosting/quickstart)

## 12. Record the demo

Use a clean Chrome profile, disable private notifications, and record fictional data only.
Use real captured outcomes. Before the take, reset the scholarship and select the intended
build for each shot. Verify the NVDA take first if capturing system audio.

| Time | What to show |
| --- | --- |
| 0:00–0:25 | R1 baseline. Show the unnamed icon and visual-only error with ClearCue off. |
| 0:25–0:55 | R2. Enable the site, repair Help, show Rule provenance and move focus with Navigator. |
| 0:55–1:40 | R3–R4. Manually submit the invalid data, show the recovered error and Jump, correct to `NF-12345`, then manually submit and show real acceptance. |
| 1:40–2:15 | Explain offline rules and recovery, bounded Nano and consented cloud via Firebase AI Logic with App Check. Show actual source badges from genuine runs, and label any unsupported or unverified path as such. |
| 2:15–2:45 | Show ClearBench's four detected barriers, two correct labels and two abstentions, and two verified unique focus outcomes. State that these are controlled checks. |
| 2:45–2:55 | Show repo and install guide. Explain how to try the public core and how to reproduce the private hybrid test. |

**Evidence:** Keep the reviewed master, final duration, English captions, and screenshots
of before/after name, recovery Jump, observed acceptance and benchmark. **If it fails:**
Retake missing or misleading footage, trim past 3:00, and remove any private content
before upload. Play the public YouTube URL signed out and check audio and captions.
[Detailed script](DEMO_SCRIPT.md)

## 13. Submit on Devpost

Deadline **November 30, 2026 at 2:00 p.m. PST**, or **December 1, 2026 at 3:30 a.m. IST**.
Keep the public test route available through **December 16, 2026 at 2:00 p.m. PST**,
or **December 17 at 3:30 a.m. IST**. Verify the official rules again before submitting.
[Official rules](https://firebasehybridaihackathon.devpost.com/rules)

- [ ] Record Pass, Fail, Blocked or Not run for all manual IDs. Resolve genuine submission
  blockers and qualify every unverified claim.
- [ ] Choose **Web (Chrome)** and explain the runtime use of **Firebase AI Logic**, Gemini
  Nano and cloud fallback with App Check. Summarize the submission-period work and disclose
  applicable pre-existing code and assets.
- [ ] Paste the reviewed [Devpost copy](SUBMISSION.md). State which build supports which
  features and which source, repair or screen-reader outcomes were genuinely observed.
- [ ] Add the public GitHub URL with visible open-source license, the clean release link,
  public playground or local launch instructions, and the hybrid reproduction instructions.
- [ ] Add the publicly visible YouTube link. Keep the judged content within three minutes,
  in English or with English subtitles.
- [ ] Verify every public URL signed out, confirm team members and eligibility details, and review
  any public screenshots for data exposure. Keep credentials and private builds out of all
  submission fields and attachments.
- [ ] Submit before the deadline. Save the Devpost confirmation, timestamp and final entry URL.

**If anything fails:** keep the project draft and record which field, link, or rule blocked
the submission. Resolve it before submitting. Report unavailable or unsupported capabilities
with the corresponding manual test ID and verified fallback, using the evidence log above.
