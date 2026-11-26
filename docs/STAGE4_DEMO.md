# ClearCue Stage 4 — nine-case hybrid demonstration

This is a reproducible, hands-on demonstration. It uses real ClearCue code and real Firebase AI
Logic. Nothing is pre-recorded or mocked. If a case needs a model and the model is unavailable, the
correct result is an abstention with a reason, not a fabricated repair.

Open `playground/stage4.html` through `npm run playground` (http://127.0.0.1:4318/stage4.html).
Enable ClearCue on `http://127.0.0.1:4318` before starting.

## What is already verified automatically

| Evidence | Result |
| --- | --- |
| Unit tests | 196 pass; 45 cover validation, pipeline, content targets and the repair contract (mocked inference only in the pipeline tests) |
| Browser tests | 20/20 pass, including real apply/restore, disable/in-page restore, overwrite refusal and undo conflict |
| Live extension verification | **36/36** checks in the real built extension, including a genuine `IN_CLOUD` repair |
| Cloud smoke | Real `IN_CLOUD` text and JSON, App Check acquired |
| Artifact hygiene | `safe-local-only`; dev token not tracked or published |
| Pilot | 24 controlled cases, detection 24/24, 0 false positives |

## What requires your machine

Only genuine on-device proposals (case 2) and genuine offline operation (case 8). The real cloud
repair path, consent withdrawal, privacy boundaries, stale rejection and restoration are covered by
`npm run verify:stage4-live` in the built extension. Record the panel's actual source and latency;
never write `ON_DEVICE` unless the panel shows it.

## The nine cases

Status key: **AUTO** = covered by automated evidence; **MANUAL** = requires a user run; **PENDING**
= not verified in this environment.

### 1. Deterministic repair without AI — AUTO (genuine browser)

- Control: "Search products" field plus an icon button whose SVG has an authored `search` title.
- Expected: issue `button-name` (or icon-control-name), deterministic candidate **Search**, decision
  `apply`, source **rule**, zero inference requests.
- Verify: apply, then check that the button announces "Search"; Undo all restores the exact previous
  state.
- Automated evidence: live check `rule-no-inference` / `rule-source-is-rule`, plus pilot and browser
  apply/restore tests.

### 2. Low-risk control named from visible context — MANUAL

- Control: bell icon with no authored name, under the visible heading "Notification settings" and
  helper text about order/delivery alerts.
- Expected with a ready local model: `ONLY_ON_DEVICE` request, actual source `on_device`, and a
  validated label such as "Notification settings" backed by the visible evidence.
- Expected without a local model: abstention with `local-unavailable`, unless cloud consent allows
  escalation.
- Do not accept a proposal that repeats a role word, uses a generic label ("Button"), or has no
  supporting evidence. A justified abstention is still valid, but the panel must report on-device AI
  as the attempted source and its real inference latency.

### 3. Local evidence insufficient, cloud escalation permitted — AUTO (genuine cloud)

- Control: unnamed chart icon beside a fictional revenue table.
- Expected with cloud consent: local result insufficient/failed → cloud request built only from
  cloud-eligible structural evidence → `IN_CLOUD` response → validation → apply or suggest.
- Expected without consent: abstention with `cloud-disabled-by-user` / `cloud-denied-by-policy`.
- Check the routing reason shown under Recent decisions. A cloud label must not depend on the page's
  private text.
- Automated evidence: live check `cloud-repair-applied` recorded source `in_cloud`, label `Search`,
  HTTP 200, validation passed and the attribute was applied by the real content script.

### 4. The same control with cloud turned off — AUTO (genuine browser)

- Disable cloud in Privacy, reload the page, repair the plus icon.
- Expected: no cloud request; abstention or local-only outcome with a cloud-disabled reason.
- This proves withdrawal of consent is honoured at request time.
- Automated evidence: `cloud-opt-out-recorded`, `cloud-off-no-request`, `cloud-off-routing`,
  `cloud-off-no-mutation`.

### 5. Private context after a local failure — AUTO (genuine browser privacy + abstention)

- Control: image-only link with a nearby private case note.
- Expected: nearby text stays `local-only`. If local inference is unavailable, a cloud request may
  still be made using only structural evidence; the private note, case number and URL must not
  appear in it. The outcome is an abstention with `insufficient-evidence`.
- Automated evidence: live check `sensitive-text-stayed-local` scanned the captured request body for
  the private sentinel, case number and page path — none were present. The attempt abstained and the
  link kept its original naming attributes. Pilot private cases 2/2 and privacy unit tests also pass.

### 6. Destructive control stays unchanged — AUTO (genuine browser)

- Control: unnamed trash icon with nearby "Delete permanently".
- Expected: `unsafe-action`, no apply, no suggestion that guesses a destructive name. The page must
  be byte-for-byte unchanged in its naming attributes.
- Automated evidence: live `destructive-no-inference`, `destructive-unsafe-routing` and
  `destructive-unchanged`, plus destructive-gate validation tests.

### 7. Apply a repair, then undo it — AUTO

- Control: settings icon with an authored `settings` title.
- Steps: Repair → apply → confirm accessible name → Undo all.
- Expected: exact previous state restored, history marks the repair undone, `repairsUndone`
  increments.
- Automated evidence: browser test applies a verified name and restores the exact previous state.

### 8. Genuine offline local repair — PENDING

- Keep the loaded page open, switch DevTools Network to Offline, then repair the "Find an order"
  search icon without reloading.
- Expected if Nano is ready: `ON_DEVICE` with no Firebase/App Check request; otherwise a clear local
  failure. Cloud escalation must fail safely, never silently pretend to succeed.
- This environment has no downloaded model and no offline run. Status: **unverified**.

### 9. Stale inference result is rejected — AUTO (genuine browser race)

- Start a repair on the download icon, then press "Replace this control" before it finishes.
- Expected: the original element is gone, `panel:checkTarget` rejects it, no attribute is applied to
  the replacement, and the decision reports `stale-target`.
- Automated evidence: the live run replaced the control while a real cloud proposal was in flight,
  recorded `stale-target`, and confirmed the replacement received no attribute (`stale-routing`,
  `stale-no-mutation`). Target/pipeline unit tests cover the deterministic check.

## Recording results

For each manual case record: date/time, requested mode, actual source, latency, decision, routing
reason, applied/undone, and any conflict. Append real values to `docs/PROGRESS.md`. Do not round
latency or infer the source from the requested mode.

## Honest summary after the run

The demonstration has genuine browser evidence for deterministic repair, cloud repair, consent
withdrawal, the privacy boundary, destructive abstention, reversible apply/undo, stale rejection,
SPA restore and site-disable restore. Only cases 2 and 8 stay **MANUAL / PENDING** until a real
on-device or offline run is recorded; they are not described as working.
