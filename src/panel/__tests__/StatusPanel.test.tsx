// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TabContext } from "../../shared/types";
import { StatusPanel } from "../components/StatusPanel";

function context(overrides: Partial<TabContext> = {}): TabContext {
  return {
    tabId: 12,
    url: null,
    origin: null,
    title: null,
    status: "permission-required",
    note: "Chrome has not exposed this tab's address. Open ClearCue from the toolbar icon on the page, then try again.",
    contentConnected: false,
    documentId: null,
    siteEnabled: false,
    hostPermissionGranted: false,
    pageSnapshot: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function render(value: TabContext): string {
  return renderToStaticMarkup(
    <StatusPanel context={value} pending={null} onEnable={() => undefined} onDisable={() => undefined} onRefresh={() => undefined} />,
  );
}

describe("status panel site access", () => {
  it("explains the real invocation needed when Chrome hides the tab address", () => {
    const markup = render(context());
    expect(markup).toContain("Access needed");
    expect(markup).toContain("Site</dt><dd>Not available");
    expect(markup).toContain("Alt+Shift+C");
    expect(markup).toContain("Check this tab again");
    expect(markup).not.toContain("Enable on");
  });

  it("shows the per-origin Enable action once the origin is known", () => {
    const markup = render(context({ url: "http://127.0.0.1:4318/stage4.html", origin: "http://127.0.0.1:4318", title: "Stage 4" }));
    expect(markup).toContain("Enable on http://127.0.0.1:4318");
    expect(markup).not.toContain("Check this tab again");
  });

  it("does not suggest a toolbar invocation on a restricted browser page", () => {
    const markup = render(context({ url: "chrome://extensions/", origin: null, status: "restricted-url", note: "Unsupported page." }));
    expect(markup).toContain("Unsupported page.");
    expect(markup).not.toContain("Check this tab again");
  });
});
