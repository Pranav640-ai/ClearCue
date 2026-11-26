# ClearBench v1 results

The protocol and fixtures were frozen in `223c1f4` before measurement. The original fixture checksums remain in [freeze.json](../benchmarks/clearbench-v1/freeze.json). The runner used the built extension in a Chromium profile with external DNS isolated. Its accompanying 40 offline checks passed and observed zero unexpected HTTP requests.

| Metric | Observed on this cohort |
| --- | --- |
| Repair detection precision and recall | 4/4 and 4/4 |
| Correct-label precision and repair coverage | 2/2 applied labels and 2/4 barriers |
| Undo | 2/2 original attributes restored |
| Incorrect or unsafe writes | 0 observed in two writes |
| Recovery detection | 2/2 positive cases, no event in the unrelated clock case |
| Recovery association | 2/2 expected associations, including the page-owned status with no field |
| Recovery announcements | ClearCue updated the delayed-error live region and suppressed a second announcement for the page-owned status |
| Repeated submission | A new interaction retained the same-text error |
| Navigator | Top-ranked target and explicit focus, 2/2 unique goals. The tie returned two candidates and the no-match goal returned none. |
| Timing | 80.49 ms mean Navigator workflow time, 189 ms mean observed recovery time, 306.54 ms rule-repair batch |

The first runner attempt stalled while typing into a separate panel window that was still rendering the previous tab. A completed initial observation was retained even though its automation inherited a disabled announcement preference and captured repairs before the intended panel context finished loading. The corrected runner waits for the actual overview and completed repair attempt and explicitly checks the announcement preference. Neither the frozen page nor the expected outcomes changed. See [initial observation](../benchmarks/clearbench-v1/initial-observation.json) and [corrected observations](../benchmarks/clearbench-v1/results.json).

Run `npm run build` and `npm run clearbench` to regenerate the JSON and the accessible HTML comparison chart in `artifacts/`. The measured sample is deterministic and deliberately small. Genuine cloud repair has its own Stage 4 evidence. Nano text, visual and offline inference, performance on different GPU modes, microphone transcription, NVDA speech, and results with blind study participants remain unmeasured in this cohort. Keep any future regular-profile measurements in a separate result file with the configuration and actual SDK source. [Manual visual comparison](STAGE5_5_MULTIMODAL.md) · [NVDA walkthrough](STAGE6_VERIFICATION.md)
## Activation supplement

The independent eight-command protocol in `benchmarks/clearbench-activation-v1/` adds
held-out wording variants on the same trusted practice application. Its checksum is frozen.
The separate development workflow checks the catalogue and a misleading website handler.
`npm run verify:activation` verifies both and writes the observations to
`artifacts/clearbench-activation-v1.json` and the privacy checks to
`artifacts/activation-verification.json`.

| Measure | Observed |
| --- | --- |
| Correct authorized changes and verified results | 3/3 |
| Incorrect authorized changes | 0/3 |
| Unauthorized changes on passive or abstention cases | 0/5 |
| Appropriate abstentions | 3/3 |
| Consequential actions prevented | 1/1 |
| Command interpretations | 8/8 |
| Ambiguous cases offered distinguishable choices | 1/1 |
| Unexpected application HTTP requests during the isolated suite | 0 |

The Newest case took three native arrow presses from Relevance, versus one submission
of an already prepared command. This sample excludes text entry, speech, focus and
review time. The cohort is small and exercises bundled controls only. [Scope and reproduction](STAGE6_ACTIVATION.md)
