# ClearCue Stage 4 — verification record

Date: 2026-11-24
Scope: Stage 4 hybrid repair engine. No Stage 5 work was started.

This record separates three kinds of evidence:

1. **Genuine runtime evidence** — the built extension running in Chromium against the real local
   playground and the real Firebase AI Logic cloud endpoint.
2. **Mocked automated tests** — unit tests that inject a fake inference runner to exercise routing,
   validation, budgets and failures. These are labelled mocked; they are not runtime inference.
3. **Unverified / manual** — genuine on-device Gemini Nano and offline behaviour. They could not be
   produced in the automation environment and are not claimed.

## Result summary

| Area | Result | Evidence |
| --- | --- | --- |
| Deterministic repair, no inference | **PASS (genuine browser)** | `verify:stage4-live` check `rule-no-inference`, `rule-source-is-rule` |
| Cloud-generated repair through the real extension pipeline | **PASS (genuine cloud, browser)** | Check `cloud-repair-applied`; source `in_cloud`; label `Search`; HTTP 200 |
| Cloud consent and withdrawal | **PASS (genuine browser)** | `cloud-consent-recorded`, `cloud-opt-out-recorded`, `cloud-off-no-request` |
| Privacy of page text in cloud requests | **PASS (captured request bodies)** | `cloud-request-no-private-data`, `sensitive-text-stayed-local` |
| Destructive abstention | **PASS (genuine browser)** | `destructive-no-inference`, `destructive-unsafe-routing`, `destructive-unchanged` |
| Apply and exact undo | **PASS (genuine browser)** | `cloud-label-visible`, `undo-restores-attribute`, `undo-recorded` |
| Stale target rejection | **PASS (genuine browser, cloud race)** | `stale-routing` = `stale-target`; replacement unchanged |
| SPA restore | **PASS (genuine browser)** | `spa-restores-repair`, `spa-undo-recorded` |
| Site-disable restore | **PASS (genuine browser)** | `disable-restores-repair` |
| Real on-device proposal / offline repair | **BLOCKED / MANUAL** | Playwright Chromium has no `LanguageModel`; branded automation profile reports `unavailable` |
| Screen-reader walkthrough | **NOT RUN** | NVDA not installed; deferred to Stage 5 by instruction |

Live suite result: **36/36 checks passed**
(`npm run verify:stage4-live`, report `artifacts/stage4-live-verification.json`).

## Genuine cloud evidence

The live harness loads `dist/` with a test-only manifest that grants host access only to
`http://127.0.0.1:4318/*`. Site consent is still written through `panel:setSiteEnabled`, and cloud
consent is enabled through the panel's confirmation UI. No consent check is bypassed.

The real run recorded:

- Requested mode: `ONLY_IN_CLOUD` after local unavailability.
- Actual source read from the SDK: **`in_cloud`**.
- Model response: label **`Search`**, evidence `ev:icon`, decision `apply`.
- Validation: document, authorization, issue, live target, role, evidence id and label checks all
  passed.
- Content script: `aria-label="Search"` applied and the accessible name recomputed.
- Cloud latency: **7,571 ms** for that repair attempt.
- HTTP: `200` from the Vertex AI `generateContent` endpoint.
- Cloud-off control: no network request and `cloud-disabled-by-user`.
- Sensitive-context link: a structural-only cloud request was made, but captured request bodies
  contained **none** of `Private case note`, `8842`, `SENTINEL-PRIVATE-8842` or `account.html`. The
  result was an honest `in_cloud` abstention with `insufficient-evidence`.
- Stale case: a real cloud proposal arrived after the element was replaced; `stale-target` was
  recorded and the replacement received no attribute.

The demo text for case 5 originally said "no cloud request". That was inaccurate: cloud escalation
does occur when the local model is unavailable, but only structural evidence travels. The demo has
been corrected to state the actual privacy guarantee.

## Mocked local inference coverage

`src/repair/__tests__/pipeline.test.ts` injects a fake `runInference` runner. These tests are
explicitly mocked and cover:

- forced `ONLY_ON_DEVICE` routing and true-source reporting,
- escalation after local failure while excluding local-only text,
- rejection of a local reply whose actual source is cloud,
- local validation failure and generic labels,
- cloud disabled, cloud budget exhaustion, invented evidence,
- destructive-control non-escalation,
- stale target,
- prompt-injection text,
- an unexpected runner rejection converted to a safe abstention.

No mocked result is written into a production path or presented as a genuine Nano run.

## Performance after optimisation

`npm run measure:scanner` (real Chromium, medians of five runs) after the Stage 4 optimisation:

| Page | Interactive | Initial | Incremental (25 controls) | Debounced update | FP | FN |
| --- | --- | --- | --- | --- | --- | --- |
| Small | 20 | 1.4 ms | 0.6 ms | 264.3 ms | 0 | 0 |
| Medium | 200 | 17.0 ms | 1.6 ms | 272.4 ms | 0 | 0 |
| Large | 1,000 | 404.8 ms | 14.5 ms | 925.2 ms | 0 | 0 |

The large-page initial scan dropped from **1,390.7 ms to 404.8 ms** (about 3.4× faster). Changes:

- structural locators now use indexed `nth-child` instead of a sibling walk per control;
- `label[for]` text is indexed once per full scan instead of querying the document per field;
- the computed role is reused;
- hidden controls no longer pay accessible-name and path costs.

Legacy `nth-of-type` locators still resolve for repair requests created before this change.

## Commands run

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 22 files, 202 tests |
| `npm run build` | PASS — `dist/content.js` 43.93 kB (gzip 13.73 kB) |
| `npm run test:e2e` | PASS — 20/20 |
| `npm run verify:stage4-live` | PASS — 36/36, genuine cloud |
| `npm run smoke:cloud` | PASS — `in_cloud-confirmed` |
| `npm run verify:extension` | PASS — no page errors |
| `npm run verify:artifacts` | PASS — `safe-local-only` |
| `npm run measure:scanner` | PASS — numbers above |
| `npm run pilot` | PASS — controlled 24-case pilot, no inference |

## Environment limits

- Playwright's bundled Chromium **159.0.8154.6** has no `LanguageModel` global.
- Branded Google Chrome **158.0.8127.89** exposes `LanguageModel` in the automation profile, but
  `availability()` reports `unavailable`; `chrome://on-device-internals` could not make the model
  usable for that profile.
- Therefore no `ON_DEVICE` result is claimed from automation.
- The native Chrome host-permission prompt cannot be automated. The live harness uses a test-only
  manifest grant for the local origin while keeping every ClearCue consent check active.

## Post-verification defect (0.4.2)

The first user manual run exposed a local routing defect that automation could not see: the local
repair prompt echoed a structural issue id longer than the 60-character contract limit, so an
otherwise valid on-device proposal failed schema parsing and was reported as a deterministic
abstention. The fix uses short local aliases (matching the existing cloud prompt), preserves the
original `on_device` source and measured inference time on failures, and changes demo case 2 to an
evidence-supported bell control. Regression tests cover the long id, no-proposal reporting and demo
evidence.

A repeat live run against the 0.4.2 build passed **36/36** again, with a genuine `in_cloud` repair in
4,031 ms. This section is **not** an on-device verification claim. Genuine on-device and offline
runtime evidence remains the manual section below.

## Manual verification still required

See `docs/STAGE4_MANUAL_VERIFICATION.md`. It covers only the genuinely unavailable paths: a real
on-device proposal and offline operation in the user's regular Chrome. Everything else has genuine
browser evidence above.

## Stage 5.5 independent rerun

The runtime now has a compact Nano proposal contract. Unit tests exercise alias mapping, per-issue
cloud citations, stale target checks, automatic rule-only routing and source mismatch with inference
doubles. Genuine App Check and cloud text and JSON diagnostics were reproduced. A production cloud
repair initially received HTTP 200 with the SDK source `in_cloud` and failed schema validation.
See the [audit](STAGE5_5_INDEPENDENT_REVIEW.md) for the final rerun. Genuine local diagnostics and
earlier production abstentions were reported by the user. Successful Nano application and verified
offline execution remain open.

The revised verifier uses exact issue and repair IDs and waits for the same issue's result. The
final run passed **38/38** checks, including explicit Undo of the genuine cloud repair, restoration
of the original absence of its label and persistence of that exact repair's undo record.

The Stage 5.5 offline variant verifies rule repair and Undo without external DNS, plus extraction
of bounded PNGs in the actual extension. Tests inject model doubles for local text and visual
request contracts, refusal, and independent cloud text fallback. Actual visual Nano output and
visual label application remain pending in regular Chrome. See [visual verification](STAGE5_5_MULTIMODAL.md).
