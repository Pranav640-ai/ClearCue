import type { SiteAccess, TabContextStatus } from "./types";

export const SITES_KEY = "clearcue.sites.v1";

/** Only ordinary web origins are supported; chrome://, extension and file URLs are not. */
export function normalizeOrigin(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function originPattern(origin: string): string {
  return `${origin}/*`;
}

/** djb2-style hash used only to build a stable content-script id. */
export function hashOrigin(origin: string): string {
  let hash = 5381;
  for (let index = 0; index < origin.length; index += 1) {
    hash = ((hash << 5) + hash + origin.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

export function contentScriptIdForOrigin(origin: string): string {
  return `site-${hashOrigin(origin)}`;
}

export function isSiteEnabled(sites: Record<string, SiteAccess>, origin: string | null): boolean {
  if (!origin) return false;
  return sites[origin]?.enabled === true;
}

export function setSiteEnabled(
  sites: Record<string, SiteAccess>,
  origin: string,
  enabled: boolean,
  now = new Date().toISOString(),
): Record<string, SiteAccess> {
  const next = { ...sites };
  next[origin] = { origin, enabled, enabledAt: enabled ? now : null };
  return next;
}

export function enabledOrigins(sites: Record<string, SiteAccess>): string[] {
  return Object.values(sites)
    .filter((site) => site.enabled)
    .map((site) => site.origin);
}

/** Enabled records in stable alphabetical order, for a predictable UI list. */
export function enabledSiteRecords(sites: Record<string, SiteAccess>): SiteAccess[] {
  return Object.values(sites)
    .filter((site) => site.enabled)
    .sort((left, right) => left.origin.localeCompare(right.origin));
}

/**
 * Decide the truthful status of the current tab. The UI uses this to explain
 * exactly why content is or is not available, rather than showing a bare error.
 */
export function tabStatusFor(input: {
  url: string | null;
  origin: string | null;
  hostPermissionGranted: boolean;
  siteEnabled: boolean;
  contentConnected: boolean;
  contentScriptRegistered: boolean;
}): { status: TabContextStatus; note: string | null } {
  if (!input.url) {
    return {
      status: "no-tab",
      note: "No active tab is available. Open ClearCue from the toolbar icon on the page you want help with.",
    };
  }
  if (!input.origin) {
    return {
      status: "restricted-url",
      note: "ClearCue only works on ordinary http(s) websites. Browser pages, extension pages and local files are excluded.",
    };
  }
  if (!input.siteEnabled) {
    return { status: "permission-required", note: "ClearCue is not enabled on this site yet." };
  }
  if (!input.hostPermissionGranted) {
    return {
      status: "permission-required",
      note: "Chrome has not granted access to this site. Enable the site again to re-approve access.",
    };
  }
  if (!input.contentScriptRegistered) {
    return { status: "connecting", note: "Access is granted; preparing the page inspector." };
  }
  if (!input.contentConnected) {
    return {
      status: "connecting",
      note: "Waiting for the page to respond. Reload the page if this takes more than a few seconds.",
    };
  }
  return { status: "connected", note: null };
}
