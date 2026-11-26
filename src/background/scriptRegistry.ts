import { contentScriptIdForOrigin, originPattern, enabledOrigins } from "../shared/sites";
import { readSites } from "./storage";

export async function hasHostPermission(origin: string): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: [originPattern(origin)] });
  } catch {
    return false;
  }
}

export async function isContentScriptRegistered(origin: string): Promise<boolean> {
  const id = contentScriptIdForOrigin(origin);
  try {
    const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
    return scripts.length > 0;
  } catch {
    return false;
  }
}

export async function registerContentScriptForOrigin(origin: string): Promise<void> {
  const id = contentScriptIdForOrigin(origin);
  await unregisterContentScriptForOrigin(origin);
  await chrome.scripting.registerContentScripts([
    {
      id,
      matches: [originPattern(origin)],
      js: ["content.js"],
      runAt: "document_idle",
      allFrames: false,
      persistAcrossSessions: true,
    },
  ]);
}

export async function unregisterContentScriptForOrigin(origin: string): Promise<void> {
  const id = contentScriptIdForOrigin(origin);
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
  } catch {
    // Nothing registered for this origin; nothing to undo.
  }
}

/** Inject immediately into an already-open tab so enabling does not require a reload. */
export async function injectContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

export async function ensureEnabledScriptsRegistered(): Promise<{ origin: string; error: string | null }[]> {
  const sites = await readSites();
  const results: { origin: string; error: string | null }[] = [];
  for (const origin of enabledOrigins(sites)) {
    if (!(await hasHostPermission(origin))) {
      results.push({ origin, error: "Host permission is missing; the site stays disabled until re-approved." });
      continue;
    }
    try {
      await registerContentScriptForOrigin(origin);
      results.push({ origin, error: null });
    } catch (error) {
      results.push({ origin, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}
