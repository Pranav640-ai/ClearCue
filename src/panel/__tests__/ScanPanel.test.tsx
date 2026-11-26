// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccessibilityScanner } from "../../content/scanner/scan";
import { EMPTY_SCAN_STATE, type TabScanState } from "../../shared/scan";
import { ScanPanel } from "../components/ScanPanel";

function scannedState(html: string): TabScanState {
  document.body.innerHTML = html;
  const summary = new AccessibilityScanner(document, "panel-test-document").scanAll().summary;
  return { status: "ready", summary, error: null, updatedAt: summary.scannedAt };
}

function render(state: TabScanState, canScan = true): string {
  return renderToStaticMarkup(<ScanPanel scan={state} pending={null} canScan={canScan} onRescan={() => undefined} />);
}

describe("scan panel rendering", () => {
  it("shows real counts and issue rows from a real scan", () => {
    const markup = render(
      scannedState(
        `<main><h2>Newsletter</h2>
          <button><svg><title>Search</title></svg></button>
          <input id="promo" placeholder="Promo code">
          <a href="/offers/summer">Read more</a>
        </main>`,
      ),
    );

    expect(markup).toContain("Accessibility scan");
    expect(markup).toContain("Missing button labels");
    expect(markup).toContain("Missing form labels");
    expect(markup).toContain("Vague links");
    expect(markup).toContain("No accessible name");
    expect(markup).toContain("Deterministic candidate");
    expect(markup).toContain("(stays on device)");
    expect(markup).toContain("Detected accessibility issues");
  });

  it("renders a clean page without inventing issues or repair counts", () => {
    const markup = render(
      scannedState(`<main><h2>Account</h2><label for="email">Email</label><input id="email"><button>Save</button></main>`),
    );
    expect(markup).toContain("No accessibility issues were detected on this page by the supported checks.");
    expect(markup).toContain("Scan Again");
  });

  it("shows an honest idle state before any scan", () => {
    const markup = render(EMPTY_SCAN_STATE, false);
    expect(markup).toContain("No scan result yet.");
    expect(markup).toContain("disabled");
  });

  it("surfaces a real scan error as an alert", () => {
    const markup = render({ status: "error", summary: null, error: "The page could not be scanned.", updatedAt: null });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("The page could not be scanned.");
  });
});
