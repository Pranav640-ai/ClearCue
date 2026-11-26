import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../shared/settings";
import { handleMessage, isContentSender } from "../router";

const panelUrl = "chrome-extension://clearcue/panel.html";
const diagUrl = "chrome-extension://clearcue/diagnostics.html";
const sender = { id: "clearcue", tab: { id: 8 } as chrome.tabs.Tab, frameId: 0, documentId: "chrome-doc" };

afterEach(() => vi.unstubAllGlobals());

describe("runtime message boundaries", () => {
  it("rejects a tabbed extension frame without active browser-document identity", () => {
    vi.stubGlobal("chrome", { runtime: { id: "clearcue" } });
    expect(isContentSender({ ...sender, documentLifecycle: "active" })).toBe(true);
    expect(isContentSender({ ...sender, frameId: 2 })).toBe(false);
    expect(isContentSender({ ...sender, documentId: undefined })).toBe(false);
    expect(isContentSender({ ...sender, documentLifecycle: "cached" })).toBe(false);
  });

  it("permits only diagnostics to read the cloud diagnostics preference", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "clearcue", getURL: (path: string) => "chrome-extension://clearcue/" + path },
      storage: { local: { get: async (key: string) => ({ [key]: { ...DEFAULT_SETTINGS, allowCloudForDiagnostics: false } }) } },
    });
    const request = { kind: "diagnostics:cloudAllowed" };
    expect(await handleMessage(request, { id: "clearcue", url: panelUrl })).toMatchObject({ code: "untrusted-sender" });
    expect(await handleMessage(request, { id: "clearcue", url: diagUrl })).toEqual({ ok: true, data: false });
    expect(await handleMessage({ kind: "panel:getState" }, { id: "clearcue", url: diagUrl })).toMatchObject({ code: "untrusted-sender" });
  });
});
