# Interaction Recovery Engine — Stage 5

Status: **implemented and verified for automated, local-only recovery.** No cloud request is made on
the detection, classification or announcement path. This document describes what runs, what is
measured, and what remains unverified.

## Why this stage exists

Screen-reader users frequently lose the outcome of an action: a form rejects a field without moving
focus or announcing the error, a visual toast appears and disappears, or a page shows success only
as text. ClearCue observes the page **after an interaction**, recognises a likely outcome from page
semantics, and offers recovery actions without taking control of the page.

The engine is deliberately deterministic. Model inference would add latency to the announcement
path and could turn an inaccessible but truthful page message into a fabricated one. Stage 5
therefore ships `source: "observed"` only. The shared contract already accepts `source: "rule"` and
`source: "on_device"` for a later, explicitly reviewed interpretation step; no such call is made
today.

## Event flow

```
interaction (click / Enter / Space / submit / change / focus)
        │
        ▼
InteractionTracker (metadata only, 12 s window, 16 entries)
        │
        ▼
RecoveryEngine MutationObserver (60 ms coalescing, 250 pending records, 80 per flush)
        │
        ├── deterministic classification + live field association
        │
        ▼
RecoveryEvent (local-only evidence, dedupe key, observed announcement mechanism)
        │
        ├── silent outcome → content script announces through a ClearCue live region
        └── page-owned live region → status "announced-by-page", no duplicate announcement
        │
        ▼
background/tabRegistry (chrome.storage.session, per tab, 30 newest, 10 min TTL)
        │
        ▼
panel:getState → RecoveryPanel (latest outcome, history, Jump / Replay / Dismiss, statistics)
```

The background is the only writer of recovery history. The panel never reads storage directly.

## What is observed

The tracker records only:

- a random interaction id,
- kind (`click`, `key`, `submit`, `change`, `input`, `focus`),
- the element reference used for correlation,
- an accessible label (never a typed value),
- a timestamp.

It never records keystrokes, field values, passwords, payment data, clipboard contents, tokens,
typed input, page text beyond the detected outcome message, or browsing history. The tracker must
not be extended to do so.

Detection reacts to:

- newly displayed message containers,
- visible text changes in a message container,
- `aria-invalid`, `aria-expanded`, `aria-busy`, `hidden`, `style`, `role` and `aria-live` changes,
- dialogs (`<dialog open>` and `role="dialog"`),
- native browser `invalid` events from fields in the form associated with a recent trusted activation.

It ignores ClearCue-owned nodes (`data-clearcue-owned`) and visually hidden nodes. `aria-hidden`
alone does **not** hide a visual toast from detection; that is the point of the shopping case.

## Classification and association

Categories: `validation-error`, `error-summary`, `success-confirmation`, `operation-failure`,
`dialog-opened`, `menu-expanded`, `loading-completed`, `status-update`, `uncertain-outcome`.

Announcement mechanisms are recorded independently: `aria-live-polite`, `aria-live-assertive`,
`role-alert`, `role-status`, `dialog-focus`, `native-validation`, `none`. An ancestor `aria-live` is checked before a
role, so a page that exposes both is reported honestly.

Field association is conservative:

| Evidence | Confidence | Result |
| --- | --- | --- |
| `aria-errormessage` or `aria-describedby` points at the message | `direct` | target offered |
| one control in the same `.field-row` / label / fieldset / group / list item | `inferred` | target offered with an inferred caveat |
| several possible controls | `none` | no target, Jump disabled |
| message names two fields, or several invalid fields | `none` | no guess |
| visual toast outside a form | `none` | no unrelated invalid field is imported |

An invalid-field fallback is scoped to the message's own `<form>`. A page-wide toast can never
inherit a registration field from another form; this was found by the Stage 5 pilot and fixed.

## Announcement policy

1. If the page already owns an accessible live region or alert, the event status is
   `announced-by-page` and ClearCue does **not** announce it again.
2. If the user has turned off **Announce outcomes through the page live region**, the status is
   `preference-off` and nothing is written.
3. Otherwise ClearCue writes the message into a hidden `role="status"` (polite) or `role="alert"`
   (assertive) region with `data-clearcue-owned`, then records `announced-by-clearcue`.
4. Identical outcomes within the same interaction are suppressed for 20 s in the background and
   15 s in content. A different interaction can record the same observed outcome again. Outcomes
   without a correlated interaction retain a shared time window.
5. Replay writes the same message again with ` Repeated message.` so the change is observable to a
   live-region user.

Announcements are never delayed for model inference. There is no model call on this path.

## Actions

- **Jump to affected field** focuses and scrolls to the live target, and verifies
  `document.activeElement`. It refuses hidden, disabled, non-focusable or removed targets and
  returns a reason. It never sets a value, submits or clicks.
- **Replay message** writes the outcome again through the page live region and increments replay
  count.
- **Dismiss** hides the latest outcome but does not delete the history immediately.

Focus is only moved after an explicit panel action. ClearCue never steals focus on its own.

## State and lifecycle

- History: `RECOVERY_HISTORY_LIMIT = 30`, `RECOVERY_EVENT_TTL_MS = 10 min`,
  `RECOVERY_DUPLICATE_WINDOW_MS = 20 s`, local dedupe 15 s.
- Stored per tab in `chrome.storage.session`, not local storage.
- Reset when the document id changes or the SPA pathname changes (`sameDocument && samePage`), and
  when the site is disabled.
- `pagehide` stops the engine; disabling a site stops the engine and disposes the live regions.

## Privacy invariants

- Every recovery evidence item is `privacy: "local-only"`.
- No recovery prompt, message, locator or event is sent to Firebase AI Logic or any network endpoint.
- The `verify:stage5-live` run records **zero network requests** on the detection/announcement path.
- The content script reads no form values and no page text beyond the detected message, even when
  correlating an outcome with a field.
- Recovery state is not used to author accessible names or repairs.

## Measured performance

`npm run measure:recovery` — real shipped engine bundle in Chromium, five runs, 2026-11-24:

| Measure | Result |
| --- | --- |
| Interaction → detection | **64.64 ms** average (includes 60 ms coalescing) |
| Detection → live-region write | **33.76 ms** average (includes 30 ms write delay) |
| Observer processing for one outcome | **0.94 ms** average |
| Idle | **0 mutation callbacks** in 1.5 s on a 1,000-section page |
| Burst of 100 unique messages | 100 events, 2 flushes, 3.9 ms total processing |
| Same success message displayed 10 times | **1 event** |

The 60 ms / 30 ms delays are deliberate coalescing and live-region behaviour, not overhead hidden
from the user. Full JSON: `artifacts/recovery-performance.json`.

## Controlled pilot

`npm run pilot:recovery` — 15 labelled development fixtures in Chromium, not a study with blind
users and not ClearBench. 2026-11-24:

| Measure | Result |
| --- | --- |
| Fixtures passed | **15/15** |
| Precision / recall | **1.000 / 1.000** (12 positive, 3 negative) |
| Association accuracy | **1.000** |
| Recovery action success | **1.000** |
| Duplicate announcement rate | **0** |
| False announcement for a page-owned live region | **0** |
| Latency | **65.07 ms** average, **79.5 ms** max |

The pilot includes silent inline errors, summaries, native validation, visual success and failure,
page-owned live regions, dialogs, expanded menus, loading completion, an unrelated mutation, a
duplicate, prompt-injection text, a ClearCue-owned region, an ambiguous summary and a stale jump
target. Full cases: `artifacts/recovery-pilot.json`.

These fixtures are authored by the project. They prove the engine behaves as specified; they do
not prove general precision on the open web.

## Not implemented / not verified

- No Stage 5 on-device or cloud interpretation call. All events are `observed`.
- No iframe or closed-shadow-root recovery.
- No direct NVDA, JAWS or VoiceOver speech verification. The user reports having NVDA 2026.3.1 installed. See
  `docs/STAGE5_NVDA_GUIDE.md`.
- No Context Navigator, ClearBench, or autonomous action. Those remain pending.
- The page may fail to expose any semantic message at all; ClearCue cannot recover text that is
  absent from the DOM (for example a native `window.alert` owned by the browser).

## Verification commands

```bash
npm test
npm run build
npx playwright test tests/e2e/stage5.spec.ts
npm run verify:stage5-live
npm run measure:recovery
npm run pilot:recovery
```
