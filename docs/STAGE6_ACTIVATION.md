# Stage 6 supplement · User-directed activation

Context Navigator distinguishes information, search, explicit focus, activation attempts and
consequential requests. Third-party websites receive focus assistance. Their DOM can describe a
control and available choices, but its role, name and icon do not establish what event handlers
will do. ClearCue abstains from dispatching activation on those pages and offers manual focus.

## Offline practice

Open **Practice voice and text commands** in Context Navigator. This bundled Chrome extension
page contains a fictional catalogue and has an opt-in checkbox for the current tab. The focus
and explanation commands work with the checkbox off.

1. Submit “Give me a page overview”, then “Take me to the sorting options”.
2. Submit “What are my options?” and review the actual choices.
3. Enable activation. Submit “Select the second option” or “Select price from low to high”.
   Verify that the selected option changes and Pencil set becomes the first product.
4. Try “Open the options menu”, “Open product help” and “Collapse product help”.
   Inspect the actual disclosure state and outcome.
5. Try “Open help”, which has two matches. Focus one or choose **Cancel command**. A choice
   resolves focus only. Submit a new explicit action if you intend to activate it.
6. Try “Submit my application”. The requested action is blocked. Disable activation to return
   to focus-only practice.

Optional on-device recognition uses push-to-talk with Stop and Cancel. A usable finalized
transcript goes into the editable command field. Review it and explicitly submit. An uncertain
transcript asks for another attempt. Typed commands work without a speech pack or internet.

## Execution boundary

An explicitly submitted command on the visible top-level bundled extension page creates one
short-lived authorization object. A single-use gate verifies the trusted gesture, per-tab opt-in,
document, expiry, snapshot, existing candidate identity, visibility and supported capability.
The capability registry keeps direct references to bundled native controls and their owned
behavior. Cloned, replaced, disabled and regrouped targets fail validation. No generic click,
model-supplied selector or website activation message exists.

An authorized disclosure changes the native `open` property. Sorting changes a specific
native option and orders the bundled product rows. The result reports observed state only
after verifying the selection and rendered order. An uncertain result remains uncertain.
The Recovery live-region announcer speaks verified outcomes and blocked states once.
Practice history holds at most eight outcomes in tab memory. Commands, targets, audio and
transcripts stay local. The command path uses deterministic processing.

## Evidence

Run `npm run typecheck`, `npm test`, `npm run build:release` and
`npm run verify:activation`. The isolated Chromium report is
`artifacts/activation-verification.json`. The development workflow covers successful
disclosure and sorting, passive focus and inspection, cancellation, opt-in, a blocked
submission and chained command, synthetic submissions, and an untrusted web button
whose click handler would otherwise run. Policy tests exercise replay, document binding,
expiration, target replacement and unconfirmed outcomes. The voice draft tests exercise finality
and confidence without a real microphone. [Supplementary ClearBench cohort](CLEARBENCH_REPORT.md)

## Manual NVDA and voice verification

Use a regular Chrome profile and open NVDA's Speech Viewer as described in
[Stage 6 verification](STAGE6_VERIFICATION.md). With keyboard input, hear the current
control and available options in the practice page, submit an authorized command, and
listen for the verified outcome. Check ambiguity, a blocked submission, Cancel, and
opt-out. If Chrome reports local English speech ready, start recognition, speak one
command, stop, review the finalized text and submit. Repeat with Cancel before
submission and confirm the control stays unchanged. The automated evidence covers
live-region contents and actual Chromium state. NVDA speech and microphone
transcription remain manual checks.
