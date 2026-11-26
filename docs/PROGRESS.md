# ClearCue — Progress

## Submission profile

Production mode keeps the screen-reader workflows and typed practice. Local
speech APIs and practice activation are restricted to the explicit experimental
mode. Release verification passed 297 unit, 29 Chromium integration and 14
packaged surface checks. Cloud repair and exact Undo passed 38/38. The owner
will complete regular Chrome Nano and NVDA checks.
[Evidence](evidence/RELEASE_VERIFICATION.md) · [Owner steps](OWNER_FINAL_STEPS.md)

## Final pre-submission audit

The executable checkpoint `e8b6fad` passed 297 unit tests, 29 Chromium tests,
all existing live deterministic suites and 38 configured cloud repair checks.
The extracted release ZIP ran in a fresh Chromium profile and matched the rebuilt
clean release byte for byte. The public compatibility run retained one intermittent
Met Museum assertion failure with a passing focused retry. Nano execution, real
NVDA speech and the judge’s hybrid access path still need owner validation.
[Report](FINAL_PRE_SUBMISSION_TEST_REPORT.md) · [Test records](FINAL_PRE_SUBMISSION_TEST_RESULTS.json)

## Post-freeze repair reliability audit

Smart Repair now stops waiting when paused, when its panel unloads, or when the
panel detects a different page context. The batch discards outstanding proposals,
checks the active tab, document, and URL before each decision, and reports why it
stopped. A cancelled Nano request may still finish inside the SDK. Its response is
ignored while the existing local concurrency guard holds the slot until it settles.

The audit reused existing SPA refresh, repair conflict checks, Recovery Replay,
local speech Repeat, source reporting, and local preference persistence. Native
Chrome focus on panel exit, genuine Nano inference, and actual NVDA announcements
remain owner checks. [Owner actions](OWNER_ACTIONS.md)

`npm test` passed 297 tests and `npm run test:e2e` passed 29 tests, including new
regressions for pending Nano cancellation with cloud enabled and for keyboard
pause/resume persistence. `npm run build:release`, `npm run zip`, and
`npm run verify:artifacts` passed for the clean release package.

## Final independent QA

The frozen release received full automated regression, real App Check and cloud repair
retests, 13-site exploratory testing, offline storage checks and narrow-panel review.
QA fixed cloud citation encoding, redacted inference verifier logs, corrected diagnostic
and privacy guidance, and repaired narrow statistic and practice layout. The frozen
ClearBench protocol remains unchanged. [QA report](FINAL_QA_REPORT.md) · [Owner actions](OWNER_ACTIONS.md)

## Feature freeze · First-run introduction and assistance settings

The panel now includes keyboard-accessible onboarding, an opt-in read-aloud control and
persisted detail, speech-output, voice and rate settings. The existing Recovery checkbox
continues to control proactive announcements. Speech synthesis is off by default and uses
only an explicitly assigned voice reported as local by Chrome.

Typecheck, the clean release build, 295 unit tests and 28 Chromium integration tests passed.
The Navigator, activation and scholarship regressions passed 60/60, 58/58 and 48/48.
The frozen ClearBench run passed its 40 accompanying checks. `npm run verify:assistance`
passed 47/47 DNS-isolated checks with zero unexpected HTTP requests. The genuine browser
probe enumerated 14 local voices and reported `ended-local`. Separate test-double checks
covered Stop, Repeat, recovery reading and refusal to fall back to a remote voice. Actual
audible output and NVDA speech remain manual. See the
[assistance runbook](FINAL_MANUAL_RUNBOOK.md#first-run-introduction-and-assistance-preferences).

Feature development is frozen. Continue with testing, genuine runtime verification,
verified bug fixes and submission preparation.

## Final usability update

Guided Navigator retains the current goal for the panel's page session and offers a next
step, explicit focus, back and current-context commands. The page map focuses existing
controls and the configurable Context Lens shortcut uses the Recovery live region.
Form guidance reads native validity and explicit ARIA flags without retaining values.
Recovery records native selection changes without repeating native feedback. An observed
page success remains separate from form validity and guidance.

The release build, 289 unit tests and all 27 Chromium integration tests passed.
`npm run verify:stage6-live` passed 60/60 isolated
Chromium checks with zero unexpected HTTP requests, including guidance, the Lens announcement
path, section focus and selection privacy. The physical Chrome shortcut and actual NVDA
speech remain manual. [Final manual runbook](FINAL_MANUAL_RUNBOOK.md#guided-navigation-context-lens-and-form-requirements)

The activation regression passed 58/58 after tightening its heading locator. The first
run matched both the heading and its new page-map focus button. The integrated scholarship
regression passed 48/48. The clean archive was rebuilt and passed artifact verification.

## Stage 6 supplement · Explicit command activation

The Navigator interprets read-only, focus and action commands. The bundled practice
catalogue supports explicit local sort and disclosure actions with a single-use policy,
per-tab opt-in and verified results through the Recovery announcer. Third-party pages
use focus assistance. `npm run verify:activation` passed 58/58 DNS-isolated Chromium
checks with zero unexpected HTTP requests. The supplementary ClearBench cohort recorded
3/3 correct authorized actions, zero unauthorized changes in five passive or abstention
cases, and 8/8 correct intent classifications. Typecheck, release build and 285 unit tests
passed. Physical speech and screen-reader checks remain manual.
[Verification and NVDA walkthrough](STAGE6_ACTIVATION.md)

## Stage 10 · Submission preparation

The local submission package includes the [Devpost copy and judge guide](SUBMISSION.md),
[recording script](DEMO_SCRIPT.md), README architecture diagram, license, and Firebase
Hosting configuration for the static playground. The release build, ZIP and artifact
verification passed. The archive is `artifacts/clearcue-0.5.0.zip`. The owner still needs
to rotate the earlier token, verify the private Nano and NVDA workflows, and publish the
repository, video and Devpost entry.

## Stage 9 · Integrated verification

The scholarship walkthrough combines a real Rule repair, typed Navigator, explicit focus,
manual submission, silent-error recovery, Jump, correction and observed acceptance.
`npm run verify:stage9-live` passed 48/48 under isolated Chromium DNS with zero unexpected
HTTP requests. Typecheck, build, 259 unit tests, 27 Chromium tests and the deterministic
regressions passed. Diagnostics returned actual `IN_CLOUD` for both cloud smoke prompts,
and the final Stage 4 run passed 38/38 including a genuine cloud repair and Undo.
See the [verification record](STAGE9_VERIFICATION.md) for remaining manual checks.

## Stage 7 · Release and security

Prior checkpoint `9b20d3e`. Chrome top-frame identity and live site permissions now gate
content messages. Repairs, Undo and Navigator target the verified document when known.
Diagnostics honor the current cloud diagnostics setting. Voice capture is time-bounded
and aborts when the panel is hidden. The Firebase App, AI Logic and App Check modules
replace the unused umbrella Firestore dependency chain.

The production lockfile advisory audit returned zero known entries after the replacement.
`npm run build:release`, `npm run zip`, and `npm run verify:artifacts` passed.
The credential-free release passed 52 DNS-isolated live checks and 27 browser tests.
`npm test` passed 259 tests. A public-safe ZIP exists locally. Production cloud attestation
and rotation of the earlier token remain owner actions. [Release instructions](STAGE7_RELEASE.md)


## Stage 6 · Context Navigator

Checkpoint evidence from 25 November 2026. Typed goals, grounded local ranking, a bounded
page overview and explicit verified focus are implemented. The panel refreshes on tab and
document lifecycle events. Nano reranking accepts only known IDs and requires confirmed
on-device provenance. Browser local speech remains opt-in and needs a regular-profile test.

- `npm run typecheck` and `npm run build` passed. `npm test` passed 257 tests.
- `npm run test:e2e` passed 27 tests. `npm run verify:stage5-live` passed 32 checks and
  `npm run verify:offline` passed 40 checks.
- `npm run verify:stage4-live` passed all 38 checks after an earlier Firebase HTTP 500.
- The first `npm run verify:stage6-live` passed 51 checks. A later run exposed an ordering
  race between same-document URL updates and panel refresh. The corrected rerun passed all 52 checks and is recorded
  in [Stage 6 verification](STAGE6_VERIFICATION.md).
- Actual Nano ranking, microphone transcription and NVDA speech remain manual.


Last updated **24 November 2026**. Current checkpoint **Stage 5.5 independent engineering audit**.

- Hardened hybrid routing, compact Nano production output, citation checks, repair target and undo
  identity, native validation recovery, interaction-scoped dedupe, live-region delivery, and
  release packaging. Version remains 0.5.0. See the [audit findings](STAGE5_5_INDEPENDENT_REVIEW.md).
- Verification recorded during this checkpoint: typecheck, 252 unit tests, development and release
  builds, 27 Chromium browser checks, diagnostics layout and real App Check cloud smoke. The live
  extension reproduced a genuine cloud label and Undo (38/38), and the live recovery workflow
  passed 32/32 with zero unexpected HTTP requests visible to Playwright after setup.
- The first authorized live cloud repair returned schema-invalid output. The cloud prompt now
  matches its contract explicitly. A later harness run selected the wrong repair row after a rescan. The harness now binds actions and results to stable IDs, and the 38-check rerun passed. The automation browser still
  reports Nano unavailable. Successful regular-profile Nano repair, physical offline execution,
  hardware backend, and actual NVDA speech remain manual checks.
- The offline suite passed 40/40 checks with external Chromium DNS blocked and zero unexpected
  application HTTP requests. It exercised diagnostics startup without a token check, scanning,
  deterministic apply and exact Undo, recovery, and local-only icon extraction. It decoded PNGs
  for ten supported controls and rejected three unsupported or sensitive controls.
  [Offline architecture](OFFLINE_ARCHITECTURE.md)
- Local visual routing is implemented for eligible inline SVG buttons. It checks text-plus-image
  capability separately and requires textual corroboration and explicit acceptance. Unit tests
  use model doubles. Genuine visual inference, comparative performance, and application remain
  pending in regular Chrome. [Visual verification](STAGE5_5_MULTIMODAL.md)
- Same-machine Chromium measurements recorded 413.7 → 427.2 ms for the initial 1,000-control scan
  and 64.28 → 65.56 ms for recovery detection. DOM announcement update was 33.62 → 36.40 ms.
  An interim run measured 378.7 ms, 63.18 ms, and 33.60 ms respectively. These are single-run
  development measurements with visible variation. Scanner pilot detection was 24/24,
  privacy gates 2/2 and recovery pilot 15/15. The recovery pilot uses a trusted browser click
  for its native validation case and remains separate from future held-out evaluation.
- The release build includes the content script. The configured debug token was absent from that
  build and from the 12 reachable revisions at intake. The diagnostics verification script now
  filters the credential console line. Rotate the development debug token before sharing this
  transcript or an existing dev build. Production attestation remains open.
- See [regular Chrome and offline verification](STAGE4_MANUAL_VERIFICATION.md) and the
  [NVDA Speech Viewer walkthrough](STAGE5_NVDA_GUIDE.md). Context Navigator, ClearBench and
  model-assisted recovery remain pending. Do not begin Stage 6 without an explicit go-ahead.

---

## Stage 5 — verified results (2026-11-24)

### What was built

- `src/shared/recovery.ts` and `src/shared/recoverySchema.ts`: event model, categories,
  mechanisms, statuses, sources, dedupe/urgency helpers and Zod schemas kept out of the content
  bundle.
- `src/content/recovery/`: metadata-only interaction tracker, deterministic classifier with
  form-scoped field association, bounded mutation engine, hidden live-region announcer and
  explicit-request focus recovery.
- `src/background/recovery.ts`: per-tab acceptance, 20 s dedupe, announcement status, replay count,
  dismiss and clear. `tabRegistry` carries `TabRecoveryState` in `chrome.storage.session` and resets
  it on document/SPA change.
- `src/panel/useRecovery.ts` and `src/panel/components/RecoveryPanel.tsx`: latest outcome, honest
  source/status labels, related-control caveat, Jump/Replay/Dismiss, history, statistics and the
  single announcement preference. The duplicate Stage 4 settings checkbox was removed (D-055).
- `playground/recovery.html` / `recovery.js`: scholarship 12-step workflow, `aria-hidden` shopping
  toast and sold-out failure, ambiguous account summary and an accessible comparison.
- `tests/e2e/stage5.spec.ts`, seven unit-test files, `scripts/stage5-live-verify.mjs`,
  `scripts/measure-recovery.mjs` and `scripts/recovery-pilot.mjs`.

### Defects found and fixed during verification

1. **Cross-form association.** The controlled pilot exposed a summary in one form inheriting an
   `aria-invalid` field from another form (and a page-wide sold-out toast inheriting it too). The
   invalid-field fallback is now scoped to the message's own `<form>`, and `preferInvalid` is only
   used for form-scoped validation/error-summary outcomes. A regression test was added.
2. **Pilot fixture text had no separator** between an `<h3>` and `<p>`, so
   "There is a problemCheck..." did not match the phrase rule and no event appeared. This was a
   fixture defect, not a production change; the fixture was corrected to realistic whitespace.
3. **Playwright `check()`/`uncheck()` raced the controlled checkbox** in the live script. The test
   now uses a real click and waits for the persisted setting; the UI itself was not changed to
   satisfy the test.

### Actual results

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS — **29 files / 240 tests** |
| `npm run build` | PASS — `content.js` 64.22 kB (gzip 19.52 kB), `background.js` 30.76 kB |
| `npm run test:e2e` | PASS — **26/26** (6 Stage 2, 7 Stage 3, 7 Stage 4, 6 Stage 5) |
| `npm run verify:stage5-live` | PASS — **32/32**, version 0.5.0, **0 network requests** |
| `npm run measure:recovery` | 64.64 ms / 33.76 ms / 0.94 ms; idle 0; burst 100/100; dedupe 1/10 |
| `npm run pilot:recovery` | PASS — **15/15**, precision/recall 1.000, action 1.000, latency 65.07 ms avg |
| `npm run verify:extension` | PASS — no page errors |
| `npm run verify:artifacts` | PASS — `safe-local-only`; debug token untracked |
| `npm run smoke:cloud` | PASS — `in_cloud-confirmed`; text 2.93 s, JSON 3.85 s |
| `npm run verify:stage4-live` | PASS — **36/36** (one earlier transient stale-target attempt; immediate rerun passed with no code change) |

Builds and reports are in `artifacts/recovery-performance.json`,
`artifacts/recovery-pilot.json`, `artifacts/stage5-live-verification.json` and the captured screenshots
`artifacts/stage5-live-page.png` / `artifacts/stage5-live-panel.png`.

### Deliberately not done

- No Stage 5 on-device or cloud interpretation call. Every event is `source: "observed"`; the
  contract accepts `on_device`, but adding a call would delay announcements and lacks a reviewed
  contract.
- No autonomous click/submit/purchase/delete/navigation. Jump only focuses a field on request.
- No NVDA, JAWS or VoiceOver speech result is claimed. The user has NVDA 2026.3.1 installed.
- No Context Navigator, ClearBench, iframe/closed-shadow-root recovery or browser-owned dialog
  recovery.

### Checkpoint

Stage 5 is committed locally as **`3f3729f`** (`feat(stage5): add local-only interaction recovery
engine`), extension version **0.5.0**.

### Next stage

Stage 6 (Context Navigator) is **not started** and requires an explicit go-ahead.

---

## Stage 4 — verified results (2026-11-24)

### Manual-verification blocker fixed in 0.4.1

The first regular-Chrome manual run showed **Access needed / Site: Not available / Page: Untitled**
and no Enable button even with the playground open. Root cause: the extension used
`sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`. Chrome opens the panel but does not
treat that implicit open as a user invocation, so `activeTab` was never granted and `tab.url` and
`tab.title` stayed undefined. The panel therefore had no origin and correctly refused to show an
Enable action.

Fix:

- removed implicit action-to-panel behavior and set it to `false`;
- added an explicit `chrome.action.onClicked` handler that calls `chrome.sidePanel.open({ tabId })`
  synchronously, so Chrome records a real invocation and grants `activeTab`;
- changed the `Alt+Shift+C` command to open the panel synchronously for the current window;
- added an accessible panel explanation and **Check this tab again** action for the no-address state.

No `tabs` permission or broad host permission was added. The manifest still requests only `storage`,
`sidePanel`, `activeTab`, `scripting` and optional per-origin host access. Browser test added:
`action click is the side-panel trigger, not implicit panel behaviour`.


### On-device routing defect found during manual verification (fixed in 0.4.2)

The next regular-Chrome run correctly showed the site, a 6-issue scan in 8 ms, an on-device model
reported as available, local-only privacy and cloud consent off. Repairing demo cases 2 and 8 then
showed **"Unnamed icon control · deterministic rule · 0 ms"** with **"Local evidence was
insufficient; Cloud is turned off."**

Root cause: the repair prompt sent the full structural issue id (for example
`icon-control-name:html>body>main>section:nth-child(2)>...`, well over 60 characters), but the
strict repair schema limits `issueId` to 60 characters. The on-device response therefore failed
schema parsing even when the model produced a proposal. The cloud path already used short aliases;
the local path did not. The resulting abstention was then reported as a deterministic rule decision,
so the panel hid the real on-device attempt and its latency.

Fix:

- `buildLocalPrompt()` now uses short `issue-1`…`issue-4` aliases, like the cloud prompt, and returns
  the alias map. The pipeline accepts both aliases and original ids and resolves them before
  validation. The 60-character schema bound is unchanged, so this does not weaken validation.
- Local failures, non-`on_device` sources, schema failures, validation failures and "no proposal"
  outcomes now keep source `on_device`, the measured `inferenceMs` and the real error on the
  abstention. Cloud-off/budget/policy branches preserve those fields.
- Debug logging (`[ClearCue][repair]`) records capability availability, request source, actual SDK
  source, schema validity, elapsed time and plan sources. It never logs prompts, labels or page text.
- The decision row shows **"N ms inference"** when inference ran instead of a misleading 0 ms total.
- Demo case 2 is now evidence-supported: an unnamed bell control under the visible heading
  "Notification settings", which genuinely needs local reasoning, not an ambiguous sparkle.
- Demo case 8's offline instruction no longer tells the user to reload an uncached page.

Regression tests: long structural id resolves through an alias; no-proposal and local-failure
abstentions retain on-device source and latency; the new demo control has nearby-text evidence, no
deterministic candidate and an id longer than the schema limit; decision timing distinguishes
inference from deterministic decisions. **Runtime on-device verification is still pending** until
the user repeats the manual run; nothing here claims an `ON_DEVICE` success.

### Genuine on-device diagnostics observed by the user (2026-11-25)

The user ran the 0.4.1 diagnostics page in their regular Chrome on integrated GPU. These are
**user-observed runtime results**, recorded here because they prove the environment works; the agent
did not re-run them.

| Diagnostic | Source | Latency | Validation |
| --- | --- | --- | --- |
| Forced on-device text | `ON_DEVICE` | 4,302 ms | passed |
| Automatic hybrid text | `ON_DEVICE` | 4,392 ms | passed |
| Forced on-device structured JSON | `ON_DEVICE` | 9,365 ms | schema valid |
| Accessibility label proposal | `ON_DEVICE` | 11,306 ms | schema valid; label "Search products" |

The accessibility-label diagnostic rejected the generated label at the semantic validation layer
because the model claimed high confidence with only one evidence citation. That rejection is the
existing safety rule and was **not** relaxed: high confidence requires at least two independent
citations. It is separate from the repair-routing defect below.

Despite those working diagnostics, individual page repairs in 0.4.1 still showed
"deterministic rule · 0 ms". That is consistent with the local schema-alias defect: diagnostics use
the accessibility-label contract, whose issue/evidence fields differ, while the repair batch contract
was rejecting the local repair response before the proposal reached validation.

### Commands and real outcomes

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS (strict, no errors) |
| `npm test` | PASS — 22 test files, 202 tests |
| `npm run build` | PASS — `dist/content.js` 43.93 kB (gzip 13.73 kB) |
| `npm run test:e2e` | PASS — 20/20 browser tests (6 Stage 2, 7 Stage 3, 7 Stage 4) |
| `npm run verify:stage4-live` | PASS — **36/36** checks against the built 0.4.2 extension and real cloud; one genuine `in_cloud` repair in 4,031 ms |
| `npm run verify:extension` | PASS — diagnostics page loads with no page errors; screenshot `artifacts/extension-diagnostics.png` |
| `npm run smoke:cloud` | PASS — verdict `in_cloud-confirmed`; real `IN_CLOUD` for text (13.54 s) and structured JSON (2.32 s), deterministic checks passed |
| `npm run verify:artifacts` | PASS — verdict `safe-local-only`, development build; no tracked file contains the debug token |
| `npm run zip` | PASS — `artifacts/clearcue-0.4.2-dev.zip`, labelled development-only |
| `npm run measure:scanner` | small 1.4 ms / 0.6 ms; medium 17.0 ms / 1.6 ms; large **404.8 ms / 14.5 ms**; FP=0, FN=0 |
| `npm run pilot` | PASS — 24/24 detection correct, 6 deterministic resolutions, 13 needs-inference (`not-run`), 5 clean controls, 0 false positives, 0 errors; 2/2 private cases kept private text local |

### What Stage 4 implements

1. **Shared contracts** (`src/shared/repair.ts`, `types.ts`, `settings.ts`, `messages.ts`): routing
   reasons, proposals, attempts, suggestions, statistics/view, exact attribute snapshots, apply/undo
   requests and new panel/content messages.
2. **One repair contract** (`src/inference/repairContracts.ts`): strict Zod, Firebase `Schema` and
   on-device JSON Schema constraint; the system instruction treats page content as untrusted and
   forbids role-word repetition, markup, generic labels and guesses for destructive actions.
3. **Single validation gate** (`src/repair/validation.ts`): destructive safety gate first; then
   document/authorization, issue still scanned, live target, tag/role compatibility, existing name
   protection, evidence ids, label length/format, generic labels, role repetition, visible-text
   preservation for vague links, expected attribute snapshot and source permission. Medium
   ambiguity/risk downgrades apply to suggest.
4. **Privacy-bounded prompts** (`src/repair/prompts.ts`): local prompt may use all evidence; cloud
   prompt only uses `selectCloudEvidence()`, aliases issue ids, redacts sensitive text and respects
   the character budget.
5. **Adaptive pipeline** (`src/repair/pipeline.ts`): deterministic candidates → `ONLY_ON_DEVICE`
   batch (max 4, 60 s) → consented cloud escalation (`ONLY_IN_CLOUD`, 45 s) with per-document budgets
   (12 local, 6 cloud). Unsafe/stale outcomes never escalate. Non-`on_device` local replies are
   rejected rather than accepted as local. An unexpected runner rejection becomes an abstention.
6. **Reversible application** (`src/content/repair/target.ts`): locator resolution with open shadow
   roots, exact previous-state capture, accessible-name recomputation, rollback on verification
   failure, and conflict-aware undo.
7. **Panel repair surface** (`src/panel/useRepair.ts`, `RepairPanel.tsx`): model readiness and
   initialization, cloud consent state, pause/resume, rules-only, auto-repair (deterministic only,
   default off), progress, honest statistics, suggestions, recent decisions with source/latency/
   routing reason, Undo all and per-issue repair.
8. **History and restoration** (`src/background/router.ts`, `storage.ts`, `contentScript.ts`):
   persisted attempts/suggestions/inference; applied repairs marked undone only when actually
   restored; disable and SPA navigation restore ClearCue-owned attributes and report restored ids.
9. **Demonstration page** (`playground/stage4.html`): nine reproducible cases with expected routes.
   Cases that require a real model are only complete when the user runs them; see
   `docs/STAGE4_DEMO.md` for status labels.

### Test evidence added for Stage 4

- `src/repair/__tests__/validation.test.ts` — 17 tests.
- `src/repair/__tests__/pipeline.test.ts` — 14 tests (mocked inference runner; not runtime AI).
- `src/content/repair/__tests__/target.test.ts` — 8 tests.
- `src/inference/__tests__/repairContracts.test.ts` — 5 tests.
- `tests/e2e/stage4.spec.ts` — 7 browser tests: truthful zero statistics before repair, model
  readiness text and keyboard reachability, verified apply + exact restore, refusal to overwrite a
  page-supplied name, restore on site disable, restore on in-page navigation, and undo conflict when
  the page changed the attribute.

### User-observed on-device runs (recorded earlier; not re-run)

- Cloud text: `IN_CLOUD`, 10.671 s.
- `PREFER_ON_DEVICE` text: actual `ON_DEVICE`, 21.557 s.
- Cloud structured JSON: `IN_CLOUD`, 3.507 s.
- Label proposal: `PREFER_ON_DEVICE` → actual `ON_DEVICE`, 14.682 s, label "Search button",
  evidence E1–E4.
- Forced `ONLY_ON_DEVICE` and offline runs: **not verified**. Do not claim them.

### Pilot evaluation (preliminary, controlled fixtures)

`npm run pilot` runs the real scanner bundle in Chromium over 24 controlled fixtures that do not
reuse playground ids or `data-defect` markers. Results are stored in `artifacts/pilot-results.json`
(gitignored, generated) and summarised here:

| Measure | Result |
| --- | --- |
| Cases | 24 |
| Detection correct | 24/24 |
| Deterministic resolution | 6 |
| Needs a model (`inferenceStatus: not-run`) | 13 |
| Clean controls | 5 |
| False positives | 0 |
| Errors | 0 |
| Private-text cases kept local | 2/2 |

This is a controlled engineering pilot, not field data. It does not run local or cloud inference in
automation and makes no claim about model accuracy.

### Still unverified or incomplete in Stage 4

- Genuine on-device proposals and offline local repair require a manual run in regular Chrome; see
  `docs/STAGE4_MANUAL_VERIFICATION.md`. No `ON_DEVICE` result is claimed from automation.
- The real cloud repair path **is** verified (36/36 live checks); it is no longer listed as manual.
- A sensitive-context case may still issue a structural-only cloud request when local AI is
  unavailable; private text stays local and the outcome was an abstention.
- Screen-reader announcements and NVDA walkthrough are not performed.
- The release App Check custom-token endpoint is not deployed; no publishable release exists.
- Auto-repair is deterministic-only and off by default; its end-to-end use is not covered by a
  browser test.
- Stage 4 did not add scanner chunking. Indexed paths and a single label index reduced the measured
  first scan on 1,000 controls from 1.39 s to 0.405 s (D-043, D-044).

---

## Stage 1 recap (Firebase hybrid inference proof)

| Item | Status |
| --- | --- |
| Firebase init from build-time env, App Check, cloud path, on-device path, hybrid mode | Implemented |
| `response.inferenceSource` reported verbatim, `UNKNOWN` when absent, mismatch warning | Implemented |
| Structured JSON (Zod + Firebase `Schema` + device JSON Schema constraint) | Implemented |
| Six diagnostics, latency, model, errors + hints | Implemented |
| Live cloud inference | **PASS** — `IN_CLOUD` for text and structured JSON (2.44 s / 1.97 s) |
| Live on-device inference | **PENDING** — model intentionally not downloaded, not required for Stage 3 |
| App Check token acquisition | **PASS** — token Acquired (value never displayed or stored) |

### Stage 1 live-run evidence (real, not simulated)

A real browser probe against the built extension (`clearcue-74562` web config in `.env`) produced:

- `AI/api-not-enabled` — HTTP 403 `SERVICE_DISABLED`; the Firebase console still shows AI Logic
  “Get started”, so the API is not enabled server-side for this project.
- `UNKNOWN` inference source (correct behaviour: no response was produced, so no source is
  claimed), real latency recorded, actionable hint shown.
- A CSP defect in the reCAPTCHA Enterprise App Check provider (remote script injection is
  forbidden in MV3). This was fixed by moving App Check to a **custom token provider**
  (`VITE_APPCHECK_CUSTOM_TOKEN_URL`) for release, with the debug provider for local development.
  The custom endpoint is not deployed yet, but the development debug path is now verified end to end
  (see the cloud smoke section below).

### Cloud smoke test — VERIFIED 2026-11-24 (real inference)

`npm run smoke:cloud` loads the built extension in real headed Chromium from a persistent profile
(`.playwright-smoke-profile/`, git-ignored), waits for the real App Check token request to settle,
then runs both cloud diagnostics. It never disables App Check, never retries with a stub and never
invents a result.

Final run (artefact `artifacts/cloud-smoke.json`, screenshot `artifacts/cloud-smoke.png`):

| Observation | Value |
| --- | --- |
| Project | `clearcue-74562` |
| Cloud model | `gemini-3.5-flash-lite` |
| App Check mode | Debug provider (local development) |
| App Check token | **Acquired** — 937-character token, value never displayed, logged or stored |
| Cloud text | **`IN_CLOUD`**, latency 2.44 s (2439 ms), deterministic check **passed** |
| Cloud structured JSON | **`IN_CLOUD`**, latency 1.97 s (1974 ms), deterministic check **passed** |
| `response.inferenceSource` | **`IN_CLOUD`** on both cases, read from the SDK response, never derived from the requested mode |
| Page errors | none |
| Verdict | **`in_cloud-confirmed`**, exit code 0 |

A second consecutive run with the same persistent profile again returned **`IN_CLOUD`** for both
cases (text 5.73 s, JSON 2.33 s, App Check Acquired, zero blockers), so the result is repeatable.
An image inspection of the screenshot confirmed both badges read `IN_CLOUD` and that **no token
value is visible** — only “Acquired (937 characters; value never displayed)”.

Blocked attempts with the same harness, kept for the record (each one real):
`403 SERVICE_DISABLED` / `api-not-enabled` → `403 USER_PROJECT_DENIED` → `401 Firebase App Check
token is invalid`. After the debug token was registered, the next run succeeded; no retry used a
disabled or stubbed App Check.

What the run proves: App Check obtains a real token, the Firebase AI Logic endpoint accepts it, and
both a text prompt and a schema-constrained JSON prompt return genuine cloud responses with
measured latency and a passed deterministic check. Cloud inference for Stage 1 is therefore
**verified**, satisfying D-023.

Model identifier: `gemini-3.5-flash-lite` is documented as a featured model and as the SDK default
cloud fallback (v13.0.0+; the project pins 13.4.0). Sources:
<https://firebase.google.com/docs/ai-logic/models>,
<https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options>.

Harness configuration (checked, not assumed):

- The debug token is **build-time** configuration: `VITE_APPCHECK_DEBUG_TOKEN` in `.env` is inlined
  by Vite. It is stable across runs and browser profiles, so a new profile cannot produce a new
  token; changing it requires `npm run build`.
- The harness uses a persistent profile so the extension identity and browser state stay stable,
  and it masks any UUID-shaped string before writing artefacts or printing logs. The token is never
  printed, never written to `artifacts/`, never screenshotted and never committed.
- Registration is per web app: the token must belong to the app matching `VITE_FIREBASE_APP_ID`.

## Completed in Stage 2

### Part A — Stage 1 completion work

- [x] Real Firebase web config wired through `.env` (git-ignored; never committed).
- [x] App Check refactor: `debug` (local) and `custom` (MV3-compatible) providers; reCAPTCHA
      Enterprise removed because it cannot load its remote script under the extension CSP.
- [x] `refreshAppCheckToken()` reports an empty token as a failure, which is how an unregistered
      debug token surfaces.
- [x] Genuine cloud attempt executed; real API error surfaced (no fabricated success).

### Part B — Extension foundation

- [x] MV3 manifest: side panel, service worker, options page, two commands, minimal permissions
      (`storage`, `sidePanel`, `activeTab`, `scripting`), optional host permissions only.
- [x] Background service worker: typed message router, tab lifecycle bookkeeping, badge state,
      side-panel behaviour, keyboard commands. No inference.
- [x] Content script (built as a standalone IIFE): reports minimal page facts, guards double
      injection, tracks SPA `pushState`/`popstate`/`hashchange`, ignores disabled sites.
- [x] Dynamic per-origin content-script registration; no declarative `<all_urls>` content script.
- [x] Typed protocol validated with Zod at the background boundary; sender identity checked.
- [x] Settings storage with invariants (`local_only` clears cloud opt-in; cloud opt-in timestamped).
- [x] Per-site enablement records + host permission withdrawal on disable.
- [x] Tab state in `chrome.storage.session`, invalidated on navigation and tab close.
- [x] Stale-message protection: snapshots from a previous page/document are rejected.
- [x] Privacy mode with explicit, reversible cloud opt-in; evidence budget.
- [x] Graceful local-AI-unavailable handling remains in the diagnostics page.
- [x] Keyboard shortcuts declared and read back from `chrome.commands.getAll()`.

### Part C — Accessibility Playground

- [x] Static demo site (`playground/`) with three working workflows: scholarship application
      (flagship, 3 steps), online shopping, account settings.
- [x] Fictional content, working interactions, per-page reset, fictional brands and contact data.
- [x] 12 documented intentional defects (D-01…D-12), marked with `data-defect` attributes and
      listed in-page and in `playground/README.md`.
- [x] Static server script (`npm run playground`).

### Part D — Side panel UI

- [x] ClearCue branding, warm off-white / deep forest palette, readable typography, visible focus.
- [x] Current site + page title + truthful status (connected, connecting, access needed,
      unsupported page, no active tab) with the reason spelled out in text, never colour alone.
- [x] Enable / disable on this site (permission requested from the panel's user gesture).
- [x] Privacy section: mode badge, what is never sent, explicit two-step cloud opt-in, revert.
- [x] Recovery & context navigator sections marked **Pending Stage 3**.
- [x] Repair history with empty state and disabled-until-real Undo wiring.
- [x] Statistics: rule / on-device / cloud / repairs / announcements, all zero with an honest note.
- [x] Settings: cloud-for-diagnostics toggle, announcement toggle, evidence budget.
- [x] Keyboard shortcut list from Chrome, with the internal `_execute_action` command filtered out.
- [x] **Site access manager**: every enabled origin is listed alphabetically with the time consent was
      granted and a Disable action that withdraws the host permission, even for a site other than
      the active tab.
- [x] Firebase diagnostics link that opens `diagnostics.html` in a tab.
- [x] Panel is fully keyboard operable and screen-reader structured (h1/h2, landmarks, labelled
      controls, `role="status"` notices).

### Part E/F — Shared types and engineering rules

- [x] `src/shared/types.ts`: `AccessibilityIssue`, `ElementReference`, `Evidence`,
      `EvidenceClassification`, `ProposedRepair`, `RepairDecision`, `AppliedRepair`,
      `InteractionEvent`, `RecoveryMessage`, `InferenceRequest`, `InferenceResult`,
      `InferenceSource`, `PrivacyPolicy`, `ExtensionSettings` (+ panel/site/stats types).
- [x] Strict TypeScript, Zod message schemas, Vitest suites for settings, sites, privacy,
      messages, tab registry.
- [x] Rules kept: no fabricated results, reversible-only repairs, minimal evidence, no dangerous
      auto-actions, no committed debug tokens, cloud only through `selectCloudEvidence`.

## Stage 3 — Detection and evidence engine (verified 2026-11-24)

### Implemented

- `src/content/scanner/`: `dom.ts` (read-only facts, `dom-accessibility-api` names, bounded
  collection, locators, destination sanitising), `rules.ts`, `evidence.ts`, `candidates.ts`,
  `scan.ts` (`AccessibilityScanner`), `observer.ts` (`ScanObserver`).
- Eight categories: `button-name`, `icon-control-name`, `link-name`, `vague-link`,
  `form-control-name`, `custom-control-name`, `broken-relationship`, `invalid-aria-reference`.
- Evidence privacy: structural facts are `cloud-eligible`; page text, headings, nearby text and
  placeholders are `local-only`; prohibited values are refused. Nothing is sent in Stage 3.
- Candidates: `associated-label`, `repair-reference`, `aria-label` from authored icon metadata and
  `link-context`. Conflicts, duplicate ids and destructive/financial actions yield no candidate.
- Typed protocol: `panel:rescan`, `bg:requestScan`, `content:scan`, `content:scanError`; the
  background rejects stale document ids/URLs and resets scan state on navigation/disable.
- Panel: `ScanPanel` with real counts, issue list, evidence (local-only marked), candidate status,
  Scan Again, busy/empty/error states. Repair counts remain zero.
- Test-only bundle `dist-test/scanner.js` (`npm run build:scanner-test`) and three unfamiliar
  controlled fixtures in `tests/fixtures/`.

### Real results

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | **PASS — 16 files, 148 tests** (25 detection, 12 evidence, 8 candidates, 11 scan/observer, 4 panel render, plus previous suites) |
| `npm run build` | PASS — `dist/content.js` 37.5 kB |
| `npm run test:e2e` | **PASS — 12/12** (5 Stage 2 + 7 Stage 3) |
| `npm run verify:extension` | PASS — 0 page errors; only on-device feature warnings |
| `npm run smoke:cloud` | PASS — `in_cloud-confirmed`, exit 0 (latest: text 6.99 s, JSON 2.09 s) |
| `npm run verify:artifacts` | PASS — token untracked, dist is dev-only, archive classified `dev-only` |
| `npm run zip` | `artifacts/clearcue-0.3.0-dev.zip` (development archive; not publishable) |

### Playground detections (real scanner output)

| Page | Interactive | Issues | Breakdown |
| --- | --- | --- | --- |
| `scholarship.html` (step 1) | 21 | 2 | D-01 placeholder-only field, D-02 vague “Click here” |
| `scholarship.html` (step 2 + attached file) | 21 | 1 | D-04 icon-only remove button; step-1 issues withdrawn because the section is hidden |
| `shopping.html` | 24 | 3 | D-07 icon-only add buttons |
| `account.html` | 15 | 3 | unnamed `role="switch"` controls (D-10 plus two siblings using the same pattern) |

Axe-core cross-check on `shopping.html`: every `button-name` and `label` finding axe reported was
also reported by ClearCue (browser test asserts this); no axe finding was missed.

### Measured performance (`npm run measure:scanner`, medians of 5, real Chromium)

| Page | Interactive | Initial | Incremental (25 controls) | Debounced update | FP | FN |
| --- | --- | --- | --- | --- | --- | --- |
| Small | 20 | 1.4 ms | 0.6 ms | 264.3 ms | 0 | 0 |
| Medium | 200 | 17.0 ms | 1.6 ms | 272.4 ms | 0 | 0 |
| Large | 1,000 | 404.8 ms | 14.5 ms | 925.2 ms | 0 | 0 |

Planted defects are measured against known truth, so FP/FN here are measured, not estimated. Large
pages are bounded by `maxInteractive`; see `docs/LIMITATIONS.md`.

### Generalisation (`npm run generalize:scan`, public pages, read-only)

| Site | Interactive | Issues | Time |
| --- | --- | --- | --- |
| Wikipedia — Web accessibility | 1,159 | 6 link-name | 171 ms |
| MDN — ARIA | 412 | 1 vague link | 56 ms |
| GOV.UK — Accessibility | 99 | 0 | 14 ms |

No ground truth exists for public pages; this only shows the scanner runs on unfamiliar markup.

## Actual test results (this stage)

Environment: Windows, Node v24.21.0, npm 11.19.0, Chrome/Chromium via Playwright 1.65.1.

| Check | Command | Result |
| --- | --- | --- |
| TypeScript strict | `npm run typecheck` | **PASS** (exit 0) |
| Unit tests | `npm test` | **PASS** — 11 files, 87 tests |
| Production build | `npm run build` | **PASS** — `dist/` 481 KB total |
| Browser integration | `npm run test:e2e` | **PASS** — 5 tests (real extension, headed Chromium) |
| Panel render + sections | `test:e2e` | **PASS** — all sections, no page errors |
| Cloud opt-in round trip | `test:e2e` | **PASS** — background persists and reverts mode |
| No script before consent | `test:e2e` | **PASS** — `getRegisteredContentScripts()` is empty |
| Content script facts | `test:e2e` | **PASS** — `content:hello` with real counts (1 form, 5 fields), double injection ignored, SPA change reported |
| Diagnostics page after Stage 2 changes | `npm run verify:extension` | **PASS** — loads, no page errors; only on-device feature-flag warnings |
| Playground render/overflow | screenshot + geometry check | **PASS** — 4 pages, no horizontal overflow |
| Cloud smoke test (real) | `npm run smoke:cloud` | **PASS** — exit 0, verdict `in_cloud-confirmed` |
| Live cloud inference | `npm run smoke:cloud` | **PASS** — text 2.44 s + structured JSON 1.97 s, both `IN_CLOUD`, checks passed |
| Live App Check token | diagnostics page / smoke | **PASS** — Acquired (937 chars; value never displayed) |
| Live on-device inference | not run | **PENDING** — Nano not downloaded (by instruction); not required for Stage 3 |

### Build output (real)

```
dist/panel.html                          0.60 kB
dist/diagnostics.html                    0.65 kB
dist/assets/panel-*.css                  5.80 kB
dist/assets/diagnostics-*.css            4.85 kB
dist/background.js                      10.44 kB
dist/assets/panel-*.js                  16.37 kB
dist/assets/diagnostics-*.js           105.95 kB
dist/content.js                          1.16 kB
dist/manifest.json
```

### Unit-test coverage highlights (new this stage)

- settings invariants: cloud opt-in timestamping, clearing on revert, budget clamping, corrupt
  storage falls back to safe defaults
- site enablement, stable content-script ids, permission pattern generation
- truthful tab status for every blocking condition (no false “connected”)
- cloud evidence policy: local-only sends nothing, non-cloud-safe evidence excluded, budget is a
  hard cap, diagnostics independent but explicitly switchable
- message schemas reject unknown kinds, extra fields, malformed snapshots
- stale-snapshot rejection (previous page, wrong origin, invalid scheme)

## What was deliberately NOT implemented in Stage 3 (historical)

- No repair engine, no DOM modification, no applied-repair record, no undo execution
  (`panel:undoRepair` returns a real “not implemented in this build” error).
- No model inference during scanning; no repair-specific inference. Only the diagnostics page calls
  Firebase.
- No recovery messages, no context navigator, no ClearBench.
- No screen-reader announcement of findings (manual walkthrough only).

## Blockers and open items (external, not code)

1. **None for cloud.** AI Logic is enabled, App Check accepts the registered debug token and both
   cloud diagnostics return `IN_CLOUD`.
2. **Gemini Nano is intentionally absent.** On-device criteria stay `PENDING` by instruction. This
   does not block Stage 3 (complete) or deterministic Stage 4 work.
3. **Chrome's native permission prompt cannot be automated**, so “enable on site” and “Scan Again”
   on a freshly enabled page are verified by unit tests plus the manual checklist below.
4. **Release App Check path is still unproven.** The custom token endpoint
   (`VITE_APPCHECK_CUSTOM_TOKEN_URL`) is not deployed, so release builds cannot authenticate yet.
   Development archives are labelled `-dev` and are not publishable.
5. **Screen-reader walkthrough pending.** The user has NVDA installed, and no NVDA
   results are claimed.

## Pending manual actions (in order)

1. ~~Enable AI Logic~~ and ~~register the App Check debug token~~ — **done and verified** (see
   above). Keep the token out of documentation, logs and commits; it lives only in `.env`.
2. Run `npm run smoke:cloud` after any Firebase console change. Rebuild first if
   `VITE_APPCHECK_DEBUG_TOKEN` or any `VITE_FIREBASE_*` value changed, because those are inlined at
   build time.
3. Load `dist/` unpacked, open the side panel on `http://127.0.0.1:4318/scholarship.html`
   (`npm run playground`), click **Enable on http://127.0.0.1:4318**, accept Chrome's prompt,
   confirm the badge becomes **Connected** and the page facts appear. Confirm the scan section shows
   the D-01 field and D-02 vague link, then press **Scan Again** and verify the count is unchanged.
4. Walk all three playground workflows with a screen reader (NVDA recommended) and note where
   context is lost; compare with the documented defect list.
5. Only after an explicit decision to download Nano: enable `chrome://settings/ai` and the Prompt
   API flag, restart, click **Initialize Local AI**, and run the on-device tests (record real
   results here).
6. Record every real result above with a timestamp. Do not mark a criterion complete without it.

## Known limitations

See `docs/LIMITATIONS.md` for the complete list (detection scope, name-computation differences,
iframes/closed shadow roots, dynamic-page bounds, performance bounds, packaging and manual items).
Short version:

- Panel state (including scan state) is polled every 3 s while visible; no push channel.
- Site enablement requires a reload if immediate injection is refused by Chrome.
- Playground pages are static; the content script is only injected after access is granted.
- Scan URLs omit query strings/fragments by design.
- Repairs are implemented for attribute-scoped names; Stage 5 recovery is implemented; the
  Context Navigator and ClearBench remain pending. Applied-repair counts are never fabricated.

## Next stage

**Stage 6 — Context Navigator (not started).** It requires an explicit go-ahead. Planned scope:
find relevant controls for a natural-language goal and focus/announce them without clicking,
submitting or navigating. It must reuse the Stage 4 validation/source-honesty rules and the Stage 5
local-only announcement policy. ClearBench remains separate.

## Stage 4 manual checklist (user, in order)

1. `npm run build`, load `dist/` unpacked, open the side panel.
2. `npm run playground`, open `http://127.0.0.1:4318/stage4.html`, click **Enable on
   http://127.0.0.1:4318**, accept Chrome's prompt, confirm **Connected**.
3. Run cases 2 and 8 using `docs/STAGE4_MANUAL_VERIFICATION.md`; record the actual source and
   latency shown in the panel. Do not record `ON_DEVICE` unless the panel says so.
4. Do not reload the page while offline; keep the loaded page open, set DevTools Network to Offline
   and repeat the local repair. Record success or the honest failure.
5. Run `npm run smoke:cloud` after any Firebase console change; never print the debug token.
6. Before submission, deploy the release App Check custom-token endpoint, rotate the debug token,
   rebuild with `npm run build:release`, and run `npm run verify:artifacts`.

Stage 7 cloud smoke evidence: App Check acquired, and both test cases returned actual IN_CLOUD after switching the smoke harness to a fresh profile.

## Stage 8 · ClearBench

Protocol freeze `223c1f4`. `npm run clearbench` ran 12 observed cases and passed the
40-check isolated runtime suite. The corrected run observed 2/4 correctly repaired barriers,
2/2 successful Undo operations, 2/2 expected recovery outcomes and 2/2 unique Navigator targets
ranked first and focused. Initial harness observations were retained. This cohort measures
deterministic configurations. See [the benchmark report](CLEARBENCH_REPORT.md).
