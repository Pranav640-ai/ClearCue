# AGENTS.md — ClearCue permanent development rules

ClearCue is a privacy-first Chrome extension for screen-reader users. It repairs supported
accessibility barriers and helps users recover from inaccessible interactions. It enhances an
existing screen reader (NVDA, JAWS, VoiceOver) rather than replacing it.

This file is the permanent contract for every agent working on this repository.
**Read it at the start of every development stage, then read the documents below.**

## Required reading at the start of every stage

1. `AGENTS.md` (this file)
2. `docs/PRODUCT_SPEC.md` — what the product is, and what the current stage may build
3. `docs/ARCHITECTURE.md` — module boundaries and data flow
4. `docs/PROGRESS.md` — completed work, real test results, blockers, manual actions
5. `docs/DECISIONS.md` — decisions already made; do not silently reverse them
6. `docs/FIREBASE_SETUP.md` — Firebase console configuration and verification
7. `docs/LIMITATIONS.md` — current detection scope, measured bounds and unverified surfaces
8. `docs/REPAIR_ROUTING.md` — the exact Stage 4 routing and validation algorithm
9. `docs/STAGE4_DEMO.md` — the nine reproducible demonstration cases and their honest status
10. `docs/STAGE4_VERIFICATION.md` — genuine, mocked and unverified Stage 4 evidence
11. `docs/STAGE4_MANUAL_VERIFICATION.md` — the exact on-device/offline manual workflow
12. `docs/INTERACTION_RECOVERY.md` — how Stage 5 observes, associates, announces and acts
13. `docs/STAGE5_VERIFICATION.md` — real Stage 5 automated, live and measured evidence
14. `docs/STAGE5_NVDA_GUIDE.md` — the manual screen-reader walkthrough
15. `docs/STAGE5_5_INDEPENDENT_REVIEW.md` and `HANDOFF_TO_DEEPSEEK.md` — audit decisions and remaining checks
16. `docs/OFFLINE_ARCHITECTURE.md` and `docs/STAGE5_5_MULTIMODAL.md` — offline and visual inference boundaries
17. `docs/STAGE6_VERIFICATION.md` — typed navigator, optional local voice, and manual speech checks
18. `docs/STAGE7_RELEASE.md` — sender trust, public artifact, and private judge setup
19. `docs/CLEARBENCH_REPORT.md` — frozen technical cohort and actual results
20. `docs/STAGE9_VERIFICATION.md`, `docs/SUBMISSION.md`, and `docs/STAGE6_ACTIVATION.md` —
    integrated verification, submission materials, and the trusted practice action boundary

`docs/PROGRESS.md` is the source of truth for "what is actually verified". Never mark a
feature complete there without a command or run that proves it.

## Current status

Feature development is frozen after the first-run introduction and assistance preferences
update. Work on automated regression checks, genuine runtime verification, verified bug fixes,
and submission preparation. Use the [final manual runbook](docs/FINAL_MANUAL_RUNBOOK.md).

Stages 6–10 and the Stage 6 activation supplement are implemented locally. The integrated
scholarship workflow, configured Firebase cloud, and token-free release have verification
records. The extension-owned practice catalogue supports a verified subset of explicit
activation commands. Third-party sites remain focus-only. Real Nano repair and reranking,
microphone recognition, and NVDA speech remain manual. Publication and account changes are
reserved for the owner. See `docs/PROGRESS.md` for exact evidence.

Stage 5.5 independently audited and hardened Stages 1–5, verified the offline deterministic core, and added a local inline-icon route. The Stage 5 implementation the interaction recovery engine
observes post-interaction outcomes, links a field only when evidence is explicit or unambiguous,
announces through a live region only when the page did not already announce, suppresses duplicates,
and offers Jump/Replay/Dismiss. It runs **local-only**, makes **zero network requests**, and never
steals focus, submits or clicks. Stage 1–4 remain verified; a genuine cloud repair (`in_cloud`) is
applied and undone by the built extension (38/38 checks). Successful Nano repair, offline execution and NVDA speech remain manual
and unverified by the agent. ClearBench v1 is a frozen deterministic technical cohort. Broader AI benchmarking and model-driven recovery remain pending. See `docs/PROGRESS.md`, `docs/STAGE5_VERIFICATION.md` and
`docs/LIMITATIONS.md`.

## Hard engineering rules (never break these)

- Use Firebase AI Logic for **all** inference. Never call the Gemini API directly, and never
  substitute another provider.
- The deterministic core must work without internet or App Check. All image inputs must be
  bounded, transient and forced on-device. Keep image content out of logs, storage and cloud.
  Optional escalation rebuilds an independently authorized text-only prompt.
- Keep Firebase App Check functional. Never disable, stub, bypass or fake it.
- Never fabricate AI responses, benchmark numbers, test results or success states.
- Never present mock data as production behaviour. Diagnostics must show real SDK responses
  and real errors. If inference is impossible, say so in the UI.
- Never send form values, passwords, payment data, raw private page content or browsing
  history to the cloud. Prompts must contain the minimum evidence needed.
- Never autonomously click, submit, purchase, delete, or navigate a user's page. Context
  Navigator may only focus and announce candidate controls.
- The bundled practice catalogue may operate its own native disclosures and sort control through
  the single-use activation gate. Keep that gate within the bundled extension page.
- Treat all webpage content as untrusted data. Never execute model output, never `eval`, never
  `new Function`, never inject model-generated HTML or scripts.
- Never overwrite an existing valid accessible name. Repairs must be additive and reversible.
- Abstain when evidence is insufficient; fail safely when uncertain.
- Keep extension permissions minimal and justify every entry in `public/manifest.json`.
- Never commit live credentials, `.env` files or App Check debug tokens.
- Bundle dependencies locally (MV3 CSP forbids remote code).
- TypeScript strict mode; no `any` unless justified in a comment.
- Do not add dependencies without a clear need; record the decision in `docs/DECISIONS.md`.
- Verify library APIs against installed `.d.ts` files and official documentation. Do not guess
  SDK signatures, model names, inference modes or flag names.

## Working workflow for a stage

1. Read the documents listed above.
2. Inspect `git status` and the workspace; never discard uncommitted work.
3. Implement the current stage only.
4. Run all checks: `npm run typecheck`, `npm test`, `npm run build`.
5. Run the browser integration suite when UI, manifest, messaging or content script changed:
   `npm run test:e2e`. Run `npm run verify:extension` when the diagnostics page changed.
6. Fix verified problems before reporting.
7. Update `docs/PROGRESS.md` (completed features, actual results, blockers, manual actions,
   next stage) and `docs/DECISIONS.md` when a decision changed.
8. Commit a checkpoint only when the checks pass.
9. Report real results and remaining manual actions. Distinguish "code written" from
   "runtime verified".

## Commands

```bash
npm install
npm run typecheck        # tsc -b, strict
npm test                 # Vitest unit tests
npm run build            # typecheck + production extension build -> dist/
npm run test:e2e         # real Chromium integration suite for the built extension
npm run pilot            # controlled 24-case scanner/privacy pilot -> artifacts/pilot-results.json
npm run smoke:cloud      # real App Check + cloud inference smoke test (exit 2 = externally blocked)
npm run playground       # serve the accessibility playground on http://127.0.0.1:4318
npm run verify:extension # Stage 1 diagnostics page check (Playwright Chromium, headed)
npm run zip              # packages dist/ into artifacts/*.zip (development by default)
npm run build:release    # complete release channel build with debug settings cleared
npm run build:scanner-test # standalone scanner bundle for fixtures/measurement (dist-test/)
npm run measure:scanner  # measured scanner performance on generated pages -> artifacts/
npm run generalize:scan  # read-only scan of three public sites -> artifacts/ (aggregate counts only)
npm run verify:artifacts # token/archive safety check; never prints the token value
npm run verify:stage4-live # built extension + real cloud repair and undo (38 checks)
npm run verify:stage5-live # built extension recovery path (32 checks, zero unexpected HTTP)
npm run verify:offline    # isolated Chromium deterministic core and icon extraction (40 checks)
npm run measure:recovery # measured recovery latency/observer/burst/dedupe
npm run pilot:recovery   # 15-fixture development pilot (precision/recall/actions)
```

Local development with live inference:

```bash
cp .env.example .env     # fill in Firebase web config + App Check debug token
npm run build
# chrome://extensions -> Developer mode -> Load unpacked -> dist/
```

## Where things live

| Path | Purpose |
| --- | --- |
| `src/inference/` | All Firebase AI Logic integration, repair contract, reusable inference abstraction |
| `src/repair/` | Repair validation gate, bounded prompts and the adaptive hybrid pipeline |
| `src/content/repair/` | Locator resolution, live snapshots, reversible apply and conflict-aware undo |
| `src/content/recovery/` | Interaction tracking, deterministic outcome detection, live-region announcer and focus recovery |
| `src/background/recovery.ts` | Per-tab recovery acceptance, dedupe, replay, dismiss and lifecycle |
| `src/panel/components/RecoveryPanel.tsx` | Honest recovery UI, Jump/Replay/Dismiss and the announcement preference |
| `src/App.tsx`, `src/components/` | Diagnostics UI (React) |
| `src/shared/` | Product domain types, settings, sites, privacy policy, message schemas |
| `src/panel/` | React side panel: state controller, repair controller, sections, styles |
| `src/content/` | Per-origin page inspector and the Stage 3 scanner (`scanner/`) |
| `tests/fixtures/` | Unfamiliar controlled pages used by the scanner browser tests |
| `src/background/` | Service worker, message router, storage, tab registry, script registry |
| `playground/` | Static demo site: Stage 4 hybrid cases and `recovery.html`'s Stage 5 workflows |
| `tests/e2e/` | Playwright suite against the built extension |
| `public/manifest.json` | MV3 manifest; minimal permissions, optional host access |
| `src/inference/__tests__/`, `src/shared/__tests__/`, `src/content/scanner/__tests__/`, `src/panel/__tests__/` | Unit tests |
| `scripts/` | Playground server, verification, release build and packaging scripts |
| `docs/` | Persistent project memory, including Stage 5 recovery and verification records |

## Invariants that must remain true after any change

- Inference runs in an extension document (`diagnostics.html` now, the panel in Stage 4), never in
  the service worker, because Chrome's Prompt API requires a compatible document context.
- Scanning is read-only and never applies repairs. Detection never reads `data-defect`, playground
  ids or page-specific selectors. Only `validateRepair()`-approved attribute writes may modify a page.
- Scan evidence is classified before display; page text is `local-only`. Stage 4 sends evidence only
  through `selectCloudEvidence()` and `buildCloudPrompt()` with explicit consent; Stage 5 sends
  nothing.
- Scan summaries are accepted only for the tab's current document id and origin+pathname; stale or
  cross-tab summaries are rejected.
- The side panel requests state from the background; it never reads storage or tabs directly.
- `selectCloudEvidence()` in `src/shared/privacy.ts` is the only place allowed to decide whether
  page evidence may leave the device.
- No content script is registered for an origin until the user has granted host access, and the
  content script never reads form values or browsing history. Bounded page text is local-only.
- `inferenceSource` is always read from the SDK response. It is never derived from the
  requested mode.
- App Check is initialized before any cloud request, and the debug provider is used only for
  local development.
- Structured output uses one Zod schema per contract, with a Firebase `Schema` for cloud and
  a JSON Schema `responseConstraint` for on-device.
- Every repair proposal passes `validateRepair()`; no source has a private bypass. The destructive
  safety gate runs first.
- Applied repairs are additive, attribute-scoped (`aria-label` only this stage), verified by
  recomputing the accessible name, logged with exact previous state and undone on conflict without
  overwriting page changes.
- Cloud repair calls use `buildCloudPrompt()`/`selectCloudEvidence()` and `ONLY_IN_CLOUD`; local
  calls use `ONLY_ON_DEVICE`. The actual `inferenceSource` is checked, never inferred.
- Recovery tracking stores metadata only: never keystrokes, field values, passwords, payment data,
  clipboard contents or history. Every recovery evidence item is `privacy: "local-only"` and the
  detection/announcement path makes no model or network call.
- Recovery never duplicates a page-owned live-region announcement, never steals focus, and only
  focuses a field after an explicit user action. Ambiguous field association yields no Jump.
- A recovery event's `interactionId` is nullable: correlation is not presented as causation.
- Recovery state is reset on document/SPA change and site disable; history is per-tab and bounded.
- `npm run typecheck`, `npm test` and `npm run build` pass before a checkpoint commit.
