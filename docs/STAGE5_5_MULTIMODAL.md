# Local visual repair

ClearCue now has a forced on-device visual route for a single explicitly requested, genuinely unnamed native button when authored icon metadata is absent. Deterministic repairs retain priority. The panel probes Chrome with both text and image modality declarations. If Chrome says that input configuration is unavailable, or the local renderer rejects the icon, the planner can use local text. The user's **Use local icon images for individual repairs** checkbox can select text-only operation for the current panel session. Automatic repairs and multi-issue runs avoid image extraction.

## How image data moves

- The panel sends issue and document IDs. The background finds that issue in the current tab's scan, checks per-site access and rejects consequential contexts. It forwards the request only to the top frame.
- The content script resolves the original scanned element, verifies the document, identity and absent name, and checks that the control is visible, enabled and outside forms and editable surfaces.
- The content script builds a monochrome 96 × 96 raster from a bounded flat inline SVG viewBox and simple path, circle, line, polygon, polyline and plain rectangle geometry. It uses Canvas and `Path2D`, with no markup rendering or remote resource loading. The image is reconstructed geometry. Page CSS layout, effects and colors are outside this representation.
- The response carries a bounded PNG through Chrome extension messages into volatile panel memory. The Firebase engine accepts bounded inline PNG only in `ONLY_ON_DEVICE`. Text and image have distinct model-cache keys. The Firebase browser adapter decodes a local data URL and passes the image to Chrome.
- ClearCue keeps images out of logs, storage, recovery and the cloud prompt. A subsequent cloud route builds a new text-only prompt solely from evidence approved by the central privacy gate.

Unsupported cases include external graphics, raster photographs, SVG references and children such as groups, text, gradients or scripts, transformed or clipped icons, screenshot capture, and icon fonts and CSS backgrounds. Similar-looking icons may describe different actions. The visual output must cite corroborating text and pass the existing validation gate. A valid visual proposal remains a **suggestion** until the user explicitly applies it. Appearance alone cannot authorize a label or any site action.

## Evidence

The isolated Chromium run used the real built extension and decoded ten 96 × 96 PNGs from the development fixture. It refused three requests covering a form, an SVG reference and a consequential context. The inference-engine tests inject a Firebase model double to assert forced mode, inline PNG, cache separation, local failure and the fresh text-only cloud request. Neither result measures Nano's interpretation, accuracy or latency.

## Regular-profile comparison

1. Reload the built extension, run `npm run playground` and open `http://127.0.0.1:4318/visual-repair.html`. Enable ClearCue and leave privacy in **Local only**. The fixture is development data and contains no held-out ClearBench assets.
2. Start with the checkbox **Use local icon images for individual repairs** cleared. Choose an individual issue by its section heading, for example the workshop inventory, class schedule or notifications card. Record purpose, actual source, CPU/GPU condition if known, label or abstention, latency, and the expected function. If a label is applied, Undo before proceeding.
3. Repeat the same issue with the checkbox checked. A visual SDK attempt appears as `repair-visual-local`. A `repair-batch-local` purpose means the text route ran. An actual `on_device` result plus the visual purpose is required for a genuine local image result. Try again only as a documented repeated measurement.
4. Read the proposal and compare it to the page context. For a correct suggestion, apply explicitly, check the computed name in DevTools **Accessibility**, and use Undo. The same plus glyph appears in two contexts and cannot prove the action by itself. The consequential and unsupported examples should be refused or safely routed without an image.
5. Test one deliberately offline run using the steps in [the offline guide](OFFLINE_ARCHITECTURE.md). Do not infer successful offline execution from a label generated before disconnection.

For a development comparison, record separate denominators for eligible fixtures, attempts, valid outputs, correct labels, applied labels, abstentions, and restored attributes. Report warm latency separately from the first call. Include the two different contexts with the same plus glyph and the custom icon. Evaluate label meaning against fixture context and independent review. Keep this fixture and model-tuning feedback outside Stage 8's held-out dataset.

[Firebase AI Logic local image input](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started)

[Chrome expected modalities and availability](https://developer.chrome.com/docs/ai/prompt-api)
