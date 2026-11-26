# ClearCue — Architecture

Public and configured submission builds use Vite production mode. Typed practice,
page live regions and Recovery Replay remain available. Local speech synthesis,
recognition and practice command activation are restricted to the explicit
`experimental` Vite mode used for development.

The first-run introduction is an inline panel region and links to the existing bundled
practice page. Completion, explanation detail, local voice and speech rate are extension
settings. The panel keeps only the last explicitly spoken ClearCue message in memory for
the current page. Each read or repeat uses a currently available, explicitly assigned
browser voice whose `localService` flag is true. A page change or hidden panel clears the
utterance and repeat text. Proactive Recovery announcements continue through the existing
page live-region policy.

Guided Navigator keeps the active goal, proposed next step and last eight ClearCue focus
targets in panel memory for the current tab and document. A continuation refreshes native
validity flags against the existing snapshot so an explicit focus request can still use
the original element identity. Form grouping uses snapshot-local IDs for actual form owners.
The Context Lens shortcut uses the same current-tab, site permission and document checks
as Navigator, then writes its description through the existing Recovery announcer.
Recovery records trusted native select changes as metadata without reading the option
value or duplicating native feedback. Existing semantic dialog and status detection is shared.

The bundled command practice page reuses the Navigator resolver and Recovery announcer.
Its single-use action gate holds direct references to extension-owned controls, and it
exposes no action message to content scripts or websites. Read-only command interpretation
and option descriptions remain available through the regular Navigator route.
[Activation architecture](STAGE6_ACTIVATION.md)

Stage 1 proved hybrid inference. Stage 2 added the extension foundation, shared domain contracts,
side panel and playground. Stage 3 added deterministic detection and evidence. **Stage 4 adds the
adaptive hybrid repair pipeline, a single validation gate, reversible DOM application and undo.**

## Runtime shape

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Chrome extension (MV3)                                                       │
│                                                                              │
│  background.js (service worker)                                               │
│    · typed message router (Zod-validated, sender-checked)                      │
│    · tab lifecycle bookkeeping (chrome.storage.session)                        │
│    · dynamic per-origin content-script registration                            │
│    · side panel + command handling, action badge                               │
│    · NO inference (Prompt API needs a document)                                │
│                                                                              │
│  panel.html (React side panel)          diagnostics.html (extension document) │
│    · branding, site status                · Firebase runtime + App Check       │
│    · enable/disable per origin            · six hybrid inference checks         │
│    · privacy + cloud opt-in               · actual response.inferenceSource     │
│    · scan + repair sections               · Initialize Local AI (user gesture)  │
│    · model readiness, budgets, undo       · no page content is ever used        │
│    · runs inference in this document      · diagnostics only                     │
│         │                                            │                        │
│         └──────── chrome.runtime messages ───────────┘                        │
│                              │                                               │
│                     ┌────────▼─────────┐                                     │
│                     │ background.js    │                                     │
│                     │ · routes & stores│                                     │
│                     │ · no inference   │                                     │
│                     └────────┬─────────┘                                     │
│   bg:requestScan / applyRepair / checkTarget / undoRepair / siteDisabled      │
│                     ┌────────▼──────────────┐                                 │
│                     │ content.js (per origin)│  ← registered only after       │
│                     │ · scanner + evidence   │    the user grants access      │
│                     │ · validation/target    │                                │
│                     │ · applies + undoes    │                                │
│                     │ · never reads values   │                                │
│                     └────────────────────────┘                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

Inference remains in extension documents: the panel and diagnostics page. The service worker routes
messages and stores state; it never runs a model. The content script never runs inference either: it
scans, validates live DOM state and applies or restores attribute changes.

## Module map

### Shared domain (`src/shared/`)

| Module | Responsibility |
| --- | --- |
| `types.ts` | The product vocabulary: issues, evidence, repairs, decisions, interaction/recovery, inference result, privacy policy, settings, tab context, panel state. |
| `settings.ts` | Defaults, storage schema, `mergeSettings` invariants, cloud-purpose checks. |
| `sites.ts` | Origin normalisation, match patterns, stable content-script ids, enablement records, truthful tab status. |
| `privacy.ts` | `selectCloudEvidence` / `isCloudEligible`: the only place that decides whether page evidence may leave the device; redaction + hard character budget. |
| `scan.ts` | Stage 3 contracts: categories, evidence kinds/privacy, deterministic candidates, issue/summary/counts, limits, per-tab scan state. |
| `messages.ts` | Zod schemas for panel and content messages, typed request/response unions, `ApiResult`. |
| `repair.ts` | Stage 4 contracts: routing reasons, proposals, attempts, suggestions, statistics/view, apply/undo requests, snapshots. |
| `recovery.ts` | Stage 5 contracts and pure helpers: categories, mechanisms, evidence, event/view/statistics shapes, dedupe key, urgency, TTL pruning. |
| `recoverySchema.ts` | Stage 5 Zod schemas kept out of the content bundle so `content.js` does not ship Zod. |

### Repair engine (`src/repair/`)

| Module | Responsibility |
| --- | --- |
| `validation.ts` | The single validation gate for all sources. Destructive safety gate runs first; deterministic checks and heuristic notes are stored separately. |
| `prompts.ts` | Builds local and cloud prompts. Local may use all evidence; cloud only through `selectCloudEvidence()`, with issue aliases, redaction and the configured character budget. |
| `pipeline.ts` | `HybridRepairPipeline.plan()`: deterministic candidates -> on-device batch -> consented cloud escalation, with timeouts, batch size, budgets and actual-source checks. |

### Repair contracts and content (`src/inference/repairContracts.ts`, `src/content/repair/`)

| Module | Responsibility |
| --- | --- |
| `repairContracts.ts` | Zod + Firebase `Schema` + on-device JSON Schema constraint for one proposal contract; the system instruction treats page content as untrusted. |
| `content/repair/target.ts` | Locator resolution (including open shadow roots), exact attribute snapshots, live capture, accessible-name verification, apply and undo with conflict detection. |
| `content/contentScript.ts` | Tracks applied repairs per document, applies only after a live snapshot match, restores on undo/disable/SPA navigation and reports restored/conflicted ids. |

### Recovery engine (`src/content/recovery/`, `src/shared/recovery.ts`)

| Module | Responsibility |
| --- | --- |
| `recovery.ts` | Pure event model and helpers; no DOM and no Zod. |
| `content/recovery/interactions.ts` | Metadata-only interaction tracker (id, kind, label, time); ignores ClearCue-owned nodes. |
| `content/recovery/classify.ts` | Deterministic outcome classification, announcement-mechanism detection, conservative field association, native validation. |
| `content/recovery/engine.ts` | Bounded debounced `MutationObserver`, native invalid-event capture, interaction-scoped dedupe, metrics, reset. |
| `content/recovery/announcer.ts` | Hidden `role=status`/`role=alert` regions with replay-visible writes. |
| `content/recovery/focus.ts` | Explicit-request focus recovery with live target checks; never changes values. |
| `background/recovery.ts` | Per-tab acceptance, 20 s duplicate window, announcement status, replay/dismiss, 30-event history. |

### Background (`src/background/`)

| Module | Responsibility |
| --- | --- |
| `serviceWorker.ts` | Entry point: installs the router, tab lifecycle, side panel behaviour and commands. |
| `router.ts` | Message handling, sender validation, panel state assembly, enable/disable flow, badges. |
| `storage.ts` | Typed access to `chrome.storage.local` (settings, sites, activity, repairs) and `.session` (tab state). |
| `tabRegistry.ts` | Pure tab-state reducer: accept/reject content snapshots, invalidate on navigation, document identity, recovery reset on document/SPA change. |
| `recovery.ts` | Stage 5 per-tab event acceptance, dedupe, announcement status, replay count, dismiss and clear. |
| `scriptRegistry.ts` | Host permission checks, register/unregister/inject the content script per origin, startup re-registration. |

### Panel (`src/panel/`)

| Module | Responsibility |
| --- | --- |
| `main.tsx` | React root, imports the panel stylesheet. |
| `PanelApp.tsx` | Layout and sections; composes the presentational components. |
| `usePanelState.ts` | Single controller: initial load, 3 s polling while visible, enable/disable with a user-gesture permission request, per-origin revocation, settings, undo, diagnostics; skips a poll while a mutation is in flight. |
| `useRecovery.ts` | Jump/replay/dismiss controller and the automatic-announcement preference. |
| `client.ts` | Typed `chrome.runtime.sendMessage` wrapper that normalises every failure shape. |
| `components/StatusPanel.tsx` | Site/page facts, status badge, the reason in text, enable/disable buttons. |
| `components/PrivacyPanel.tsx` | Mode badge, never-sent list, two-step cloud opt-in and revert. |
| `components/ScanPanel.tsx` | Real scan counts, issue list with evidence and candidate status, Scan Again, empty/error states. |
| `components/RecoveryPanel.tsx` | Latest outcome, field link, announcement status, replay/dismiss, history, statistics and preference. |
| `components/Section.tsx` | Labelled region + pending badge. |
| Site access list (in `PanelApp.tsx`) | Every enabled origin, consent time and a Disable action for any origin, not only the active tab. |
| `panel.css` | Warm off-white palette, forest accents, focus-visible rings, reduced-motion and forced-colors support. |

### Content (`src/content/`)

| Module | Responsibility |
| --- | --- |
| `contentScript.ts` | Guarded single-instance inspector and recovery host: hello/page-changed/scan replies, recovery event reporting, ClearCue live regions, explicit focus recovery, stop on disable/`pagehide`. |
| `recovery/` | Stage 5 interaction tracker, classifier, engine, announcer and focus recovery (see above). |
| `scanner/dom.ts` | Read-only DOM helpers: accessible name via `dom-accessibility-api`, role/tag/visibility/disabled facts, bounded element collection, nth-of-type locators with a shadow-root marker, destination sanitising. |
| `scanner/rules.ts` | Deterministic detection rules; one issue per `category:path`; naming relationships before generic missing-name rules. |
| `scanner/evidence.ts` | Builds inert, classification-tagged evidence; refuses prohibited content. |
| `scanner/candidates.ts` | Conservative candidate proposals: associated label, reference repair, authored icon name, link context; abstains on conflicts/duplicates/destructive actions. |
| `scanner/scan.ts` | `AccessibilityScanner`: full/incremental scans, dependency map, stale-element removal, stable sort, bounded summary. |
| `scanner/observer.ts` | Debounced `MutationObserver`: bounded queues, shadow roots, label/`aria-labelledby` dependencies, ClearCue-owned mutation skip, full-scan fallback. |

### Inference (`src/inference/`) — unchanged from Stage 1

`config.ts`, `firebase.ts`, `engine.ts`, `engineInstance.ts`, `contracts.ts`, `schemas.ts`,
`validation.ts`, `errors.ts`, `deviceOptions.ts`, `deviceCapability.ts`, `diagnostics.ts`.
See the Stage 1 request flow below; it is still the only inference implementation.

## Message protocol

All messages are validated at the background boundary. Unknown kinds, extra fields and malformed
payloads are rejected. Payloads never carry a trusted tab id; the background always uses
`sender.tab.id`.

| Direction | Message | Purpose |
| --- | --- | --- |
| panel → background | `panel:getState` | Full `PanelState` for the active tab. |
| panel → background | `panel:setSiteEnabled` | Persist enablement, register/unregister, inject, withdraw permission. |
| panel → background | `panel:updateSettings` | Merge a validated patch, persist, return fresh state. |
| panel → background | `panel:undoRepair` / `panel:undoAllRepairs` | Exact-state undo; refuses when the page changed the attribute. |
| panel → background | `panel:openDiagnostics` | Open `diagnostics.html` in a tab. |
| panel → background | `panel:rescan` | Ask the connected content script for a fresh scan; stores it only when the document id matches. |
| background → content | `bg:requestSnapshot` | Ask for fresh page facts. |
| background → content | `bg:requestScan` | Force a full scan on the connected document. |
| background → content | `bg:siteDisabled` | Stop reporting; the user withdrew access. |
| content → background | `content:hello` / `content:pageChanged` / `content:snapshot` | Report minimal page facts. |
| content → background | `content:scan` / `content:scanError` | Report a validated scan summary, or the real failure. |
| content → background | `content:recovery` | Report a local-only recovery event for the current document. |
| content → background | `content:recoveryAnnounced` | Truthful outcome of a ClearCue live-region write. |
| panel → background | `panel:focusRecovery` / `panel:replayRecovery` / `panel:dismissRecovery` | Explicit recovery action for a specific event id. |
| background → content | `bg:focusRecovery` / `bg:announceRecovery` / `bg:recoveryStop` | Focus only on request, replay through the live region, stop recovery. |

Responses are `{ ok: true, data }` or `{ ok: false, error, code }`. The panel never treats a
missing or malformed response as success.

### Sender validation

- Panel requests: `sender.id === runtime.id` **and** `sender.url` begins with this extension's
  origin. The panel may run in the side panel or as a normal tab; identity comes from the URL, not
  from the absence of a tab.
- Content messages: `sender.id === runtime.id` and `sender.tab.id` is present.
- Content messages are additionally rejected when the origin is no longer enabled, or when the
  snapshot does not match the tab's current origin + pathname (stale document).

## Storage

| Key | Area | Contents |
| --- | --- | --- |
| `clearcue.settings.v1` | local | `ExtensionSettings` (privacy mode, opt-in time, diagnostics switch, budget). |
| `clearcue.sites.v1` | local | `Record<origin, SiteAccess>`. |
| `clearcue.activity.v1` | local | Counters; `updatedAt` is null until something real happens. |
| `clearcue.repairs.v1` | local | `AppliedRepair[]`; currently always empty. |
| `clearcue.tab.v1.<tabId>` | session | `StoredTabState` (document id, connected flag, last snapshot, `TabScanState`, `TabRecoveryState`). |

Session storage is cleared by Chrome on restart, which is the desired behaviour: a tab context is
never trusted across browser sessions.

## Enablement flow (with truthful failure modes)

1. Panel asks for the origin from the background state. No origin ⇒ no action.
2. Panel calls `chrome.permissions.request({ origins: ["<origin>/*"] })` inside the click gesture.
   If Chrome declines, the panel says so and nothing else happens.
3. Background re-checks `chrome.permissions.contains`, registers the per-origin content script,
   persists the site record, and injects into the current tab when it matches.
4. Content script reports `content:hello`; the background stores the snapshot and sets the badge.
5. Disable: unregister the script, persist `enabled: false`, tell the tab to stop, clear tab state,
   then `chrome.permissions.remove`. Every step is safe to repeat.

## Privacy enforcement

`selectCloudEvidence(evidence, settings, purpose)` is the only sanctioned decision point:

- `purpose: "page-evidence"` requires `privacyMode === "cloud_allowed"` **and** a recorded opt-in.
- Only evidence flagged `cloudSafe` is considered; obvious emails/card digits are redacted.
- The configured character budget is a hard cap; if nothing fits, the answer is “not allowed”.
- `purpose: "diagnostics"` is independent, limited to hand-written fictional prompts, and can be
  switched off.

No Stage 2 feature sends page content anywhere. The policy exists so Stage 3 cannot bypass it.

## Build and packaging

Two Vite builds run in sequence:

1. `vite.config.ts` — `panel.html`, `diagnostics.html`, `background.js` (module service worker),
   relative asset paths, `target: chrome139`, no remote code.
2. `vite.content.config.ts` — `content.js` as a self-contained IIFE, because MV3 content scripts
   cannot use ES module imports.

The side panel is opened only from an explicit action click or keyboard command, which is what
grants `activeTab`. Implicit `openPanelOnActionClick` behavior is disabled because it does not count
as invoking the extension and leaves `tab.url`/`tab.title` hidden.

`public/manifest.json` is copied verbatim. Permissions: `storage`, `sidePanel`, `activeTab`,
`scripting`. Host access is **optional** (`https://*/*`, `http://*/*`) and requested per origin.
CSP: `script-src 'self'; object-src 'self'`.

## Playground

Static, build-free site under `playground/`, served by `scripts/serve-playground.mjs`
(`npm run playground`, port 4318). Each page is plain HTML/CSS/JS with fictional data, working
interactions and a documented defect list. Defects carry `data-defect="D-xx"` attributes so tests
and reviewers can locate them. See `playground/README.md`.

## Testing layers

| Layer | Tool | What it proves |
| --- | --- | --- |
| Pure logic | Vitest (`src/**/__tests__`) | Settings invariants, site status, privacy policy, message validation, stale-snapshot rejection, inference validation. |
| Real extension | Playwright (`tests/e2e`) | Manifest loads, panel renders all sections, cloud opt-in round-trips through the background, no content script before consent, content script reports real counts and survives double injection / SPA navigation. |
| Cloud smoke | Playwright (`scripts/cloud-smoke.mjs`) | Real App Check token request plus the two cloud diagnostics; reports the exact verdict and blocks completion when App Check or the API refuses. |
| Manual | checklist in `docs/PROGRESS.md` | Chrome permission prompt, screen-reader walkthrough, live Firebase/Nano inference. |

## Stage 1 inference request flow (unchanged)

1. User activates a diagnostic.
2. `HybridInferenceEngine.run(request)` builds `HybridParams` (mode, on-device `createOptions`,
   JSON Schema constraint for structured tasks, cloud model + generation config).
3. `getGenerativeModel(ai, params).generateContent(prompt)` runs through Firebase AI Logic.
4. The engine reads `result.response.inferenceSource`; absent ⇒ `unknown`, never the requested
   mode.
5. Structured output is parsed and validated with Zod; accessibility proposals get deterministic
   evidence checks (real evidence ids, citation minimums, generic-label rejection, valid abstention).
6. The UI shows requested mode, actual source, latency, model, raw text, validation and hints.

## Known constraints

- On-device inference requires Chrome 139+ desktop, the Prompt API flag, a capable device and a
  downloaded model.
- AI Logic enforces App Check; reCAPTCHA Enterprise cannot load under MV3 CSP, so release uses a
  custom token endpoint.
- `countTokens` is unsupported on the hybrid path.
- Chrome's native permission prompt is not automatable, so it stays a manual check.
- The panel polls state every 3 s while visible; there is no push channel in this stage.

## Stage 3 scan flow (implemented)

1. The content script starts once per document, announces itself, then runs a full scan.
2. `AccessibilityScanner` collects interactive elements (bounded), computes names, applies rules and
   candidate logic, and returns a `ScanSummary` whose URL is origin + pathname only.
3. The summary is sent as `content:scan`; the background stores it in session tab state only when
   the document id and pathname match the current tab. Stale summaries are rejected.
4. The panel reads `state.scan` through the normal `panel:getState` path and renders counts, issue
   rows, evidence (local-only marked) and candidate status. Stage 3 leaves repair counts untouched;
   Stage 4 updates them only when a repair is actually applied.
5. `ScanObserver` batches mutations (250 ms), re-evaluates only affected elements or dependents of a
   changed label/reference, and falls back to a bounded full scan when queues overflow.
6. `panel:rescan` forces a full scan of the connected document; `bg:siteDisabled` stops the
   observer and clears the scanner.

## Stage 4 repair flow (implemented)

1. The user presses **Repair** (one issue) or **Repair all**. The panel asks the background for a
   fresh `panel:checkTarget`; a replaced or renamed target stops the attempt.
2. `HybridRepairPipeline.plan()` handles issues in chunks of four. Deterministic candidates become
   `rule` proposals. Everything else is batched with `ONLY_ON_DEVICE` (60 s); the reply's
   `response.inferenceSource` must be `on_device`. An unexpected runner rejection becomes an
   abstention, never an unhandled error.
3. A failed, unavailable or invalid on-device result may escalate only when
   `privacyMode === "cloud_allowed"`, `cloudOptInAt` is set and the per-document cloud budget is not
   exhausted. `buildCloudPrompt()` passes evidence through `selectCloudEvidence()` and replaces issue
   ids with aliases; the request uses `ONLY_IN_CLOUD` with a 45 s timeout.
4. Every proposal - rule, device or cloud - goes through `validateRepair()`. The destructive check
   runs first. Deterministic failures reject; medium ambiguity or risk downgrades "apply" to
   "suggest". Every outcome records a routing reason.
5. `panel:repairApply` re-checks the document id and live element, then `bg:applyRepair` compares the
   captured attribute snapshot, recomputes the accessible name and applies only `aria-label`.
   Verification failure rolls back. The background logs the repair with its previous state.
6. Undo (`panel:undoRepair`, `panel:undoAllRepairs`) refuses if the page changed the attribute and
   returns `conflict: true`. Disabling a site or a SPA navigation restores ClearCue-owned repairs and
   reports restored ids so history stays truthful.
7. Statistics are derived from logs, not request counts: a repair counts only when applied;
   inference counts only successful calls with a known source.

## Stage 5 recovery flow (implemented)

1. Every interaction with a button, link, field, menu item, tab, switch, checkbox or form is
   recorded by `InteractionTracker` with metadata only: id, kind, accessible label, element and
   time. Values, keystrokes, passwords, payment data and history are never read.
2. `RecoveryEngine` observes child/text/attribute changes after the interaction, coalesces for
   60 ms, and bounds work to 250 pending records / 80 per flush. It ignores `data-clearcue-owned`
   nodes and never reacts to its own live-region writes.
3. `detectRecoveryOutcomes()` classifies visible messages deterministically and records the
   existing announcement mechanism. `associateRecoveryTarget()` links a field only for an explicit
   `aria-errormessage`/`aria-describedby` reference or a single control in the same group. Several
   candidates, several invalid fields, or an invalid field in another form produce `related: null`
   and no Jump. The invalid-field fallback is scoped to the message's own form.
4. The content script sends `content:recovery`; the background accepts it only for the current
   document id and comparable URL. History is per-tab, deduplicated by
   document, interaction, category, locator and normalised text for 20 s, capped at 30 events with a 10 min TTL.
5. If the page owns a live region the status is `announced-by-page` and ClearCue writes nothing.
   If the preference is off the status is `preference-off`. Otherwise the content script writes a
   hidden polite/assertive live region and reports `announced-by-clearcue` or the real failure.
6. **Jump** resolves the live locator, refuses hidden/disabled/non-focusable/stale targets and calls
   `focus()` only. It never changes a value or submits. **Replay** writes the message again with a
   visible suffix; **Dismiss** hides the latest event.
7. Recovery state is cleared when the document or SPA path changes and when a site is disabled.
   No recovery event leaves the device, and no model is called on this path.

## Planning boundaries for Stage 6 (not built)

- Context Navigator: focus/announce candidate controls for a goal, never click or submit.
- ClearBench: recorded fixtures for measured evaluation, separate from the development pilot.
- A reviewed Stage 5 model-interpretation step, if evidence shows deterministic classification is
  insufficient. It must not delay announcements.
- Screen-reader walkthrough results (NVDA/JAWS/VoiceOver) and a deployed release App Check endpoint.

## Stage 5.5 changes

The panel refreshes document, tab, URL and settings around repair planning and checks current consent
before cloud dispatch. Target checks carry ClearCue's document ID. Automatic repair stops at the rule
gate even if a rule proposal is rejected. The Firebase engine's model cache includes the actual
schema in its key. The request timeout aborts supported cloud transport and discards late results.
The current Firebase adapter can keep a Nano call running after the UI timeout. A panel retains
its local slot until the SDK promise settles.

The content script keeps the original element and validates naming snapshots before writing.
Undo uses that retained element and the recorded attribute state. Script-driven synthetic DOM
events do not provide interaction IDs. Native validation observes scoped `invalid` events.
Content-originated writes and tab lifecycle updates are serialized per tab. Some panel-side
storage updates still require transactional review. Recovery pre-creates its live regions and
queues DOM writes. DOM updates and page semantics are the observable announcement evidence.

### Offline isolation and the local visual route

The panel may request an isolated icon for a single user-selected issue after the text-plus-image
capability probe. The background binds extraction to the active, authorized document and forwards
the request to its top frame. The content script generates a 96 × 96 PNG from passive inline SVG
geometry. The panel passes only inline PNG to Firebase in forced local mode. The response enters
the common validation gate, can only become a suggestion, and needs supporting text. Images have
no persistent representation and do not enter the text-only cloud gate.

Opening the diagnostics document probes local capability without obtaining an App Check token.
An explicit connection check or cloud dispatch requests a token on demand. App Check provider
initialization failures leave forced local SDK access and the deterministic core independent.
See [offline architecture](OFFLINE_ARCHITECTURE.md) and [local visual repair](STAGE5_5_MULTIMODAL.md).

## Context Navigator

The top-frame content script builds one bounded ephemeral overview per document and holds live
element references behind opaque snapshot and candidate IDs. The panel ranks bounded names,
roles, form labels and headings deterministically. The worker rechecks the active tab and the
granted origin before forwarding a focus request. The content script rechecks the document URL,
original element, current semantics and availability before focusing. Goal text stays within the
panel. Optional Nano reranking uses forced local Firebase AI Logic and permits only known IDs.
Microphone input requires an available local speech pack and the browser's local processing mode.

## Release trust boundary

Browser top-frame document metadata binds content senders and navigation, repair, and Undo
destinations. A same-document re-handshake may temporarily use the top frame until a validated
content event supplies the browser document identifier. Diagnostics has a narrow settings
request and checks the live cloud-diagnostics preference before token exchange or cloud dispatch.
The release build compiles empty Firebase project configuration and packages license notices.

ClearBench loads its frozen oracle from a separate local harness. The content script and
Firebase prompts have no path to the expected outputs. The harness records all observations
from the actual MV3 runtime and creates an accessible static comparison chart.
