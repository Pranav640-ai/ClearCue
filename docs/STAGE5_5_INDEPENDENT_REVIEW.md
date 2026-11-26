# ClearCue Stage 5.5 independent engineering review

Audit date **24 November 2026**. Starting revision **8301f1b**, version **0.5.0**. The working tree was clean at intake. Review covered the actual extension and its tests from activation through page inspection, repair and interaction recovery.

## Findings and changes

| Severity | Finding and root cause | Change and evidence |
| --- | --- | --- |
| High | The rule-only button could escalate to AI because it filtered candidates before entering the same hybrid pipeline. A rejected rule could reach the model. | Enforced rule-only at the routing boundary. A regression test rejects a rule and asserts zero model calls. |
| High | Failed and mismatched inference paths could attribute a response to the requested backend. Cloud accepted a successful result without verifying its backend. | Source comes from the SDK response. Panel shows requested source, whether the SDK was called and actual source. Unknown is explicit. Mismatches are discarded and tested in both directions. |
| High | Raw role, attribute values, custom tags and destination hosts could be treated as structural cloud facts. The validator could accept an evidence ID that had never left the device. | Cloud uses a finite structural vocabulary, omits destination hosts, and allows only citations sent for that issue. Tests use synthetic private attributes, tags, URL components and text. |
| High | Saved panel closures compared their own old state during long repairs. Apply replaced the validated snapshot with a later snapshot. Undo could target a replacement element at the same locator. | Panel rechecks the live context and consent before dispatch, uses document-bound target checks, and sends the actual naming snapshot. Content confirms element identity and visibility. Undo uses the retained original element and respects independent page writes. |
| High | Recovery listened to submit to infer native validation although browsers stop invalid submissions before dispatching submit. It scanned other forms when it did run. | Captures trusted browser invalid events for the activated form and avoids raw custom validation strings. Chromium two-form regression locks the behavior. |
| High | Message-only dedupe erased legitimate retries. The announcement timer could cancel a prior message and immediately report both as announced. | Deduplication is scoped to the interaction, native and scripted activations are distinguished, and page writes are queued and acknowledged after mutation. Content-ingress writes sharing a tab record are serialized. |
| High | The release command emitted an incomplete build and relied on runtime refusal to protect a secret that Vite could still substitute. The diagnostics verifier copied a debug token from SDK console output. | The release command runs the full build with debug credentials unset before bundling. SDK calls with cloud capability require configured App Check. The verifier filters the SDK credential line. Rotate the development debug token before sharing this run or existing development artifacts. |
| Medium | Nano generated a verbose seven-field proposal for each issue and the cache keyed constraints as a boolean. The cloud prompt used a different input identifier spelling from its output contract. | Nano returns only an alias, label and citations through a smaller JSON constraint. The cloud prompt uses matching aliases and shows the full response shape. Cache keys include the actual constraint and generation configuration. |
| Medium | Validation looked for any one word anywhere in the scan, even when the model cited unrelated evidence. | Auto-apply requires coverage of meaningful label words in cited purpose-bearing facts. Suggestions can request explicit review. Lexical evidence is still a heuristic, and overlapping text can have the same underlying source. |
| Medium | Busy-to-idle could reuse a stale message and report success. An ARIA live attribute could mask a silent outcome through `aria-live=off` or an inaccessible ancestor. | Busy-to-idle produces an informational result. Newly observed status text can independently support success. Announcement suppression checks the relevant ARIA state. |
| Medium | The loopback playground used a string-prefix path check. Windows archive tests assumed `unzip`; unreadable archive members could be skipped. | The playground verifies directory boundaries using relative paths and handles malformed input. Archive verification uses native Windows tar when appropriate and fails on unreadable members. |

### Activation and lifecycle

Reviewed the action-click activation path and explicit per-origin permission flow. The manifest has no `tabs` permission, requests optional HTTP(S) host permissions per site, and bundles extension code locally. The built service worker uses session tab state and the panel requests it through typed messages. Browser tests verify manifest, activation wiring, default settings and registration boundaries. Test-only permission grants are used in automated live verification. Native permission prompts, service-worker restart under concurrent mutations, and broader cross-window lifecycle behavior need manual or targeted coverage. Content senders must come from the extension's top frame. Chrome's own document ID and lifecycle metadata remain candidates for a stronger end-to-end ownership check. [Chrome runtime sender metadata](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender)

### Inference and repair

The previous Nano diagnostics and production abstentions were user-observed. Diagnostics used a separate richer contract with a two-citation high-confidence check. That rule does not govern production repair. Previous Nano repair latencies were 32,994 ms and 14,595 ms. A valid label was observed in diagnostics, but no successful Nano application or confirmed offline run follows from that evidence. The new three-field contract reduces output structure and avoids duplicate context, with no measured Nano speedup claimed. Compact results still pass the shared validation gate. Firebase enforces single-turn usage. The installed adapter does not pass the request cancellation signal through to Nano. The panel holds its running slot until the SDK settles and rejects stale results. [Firebase hybrid setup](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started) [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)

There is no evidence of which hardware backend Nano used on this laptop. The regular-profile experiment controls for build, prompt, model, and temperature, then records cold and warm latency for each Windows graphics preference. Consult Chrome's model internals for an explicit backend signal. Browser graphics information by itself describes the browser. [Regular-profile checks](STAGE4_MANUAL_VERIFICATION.md)

Existing accessible names remain protected. Applying and restoring an `aria-label` still requires recomputing the name and respecting concurrent site edits. An applied label is not proof of WCAG conformance. There is no semantic proof from citation overlap. Generated structure cannot request clicks, scripts, submissions, navigation or HTML. [W3C accessible-name computation](https://www.w3.org/TR/accname/)

### Recovery and privacy

Recovery still observes mutations after the user acts. Overlapping same-form interactions, late async outcomes and third-party notifications can make attribution ambiguous. Different forms cannot lend each other a correlation when both forms can be identified. Open shadow roots and iframes lack recovery coverage, class-only visibility transitions can be missed, and unrelated but semantic notifications can still be recorded with uncertain attribution. Discovery handles native dialog open state. Live-region buffering protects rapid DOM writes, but did not establish NVDA speech, virtual cursor behavior or native side-panel Replay speech. Test both page focus and panel focus. [W3C live region technique](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA19) [NVDA walkthrough](STAGE5_NVDA_GUIDE.md)

Recovery can observe page-generated private text despite never reading form values. It bounds and retains local session evidence, redacts obvious emails, card-shaped strings and password markers, and keeps ordinary text such as names or application identifiers in scope. Repair records and suggestions remain bounded local storage and may contain textual evidence or derived labels. New attempt and suggestion records omit page URLs. Deleting legacy URLs and minimizing durable names, reasons, and the retained global inference record belong in Stage 7. The scanner and repair still inherit the limits of browser computed semantics and fixture-based coverage.

### Release and judge testing

The unbundled custom-token client seam posts to a configured endpoint. No production attestation service is deployed or verified. The endpoint requires a real authenticated or attested caller, a server-owned expiry and issuance limits before distribution. A client-supplied extension ID or origin alone is public information. Until that work is verified, release cloud is gated. The rules allow debug tokens for judging and require a public licensed source repository and a demonstration video. The local repository has no license file yet. Use an isolated, quota-limited judge project and an organizer-approved private credential channel if available, with revocation after judging. Otherwise document the local setup required to reproduce cloud and show the genuine cloud flow in the demo. Verify the chosen path before submission. [Firebase custom App Check provider](https://firebase.google.com/docs/app-check/web/custom-provider) [Official contest rules](https://firebasehybridaihackathon.devpost.com/rules)

## Verification and measurements

| Command or evidence | Result |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | Typecheck, 252 unit tests, complete development and release builds. [Progress](PROGRESS.md) |
| `npm run test:e2e` | 27 Chromium checks, including real browser input for native validation. Some scenarios stub Chrome transport around the actual content bundle. |
| `npm run verify:extension` | Diagnostics, worker and extension layout verified. Nano unavailable in the isolated browser profile. |
| `npm run smoke:cloud` | App Check acquired and both text and JSON returned genuine SDK `in_cloud`. The sandboxed run failed DNS before the authorized network run succeeded. |
| `npm run verify:stage4-live` | 38 checks passed. The revised prompt produced a genuine cloud label which applied and was undone. The suite inspected request bodies for fixture sentinels. |
| `npm run verify:stage5-live` | 32 checks passed. Zero unexpected HTTP requests during the observed workflow after setup. The pre-created regions remained empty in the page-owned comparison. |
| `npm run verify:artifacts` | Development artifacts classified and checked using Windows tar. This verifies the configured credential and generated artifacts in scope. |
| `npm run measure:scanner` | Initial 1,000-control scan 413.7 → 427.2 ms, with an interim run at 378.7 ms. Incremental 14.6 → 13.9 ms. End-to-end dynamic sequence 931.2 → 917.5 ms. |
| `npm run measure:recovery` | Detection 64.28 → 65.56 ms. Live-region update 33.62 → 36.40 ms. Interim values were 63.18 ms and 33.60 ms. Idle callbacks 0. Burst 100/100 in two flushes. One event for ten identical displays without a new user interaction. |
| `npm run pilot` and `npm run pilot:recovery` | Controlled development fixtures only. Scanner detection 24/24 and privacy gate 2/2. Recovery results in [Progress](PROGRESS.md). |

The initial loopback suite needed authorized network access. A later Stage 4 run demonstrated a
harness race: the scan index and current UI row could diverge. Exact issue and repair IDs replaced
position-based clicks. A recovery-pilot invocation missed its bundle after a scanner build and
passed after scanner builds stopped clearing the shared directory. The initial release verifier
mistook an environment variable's name for a credential. Exact matching confirmed zero credential
hits and the verifier now reads actual build-channel metadata.

Measurements are single-run observations from comparable local Chromium fixtures. Timing jitter is enough to account for small differences. There is no held-out performance or accuracy claim. The existing historical ~1,391-to-405 ms scanner change was not independently recreated by rebuilding the pre-optimization commit. Mocked inference contract tests cannot establish Nano capability.

## Handoff gates

The engineering foundation is ready for authorized Stage 6 work. The competition demo still needs actual NVDA error, Jump, Replay, correction and success evidence. It also needs a real Nano application, verified offline reproduction, and a judge-safe App Check plan. Test ordinary machines and fresh profiles before generalizing results. Keep Context Navigator, ClearBench and model-assisted recovery pending until their own stages.

Continue with [the DeepSeek handoff](../HANDOFF_TO_DEEPSEEK.md).

## Offline-first and multimodal extension to the audit

An additional review found an unnecessary App Check request during diagnostics startup. The
explicit **Check cloud connection** action now performs that operation. Firebase AI Logic still
uses the provider on demand for cloud inference and retains forced local operation if provider
initialization fails. The isolated Chromium offline check verified 40 assertions and no unexpected
application HTTP traffic, including actual DOM repair, Undo, recovery actions and startup. Its
network boundary is hostname isolation and is documented in [offline architecture](OFFLINE_ARCHITECTURE.md).

The original scanner saw authored icon metadata and emitted a generic graphical marker when no
metadata existed. ClearCue now reconstructs small anonymous inline SVG geometry into a PNG without
rendering webpage markup, taking screenshots or fetching resources. It checks the text-plus-image
configuration independently and never attaches images to a cloud mode. It requires supporting
text and review before a visual proposal may be applied. The rendered-pixel path passed a real
Chromium test with ten accepted and three rejected development cases. Actual Nano interpretation
and comparative text/image latency remain unmeasured. [Local visual repair](STAGE5_5_MULTIMODAL.md)

Chrome and VoiceOver already provide different forms of image description. ClearCue's audited
scope is control naming with corroborating evidence and explicit reversible application, combined
with deterministic interaction recovery. [Chrome image descriptions](https://support.google.com/chrome/answer/9311597) [VoiceOver Recognition](https://support.apple.com/guide/voiceover/voiceover-recognition-category-vocbaf20181f/mac)

The final Stage 4 verifier selects exact issue and repair IDs and reports failure on the first
genuine cloud attempt. The visual fixtures are evaluation development data. Hold out independent
controls, languages, sites and semantic judgments for Stage 8.
