# Stage 7 · Security and release

## Message and privacy boundaries

- Panel requests require the extension's own panel document. The diagnostics document has a narrower preference request. It checks the current diagnostics setting immediately before requesting App Check or starting a cloud-capable diagnostic.
- Content requests require Chrome's top-frame document identity, a current page URL, and the site's live host grant. The worker records Chrome document identity when it receives a valid content message and targets that document for Navigator focus and repair or Undo. The Navigator also retains the actual DOM element and rejects another owner document.
- Navigation and speech strings stay in panel memory. The only Navigator model request is forced on-device. The model can order known candidates. Transcript review, result selection and any website interaction remain separate user actions.
- Voice input asks Chrome for explicit local recognition, stops after 20 seconds, and aborts on panel hide, unmount or Cancel. It holds no recording in extension code. Actual microphone use remains a manual runtime check.
- Recovery evidence stays in Chrome session storage, with the existing bounded event count and TTL. Repair records retain the exact values needed for Undo. The build preserves the existing repair ambiguity and destructive-action gate.

## Build and install the public-safe package locally

Use Node 20.19+ and Chrome 139+. Run `npm ci`, `npm run build:release`, `npm run zip`, then `npm run verify:artifacts`. Extract `artifacts/clearcue-0.5.0.zip` to a new directory. Go to `chrome://extensions`, enable Developer mode, and use **Load unpacked** on that directory. Start `npm run playground`, open the loopback page and enable ClearCue from the toolbar or assigned shortcut.

The release build blanks every project-specific Firebase identifier, the debug secret and any unverified custom token URL before compiling. Deterministic repair, recovery and navigation work with that package. Local Nano research also needs a locally configured Firebase SDK build and a supported Chrome profile. The ZIP includes the Apache-2.0 license and a dependency notice inventory. The verifier rejects unsafe path patterns and requires the manifest, entry points, license and notices in public-named archives.

## Judge testing with Firebase

Use the private test ZIP and hosted practice link supplied in the submission's
nonpublic testing instructions. Extract the ZIP. In Chrome open
`chrome://extensions`, enable **Developer mode**, choose **Load unpacked** and
select the folder containing `manifest.json`. Open the practice link, click
ClearCue in the toolbar and enable ClearCue on that site. The guide walks
through cloud diagnostics, repair and Undo, and local inference where available.

The owner builds the judge package in a private checkout using a separate test
project and a revocable App Check credential. The public clean ZIP remains
available for the deterministic workflow. [Hackathon rules](https://firebasehybridaihackathon.devpost.com/rules) · [Firebase debug provider](https://firebase.google.com/docs/app-check/web/debug-provider)

The project owner must open **Firebase Console → App Check → Apps → Web app → Manage debug tokens**, register a fresh private token, replace the local `.env` value, and rebuild. Verify the new build with `npm run smoke:cloud`, then remove the previously exposed token from the console. Treat earlier development ZIPs and the affected audit transcript as private. Never use screenshots of the token registration flow in public materials.

For production cloud, use a separately reviewed Firebase custom App Check provider architecture. MV3 extension pages cannot load reCAPTCHA Enterprise remote script. A custom issuer must verify authenticity using a proof stronger than an Origin header or an extension ID, enforce replay protection and issuance limits, and return bounded expiring tokens. No such production issuer is configured or deployed here. The public package therefore remains a deterministic offline release. [Firebase custom App Check provider](https://firebase.google.com/docs/app-check/custom-provider) · [Chrome MV3 content security policy](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)

## Known limits

A live worker restart under concurrent updates and native permission-revocation prompts remain manual verification gaps. Local tab session state is recovered from Chrome. Model and message guards reduce risk but cannot establish universal website compatibility. See [Stage 6 evidence](STAGE6_VERIFICATION.md) and [limitations](LIMITATIONS.md).

## Dependency review

The npm audit initially reported four high entries through the umbrella Firebase package,
Firestore, its compatibility package and gRPC. The app used only AI Logic, App and App Check.
The release now depends on those same installed modules directly. The production lockfile
advisory rerun found zero known entries. The registry query used Node's Windows system CA
because bundled certificate trust initially rejected the registry connection.

The final cloud smoke used a fresh isolated Chromium profile and returned genuine IN_CLOUD for text and JSON. An earlier run hit a stale worker in the reused test profile. The release passed 52 live offline checks, 27 browser tests, 259 unit tests and release archive verification.
