# ClearCue Stage 4 — repair routing algorithm

This document is the auditable description of how a detected issue becomes an applied repair, a
suggestion, or an abstention. The implementation lives in `src/repair/pipeline.ts`,
`src/repair/validation.ts`, `src/repair/prompts.ts`, `src/panel/useRepair.ts` and
`src/content/contentScript.ts`.

## Inputs

- `ScannedIssue` from Stage 3: category, locator, role, tag, evidence, deterministic candidates.
- `ExtensionSettings`: privacy mode, cloud opt-in, auto-repair, paused, cloud evidence limit.
- Per-document budgets: 12 local inference requests, 6 cloud requests.
- Live DOM state and the applied-repair log.

## End-to-end decision order

1. **Context gate (panel).** If there is no connected document, no tab, or no permission, stop with
   a visible reason. Never infer from storage or tabs directly.
2. **Pause gate.** If `repairPaused`, do nothing. A paused session performs no model work.
3. **Fresh target check.** `panel:checkTarget` asks the content script to resolve the issue locator
   and capture its current attributes. Missing, replaced, renamed or duplicate targets stop here
   with `stale-target` or `insufficient-evidence`.
4. **Deterministic candidate.** If the Stage 3 scan supplied a direct/high candidate, build a `rule`
   proposal from it. This does not call a model.
5. **On-device batch.** Otherwise send up to four issues with `ONLY_ON_DEVICE`, the repair contract
   and a 60 s timeout. All local evidence may be used because it stays on the device.
6. **Actual-source check.** A reply is accepted as local only when
   `response.inferenceSource === "on_device"`. A missing or different source is a failure, not a
   local success.
7. **Cloud eligibility.** A local failure, unavailability or deterministic rejection may escalate
   only when all of these hold:
   - `privacyMode === "cloud_allowed"` and `cloudOptInAt !== null`,
   - cloud budget remains for this document,
   - the failure is not `unsafe-action` or `stale-target`,
   - `selectCloudEvidence()` returns usable evidence.
   The cloud request uses `ONLY_IN_CLOUD`, issue aliases and a 45 s timeout. An unexpected
   runner rejection is converted into an abstention, never an unhandled error.
8. **Build the proposal.** Reject non-object output, unknown issue aliases, a source that contradicts
   the requested route, missing evidence ids, labels over 60 characters, markup, line breaks, generic
   labels and role-word repetition.
9. **Single validation gate.** Run `validateRepair()`, destructive check first, for every proposal
   regardless of source. Details below.
10. **Decision.** `apply` proceeds; `suggest` is shown for explicit user action; `abstain` changes
    nothing and records why.
11. **Live re-check before apply.** The panel checks again, then `bg:applyRepair` compares the
    captured snapshot and confirms the element is the same instance. A mismatch rejects the apply.
12. **Apply.** Write only `aria-label` when the accessible name was empty. Mark the element
    `data-clearcue-owned`. Recompute the accessible name. If verification fails, restore the exact
    previous state immediately.
13. **Record.** Persist an `AppliedRepair` with `documentId`, tab, URL, previous presence/value,
    names before/after, source, explanation and timestamp. Increment statistics only for applied
    repairs.
14. **Restore.** Undo checks for an independent page change. If present, return `conflict: true` and
    do not overwrite. Disable and SPA navigation restore only still-owned repairs and mark exactly
    those undone in history.
15. **Report.** The panel shows source, latency, validation notes, routing reason and error text.
    Failed attempts are not repairs.

## Deterministic validation checks

All must pass before a proposal can be applied:

| Check | Failure outcome |
| --- | --- |
| Destructive or financial control | `unsafe-action` (checked first) |
| Document id present and matches the connected tab | `stale-target` |
| Site access still enabled | Policy rejection |
| Issue still present in the current scan | `stale-target` |
| Live element resolves and is not replaced | `stale-target` |
| Tag matches the scanned target | `stale-target` |
| Role is compatible with the category | `insufficient-evidence` |
| Existing accessible name is not overwritten | `conflicting-evidence` |
| Evidence ids exist in the issue | `insufficient-evidence` |
| Label is 1-60 characters, no markup, no line breaks | Validation failure |
| Label is not generic ("button", "link", "click here", etc.) | `insufficient-evidence` |
| Label does not repeat the control role unnecessarily | Validation failure |
| Vague-link repair preserves the visible text | `insufficient-evidence` |
| Expected attribute snapshot still matches | `stale-target` |
| Requested source is permitted by settings | `cloud-denied-by-policy` / `cloud-disabled-by-user` |

Medium ambiguity or medium risk downgrades `apply` to `suggest`; it never bypasses the table.

## Routing reasons (closed vocabulary)

| Code | Plain-language meaning |
| --- | --- |
| `deterministic-supported` | A direct rule resolved the case. |
| `local-preferred` | A local proposal was requested first. |
| `local-evidence-insufficient` | Local evidence or output was not enough; cloud may be considered. |
| `local-validation-failed` | The local proposal failed validation; cloud may be considered. |
| `local-unavailable` | No local model was available. |
| `cloud-permitted` | Consent and budget allowed escalation. |
| `cloud-denied-by-policy` | Evidence policy forbade sending this case. |
| `cloud-disabled-by-user` | Cloud consent is off. |
| `unsafe-action` | The control may destroy or spend; never guess. |
| `conflicting-evidence` | Evidence disagrees with the proposal. |
| `insufficient-evidence` | Not enough support to name the control. |
| `stale-target` | The element or page changed before apply. |
| `budget-exhausted` | The per-document request budget is used up. |

## Privacy rules in the route

- Page text, headings, nearby text and placeholders are `local-only` and never enter a cloud prompt.
- Form values, passwords, payment data, typed content, history and URL query/fragment are never read.
- `buildCloudPrompt()` is the only cloud prompt builder; it delegates evidence selection to
  `selectCloudEvidence()` and enforces the character cap.
- Issue ids are replaced with aliases in cloud prompts so page-derived identifiers do not travel.
- Model output is parsed as data. It is never executed, never inserted as HTML and never used to
  automate clicks or navigation.

## What the route deliberately refuses

- Overwriting a valid name, even if a model suggests a "better" one.
- Guessing a name for a destructive, purchasing or deletion control.
- Treating a request as a repair when it produced a suggestion or an abstention.
- Reporting cloud when the SDK says on-device, or the reverse.
- Escalating after a stale or unsafe outcome.
- Pretending a failed/offline model run succeeded.

## Stage 5.5 contract

The Nano batch response has three fields per item: `issueId`, `label`, and `evidenceIds`.
An empty label means abstain. The model receives bounded JSON evidence and short aliases.
The application determines whether citations support a write. Cloud keeps the richer contract
with matching request and response aliases. Each cloud proposal may cite only evidence actually
sent for that issue. Cloud always requires explicit consent and verified SDK provenance. Schema
errors, timeouts and source mismatches are recorded as abstentions. When a response was unavailable,
actual source remains unknown. Rule-only runs cannot escalate.

Evidence overlap is a heuristic. Every meaningful word in a model-proposed label must be present
in purpose-bearing cited evidence to apply automatically. A mismatch can require user review.
The current guardrails do not prove semantic correctness or independence between two citations.
A naming snapshot from validation must still match at apply time.

### Local modality selection

A user-selected single eligible icon issue may use text and a bounded inline PNG. The panel
checks the exact multimodal Chrome profile before extraction. Failure to obtain a PNG uses
the text route. A visual proposal that passes validation remains a suggestion and requires
corroborating cited text. Any cloud escalation uses its own policy-filtered text prompt.
See [local visual repair](STAGE5_5_MULTIMODAL.md).
