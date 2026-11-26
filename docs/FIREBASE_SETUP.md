# Firebase setup — click-by-click

These steps require the Firebase console and cannot be performed by an agent. Everything the
repository can do without them is already implemented and tested.

## 1. Create the Firebase project

1. Open <https://console.firebase.google.com/>.
2. **Create a project** (or **Add project**).
3. Enter a project name, e.g. `clearcue`.
4. Google Analytics is **not** required. Disable it if offered.
5. Wait for provisioning, then **Continue**.

## 2. Register a Web app and copy the configuration

1. Project overview → **Add app** → Web (`</>`).
2. App nickname: `ClearCue extension`.
3. Do **not** enable Firebase Hosting for this stage.
4. **Register app**.
5. Copy the `firebaseConfig` values. You need:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`
6. Skip the SDK snippet.

## 3. Enable AI Logic with the Gemini Developer API

1. Left navigation → **Build** → **AI Logic**.
2. **Get started**.
3. Choose **Gemini Developer API** as the provider (free tier, no billing needed).
4. Continue through the workflow so Firebase enables the required APIs.
5. The workflow automatically enforces **App Check** for AI Logic.

## 4. Confirm App Check enforcement

1. Left navigation → **Security** → **App Check** → **APIs** tab.
2. Find **Firebase AI Logic**.
3. It must read **Enforced**. If it reads *Unenforced*, open its menu and enforce it.
4. Keep this page open; you will add a debug token in step 7.

## 5. Put the configuration in `.env`

```bash
cp .env.example .env
```

Edit `.env`:

```dotenv
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_CLOUD_MODEL=gemini-3.5-flash-lite
VITE_APPCHECK_DEBUG=true
```

`VITE_APPCHECK_DEBUG=true` enables the documented debug provider. Do not commit `.env`.

## 6. Build and load the extension

```bash
npm install
npm run build
```

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. **Load unpacked** → select the `dist/` folder.
4. Click the ClearCue toolbar icon. The diagnostics page opens in a tab.

## 7. Register the App Check debug token

The build uses the token in `.env` (`VITE_APPCHECK_DEBUG_TOKEN`) rather than an auto-generated one, so
the same token is reused on every run and every browser profile. It is inlined at build time: after
changing it, run `npm run build` again.

1. In the Firebase console: **Build → App Check → Apps** tab.
2. Find the web app whose app ID equals `VITE_FIREBASE_APP_ID` (a token registered on another app or
   project is rejected).
3. Open its overflow menu (**⋮**) → **Manage debug tokens**.
4. **Add debug token**, name it (`ClearCue local`), paste the value from `.env`, **Save**.
5. Reload the diagnostics page (restart Chrome if the old token was cached).
6. The **Firebase AI Logic** card must show `App Check token: Acquired (… characters)`.

Never put that token in git, screenshots, documentation, a public issue or a release build. The
smoke harness masks UUID-shaped strings before writing artefacts, but the token's only home is
`.env`.

## 8. Run the cloud and hybrid tests

1. Click **Run all available** (cloud text, cloud JSON, hybrid text, accessibility label).
2. Confirm the actual source badges read **IN_CLOUD** (or use the hybrid result the SDK reports).
3. If a cloud request fails:
   - `403 / App Check` → the debug token is not registered, or enforcement was just enabled; repeat
     step 7.
   - `model not found` / `404` → open **AI Logic → Models** in the console and confirm which model
     names are enabled. Set `VITE_CLOUD_MODEL` to one of them, rebuild, reload.
   - quota errors → wait or raise the quota in Google AI Studio.

## 9. Enable the on-device model

1. Use Chrome **139 or newer on desktop** (this project was built against Chrome 158/159).
2. Open `chrome://settings/ai` and enable on-device AI if the toggle exists.
3. Open `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and set it to **Enabled**.
4. Restart Chrome.
5. Optional pre-download: open DevTools → Console on any page and run
   `await LanguageModel.availability()`. `downloadable` means it can be installed;
   `await LanguageModel.create()` starts the download (several minutes, needs free disk space).
6. In ClearCue, click **Initialize Local AI** and watch the download progress.
7. Run the two on-device tests. The source badge must read **ON_DEVICE**.

The diagnostics page also shows the environment checks (`window.LanguageModel`, availability,
Chrome version). If it reports `unavailable`, the device/profile cannot run Gemini Nano; cloud
tests still work and on-device tests must be reported as blocked, not passed.

## 10. Verify offline behaviour (acceptance G)

1. Initialize the model and run an on-device test successfully.
2. Disconnect the network (or enable airplane mode).
3. Reload the diagnostics page and run only the on-device tests **without** re-initializing.
4. Expect **ON_DEVICE** responses with no network. Record the result in `docs/PROGRESS.md`.

Note: the hybrid (`PREFER_ON_DEVICE`) test may fall back to the cloud, which will fail offline.
That is correct behaviour and should be reported as such, not hidden.

## 11. Production attestation (before any public release)

reCAPTCHA Enterprise **cannot** be used from this extension: its provider injects a remote script,
which the MV3 CSP (`script-src 'self'`) forbids. That was observed as a real CSP failure, not a
guess. Do not disable App Check to work around it.

The implemented release path is a **custom App Check token provider**:

1. Deploy a small trusted endpoint (Cloud Run / Cloud Functions) that issues App Check tokens for
   your project using the Firebase Admin SDK.
2. Set `VITE_APPCHECK_CUSTOM_TOKEN_URL=https://<your-endpoint>/appcheck/token` in `.env` and remove
   the debug variables.
3. Build with `npm run build:release`. It clears debug settings before bundling and includes the content script.
4. Confirm cloud requests succeed with App Check **Enforced** for AI Logic.

The endpoint is **not deployed yet**, so the release attestation path is an open task recorded in
`docs/PROGRESS.md`.

## 12. Current configuration state (Stage 2 checkpoint)

Observed on the real project `clearcue-74562` with the built extension, latest run 2026-11-24
(`npm run smoke:cloud`, artefact `artifacts/cloud-smoke.json`):

| Check | Result | Meaning |
| --- | --- | --- |
| Web config present in build | yes | `.env` filled with the six `VITE_FIREBASE_*` values |
| Cloud model identifier | `gemini-3.5-flash-lite` | listed as a featured model and as the SDK default fallback (docs, 2026-11-24) |
| AI Logic API | **enabled** | Gemini Developer API enabled by the operator; `api-not-enabled` no longer returned |
| App Check token | **Acquired** | debug token registered for the matching web app; 937-character token, value never displayed |
| Cloud text | **`IN_CLOUD`** | real response, 2.44 s, deterministic check passed |
| Cloud structured JSON | **`IN_CLOUD`** | real response, 1.97 s, deterministic check passed |
| `response.inferenceSource` | **`IN_CLOUD`** | read from the SDK response, not from the requested mode |
| Verdict | **`in_cloud-confirmed`** | `npm run smoke:cloud` exit code 0 |
| On-device run | not attempted | Gemini Nano deliberately not downloaded; not required for Stage 3 |

Cloud path: steps 3 and 7 are complete and step 8 is verified. Step 9 (on-device) remains optional
and is not a prerequisite for Stage 3.

### Model identifier verification

The configured identifier was checked against the official documentation rather than assumed:

- Firebase AI Logic supported models lists **Gemini 3.5 Flash-Lite** as "`gemini-3.5-flash-lite`"
  under featured models: <https://firebase.google.com/docs/ai-logic/models>.
- The hybrid web configuration page states: "The default cloud-hosted model is
  `gemini-3.5-flash-lite` (starting with JS SDK v13.0.0)":
  <https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options>.
- This project pins `firebase@13.4.0`, so both the identifier and the default fallback apply.

Runtime availability for the project cannot be confirmed while App Check rejects the request,
because authentication fails before model resolution. Do not mark the model "available" from the
smoke test alone; confirm it in Firebase console → AI Logic → Models after a successful run. If
the console lists a different set, override with `VITE_CLOUD_MODEL` and rebuild.

## Troubleshooting quick reference

| Symptom | Likely cause | Action |
| --- | --- | --- |
| “Firebase is not configured in this build” | missing `.env` values at build time | fill `.env`, `npm run build`, reload |
| App Check token: Failed | debug token not registered / wrong project | repeat step 7 |
| `api-not-enabled` / `SERVICE_DISABLED` | AI Logic API not enabled for the project | step 3 |
| `api-not-enabled` mentioning LanguageModel | Prompt API unavailable in this document | steps 9.2–9.4 |
| `unavailable` availability | hardware/policy/disk | use cloud tests; mark D blocked |
| Cloud 404 model | model not enabled for project | set `VITE_CLOUD_MODEL` from AI Logic → Models |
| Empty results after reload | results are session-only by design | re-run the tests |

### Stage 5.5 attestation status

The complete release build excludes the configured debug credential. Its cloud path needs a configured
App Check provider. The custom-provider client remains an integration seam. No production issuer
was deployed. Before enabling cloud for release, verify authenticated issuance, expiry, limits,
revocation, and MV3-compatible origin handling. An extension ID or origin alone is insufficient to
attest a caller. Judge-only debug provisioning requires a separate restricted project and a private
channel accepted by the organizers. [Firebase custom providers](https://firebase.google.com/docs/app-check/web/custom-provider)
