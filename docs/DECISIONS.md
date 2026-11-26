# ClearCue — Decisions

## Final assistance settings and feature freeze

Keep screen-reader and text output as the default. Local synthesis is available on request
and only through a voice explicitly identified by Chrome as local. A missing selected voice
leaves the written message available. The same rule applies to Repeat. First-time guidance
uses an inline keyboard-accessible introduction with no automatic permission request or
navigation. The existing practice page supplies the exercise. Further work is limited to
testing, genuine runtime verification, bug fixes and submission preparation.

## Final usability update

Guidance presents a control and an explanation using observed structure. Focus occurs only
after an explicit request. Back revisits an earlier verified ClearCue focus target in the
current document. Form guidance checks browser validity booleans and explicit ARIA invalid
state. It does not retain typed values, infer a successful submission or use a model for
execution. The Lens reuses existing accessible names, including names from applied repairs.
Optional Nano ranking still uses the existing on-device route with a reduced input contract.

## Stage 6 supplement · Activation trust boundary

Third-party DOM evidence supports descriptions and explicit focus. User-directed activation
is available for a bounded set of controls owned by the bundled practice page. The local
gate independently verifies the submitted command, origin, document, target, supported
operation and observed result. No new permissions or dependencies are required.
[Activation verification](STAGE6_ACTIVATION.md)

Newest last. Each entry: context, decision, consequence. Do not reverse a decision without
adding a new entry that supersedes it.

## D-001 — Firebase AI Logic for every inference path

**Context:** The hackathon requires genuine Firebase hybrid inference, not direct Gemini API calls.
**Decision:** All inference goes through `firebase/ai` (`getAI` + `getGenerativeModel`). No direct
REST calls, no proxying, no alternative provider.
**Consequence:** Cloud inference depends on App Check and a configured Firebase project. The unit
tests inject a `ModelBuilder` seam, but production code cannot bypass the SDK.

## D-002 — Inference runs in the extension document, not the service worker

**Context:** Chrome's Prompt API (`LanguageModel`), used underneath Firebase on-device inference, is
only available in a compatible document. MV3 service workers are not such a context.
**Decision:** The diagnostics page hosts all inference. The service worker only opens the page.
**Consequence:** The user gesture required by `initializeDeviceModel()` is naturally available.
A future UI can be a side panel, which is also a document.

## D-003 — Report `response.inferenceSource`, never the requested mode

**Context:** The SDK can fall back between on-device and cloud, and can return an unknown source.
**Decision:** The engine stores the SDK's `inferenceSource`; when absent it records `unknown`.
A mismatch between requested and actual source is surfaced as a warning in the UI.
**Consequence:** The UI can show `ONLY_IN_CLOUD` requested but `ON_DEVICE` actual without pretending
otherwise. Do not "fix" this by mapping mode to source.

## D-004 — App Check debug provider for local development only

**Context:** AI Logic enforces App Check; extension origins are not web domains, and reCAPTCHA
Enterprise keys need manual origin registration.
**Decision:** Use the documented debug token flow (`self.FIREBASE_APPCHECK_DEBUG_TOKEN`) for local
development. The original production choice (reCAPTCHA Enterprise) was **superseded by D-012**
because its remote script cannot load under the MV3 CSP; release now uses a custom token endpoint.
Release builds (`npm run build:release`) refuse a debug token at runtime.
**Consequence:** The debug token must be registered in the Firebase console once per profile. It is
never printed in the UI, never committed, and never shipped in a release build.

## D-005 — Cloud model: `gemini-3.5-flash-lite` by default, configurable

**Context:** Firebase AI Logic documentation (2026-11) names `gemini-3.5-flash-lite` as the default
hybrid fallback model and lists `gemini-4-hydrogen`, `gemini-3.8-flash`, `gemini-3.5-flash-lite` as
current options. Model availability is project-specific and changes.
**Decision:** Default to `gemini-3.5-flash-lite`, allow override via `VITE_CLOUD_MODEL`, and display
the configured name in the UI. Never hard-code a model name in prose as "verified" without a
console check.
**Consequence:** `docs/PROGRESS.md` lists model availability as a manual verification item.
**Re-verified 2026-11-24:** the supported-models page lists `gemini-3.5-flash-lite` as a featured
Flash-Lite model, and the hybrid web configuration page names it as the default cloud fallback from
SDK v13.0.0 (this project pins 13.4.0). Sources:
<https://firebase.google.com/docs/ai-logic/models>,
<https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options>. Documentation evidence
only: runtime availability remains unconfirmed until a real cloud call succeeds.

## D-006 — One contract per structured task, two schema dialects

**Context:** Cloud needs a Firebase `Schema`; Chrome's Prompt API needs a JSON Schema
`responseConstraint`. Keeping them separate risks drift.
**Decision:** Each contract bundles one Zod schema (validation), one Firebase `Schema` (cloud) and
one JSON Schema derived with `z.toJSONSchema` (on device). Unit tests assert property-name parity.
**Consequence:** Structured output is validated identically regardless of where it ran.

## D-007 — Deterministic, evidence-based label validation

**Context:** Model-generated accessible names must not be trusted blindly.
**Decision:** `evaluateLabelProposal()` rejects invented evidence IDs, empty labels without
abstention, labels over 100 characters, generic role words, and "high" confidence backed by fewer
than two citations. Abstentions require a reason and must not carry a label.
**Consequence:** Stage 1 already demonstrates the trust model that Stage 2 applies before writing
any DOM attribute.

## D-008 — No mock inference mode in the product

**Context:** A mock toggle would make demos easy but violates the "no fabricated AI" rule.
**Decision:** The UI has no mock mode. When Firebase is unconfigured, cloud/hybrid tests are
disabled with an explanation and the on-device test is gated on real initialization. Unit tests use
an injected model builder as a test seam only.
**Consequence:** The product never displays a response that did not come from the SDK.

## D-009 — Fictional, minimal prompts; no page data in Stage 1

**Context:** Privacy is a core differentiator and stage 1 must not need page access.
**Decision:** All diagnostic prompts are hand-written fiction. The accessibility task uses a
hand-written evidence fixture with `E1..E4` IDs.
**Consequence:** No content script, no host permissions, no page data. Stage 2 must keep evidence
minimisation and redaction before any cloud call.

## D-010 — Pinned dependency set

**Context:** Hybrid inference is new; APIs changed between SDK versions.
**Decision:** `firebase@13.4.0` (web SDK with hybrid support), `react@19.3.1`, `vite@8.3.8`,
`typescript@5.9.3`, `zod@4.6.7`, `vitest@5.1.1`, `@playwright/test@1.65.1`. Exact versions, no
ranges.
**Consequence:** Upgrades require re-running typecheck, tests, build and the extension verification.

## D-011 — Playwright verification uses bundled Chromium, headed

**Context:** Google Chrome 137+ ignores `--load-extension`, and MV3 extensions do not load in this
Playwright headless configuration.
**Decision:** `scripts/verify-extension.mjs` launches Playwright's bundled Chromium headed, loads
`dist/`, opens the diagnostics page and reports observable facts (no inference).
**Consequence:** The check needs a desktop session. It verifies packaging, CSP, rendering, service
worker, geometry and real `LanguageModel` availability.

## D-012 — App Check uses a custom token provider for release, not reCAPTCHA Enterprise

**Context:** A real cloud attempt exposed a CSP defect: `ReCaptchaEnterpriseProvider` injects a
remote script, which MV3 `script-src 'self'` forbids. Disabling App Check is not allowed.
**Decision:** `AppCheckProviderMode` is `debug` (local, `globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN`)
or `custom` (`VITE_APPCHECK_CUSTOM_TOKEN_URL`, a `CustomProvider` fetching an App Check token).
reCAPTCHA Enterprise was removed. Release builds refuse a debug token at runtime.
**Consequence:** Cloud inference needs either a registered debug token or a deployed token
endpoint. Both are external setup steps tracked in `docs/PROGRESS.md`.

## D-013 — Product contracts live in `src/shared`; SDK contracts stay in `src/inference`

**Context:** Stage 2 needs message-safe domain types (`AccessibilityIssue`, `Evidence`,
`ProposedRepair`, `AppliedRepair`, …), while the inference layer already had SDK-level request and
result types.
**Decision:** `src/shared/types.ts` holds the product vocabulary. The product-level
`InferenceRequest`/`InferenceResult` describe intent and reporting; the SDK-level request/outcome
remain in `src/inference/types.ts` and are mapped at the call site.
**Consequence:** No DOM handles, functions or raw HTML cross a message boundary. Stage 3 maps
`ProposedRepair` onto engine requests explicitly.

## D-014 — Only extension documents may host inference

**Context:** Chrome's Prompt API is unavailable in service workers, and hybrid inference needs a
user gesture for model download.
**Decision:** Inference runs in `diagnostics.html` today and in the panel document tomorrow. The
service worker never imports the inference engine.
**Consequence:** The service worker stays small, restartable and free of long-running work.

## D-015 — Per-origin content scripts, granted on demand

**Context:** The product must not read every page by default, and Chrome shows a permission prompt
per site.
**Decision:** No static `content_scripts`. Host access is `optional_host_permissions` only. On
enable, the background registers a dynamic content script for that exact origin, injects it into
the current tab, and records the site. Disable unregisters, stops the script, clears state and
removes the host permission. No `tabs` permission is requested.
**Consequence:** A site is inert until the user enables it, and revocation is complete. Exact tab
URLs outside the enabled origin are unavailable, which the panel states instead of guessing.

## D-016 — Panel sender identity comes from the extension URL, not from “no tab”

**Context:** The first integration run failed with “Rejected message from an untrusted sender”
because the check required `sender.tab === undefined`, which is only true in the side panel, not
when `panel.html` is opened as a tab.
**Decision:** Accept panel requests only when `sender.id` matches and `sender.url` starts with
`chrome-extension://<our-id>/`. Content messages require a tab sender and are additionally checked
against the enabled origin and current page.
**Consequence:** The same panel code is testable as a normal tab without weakening validation.

## D-017 — Local storage for consent, session storage for tab state

**Context:** Settings and site consent must survive restarts; a tab's document identity must not.
**Decision:** `chrome.storage.local` holds settings, sites, activity and repairs.
`chrome.storage.session` holds `clearcue.tab.v1.<tabId>`. Navigation clears the document id and
connected flag; tab close deletes the record.
**Consequence:** A stale document can never be mistaken for the current page after a restart.

## D-018 — One privacy decision point with a hard budget

**Context:** Cloud sends must be explainable, minimal and revocable.
**Decision:** `selectCloudEvidence()` is the only function allowed to decide whether page evidence
may leave the device. It requires the explicit cloud mode, filters on `Evidence.cloudSafe`,
redacts obvious secrets, and enforces `maxCloudEvidenceCharacters` as a hard cap. Diagnostics have
a separate, explicitly labelled switch and use fictional prompts only.
**Consequence:** Stage 3 features must route through it; ad-hoc fetch calls are a review failure.

## D-019 — Panel polls state instead of holding a long-lived port

**Context:** MV3 service workers suspend aggressively; a port would need reconnection logic and
could show stale “connected” states.
**Decision:** The panel requests `panel:getState` on mount and every 3 s while visible, and after
every action. All responses carry `checkedAt`.
**Consequence:** Slightly more messages, but no false liveness. Revisit only with measured need.

## D-020 — Playground defects are documented, tagged and fictional

**Context:** A demo site with hidden defects would be dishonest and hard to test.
**Decision:** Every intentional defect has a `data-defect="D-xx"` attribute, an in-page list entry
and a row in `playground/README.md`. Content, brands and contact details are fictional. No defect
imitates a real security weakness or dark pattern beyond accessibility barriers.
**Consequence:** Reviewers can verify the gap between “what a screen reader experiences” and “what
ClearCue should eventually repair”, and tests can target stable hooks.

## D-021 — Unimplemented surfaces are labelled Pending, never simulated

**Context:** Stage 2 must not imply a repair engine exists.
**Decision:** Recovery, context navigator, repair history and undo are visible but explicitly
marked Pending Stage 3, with empty states that explain why. `panel:undoRepair` returns a real
`not-implemented` error instead of a fake success. Statistics stay at zero until something real is
recorded.
**Consequence:** The panel is honest at every state; Stage 3 must replace these placeholders rather
than build around them.

## D-022 — Site consent is managed as an explicit list, not just the current tab

**Context:** Stage 2 required per-site toggles. A current-tab-only toggle leaves users unable to
review or revoke consent they granted earlier.
**Decision:** `PanelState.enabledSites` returns enabled origins alphabetically. The panel shows each
origin with its consent time and a Disable action that unregisters the content script, stops the
inspector, clears tab state and removes the host permission, even when the origin is not the active
tab. The same background path handles both current-tab and list actions.
**Consequence:** Consent is reviewable and revocable in one place. A stale record whose permission
was removed elsewhere is still listed honestly until the user disables it.

## D-023 — Cloud completion requires a real `IN_CLOUD` smoke run

**Context:** An earlier attempt to call cloud inference failed, and it would be easy to declare the
integration complete from code review or from a documentation check of the model name.
**Decision:** `npm run smoke:cloud` is the acceptance gate for cloud inference. Completion requires
at least one genuine `IN_CLOUD` badge plus a validated structured response, with App Check enabled.
Documentation may justify a model identifier but never substitutes for runtime evidence. Every
blocked run is recorded with its exact error and a verdict of `blocked-externally`.
**Consequence:** Stage 1 cloud/App Check criteria stay PARTIAL until the operator registers the
App Check token and the smoke script reports `in_cloud-confirmed`.

## D-024 — Stage 3 does not wait for on-device inference

**Context:** Stage 1 on-device verification requires downloading Gemini Nano, which is explicitly out
of scope for now. Blocking Stage 3 on it would stall deterministic work that never needs the model.
**Decision:** Stage 3 (deterministic detection, repair proposal, reversible application, undo log,
recovery messages, context navigator) may proceed with the verified cloud path for any inference it
uses. On-device inference remains an optional, separately verified capability. Documentation must
not describe on-device results as a Stage 3 prerequisite.
**Consequence:** `PRODUCT_SPEC.md`, `PROGRESS.md`, `AGENTS.md` and `README.md` state cloud PASS and
on-device PENDING-by-choice; no task claims Nano is required.

## D-025 — Cloud smoke harness: build-time token, persistent profile, redaction

**Context:** The harness previously launched a throwaway browser profile. It was unclear whether a
new run could mint a new App Check debug token, which would invalidate registration silently.
**Decision:** The debug token is build-time configuration (`VITE_APPCHECK_DEBUG_TOKEN`, inlined by
Vite), so it is stable across profiles; a throwaway profile cannot mint a new token. The harness now
uses a persistent, git-ignored profile (`.playwright-smoke-profile/`) so the extension identity and
browser state stay stable, and it masks anything matching a UUID pattern before writing artefacts or
printing output. Success requires **every** executed cloud case to report `IN_CLOUD`; a single case
is no longer enough. App Check is never disabled, stubbed or bypassed.
**Consequence:** Re-running the harness cannot demand a new console registration. Changing the token
requires editing `.env` and rebuilding. Token values never reach artefacts, screenshots, logs or git.


## D-026 — Deterministic detector modules, no page-specific selectors

**Context:** Stage 3 must find real barriers on arbitrary pages, not the demo site.
**Decision:** Detection lives in `src/content/scanner/` and uses the accessibility name computation
from `dom-accessibility-api` plus ARIA/native rules. It never reads `data-defect`, playground ids or
hardcoded page selectors. Issue ids are `category:path` using an nth-of-type chain with a `::shadow`
marker, which is stable across rescans of the same structure and locates the element for the panel.
**Consequence:** The playground and public sites are evidence, not configuration. Rules can be unit
tested in jsdom and reused unchanged on any page.

## D-027 — Evidence is classified before it can travel; Stage 3 sends nothing

**Context:** The product must never send page text, values or private content to the cloud.
**Decision:** Every evidence item carries `local-only`, `cloud-eligible` or `prohibited`.
Structural facts (role, tag, name-absent, allowlisted attributes, icon words from a fixed vocabulary)
are cloud-eligible; page text, headings, nearby text and placeholders are local-only; prohibited
values are refused. `selectCloudEvidence()`/`isCloudEligible()` remain the only gate. Stage 3 does not
call inference at all.
**Consequence:** The panel can show useful evidence while the privacy contract holds. A later stage
must still pass through the existing gate and budget.

## D-028 — Candidates are suggestions, never actions

**Context:** A wrong accessible name can be worse than none, and destructive actions must never be
guessed.
**Decision:** Candidates are limited to `associated-label`, `repair-reference`, authored icon
metadata (`aria-label` from SVG title/allowlisted icon words) and `link-context` (from a sanitised
destination slug). Conflicts, duplicate references, insufficient evidence and destructive/financial
actions return no candidate and set `needsReasoning`. Nothing is applied.
**Consequence:** The panel can honestly say "Further reasoning is required" and repair counts stay
zero until Stage 4 exists.

## D-029 — Bounded incremental observation with dependency updates

**Context:** Modern pages mutate constantly; naive observers either miss changes or loop.
**Decision:** `ScanObserver` debounces 250 ms, caps pending elements at 150 and mutations at 400
before falling back to a bounded full scan. It re-evaluates elements whose id changes and controls
bound to changed labels/references, scans open shadow roots, skips `data-clearcue-owned` subtrees,
and treats attribute changes (including `hidden`) as potentially revealing descendants.
**Consequence:** Revealing a hidden row is detected, removed elements are invalidated, and future
repairs cannot trigger an infinite observation loop.

## D-030 — Scan state is document-scoped and rejected when stale

**Context:** A late scan from a previous page could show the wrong page's barriers.
**Decision:** `content:scan` is accepted only when its document id and origin+pathname match the
tab's stored context. Navigation and disable reset scan state to `EMPTY_SCAN_STATE`. The panel reads
`state.scan` only through the background and never from storage directly.
**Consequence:** No cross-tab or cross-document leakage; SPA URL changes reset identity while the
same document id is retained.

## D-031 — Dev and release artifacts are separated by token detection

**Context:** A development build inlines the App Check debug token, so a ZIP of `dist/` is a secret.
**Decision:** `.env` stays gitignored and untracked; packaging names the archive `-dev.zip` when the
token is configured; `npm run verify:artifacts` checks tracked files, dist and ZIP contents without
printing the token. Archives are labelled dev-only unless they contain no token.
**Consequence:** A dev archive can never be mistaken for a publishable release. Release App Check
still requires the deployed custom token endpoint (`VITE_APPCHECK_CUSTOM_TOKEN_URL`).

## D-032 — Measured performance bounds are documented, not optimised speculatively

**Context:** Accessible-name computation is not free, and the scanner must not hang a page.
**Decision:** Work is bounded by `DEFAULT_SCAN_LIMITS` (4,000 interactive controls, 400 issues, 60
returned) and measured on real Chromium (`npm run measure:scanner`). At the time, the honest numbers
were 1,391 ms initial and 17 ms incremental on 1,000 controls. Optimisation waits for a measured
profile, not a guess; D-043 later reduced the measured initial cost to 405 ms. Bounds and numbers
stay in `docs/LIMITATIONS.md` rather than being rounded into a marketing claim.
**Consequence:** Users on very large pages may still wait for the first scan; they see a labelled
truncated result instead of a silent partial answer.

## D-033 — One validation gate for every repair source

**Context:** Rules, on-device inference and cloud inference can all produce a proposal, and each has
different failure modes. A per-source validator would let weak paths bypass hard checks.
**Decision:** Every proposal goes through `validateRepair()` in `src/repair/validation.ts`, whatever
its source. The destructive/financial safety gate runs before any evidence or format check.
Deterministic failures reject; heuristic concerns are recorded separately and can only downgrade
"apply" to "suggest".
**Consequence:** No source can apply a name that overwrites an existing one, no source can rename a
destructive control, and every rejection is explainable.

## D-034 — Repairs are additive, attribute-scoped and verified

**Context:** The extension must never destroy authored accessibility information.
**Decision:** Stage 4 applies only `aria-label` when the computed accessible name is empty, captures
the exact previous state (including absence) and recomputes the accessible name after applying.
Verification failure rolls back. `aria-labelledby` and relationship repairs are abstained or
suggested because they require DOM insertion.
**Consequence:** Repairs remain reversible and small; broader relationship repair is deliberately
deferred.

## D-035 — Live re-check before apply, and conflict-aware undo

**Context:** A page can change between scanning and applying, and again before undo.
**Decision:** The panel asks for a fresh `panel:checkTarget`; the content script compares the
captured snapshot and rejects replaced elements. Undo refuses when the page changed the attribute
and returns `conflict: true`.
**Consequence:** Stale or page-modified targets are never overwritten; a conflict is shown as a
fact, not silently repaired.

## D-036 — Cloud escalation is narrow, consented and budgeted

**Context:** Cloud calls cost money and carry privacy risk; on-device results can be slow or
unavailable.
**Decision:** Local batches use `ONLY_ON_DEVICE` with 60 s timeouts. Cloud escalation happens only
after a local failure, only with `privacyMode === "cloud_allowed"` and a recorded opt-in, only
through `buildCloudPrompt()`/`selectCloudEvidence()`, with 45 s timeouts and per-document budgets
(12 local, 6 cloud) and batches of at most 4.
**Consequence:** No silent SDK fallback is treated as verification; when consent or budget is
missing the outcome is an abstention with a routing reason.

## D-037 — Statistics count applied repairs, not requests

**Context:** "Repairs" and "inference requests" are different facts and can be inflated by retries.
**Decision:** `deterministicRepairs`, `onDeviceRepairs` and `cloudRepairs` are derived from applied
repairs by source. Inference counters increase only for successful calls with a known source.
Failed attempts are counted separately and are never shown as repairs.
**Consequence:** The panel cannot report a repair that did not change the page.

## D-038 — Reuse model handles and batch inference

**Context:** Local proposals were slow (user-observed 14.7-21.6 s) and each issue could create a new
cold model.
**Decision:** Cache model handles by mode, cloud model, system instruction, device initial prompts
and constraint, bounded to six configurations. Batch up to four issues per local request, deduplicate
issues, keep prompts minimal and expose progress while work runs.
**Consequence:** Repeated repairs avoid repeated initialization. Stage 4 latency improvements are
not claimed as measured beyond the real per-attempt values shown in the panel.

## D-039 — Diagnostics forced on-device run initializes from the click

**Context:** Requiring a separate initialization press made a genuine forced on-device run hard to
perform and easy to misread.
**Decision:** `runCase` calls `initializeLocalAI()` from the user's click and `availabilityFor()`
allows a configured forced on-device run without prior initialization.
**Consequence:** A real gesture still gates model download/initialization; no model is downloaded
automatically and no simulated on-device result is created.

## D-040 — Routing reasons are a closed, persisted vocabulary

**Context:** Users and reviewers need to know why ClearCue changed or refused to change a page.
**Decision:** Outcomes use the fixed reason codes in `ROUTING_REASONS`, persisted with each attempt
and rendered as plain-language labels. New reasons require a schema change and a decision entry.
**Consequence:** Every attempt is explainable, and analytics cannot invent arbitrary status text.

## D-041 — Site disable and SPA navigation restore ClearCue repairs

**Context:** Leaving a site or navigating within a single-page app must not leave ClearCue-owned
attributes behind, and history must not claim a repair is still applied after it was restored.
**Decision:** The content script restores its known repairs on `bg:siteDisabled` and on SPA URL
change, reports restored and conflicted repair ids, and the background marks only restored repairs
undone. A page-modified attribute becomes a conflict and is not overwritten.
**Consequence:** ClearCue's footprint disappears when consent is withdrawn; conflict facts survive.

## D-042 — Pilot evidence is labelled as controlled, not as field data

**Context:** The pilot runner uses 24 controlled fixtures in real Chromium. It does not run local or
cloud inference in automation.
**Decision:** `npm run pilot` reports detection, deterministic resolution, `needs-inference` and
privacy outcomes. Model-dependent cases are recorded as `inferenceStatus: "not-run"`, never as
successes. Results live in `artifacts/pilot-results.json` and are summarised in `docs/PROGRESS.md`.
**Consequence:** The pilot can show honest deterministic coverage and limitations without simulating
AI or claiming field validation.

## D-043 — Scanner performance is measured, not guessed

**Context:** Stage 4 added more work around scanning and repair. Chunking the scanner would risk
duplicate or inconsistent issue sets, so any change had to be justified by a real profile.
**Decision:** Profile the real scanner, then optimise only measured hot paths. Keep the existing
bounded, synchronous scan and fast incremental path rather than adding chunking. Re-measure after
every scanner change (`npm run measure:scanner`).
**Consequence:** The measured 1,000-control initial scan fell from 1,390.7 ms to 404.8 ms and the
incremental scan from 18.2 ms to 14.5 ms, with FP=0 and FN=0. Large pages can still block briefly on
first scan; that cost remains disclosed rather than hidden.

## D-044 — Structural locators use indexed nth-child paths

**Context:** Profiling showed `buildPath()` dominated the large-page scan because each control walked
its siblings with `nth-of-type`. The locator is persisted in repair attempts, so the format is a
compatibility surface.
**Decision:** Build paths with `nth-child` indices computed once per full scan through a
`WeakMap<Element, number>`, and resolve both new `nth-child(...)` and historical `nth-of-type(...)`
segments in `resolveLocator()`. Index `label[for]` text once per scan, reuse the computed role, and
skip accessible-name/path work for hidden controls.
**Consequence:** Initial scan cost dropped about 3.4× on 1,000 controls. Old persisted attempts still
resolve. The path format is now an explicit compatibility contract and must not change silently.

## D-045 — Cloud timeouts are sized for observed latency; runner errors abstain

**Context:** Genuine cloud repairs were observed at 7.6 s and earlier diagnostics at 2-11 s, but
several live runs exceeded the previous 25 s ceiling. A thrown inference-runner error could also
escape as an unhandled failure.
**Decision:** Use a 45 s cloud timeout. Convert an unexpected runner rejection into an abstention
with a recorded error, rather than letting it crash the repair flow.
**Consequence:** Slow but valid cloud proposals are no longer discarded at 25 s. A genuinely hung
request still fails safely within 45 s, and no error is presented as a repair.

## D-046 — The side panel opens from an explicit invocation, never implicitly

**Context:** A regular-Chrome manual run showed no site, no title and no Enable button. With
`sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`, Chrome opens the panel without
treating the click as an extension invocation, so `activeTab` is not granted and `tab.url` and
`tab.title` stay undefined.
**Decision:** Disable implicit panel behavior. Open the panel from `chrome.action.onClicked` (or the
`Alt+Shift+C` command) by calling `chrome.sidePanel.open()` synchronously inside the gesture. Keep
the minimal permission set; do not add `tabs` or broad host access. Explain the no-address state in
the panel and provide **Check this tab again**.
**Consequence:** The normal toolbar path sees the page origin and can request per-site consent.
Opening the panel from Chrome's side-panel menu remains unsupported until the user invokes the
toolbar icon, but it is now explained honestly instead of showing a dead end.

## D-047 — Local repair prompts use short issue aliases; attempts keep real provenance

**Context:** A regular-Chrome manual run showed the on-device model as available but every local
repair became "deterministic rule · 0 ms". The local prompt asked the model to echo a structural
issue id longer than the contract's 60-character `issueId` limit, so valid proposals failed schema
parsing. The abstention then lost the on-device source and latency.
**Decision:** Both cloud and local repair prompts send bounded aliases (`issue-1`…`issue-4`) and the
pipeline resolves them back to the scanned issue id. The schema bound stays at 60 characters. A
failed, mismatched, invalid or empty on-device result is recorded with source `on_device`, the
measured inference time and the real error before any cloud or deterministic routing reason is
applied. The panel displays inference time separately from decision overhead. Debug logs contain
counts, sources, schema validity and durations only, never prompts, labels or page text.
**Consequence:** On-device proposals can validate without weakening the contract, and the panel
reports the genuine attempted source. A model that returns nothing is still an honest abstention,
not a deterministic repair.

## D-048 — The manual on-device demo uses evidence-supported, not ambiguous, controls

**Context:** An unnamed sparkle icon with no visible context cannot fairly demonstrate local
reasoning; an abstention there is correct but indistinguishable from a routing defect.
**Decision:** Demo case 2 is an unnamed bell control under the visible heading "Notification
settings" with helper text about alerts. The visible evidence supports a specific name while no
deterministic rule can author it. Case 8 remains the offline search control.
**Consequence:** Manual verification can distinguish "model declined" from "model was never asked",
without loosening validation or fabricating evidence.

## D-049 — Recovery is deterministic, local-only and per-tab

**Context:** Stage 5 must help a screen-reader user recover an outcome without adding model latency
or creating a second source of truth.
**Decision:** Recovery events are local observations stored in `chrome.storage.session`. History is
capped at 30 events with a 10-minute TTL, background dedupe is 20 s and content dedupe is 15 s.
`interactionId` is nullable because correlation is not causation. `source` is `observed` in this
stage; the contract accepts `rule`/`on_device` for a later reviewed step. Every evidence item is
`privacy: "local-only"` and no cloud request is made on the detection or announcement path.
**Consequence:** Recovery works offline and never waits for inference. A model cannot fabricate an
outcome, and the panel can honestly say no model call was needed.

## D-050 — Recovery Zod schemas live outside the content bundle

**Context:** Importing `recovery.ts` with Zod into the content script inflated `content.js` from
about 64 kB to about 150 kB, although the content script never validates recovery messages itself.
**Decision:** Keep pure types/helpers in `src/shared/recovery.ts` and Zod schemas in
`src/shared/recoverySchema.ts`. The background validates `content:recovery` at the boundary; the
content bundle imports only the pure module.
**Consequence:** `content.js` stays around 64 kB. Any new content-side schema import must be
justified and measured, not assumed.

## D-051 — A page-owned live region is detected before a role, and is never duplicated

**Context:** The accessible comparison exposes both `role="alert"` and `aria-live="assertive"`.
Checking role first reported `role-alert`; checking live first reports `aria-live-assertive`.
**Decision:** `detectAnnouncementMechanism` checks ancestor `aria-live` before `role=alert/status`.
An event whose mechanism is not `none` is marked `announced-by-page` and ClearCue writes nothing.
The browser test expectation is `aria-live-assertive`.
**Consequence:** ClearCue respects page-owned speech and does not talk over it. The status shown in
the panel matches the mechanism that actually exists.

## D-052 — Focus recovery only runs on explicit request and never changes page state

**Context:** Jump could silently submit, fill or steal focus if implemented as an action helper.
**Decision:** `focusRecoveryTarget()` resolves the live locator, refuses hidden/disabled/non-focusable
or removed targets with a reason, scrolls and calls `.focus()`, then verifies
`document.activeElement`. It never sets `.value`, dispatches submit/click or changes attributes.
The panel offers Jump only for an event with a related field.
**Consequence:** Focusing is reversible and non-consequential. A stale target fails honestly rather
than acting on a replacement. The browser suite checks the field value is unchanged.

## D-053 — Recovery state resets on document or SPA path change and site disable

**Context:** A recovery message from one page must not appear as the current outcome on the next.
**Decision:** `tabRegistry.acceptContentSnapshot()` resets recovery when the document changes **or**
the origin+pathname changes (`sameDocument && samePage` is false). Site disable explicitly clears
recovery. The content engine stops on `pagehide` and site disable.
**Consequence:** History is scoped to the page session. A same-page DOM update keeps relevant
history; a route change does not.

## D-054 — The panel reports announcement status and source honestly

**Context:** A recovery event may be pending, announced by the page, announced by ClearCue, blocked
by preference or failed. Showing a generic "announced" badge would be false in three of five cases.
**Decision:** Persist and display `pending`, `announced-by-page`, `announced-by-clearcue`,
`preference-off` and `failed`. Label the source as "Observed directly from page semantics; no model
call was needed", "Deterministic classification, no model call" or "AI interpretation (on-device)".
Source is never inferred from the requested mode.
**Consequence:** The user can tell whether speech came from the page, ClearCue or nowhere. The
on-device label is unused until a genuine Stage 5 interpretation call exists.

## D-055 — One announcement preference, hosted in the recovery panel

**Context:** Stage 4 settings contained "Announce results through the page's live region" while the
new recovery panel also needed the same control. Two checkboxes for one setting would be ambiguous.
**Decision:** Remove the settings-panel duplicate. The only control is **Announce outcomes through
the page live region** in `RecoveryPanel`, wired to `panel:updateSettings({announceRecoveryMessages})`.
**Consequence:** There is one control and one persisted setting. The Stage 2 browser test that
asserted the old settings checkbox was updated; no behaviour was lost.

## Stage 5.5 independent audit decisions

- Automatic repair is strictly rule-only. Model failures preserve SDK-confirmed provenance when it
  exists, and unknown source otherwise. Compact Nano output reduces generation work while cited
  evidence still governs writes. No dependencies were added.
- Cloud evidence uses a finite structural vocabulary. Hostnames, custom attributes and custom tag
  strings stay local. Cloud citations must be a subset of the evidence transmitted for the issue.
- Duplicate recovery evidence is scoped to the interaction. An actual repeat is meaningful.
  A busy-to-idle change establishes completion of loading. Success requires a separate observed
  outcome. Capture browser invalid events and sanitize native validation text.
- Pre-created regions, queued writes and DOM acknowledgements are used for recovery. Page semantics
  do not establish what an assistive technology spoke.
- For release attestation, prefer a separately verified backend with an authenticated, restricted
  attestation flow. The hackathon permits debug tokens, which may be provisioned privately on an
  isolated, quota-limited project if the organizers provide a suitable private channel. Keep them
  outside public source, release packages and logs. [Official rules](https://firebasehybridaihackathon.devpost.com/rules)
  [Firebase custom providers](https://firebase.google.com/docs/app-check/web/custom-provider)

### Offline and local visual routing

- Offline is a product contract for the deterministic core. Keep cloud diagnostics on demand.
  Firebase public web configuration is used locally by the installed SDK, and an App Check
  provider is required before a cloud-capable request. Preserve distinct readiness and source.
- Use a bounded raster reconstructed from simple SVG geometry. Request no screenshot permission
  and avoid either page-markup rendering or remote icon URLs. Initiate the image route after an
  individual repair request and exact text-plus-image capability probe.
- Model image suggestions require corroborating available text and explicit user review.
  If a cloud escalation is justified, construct a new, policy-filtered text prompt.
- A Chromium fixture checks extraction and offline operation. A model double checks request shape
  and no image fallback. Actual text and image interpretation require the regular profile.
  Preserve this evidence boundary when preparing the demo.

## Context Navigator and voice

Navigator candidates stay bound to original DOM elements. Rank locally first and treat model
ranking as optional. Model output can order known IDs while explanations and focus validation
remain deterministic. Use the browser speech API only after a positive local availability check,
with explicit recording and an editable transcript. The product requests no new permissions.

## Release boundary and SDK dependency scope

The public release compiles with project identifiers, debug settings, and unverified custom
token configuration blanked. Firebase App Check remains required for any cloud-capable runtime
build. Use the pinned Firebase AI Logic, App, and App Check modules that the former umbrella
package exported. The production registry audit initially flagged four entries in the unused
Firestore/gRPC chain. The new production lockfile audit returned zero known entries.

The ClearBench v1 fixture and oracle are checksum-frozen before measurement. Keep initial
and corrected runner outputs separate. Coverage uses every eligible oracle barrier and
successful apply is scored against the predetermined label and exact Undo.
