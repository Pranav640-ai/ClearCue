# Stage 6 · Context Navigator verification

For explicit command practice, action policy, and the additional NVDA and speech workflow,
see [the Stage 6 activation supplement](STAGE6_ACTIVATION.md).
For follow-up commands, the configurable Context Lens shortcut, and live form requirements,
see [the final runbook](FINAL_MANUAL_RUNBOOK.md#guided-navigation-context-lens-and-form-requirements).

The panel offers typed search, a bounded overview and explicit focus on a selected control. The content script owns the snapshot and its element references. The panel sends only a candidate and snapshot identifier for focus. The worker confirms current tab, site permission and document. Content rechecks identity, URL, role, label, relevant container, link destination and availability, then verifies actual focus. Search never changes focus or activates the page.

Search weighs names, roles, form names and nearby headings and expands common task vocabulary. It gives an explanation derived from the matching field and marks tied results. Local AI reranking is separate and opt-in. A forced on-device Firebase AI Logic request receives only the bounded goal and up to eight already-matched candidates. The schema permits IDs only. Unknown IDs and invalid or unconfirmed results preserve the deterministic order.

Optional one-shot voice input requires a positive Chrome local capability response for English (US) and a confirmed `processLocally` setting. Language-pack download has a separate button. Start, Stop and Cancel operate only from the panel. A transcript fills the editable goal for review. It is ephemeral and follows the same typed submission path. Actual microphone recognition in the Chrome side panel and Nano reranking require the user's regular Chrome profile.

[Web Speech API specification](https://webaudio.github.io/web-speech-api/) · [Firebase hybrid execution](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started)

## Reproduce

After building, run `npm run verify:stage6-live`. It uses the actual Chromium extension and local fixtures with external DNS denied. The Stage 6 checks cover page structure, explainable search, explicit focus, untouched input, untouched activation counters, replacement rejection, ties, no match, cross-tab routing, and SPA reset. The existing 40 offline assertions run first. The harness collects unexpected HTTP requests across the browser context.

## NVDA walkthrough

1. Load `dist/` in regular Chrome, then start `npm run playground`. Start NVDA with Ctrl+Alt+N. Right-click the NVDA notification-area icon and choose **Tools → Speech Viewer**.
2. Open `http://127.0.0.1:4318/member-portal.html` and press Alt+Shift+C (or the custom **Open ClearCue** shortcut in Chrome). Enable the loopback site.
3. Tab to **What would you like to find?** Type **Where can I enter my registration number?** and press Enter. Listen for the result count. Read **Matching controls** and **Page overview** using heading navigation. Confirm that **Focus Registration number, result 1** is distinguishable.
4. Activate that result. Confirm the input receives actual keyboard focus, Speech Viewer identifies it and its fictional existing value is still `HBR-902`. Search **Find details** and check both equal candidates are announced individually.
5. Open `http://127.0.0.1:4318/recovery.html`. In the scholarship section enter registration `BAD` and email `candidate@example.test`, then activate **Continue application** manually. Confirm the observed validation error is spoken once. Use **Jump to affected field**, correct the number to `NF-12345`, and submit manually. Compare against the accessible comparison toggle and with ClearCue disabled. Record the observed success and any duplicate announcements. See [the Stage 5 walkthrough](STAGE5_NVDA_GUIDE.md).
6. If available, activate **Start local voice input**, say **Find registration number**, stop recording, review the text, and submit manually. Repeat with Cancel. If the pack is absent, its download requires a separate action. Confirm typed goals work when voice or Nano is unavailable.
7. Right-click the NVDA notification-area icon, choose **Exit**, and confirm if asked.

DOM focus and live-region updates are test evidence. Actual speech, live microphone transcription, and genuine local ranking require separate manual evidence.

## Recorded results

The final offline rerun passed 52/52 checks. 257 unit tests and 27 browser tests passed. The Stage 4 live rerun passed 38/38 after an earlier Firebase HTTP 500. Stage 5 live passed 32/32 and the separate offline suite passed 40/40. The Navigator suite verified stale snapshot rejection and a fresh overview after a fragment transition.
