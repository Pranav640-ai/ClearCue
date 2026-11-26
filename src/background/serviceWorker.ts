import { announceFocusedContext, installMessageRouter, installTabLifecycle } from "./router";
import { ensureEnabledScriptsRegistered } from "./scriptRegistry";

/**
 * Background service worker.
 *
 * Responsibilities: typed message routing, tab lifecycle bookkeeping, side panel
 * behaviour and keyboard commands. It performs NO inference: Chrome's Prompt API
 * is unavailable in service workers, so all inference lives in extension
 * documents (side panel / diagnostics page).
 */

installMessageRouter();
installTabLifecycle();

/**
 * Do not let Chrome open the panel implicitly from the action icon.
 *
 * `setPanelBehavior({ openPanelOnActionClick: true })` does not count as the
 * user invoking the extension, so Chrome does not grant `activeTab`; the panel
 * then sees no URL or title. The explicit `action.onClicked` path below is a
 * real invocation, and it opens the same side panel.
 */
async function disableImplicitPanelBehavior(): Promise<void> {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch (error) {
    console.warn("[ClearCue] Could not configure the side panel behaviour.", error);
  }
}

void disableImplicitPanelBehavior();

function openPanelForTab(tab: chrome.tabs.Tab): void {
  if (tab.id === undefined) return;
  try {
    // This call must happen synchronously inside the user-gesture handler.
    const opening = chrome.sidePanel.open({ tabId: tab.id });
    void opening.catch((error: unknown) => {
      console.warn("[ClearCue] Could not open the side panel.", error);
    });
  } catch (error) {
    console.warn("[ClearCue] Could not open the side panel.", error);
  }
}

function openPanelForCurrentWindow(): void {
  try {
    // Commands are user gestures. Calling open() before any await preserves it.
    const opening = chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    void opening.catch((error: unknown) => {
      console.warn("[ClearCue] Could not open the side panel.", error);
    });
  } catch (error) {
    console.warn("[ClearCue] Could not open the side panel.", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void disableImplicitPanelBehavior();
  void ensureEnabledScriptsRegistered();
});

chrome.runtime.onStartup.addListener(() => {
  void disableImplicitPanelBehavior();
  void ensureEnabledScriptsRegistered();
});

chrome.action.onClicked.addListener((tab) => {
  openPanelForTab(tab);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "explain-focus" && tab?.id !== undefined) {
    void announceFocusedContext(tab.id).catch(() => undefined);
    return;
  }
  if (command === "open-panel") {
    openPanelForCurrentWindow();
    return;
  }
  if (command === "open-diagnostics") {
    void chrome.tabs.create({ url: chrome.runtime.getURL("diagnostics.html") });
  }
});
