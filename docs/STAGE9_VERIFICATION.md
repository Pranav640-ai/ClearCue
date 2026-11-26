# Stage 9 · Integrated engineering verification

Run `npm run build` and `npm run verify:stage9-live`. The verifier starts an isolated Chromium
profile and grants only the loopback fixture origin through a test copy of the manifest. The
production site-consent path still runs. DNS egress is blocked, and a service-worker fetch verifies
the isolation. The report is `artifacts/stage9-live-verification.json`.

## Scholarship application

1. Run `npm run playground` and open `http://127.0.0.1:4318/recovery.html`. Keep the accessible
   comparison off. The Help icon begins unnamed, and validation is visual only.
2. Enable ClearCue on the site and repair the individual Help issue. Check the new accessible
   name and the Rule source. The local rule uses corroborating SVG text.
3. In Context Navigator, type “Where can I enter my registration number?” Choose **Move focus**
   for Registration number. Enter `BAD` and `candidate@example.test` in the demo form.
4. Press **Continue application** yourself. Check the observed error, the ClearCue announcement
   status and the linked field. Choose **Jump to affected field**. The original value is preserved.
5. Change the number to `NF-12345` and press **Continue application**. The actual fixture shows
   **Registration accepted** and example ID `NF-2026-0481`. ClearCue records the visible success.
6. Reload to repeat. Turn on the accessible comparison to hear the page's own feedback in the
   manual NVDA run. ClearCue records that the page owns the announcement.

All 48 integrated Chromium checks passed, including eight scholarship checks and zero unexpected
application HTTP requests. Evidence includes the browser's role/name query, DOM focus, live-region
text and the real fixture's success state. A first run exposed a timing-dependent harness
assertion on repeated submission. The verifier now waits for the reset and actual new event.

## Short companion demonstrations

- **Shopping** on the same recovery page. Try the sold-out product. Read the actual failure
  under Interaction Recovery and observe that ClearCue reports an error.
- **Account settings** on the same page. Save with both fields invalid and notice that the
  ambiguous error gets no Jump target. Correct both manually and save to show the real
  confirmation. The Stage 5 live suite exercises both flows.

## Boundaries

The final regression passed typecheck, 259 unit tests, the production build, 27 Chromium
tests, the diagnostics verification, live cloud smoke, 32 Stage 5 checks, 52 Stage 6 checks,
40 offline checks, artifact verification and the frozen ClearBench cohort. The scanner and
recovery performance commands and both development pilots also completed. The recovery pilot
passed 15/15 cases. The Stage 9 scanner measurement recorded 289 ms initial and 4.5 ms
incremental at 1,000 controls. The recovery measurement recorded 64.94 ms detection and
34.24 ms from detection to the live-region update.

The fresh Stage 4 run rejected a genuine schema-invalid response. A retry applied and
undid a genuine cloud repair, then the model returned no eligible proposal for the
replaced control. The verifier now waits for the actual request before replacing the
control and records either safe abstention or explicit stale-target rejection. The
deterministic browser regression separately exercises replacement and conflict handling.
The final Stage 4 rerun passed 38/38, including a genuine cloud repair, exact Undo and
observed stale-target rejection.

The test does not drive Chrome's normal host-consent dialog, physical shortcuts, microphone input
or NVDA speech. Use the clean release installation instructions and regular Chrome profile for
those checks. Cloud smoke and Stage 4 evidence use the configured development build and record
the SDK's actual `IN_CLOUD` source. The offline scholarship run uses Rules only. Local Nano
availability is inspected in the browser suites, and successful Nano text, visual, offline and
GPU-specific runs remain manual.
