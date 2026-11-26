import { AccessibilityScanner } from "./scan";
import { ScanObserver } from "./observer";

/**
 * Test-only entry point. It is built as a standalone IIFE (`dist-test/scanner.js`)
 * so Playwright can run the real scanner on controlled fixtures and on public
 * pages without loading the extension or granting site access.
 */
declare global {
  interface Window {
    ClearCueScanner?: {
      scan: (documentId?: string) => unknown;
      scanTargets: (selectors: string[]) => unknown;
      Scanner: typeof AccessibilityScanner;
      Observer: typeof ScanObserver;
    };
  }
}

window.ClearCueScanner = {
  scan: (documentId = "scanner-test-document") => new AccessibilityScanner(document, documentId).scanAll().summary,
  scanTargets: (selectors: string[]) => {
    const scanner = new AccessibilityScanner(document, "scanner-test-document");
    scanner.scanAll();
    const targets = selectors
      .map((selector) => document.querySelector(selector))
      .filter((element): element is Element => element !== null);
    return scanner.scanTargets(targets).summary;
  },
  Scanner: AccessibilityScanner,
  Observer: ScanObserver,
};

export {};
