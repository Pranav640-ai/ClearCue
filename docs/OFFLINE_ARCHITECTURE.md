# Offline architecture

ClearCue works on already-loaded or locally available webpages. The extension bundles its runtime and stores preferences through Chrome. Per-site grants, scanning, deterministic repairs, Undo, outcome detection, live-region updates, and explicit Jump run without internet. A website that needs its server for its own transactions still needs that connection.

## Runtime and inference

1. The Chrome extension starts its service worker, panel and authorized content script from local files. The worker and content script carry no inference clients.
2. The scanner and recovery paths run on the local DOM. The repair planner tries deterministic candidates first. The Rules only command can finish after the rule gate.
3. A local Firebase AI Logic handle is built in the extension document. The installed SDK still requires the public Firebase web configuration fields when creating a model, including in forced local mode. These are build-time values. App Check initialization failures leave the local AI handle available when that configuration is valid. A browser profile must already have a compatible Nano model, unless the user elects to download it.
4. ClearCue probes the exact Chrome input configuration for text and for text plus image separately. A downloaded text model can be used when image mode is unavailable. All page-derived local prompts use `ONLY_ON_DEVICE`. The SDK response supplies actual provenance.
5. Cloud assistance requires explicit consent, an initialized App Check provider, fresh document context and the central evidence gate. When used, the SDK requests App Check on demand. Diagnostics request a token only after **Check cloud connection** is activated. Firebase requests cannot be prerequisites for deterministic outcomes.

No telemetry or background inference was added. Network failure can prevent optional cloud results. It does not prevent scanning or regular recovery. If no local model is ready, the user can continue with **Rules only** or the recovery tools.

## Verification

Run `npm run build` then `npm run verify:offline`. The harness launches a fresh Chromium profile with a deny-by-default hostname resolver rule, proxy use disabled, and the known loopback origin reachable. It verifies an external navigation fails DNS and a service-worker external fetch rejects. It then runs the built extension against the loopback playground. Browser-context HTTP observation begins before the panel starts. The test skips its own two connectivity probes and expected local page and asset loads when counting application traffic. The isolation targets DNS-based internet services, including Firebase. It does not change system or personal Chrome networking and is not an IP-level firewall test.

The isolated run passed **40/40** checks, including panel and diagnostics startup, local-only settings, scan, deterministic repair, exact Undo, recovery, page DOM live-region delivery, Jump, replay, dismiss, page-owned announcements, success confirmation, site disable and bounded icon extraction. Playwright observed **zero unexpected HTTP requests** during the application workflow. The deployment test grants only the loopback site for the isolated extension. Chrome's own permission prompt and actual assistive technology speech remain manual. Nano is unavailable in this automation profile, so this result covers the deterministic core and PNG extraction.

## Regular Chrome verification

1. Build and reload the unpacked extension in the regular Chrome profile. Run `npm run playground` and open the loopback fixture.
2. In the panel leave **Local only** enabled. Confirm the model has already downloaded in diagnostics. Use the existing screens to initialize while connected if necessary.
3. Disable Wi-Fi and Ethernet in Windows. Check another tab cannot reach a normal public site. Leave the local fixture open and use ClearCue to scan, repair by rule and Undo.
4. To prove offline Nano execution, choose a reasoning fixture and record a real SDK `ON_DEVICE` result while disconnected. Record an abstention separately from a label proposal and a successful write. Check the computed accessible name and use Undo if an apply succeeded.
5. For voice output, compare enabled and disabled with [NVDA Speech Viewer](STAGE5_NVDA_GUIDE.md). Run the separate [visual comparison](STAGE5_5_MULTIMODAL.md) to establish local image behavior.

[Firebase hybrid inference](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started)

[Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)

Stage 6 adds `npm run verify:stage6-live`. Typed goals, deterministic ranking and explicit
focus passed with DNS isolated. Local speech pack download is a separate explicit browser
operation. Unavailable voice or Nano leaves the typed flow usable.
