# ClearCue — Product Specification

The release feature set is frozen. Continue with regression checks, genuine runtime
verification, verified bug fixes and submission preparation. See the
[final manual runbook](FINAL_MANUAL_RUNBOOK.md).

## Identity

- **Name:** ClearCue
- **Tagline:** Don't just read the web. Get things done.
- **Category:** Accessibility Chrome extension (Manifest V3) with hybrid AI inference.

## Problem

Blind and visually impaired users depend on screen readers to navigate the web. Everyday tasks
fail not because screen readers are weak, but because websites are:

- missing accessible names for icon buttons and form fields,
- using vague link text ("click here", "read more"),
- reporting validation errors visually only (a red border, no announced message),
- changing state silently after an action (cart count, filters, saved state).

The result is that users cannot complete routine activities independently: search a catalogue,
fix a form error, confirm that an action succeeded.

## Solution

ClearCue is a privacy-first extension that **enhances** the user's existing screen reader. It
detects supported accessibility barriers, generates evidence-backed repairs, applies them
reversibly, and announces what changed. It never silently acts on the user's behalf.

## Final product features (target end state)

1. **Smart Repair** — detect unlabeled buttons, icon controls and form fields; clarify vague link
   text; generate evidence-backed accessible names; inject reversible improvements.
2. **Interaction Recovery Engine (flagship)** — observe relevant DOM changes after an interaction;
   detect likely inaccessible validation errors; announce confirmations and state changes; let the
   user jump to affected fields; let the user replay the last announcement.
3. **Context Navigator** — find relevant controls for a natural-language goal; accessible keyboard
   navigation; never click or submit anything.
4. **Adaptive Hybrid AI** — rules first for simple cases; Gemini Nano on device through Firebase AI
   Logic; cloud Gemini for hard cases; evidence-based validation and escalation; privacy-aware
   routing; offline operation where supported.
5. **Trust and Control** — validate generated labels; abstain when evidence is insufficient;
   preserve existing valid accessibility information; reversible repairs with undo; local-only
   privacy mode; report the actual inference source.

---

## Current stage: Stage 5 — interaction recovery engine

**Goal:** after a user action, detect a meaningful outcome that the page does not expose
accessibly, tell the user without taking control, let them jump to the affected field only on
request, replay the message, and dismiss it. Recovery is deterministic and local-only; it must not
wait for a model and must never duplicate a page-owned announcement.

Stage 5 status: **implemented and verified for its automated/local scope** (29 test files / 240
tests, 26/26 browser tests, 32/32 live built-extension checks, zero network requests, 15/15
development pilot fixtures). NVDA speech and on-device/offline repair remain user-verification.

### In scope for Stage 5

- Event-driven observation after click, Enter/Space, submit, change, focus and native validation.
- Deterministic categories: validation error, error summary, success, operation failure, dialog,
  menu expansion, loading completion, status update, uncertain outcome.
- Announcement mechanism detection (`aria-live` polite/assertive, `role=alert`, `role=status`,
  dialog focus, none), with page-owned announcements respected rather than repeated.
- Conservative field association: explicit `aria-errormessage`/`aria-describedby` only, one-control
  group inference, and no guess when several fields are possible. Invalid-field fallback is scoped
  to the same form.
- ClearCue live regions with polite/assertive choice, duplicate suppression (20 s background,
  15 s content), replay and honest announcement status.
- **Jump** to a live field only on explicit request, verifying focus and never changing values;
  **Replay**; **Dismiss**.
- Per-tab session history (30 newest, 10 min TTL), reset on document/SPA change and site disable.
- A panel section that states the observed source, the existing announcement mechanism, the
  association confidence and what was not done.
- Recovery lab playground: scholarship 12-step workflow, `aria-hidden` shopping toast and ambiguous
  account summary.

### Out of scope for Stage 5 (must stay marked Pending)

- Context Navigator, ClearBench and any autonomous click/submit/purchase/delete/navigation.
- Model interpretation of recovery text. The contract accepts `source: "on_device"` for a later
  reviewed step, but no Stage 5 inference call is made and every event is `source: "observed"`.
- iframes, closed shadow roots and browser-owned dialogs (`window.alert`).
- Claiming NVDA/JAWS/VoiceOver speech from DOM inspection. That requires the user walkthrough in
  `docs/STAGE5_NVDA_GUIDE.md`.

### Acceptance criteria (Stage 5)

| ID | Criterion | Verification |
| --- | --- | --- |
| S35 | A silent post-interaction outcome is detected without a page live region | engine/classify unit tests + Stage 5 browser and live suites |
| S36 | ClearCue announces once, suppresses an identical repeat, and supports replay | announcer/background tests + live `stage5-announcement-*`/`stage5-replay-*` |
| S37 | A page-owned alert or live region is never announced twice | classify test + live `stage5-page-owned` + browser accessible comparison |
| S38 | A field is linked only by direct or single-control evidence; ambiguity yields no Jump | classify tests + live `stage5-ambiguous-*` + pilot ambiguity/stale cases |
| S39 | Focus moves only on request, the value is preserved, and stale/hidden targets are refused | focus tests + live `stage5-jump-*` + browser value check |
| S40 | The detection/announcement path is local-only and makes zero network requests | live `stage5-no-network` + privacy review of every evidence item |
| S41 | State resets on document/SPA change and site disable; preference off suppresses speech | background tests + live `stage5-disable-clears`/`stage5-preference-off` |
| S42 | Performance and precision/recall are measured, not estimated | `npm run measure:recovery`, `npm run pilot:recovery` |
| S43 | Stage 1-4 inference, repair, privacy and artifact checks still pass | full `npm run test:e2e`, `verify:stage4-live`, `smoke:cloud`, `verify:artifacts` |

## Stage 4 (completed, retained) — adaptive hybrid repair engine

**Goal:** turn detected barriers into evidence-backed, validated, reversible repairs. Rules resolve
simple cases without a model; on-device Gemini Nano handles ambiguous low-risk controls; cloud
Gemini is used only with explicit consent and only after the on-device path cannot resolve a case.
Every outcome is explainable, every applied change is verified and undoable, and the panel reports
the actual inference source rather than the requested one.

**Stage 1 status:** cloud inference is verified (real `IN_CLOUD` text and structured-JSON responses
with measured latency and App Check active). On-device inference is intentionally not exercised in
this environment (Nano not downloaded); earlier user-observed `ON_DEVICE` runs are recorded in
`docs/PROGRESS.md` as such. Forced `ONLY_ON_DEVICE` and offline runs remain unverified.

### In scope for Stage 4

- One validation gate for every source: document/authorization, issue still present, target live and
  not replaced, tag/role compatibility, no overwrite of an existing name, label format, generic-label
  and role-repetition checks, expected attribute snapshot, source permitted by settings.
- Destructive/financial safety gate first: a destructive action is never renamed or guessed.
- Hybrid routing: deterministic candidates → `ONLY_ON_DEVICE` batch → cloud only through
  `selectCloudEvidence()` and `buildCloudPrompt()`, with per-document budgets, timeouts and no silent
  SDK fallback. `ONLY_ON_DEVICE` replies whose actual source is not `on_device` are rejected.
- Reversible attribute-scoped repairs. This stage applies `aria-label` only; `aria-labelledby` and
  relationship repairs are abstained or suggested because they need DOM insertion.
- Exact previous state capture (`previousPresent`) and verified undo, with conflict detection when
  the page changed the attribute independently.
- Live re-check immediately before apply at both the panel and the content script; stale proposals
  and replaced elements are rejected.
- Panel repair surface: model readiness, initialize/check, cloud consent state, pause/resume,
  rules-only mode, auto-repair (deterministic only, default off), progress, honest statistics,
  suggestions with apply/dismiss, recent decisions with routing reasons and actual source/latency,
  undo all, and per-issue repair.
- Applied-repair log and automatic restore on site disable and single-page navigation, reporting
  restored/conflicted repairs to the background.
- Nine-case reproducible demonstration page (`playground/stage4.html`) covering deterministic,
  on-device, cloud-escalation, cloud-disabled, private-blocked, destructive, apply/undo, offline and
  stale-target paths. Cases that require a real model are only claimed when the user runs them.

### Out of scope for Stage 4 (completed later or still Pending)

- Recovery messages were delivered in Stage 5; the Context Navigator and ClearBench remain Pending.
- Adding new elements or repairing relationships by DOM insertion.
- Editing existing valid accessible names.
- Forced on-device/offline verification in CI; these stay manual and unverified here.
- Any claim that a cloud request occurred when the SDK reports another source.

### Acceptance criteria (Stage 4)

| ID | Criterion | Verification |
| --- | --- | --- |
| S22 | Every proposal from rule/device/cloud passes the same deterministic validation gate | 17 validation unit tests |
| S23 | Destructive and financial controls are abstained and never modified | validation tests + live `destructive-*` checks |
| S24 | Only additive, reversible `aria-label` repairs are applied; existing names are never overwritten | 9 target tests + 4 real browser repair tests |
| S25 | Applied repairs recompute the accessible name, roll back on failure, and restore the exact previous state | browser repair tests + target unit tests |
| S26 | Undo refuses when the page changed the attribute and reports the conflict | browser test + target unit tests |
| S27 | A genuine cloud proposal is validated, applied and undone through the built extension | `npm run verify:stage4-live` → `in_cloud`, 36/36 |
| S28 | Cloud escalation happens only through the privacy gate, only with consent, and actual source is validated | 14 mocked pipeline tests + live cloud/consent checks |
| S29 | Routing reasons for every outcome are persisted and rendered as text | pipeline tests + live routing checks |
| S30 | Statistics count repairs only when applied and inference only when a known source succeeded | panel test + review of `buildRepairView` |
| S31 | Repairs are restored when a site is disabled or a SPA navigation occurs | browser tests + live `spa-*` / `disable-*` checks |
| S32 | A controlled 24-case pilot records detection, deterministic resolution and privacy outcomes honestly | `npm run pilot` → `artifacts/pilot-results.json` |
| S33 | Cloud inference, App Check and artifact hygiene still pass after Stage 4 | `npm run smoke:cloud`, `npm run verify:artifacts` |
| S34 | Scanner optimisation is measured, preserves detection and resolves historical locators | `npm run measure:scanner` + locator tests |

### Stage 3 (completed, retained)

Stage 3 found real accessibility barriers with deterministic, read-only checks, extracted minimised
evidence with a privacy classification, proposed conservative candidates, and displayed the truth in
the panel. It did not apply repairs or call a model. Its scanner remains the input to Stage 4.

### In scope for Stage 3

- Read-only scanner in the content script: accessible-name computation via `dom-accessibility-api`,
  deterministic rules for missing names, vague links, broken/duplicate naming relationships and
  unlabelled form controls.
- Minimised evidence with `local-only` / `cloud-eligible` / `prohibited` classification; forbidden
  data is never collected; page text stays local.
- Conservative deterministic candidates only: direct evidence, heuristic or abstain. Destructive
  and financial actions are never guessed.
- Bounded incremental scanning with `MutationObserver`, debounce, dependency updates,
  stale-element removal, SPA changes and cleanup on disable/navigation.
- Typed messages and background state: scan summaries are keyed to the tab/document and stale ones
  are rejected.
- Panel: real counts (total, missing button labels, missing form labels, missing link labels, vague
  links, other), accessible issue list with evidence and candidate status, Scan Again, honest empty
  and error states. Applied-repair counts stay zero.

### Out of scope for Stage 3 (must be marked pending in the product)

- Applying, animating or undoing any repair; writing an applied-repair log.
- Model inference for labels; `HybridInferenceEngine` is not called by the scanner or panel.
- Recovery messages, context navigator, ClearBench.
- Automated screen-reader announcements of findings.

### Acceptance criteria (Stage 3, satisfied)

| ID | Criterion | Verification |
| --- | --- | --- |
| S13 | Scanner detects the specified missing-name, vague-link and naming-relationship cases and respects existing valid names | 25 unit tests + `npm run test:e2e` |
| S14 | Evidence is classified; prohibited values and private text never enter a summary or cloud set | 12 evidence/privacy unit tests |
| S15 | Candidates are deterministic, conservative and never propose destructive actions | 8 candidate unit tests |
| S16 | Dynamic insertion, removal, dependency changes, SPA changes and observer cleanup work without duplicates | 11 scan/observer unit tests + browser test |
| S17 | Panel shows real counts and issues, not fabricated zeros; repair counts remain zero | panel render tests + browser test |
| S18 | Stale scans from another URL/document are rejected | tab-registry unit test + background check |
| S19 | Runs on three unfamiliar controlled fixtures and three public sites without crashing | `npm run test:e2e`, `npm run generalize:scan` |
| S20 | Performance is measured on small/medium/large pages and frequent updates | `npm run measure:scanner` + `docs/LIMITATIONS.md` |
| S21 | Dev archives carrying the debug token are labelled and never publishable; token never tracked | `npm run verify:artifacts` |

### Stage 2 acceptance (satisfied, retained)

| ID | Criterion | Verification |
| --- | --- | --- |
| S1 | Manifest is minimal and justified (no `tabs`, no static content script, no broad grants) | `npm run test:e2e` manifest test + review |
| S2 | TypeScript strict + unit tests pass | `npm run typecheck`, `npm test` |
| S3 | Production build produces loadable `dist/` (panel, diagnostics, background, content) | `npm run build` |
| S4 | Panel renders all sections with no page errors | `npm run test:e2e` |
| S5 | Cloud opt-in is explicit, persisted and reversible | `npm run test:e2e` |
| S6 | No content script exists before consent | `npm run test:e2e` |
| S7 | Content script reports honest facts, ignores double injection, tracks SPA navigation | `npm run test:e2e` |
| S8 | Per-site enable flow works in real Chrome (permission prompt) | manual checklist |
| S9 | Playground has 3 workflows, reset and documented defects | manual + `playground/README.md` |
| S10 | Nothing unimplemented is presented as working | review: Pending labels, zero stats, real “not implemented” error |
| S11 | Live cloud/on-device inference remains truthfully reported as pending/blocked | `docs/PROGRESS.md` |
| S12 | Enabled origins can be reviewed and revoked from the panel | unit tests + `npm run test:e2e` (empty state) |

## User-visible trust requirements

- The panel must always tell the truth about the current tab: connected, connecting, access needed,
  unsupported page or no tab — with the reason in text, never colour alone.
- The UI must always distinguish requested mode, actual inference source, latency and model.
- Errors are shown verbatim with an actionable hint. No "success" without a response.
- An accessible-name proposal must cite evidence IDs from the supplied evidence set, or abstain.
- ClearCue never overwrites an accessible name that already exists (enforced by detection and, later, repair validation).
- Empty states must explain what is missing and when it arrives.

## Privacy contract

- Local-only is the default. Cloud requires an explicit, timestamped opt-in that can be reverted.
- Page evidence is minimised and redacted on device. Only evidence classified `cloudSafe` may be
  considered, and only up to the configured character budget.
- Form values, passwords, payment data, full page text and browsing history never leave the device.
- Diagnostics use hand-written fictional prompts only; they are never derived from the current page.
- Disabling a site withdraws Chrome's host permission and stops the content script.

## Permissions justification

| Permission | Why it is needed |
| --- | --- |
| `storage` | Persist settings, per-site consent, counters and tab state. |
| `sidePanel` | Host the product UI. |
| `activeTab` | Identify the page the user invoked ClearCue on, without standing access. |
| `scripting` | Register/inject the per-origin page inspector after consent. |
| `optional_host_permissions` (`https://*/*`, `http://*/*`) | Requested one origin at a time, only when the user enables a site. |

Deliberately absent: `tabs` (not needed), `history`, `readingList`, `webNavigation`, static
`content_scripts`, `host_permissions`.

## Success metrics for the hackathon

- All Stage 1 cloud diagnostics pass against a configured Firebase project, with App Check active
  and measured latency (verified 2026-11-24). On-device results are recorded only when a capable
  machine is available; they are not a gate for Stage 3.
- Stage 2 checks above pass in a real browser against the built extension.
- Zero console errors and zero CSP violations in extension documents.
- A screen-reader user can complete all three playground workflows without ClearCue, and the
  documented defect list matches their experience.
- ClearBench (Stage 4+) reports measured latency and success per inference strategy with
  reproducible inputs.

## Non-goals

- Replacing the screen reader, or reading page content aloud.
- Autonomous clicking, submitting, purchasing, deleting or navigating.
- Sending page content to any server without an explicit opt-in.
- Any mock or pre-recorded inference presented as real.
