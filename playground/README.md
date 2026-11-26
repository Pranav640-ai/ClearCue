# ClearCue Accessibility Playground

A static demo site used to test ClearCue against realistic tasks. All content is fictional.

```bash
npm run playground      # http://127.0.0.1:4318/
```

No build step. `scripts/serve-playground.mjs` serves these files with `no-store` caching so edits
show up immediately.

## Pages

| Page | Workflow | Defects |
| --- | --- | --- |
| `index.html` | Overview and instructions | — |
| `scholarship.html` | Three-step scholarship application (flagship) | D-01 … D-06 |
| `shopping.html` | Product list, quantities, basket total | D-07 … D-09 |
| `account.html` | Notification switches, save and delete | D-10 … D-12 |

Each page has a **Reset this page** control. The scholarship form also keeps its state while you
move between steps, so validation and review can be exercised repeatedly.

## Intentional defects

Every defect is tagged in the markup with `data-defect="D-xx"` and listed in a disclosure at the
bottom of its page.

| ID | Page | Defect | Expected ClearCue finding |
| --- | --- | --- | --- |
| D-01 | Scholarship | Full-name input has a placeholder but no label | `unlabeled-form-field`, severity serious |
| D-02 | Scholarship | Eligibility link text is only “Click here” | `vague-link-text` |
| D-03 | Scholarship | Validation summary is not a live region and is never focused | `silent-validation-error`, severity blocking |
| D-04 | Scholarship | Remove-attachment button is an unnamed trash icon | `missing-accessible-name` |
| D-05 | Scholarship | Word counter updates silently on every keystroke | `unannounced-state-change` |
| D-06 | Scholarship | Submit replaces the form; focus is lost, nothing is announced | `unannounced-state-change`, severity serious |
| D-07 | Shopping | “Add to basket” buttons are icon-only with no name | `missing-accessible-name` |
| D-08 | Shopping | Basket total changes with no live region | `unannounced-state-change` |
| D-09 | Shopping | “Added to basket” toast appears and disappears silently (`aria-hidden`) | `unannounced-state-change` |
| D-10 | Account | Email-notifications switch has role/state but no accessible name | `missing-accessible-name` |
| D-11 | Account | “Delete account” uses the same primary styling and position as “Save changes” | `ambiguous-destructive-action` |
| D-12 | Account | Save confirmation is a check icon only, never announced | `unannounced-state-change` |

## Design rules for this site

- Fictional brands, prices, phone numbers and `.example` email addresses only.
- Working interactions, including keyboard operation for every control that is meant to work.
- Defects are accessibility barriers, not security holes or dark patterns.
- Everything except the documented defects is genuinely accessible: labels, focus styles, heading
  order, skip link, live regions where appropriate.
- No network requests, no storage, no tracking.

## Using it with a screen reader

1. Enable ClearCue on `http://127.0.0.1:4318` from the side panel.
2. Walk a workflow start to finish (NVDA recommended on Windows).
3. Note the point where you lose context or cannot tell what changed.
4. Compare with the disclosure at the bottom of the page and the table above.
5. Press **Reset this page** and repeat with ClearCue disabled, to compare.
