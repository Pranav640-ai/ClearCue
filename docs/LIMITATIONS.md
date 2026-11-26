# ClearCue — Limitations

Read-aloud depends on the Chrome profile and installed operating-system voices. Chrome's
`localService` flag determines eligibility. A missing voice, browser synthesis error or
missing output device can prevent playback. Audible output and actual screen-reader
speech require separate manual checks.

Guidance covers the current page and clears when that page or panel session is replaced.
Form guidance covers visible, supported native fields and explicit validation signals.
A field passing constraint validation establishes neither submission nor completion.
The Lens respects the browser's focused control, available names and bounded native choices.
Results depend on observable semantic changes. Native selection history records only that
a change occurred. Closed shadow roots and other documents remain outside this workflow.

Command activation is limited to the bundled extension-origin practice catalogue, which
contains supported native disclosures and a local sort control. Third-party controls
retain informative and focus-only help. No site compatibility or safety rate is implied
by the bundled cohort. [Activation boundaries](STAGE6_ACTIVATION.md)

Last updated: 2026-11-24 (Stage 5)

This file states what the current build does **not** do or cannot yet guarantee. It is part of the
honesty contract in `AGENTS.md`: nothing here may be presented as working in the product, docs or a
demo.

## Detection scope (Stage 3)

Implemented deterministic checks, all read-only:

- unnamed native buttons and button-like roles,
- unnamed icon-only controls,
- unnamed links,
- vague link text (`click here`, `read more`, `more`, `learn more`, `this link`) when context is
  available and no explicit description exists,
- unlabelled form controls (including placeholder-only fields),
- unnamed ARIA custom controls (`role="switch"`, `checkbox`, `tab`, etc.),
- broken naming relationships (missing `label[for]` target, referenced id absent or empty),
- invalid or duplicated `aria-labelledby` references.

Not detected in this stage (no claim of coverage):

- iframes and cross-origin frames (the scanner only sees its own document),
- closed shadow roots; open shadow roots are scanned,
- CSS-generated content (`::before`/`::after` text), canvas-drawn labels, and text baked into images,
- duplicate accessible names across a page (no "same name, different purpose" rule),
- colour contrast, focus order, keyboard traps, live-region behaviour, heading order, alt text
  quality, table semantics, motion, zoom/reflow,
- page language, directionality and translation problems,
- controls that are only unreachable because of overlay/CSS clipping,
- intent or correctness of an accessible name (for example an icon named "Button").

## Accessible-name computation

Names are computed with `dom-accessibility-api@0.7.1`, not by the browser's own accessibility tree.
It implements the ARIA name computation closely, but some edge cases can differ from Chrome, NVDA or
JAWS (for example unusual `aria-owns` graphs or browser-specific shadow DOM traversal). A name that
looks valid to this library is treated as valid and is never overwritten; a name the library cannot
compute is reported as missing.

Placeholder text is deliberately **not** treated as a label. A placeholder-only field is reported
even though some users can still infer its purpose visually.

## Evidence and privacy

- Page text, headings, nearby text and placeholder content are classified `local-only`. They are
  shown in the panel but never leave the device.
- Structural facts (role, tag, name absent, allowlisted attributes, icon words from a fixed
  vocabulary) are `cloud-eligible`. Nothing is sent unless the user has enabled cloud and the
  on-device path could not resolve the case. `selectCloudEvidence()` remains the only gate.
- The scanner never reads input values, passwords, payment fields, typed characters,
  `contenteditable` text, authentication tokens, or URL query strings/fragments. Scan summaries use
  origin plus pathname only.
- Evidence strings are shown as inert text. Model or page output is never executed or injected as
  HTML.

## Dynamic pages

- Mutations are debounced (250 ms by default); a very fast burst can therefore update the panel with
  a short delay.
- Work is bounded: at most 150 pending elements and 400 mutations before a full rescan, at most
  4,000 interactive controls, 400 issues, and 60 issues returned per summary. A truncated result is
  labelled in the panel; it is not silently complete.
- Clearing the page or navigating resets the scan. Stale scans from another URL/document id are
  rejected by the background rather than displayed.
- ClearCue's own attribute changes are marked with `data-clearcue-owned`; the observer skips them so
  a repair does not create an infinite rescan loop.
- On a SPA navigation ClearCue restores the repairs it still owns. If the page replaced the element
  or changed the attribute first, the repair is left alone and reported as a conflict.

## Side panel

- Scan state is polled with the rest of panel state every 3 s while the panel is visible; there is
  no push channel.
- **Scan Again** requires a connected page with granted host access. Chrome's native permission
  prompt cannot be automated in the test suite, so enabling a site is verified manually plus by
  unit tests.
- Chrome grants `activeTab` only on a real invocation. The panel must be opened with the toolbar
  icon or `Alt+Shift+C`; opening it from Chrome's side-panel menu shows an explicit explanation
  instead of an Enable button. ClearCue does not request the broad `tabs` permission to work around
  this.
- Keyboard and screen-reader walkthroughs are manual. NVDA 2026.3.1 is installed on the user’s laptop.
  no screen-reader results are claimed.

## Interaction recovery (Stage 5)

- Detection is deterministic and covers outcomes that are present in the DOM as visible text,
  semantic live regions, dialogs, `aria-invalid`, `aria-expanded`, `aria-busy`, hidden/style changes
  and native validation after submit. It does not read canvas text, images, iframes, closed shadow
  roots or browser-owned UI such as `window.alert`.
- The engine coalesces mutations for 60 ms and the announcer writes after 30 ms. Those delays are
  deliberate; measured interaction → detection is about 64.6 ms and detection → speech write about
  33.76 ms in Chromium. No announcement waits for a model.
- Field association is deliberately limited. Only explicit `aria-errormessage`/`aria-describedby`,
  one control in a shared field row/group, or a single invalid field is linked. Several candidates,
  several invalid fields or an invalid field in another form produce no related field and no Jump.
  This can leave Jump unavailable on a page where a human could infer the field; that is the safe
  outcome.
- The invalid-field fallback is scoped to the message's own `<form>`. It does not search the page
  for "the most likely" invalid field.
- ClearCue announces only when the page does not already expose an accessible live region/alert.
  A page that announces badly (for example an empty `role="alert"`) is respected rather than
  corrected; ClearCue does not overwrite page-owned speech.
- Duplicate suppression is 20 s in the background and 15 s in the content engine. A page that
  repeats the same real outcome after 20 s will produce a second event; that is intentional.
- Recovery history is per-tab, capped at 30 events, expires after 10 min and is cleared on
  document/SPA change or site disable. It is not a transcript and is not persisted across restarts.
- Jump focuses a live element only after an explicit panel action. It refuses hidden, disabled,
  non-focusable or removed targets. It never sets a value, clicks, submits or navigates.
- The recovery panel and live-region text are English in this build. No localisation claim is made.
- **No Stage 5 model interpretation is implemented.** All events are `source: "observed"`. The
  contract's `on_device` value is unused, and the panel label "AI interpretation (on-device)" is only
  reachable if such a call is added later.
- **No NVDA/JAWS/VoiceOver speech is verified.** The automated suite proves live regions and focus in
  the DOM. Actual speech requires `docs/STAGE5_NVDA_GUIDE.md`.
- The 15-fixture pilot is a development fixture set, not ClearBench and not a study with blind
  participants. Its 1.000 precision/recall is not an open-web claim.

## Performance (measured, not estimated)

`npm run measure:scanner` (real Chromium, medians of five runs):

| Page | Interactive controls | Initial scan | Incremental (25 controls) | Debounced update |
| --- | --- | --- | --- | --- |
| Small | 20 | 1.4 ms | 0.6 ms | 264.3 ms |
| Medium | 200 | 17.0 ms | 1.6 ms | 272.4 ms |
| Large | 1,000 | 404.8 ms | 14.5 ms | 925.2 ms |

### Recovery measurements (Stage 5)

`npm run measure:recovery` (real engine bundle, five runs, 2026-11-24):

| Measure | Result |
| --- | --- |
| Interaction → detection | 64.64 ms average (includes 60 ms debounce) |
| Detection → announcement | 33.76 ms average (includes 30 ms write delay) |
| Observer processing | 0.94 ms average |
| Idle on 1,000 sections | 0 mutation callbacks in 1.5 s |
| 100-message burst | 100 events, 2 flushes, 3.9 ms total |
| 10 identical displays | 1 event |

`npm run pilot:recovery` (15 labelled development fixtures, not a blind-user study):

| Measure | Result |
| --- | --- |
| Passed | 15/15 |
| Precision / recall | 1.000 / 1.000 |
| Association accuracy | 1.000 |
| Action success | 1.000 (stale target refused) |
| Duplicate announcement rate | 0 |
| Page-owned false announcement | 0 |
| Latency | 65.07 ms average, 79.5 ms max |

The large-page initial scan improved from 1,390.7 ms after the indexed path/label work (D-043,
D-044). Large pages are bounded by `maxInteractive`. At the 4,000-control cap an initial scan can
still take several seconds; it runs in the content script and never blocks the side panel's own
rendering. The large-page debounced number includes a fallback scan after 500 attribute mutations,
plus the 250 ms debounce. This is a measurable cost, not a benchmark claim.

## Generalisation evidence

Three public pages were scanned read-only (`npm run generalize:scan`): Wikipedia (1,159 controls,
6 link-name findings in 171 ms), MDN (412 controls, 1 vague link in 56 ms) and GOV.UK (99 controls,
0 findings in 14 ms). These are snapshots without ground truth; they show the scanner runs on
unfamiliar markup without crashing and do not prove precision. Some sites block inline script
injection by CSP; the measurement script evaluates the bundle through the automation protocol
instead, which is a test-only path.

## Repairs and inference

- Only `aria-label` is applied. `aria-labelledby` repairs, added elements and relationship fixes are
  abstained or suggested, not applied.
- ClearCue never overwrites an existing valid accessible name and never renames destructive or
  financially consequential controls. If evidence is insufficient it abstains; an abstention is a
  valid outcome, not a failure.
- Stage 5 recovery sends no evidence to the cloud at all; every recovery evidence item is
  `local-only`. The Stage 4 cloud gate is unchanged and still the only path for page evidence.
- Live re-checks reduce but cannot eliminate races: a page can change the element between the final
  check and the attribute write. Verification and rollback catch the common case; undo reports a
  conflict if the page changed the attribute afterwards.
- Auto-repair is deterministic-only and off by default. There is no browser test that runs
  auto-repair end to end.
- On-device inference requires Chrome 139+ desktop, the Prompt API, a capable device and a downloaded
  model. Playwright's bundled Chromium has no `LanguageModel`; the branded automation profile reports
  `unavailable`. Earlier user-observed `ON_DEVICE` timings are observations, not reproducible
  automation.
- Forced `ONLY_ON_DEVICE` and genuine offline repair remain unverified in automation and require the
  manual workflow in `docs/STAGE4_MANUAL_VERIFICATION.md`. A local failure may escalate to cloud only
  with explicit consent and remaining budget; without it the result is an abstention.
- The cloud repair path is verified by real runs in the built extension: `in_cloud`, applied and
  undone, with private text absent from the captured request body. See
  `docs/STAGE4_VERIFICATION.md`.
- Sensitive-context escalations may still make a **structural-only** cloud request when the local
  model is unavailable. The page text, private note, case number and URL stay local; the outcome was
  an honest abstention. The UI must not describe that case as "no cloud request".
- Model latency is high on device (user-observed 14.7-21.6 s for earlier single requests). Stage 4
  batches up to four issues and caches model handles, but no Stage 4 latency improvement is claimed
  without a real run.

## Pilot evidence

- `npm run pilot` is a controlled engineering pilot over 24 fixtures in Chromium, not field data.
- It does not run local or cloud inference. Model-dependent cases are recorded as
  `needs-inference` with `inferenceStatus: "not-run"`.
- Detection correctness is measured against the fixture's intended category, not against a complete
  human accessibility audit. The 6 deterministic resolutions were semantically inspected, but the
  sample is small and not statistically representative.
- Private-text cases are checked for local-only classification; they do not prove that every cloud
  prompt is minimal. That guarantee rests on `selectCloudEvidence()` and its unit tests.

## Release packaging

- Development builds inline the App Check debug token from `.env`, so archives are named
  `-dev.zip`. `npm run verify:artifacts` proves the token is not tracked, is confined to the dev
  build and is labelled as dev-only in the archive. Never publish a dev archive.
- The release App Check path (`VITE_APPCHECK_CUSTOM_TOKEN_URL`) still requires a deployed custom
  token endpoint; until then no release archive can authenticate. `npm run build:release` refuses a
  debug token at runtime but this has not been exercised against a live release endpoint.
- Packaging uses `zip`, then Windows `bsdtar`, then PowerShell `Compress-Archive`; the last can
  write backslash entry names. `verify:artifacts` reports archives it cannot inspect instead of
  claiming they are clean.

## Browser environment

- Chrome/Chromium MV3 only. The Playwright suites use the bundled Chromium (headed for extension
  tests). Chrome 137+ ignores `--load-extension`, so verification needs a real desktop session.

## Stage 5.5 remaining limits

- Successful production Nano repair, physical offline reproduction, actual NVDA speech, Chrome native
  permission-prompt usability, and GPU backend identification require a regular-profile run.
- Firebase `13.4.0` forwards abort to cloud transport. The installed on-device adapter keeps its
  own session options and does not pass this signal to Nano. Timeout discards late proposals.
- Recovery correlation is best-effort inside a 12-second window. Long-delayed outcomes can still be
  observed without attribution. Concurrent actions in one form remain ambiguous. Iframes and
  recovery observation within shadow roots lack coverage. A change to class alone can be missed.
- Recovery evidence stays in bounded session state. Emails, common card-number strings and explicit
  password markers are redacted. A message can still contain names, addresses or application IDs.
  Repair attempts, suggestions and applied records retain text in bounded local storage. Stage 7
  should minimize retention and migrate pre-existing records written with page URLs.
- A pre-created page live region can be outside the exposed tree during a modal dialog or while
  focus is in Chrome's native side panel. Actual Replay speech under those conditions is pending.
- Cloud release attestation remains unresolved. Development ZIPs are private test artifacts.

### Offline and multimodal scope

Chromium hostname isolation verified the deterministic core and icon extraction, including startup
without App Check token retrieval. It did not verify genuine Nano latency, interpretation or offline
label application. The installed SDK requires static Firebase configuration even in local mode.
The local renderer supports simple flat inline SVG buttons outside forms. It skips screenshot
capture, CSS and font icons, linked images, nested SVG and complex effects. Current graphics
availability and backend must be confirmed in regular Chrome. See [local visual repair](STAGE5_5_MULTIMODAL.md).

## Navigator limitations

The bounded overview skips closed shadow roots and frames. It uses English task vocabulary and
a conservative accessible-name subset that avoids editable content and form values. Some advanced
ARIA names and dynamic context need a refreshed overview. Live browser microphone transcription,
Nano ranking and NVDA announcements need regular-profile verification.

Production App Check attestation and token rotation require the owner. The public release ZIP
supports deterministic offline workflows. A separate private Firebase-configured build is needed
for live AI testing. Local package audit results describe known advisories for the pinned graph
at audit time. See [Stage 7 release](STAGE7_RELEASE.md).

ClearBench v1 has twelve observations on one synthetic portal. Genuine model strategies,
actual screen-reader speech and user-study results remain separate from its deterministic scores.
