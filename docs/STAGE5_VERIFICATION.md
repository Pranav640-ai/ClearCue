# Stage 5 Verification — Interaction Recovery Engine

Date: 2026-11-24
Extension version: **0.5.0**
Environment: Windows, Node v24.21.0, npm 11.19.0, Playwright 1.65.1, Chromium 159.0.8154.6.

This record distinguishes **automated**, **live built-extension**, **measured** and
**unverified/manual** evidence. Nothing below is estimated or copied from an earlier run.

## Summary

| Area | Result |
| --- | --- |
| TypeScript strict build | **PASS** |
| Unit tests | **PASS — 29 files / 240 tests** |
| Production build | **PASS** |
| Browser integration suite | **PASS — 26/26** (6 Stage 2, 7 Stage 3, 7 Stage 4, 6 Stage 5) |
| Stage 5 live built-extension suite | **PASS — 32/32**, zero network requests |
| Recovery performance measurement | **PASS** — measured values below |
| Controlled recovery pilot | **PASS — 15/15 fixtures** |
| Diagnostics page (`verify:extension`) | **PASS** — no page errors |
| Artifact hygiene (`verify:artifacts`) | **PASS** — debug token remains untracked |
| Real cloud inference (`smoke:cloud`) | **PASS** — `in_cloud-confirmed` |
| Stage 4 live regression suite | **PASS — 36/36** |
| NVDA walkthrough | **NOT RUN** — the user has NVDA 2026.3.1; see the guide |

## Unit tests

```
Test Files  29 passed (29)
     Tests  240 passed (240)
```

Stage 5 added 38 tests across seven files:

| File | Tests | Focus |
| --- | --- | --- |
| `src/shared/__tests__/recovery.test.ts` | 6 | dedupe keys, urgency, TTL pruning, view building |
| `src/background/__tests__/recovery.test.ts` | 7 | per-tab acceptance, 20 s duplicate window, replay, dismiss, preference |
| `src/content/recovery/__tests__/classify.test.ts` | 8 | silent errors, summaries, association, other-form isolation, hidden vs aria-hidden |
| `src/content/recovery/__tests__/engine.test.ts` | 8 | debouncing, native validation, interaction correlation, reset |
| `src/content/recovery/__tests__/focus.test.ts` | 3 | live focus, refusal on hidden/stale targets |
| `src/content/recovery/__tests__/announcer.test.ts` | 2 | live-region creation, replayed text |
| `src/panel/__tests__/RecoveryPanel.test.tsx` | 3 | honest labels, disabled Jump, controls |

A regression test was added for the pilot-discovered cross-form defect: a summary inside one form
must not inherit an `aria-invalid` field from another form.

## Build

```
dist/content.js                         64.22 kB │ gzip: 19.52 kB
dist/background.js                      30.76 kB │ gzip:  8.29 kB
dist/assets/panel-*.js                  68.38 kB │ gzip: 19.05 kB
dist/assets/contracts-*.js             304.31 kB │ gzip: 94.69 kB
dist/assets/schemas-*.js                94.93 kB │ gzip: 26.76 kB
```

The content bundle stays at ~64 kB because recovery Zod schemas live in
`src/shared/recoverySchema.ts`, which is not imported by the content script (D-050).

## Browser integration — Stage 5

`npx playwright test tests/e2e/stage5.spec.ts` → **6/6 passed**.

| Test | What it proves |
| --- | --- |
| Silent validation outcome | detected without any visible alert; real field link; focus only on request; field value preserved |
| Accessible live region | announced once through a real live region; identical repeat suppressed |
| Page-owned alert | `role="alert"` + `aria-live="assertive"` comparison yields `announced-by-page`, not a duplicate |
| `aria-hidden` toast | visual toast recovered; sold-out path classified `operation-failure` |
| Ambiguous account summary | `related: null`; no guessed field; no Jump |
| Visual-only success | detected after correction |

`npm run test:e2e` → **26/26 passed** in 45.7 s, including every earlier Stage 2–4 test.

## Live built-extension — Stage 5

`npm run verify:stage5-live` → **32/32 checks passed**, extension `0.5.0`,
`networkRequests = 0`. It loads the real built extension, grants site consent through the real
background message, drives the real panel and content script, and inspects the real panel state.

Checks include:

- no `tabs` permission, minimal permission set, expected version;
- clean start, local-only privacy;
- silent validation detection and an observed message;
- interaction correlation, not page-announced;
- one recorded ClearCue announcement, detection within the latency SLA;
- real live region present, no focus steal;
- latest outcome linked to the correct field;
- Jump focuses the field and the field value is preserved;
- Replay increments the count and writes the live region again;
- Dismiss marks the event dismissed;
- an identical repeat is suppressed;
- the preference turns automatic announcement off;
- a page-owned live region is not duplicated and no ClearCue region is created;
- sold-out failure has `operation-failure` severity/evidence;
- an ambiguous summary has no field and no enabled Jump;
- visual-only success is detected;
- disabling the site clears recovery state;
- **zero network requests** on the whole recovery path;
- no App Check debug token appears in the report.

Report: `artifacts/stage5-live-verification.json`.

## Measured performance

`npm run measure:recovery` — real engine bundle, five runs:

| Measure | Result |
| --- | --- |
| Interaction → detection | 64.64 ms |
| Detection → announcement | 33.76 ms |
| Observer processing | 0.94 ms |
| Idle callbacks on a 1,000-section page | 0 in 1.5 s |
| 100-message burst | 100/100 events, 2 flushes, 3.9 ms |
| 10 identical displays | 1 event |

These include the deliberate 60 ms coalescing and 30 ms live-region write. The engine does not
claim CPU savings from an unmeasured percentage. Report: `artifacts/recovery-performance.json`.

## Controlled pilot

`npm run pilot:recovery` → **15/15 fixtures passed**.

- 12 positive, 3 negative fixtures.
- Precision **1.000**, recall **1.000**, false positives **0**, false negatives **0**.
- Association accuracy **1.000**.
- Recovery action success **1.000** (stale target correctly refused).
- Duplicate announcement rate **0**.
- False announcement for a page-owned region **0**.
- Latency **65.07 ms** average, **79.5 ms** max.

This is a development fixture pilot, not a study with blind participants and not ClearBench.
Report: `artifacts/recovery-pilot.json`.

## Regression checks

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run verify:extension` | PASS — diagnostics loads, no page errors |
| `npm run verify:artifacts` | PASS — `safe-local-only`, token untracked |
| `npm run smoke:cloud` | PASS — `in_cloud-confirmed`, App Check Acquired, cloud text 2.93 s, JSON 3.85 s |
| `npm run verify:stage4-live` | PASS — 36/36, genuine `in_cloud` repair |

The Stage 4 live suite was re-run after Stage 5. One earlier attempt failed with a transient stale
cloud target; the immediate rerun passed 36/36 with no code change. That flake is recorded here
rather than hidden.

## Not verified

- **NVDA/JAWS/VoiceOver behaviour.** The user has NVDA 2026.3.1. The agent did
  not install it. DOM live regions and focus are verified; actual speech is not.
- **Stage 5 on-device/cloud interpretation.** Not implemented by design; all events are
  `source: "observed"`. No model call is made.
- **Real blind participants.** No user study was run.
- **Open-web precision.** Only the 15 development fixtures and the six playground workflows were
  measured.
- **Release App Check.** The custom token endpoint is still not deployed, so only development
  archives can authenticate.

## Stage 5.5 independent rerun

The browser suite adds a native validation workflow with two forms. The test uses a real Chromium
click and verifies that only the submitted form contributes a related field. The repeated-submission
case now checks that a new user interaction can display the same error again. A live verification
assertion checks that pre-created regions remain empty when the page owns the announcement. Network
observation uses Playwright's browser context events after setup, covering page and service-worker
requests visible to Playwright. Known playground page and asset loads are excluded. The final audit
records command outcomes and how the checks differ from live assistive technology.

The same live harness runs with isolated Chromium DNS via `npm run verify:offline`. With
the loopback playground available, it tests the full recovery flow and verifies worker network
failure, diagnostics startup, scanning, deterministic repair, Undo and icon extraction.
See [offline architecture](OFFLINE_ARCHITECTURE.md).
