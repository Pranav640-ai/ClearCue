import { describe, expect, it } from "vitest";
import {
  contentScriptIdForOrigin,
  enabledOrigins,
  enabledSiteRecords,
  isSiteEnabled,
  normalizeOrigin,
  originPattern,
  setSiteEnabled,
  tabStatusFor,
} from "../sites";

const ORIGIN = "https://apply.example.org";

describe("normalizeOrigin", () => {
  it("returns the origin for ordinary web URLs", () => {
    expect(normalizeOrigin(`${ORIGIN}/form?step=2#top`)).toBe(ORIGIN);
    expect(normalizeOrigin("http://localhost:4318/index.html")).toBe("http://localhost:4318");
  });

  it("rejects non-web and malformed URLs", () => {
    expect(normalizeOrigin("chrome://extensions")).toBeNull();
    expect(normalizeOrigin("chrome-extension://abc/panel.html")).toBeNull();
    expect(normalizeOrigin("file:///C:/secrets.html")).toBeNull();
    expect(normalizeOrigin("about:blank")).toBeNull();
    expect(normalizeOrigin("not a url")).toBeNull();
    expect(normalizeOrigin(null)).toBeNull();
  });
});

describe("originPattern / contentScriptIdForOrigin", () => {
  it("builds a valid match pattern", () => {
    expect(originPattern(ORIGIN)).toBe("https://apply.example.org/*");
  });

  it("derives a stable id per origin and different ids for different origins", () => {
    expect(contentScriptIdForOrigin(ORIGIN)).toBe(contentScriptIdForOrigin(ORIGIN));
    expect(contentScriptIdForOrigin(ORIGIN)).not.toBe(contentScriptIdForOrigin("https://shop.example.org"));
    expect(contentScriptIdForOrigin(ORIGIN)).toMatch(/^site-[a-z0-9]+$/);
  });
});

describe("site records", () => {
  it("tracks enablement with a timestamp and clears it on disable", () => {
    const enabled = setSiteEnabled({}, ORIGIN, true, "2026-04-04T09:00:00.000Z");
    expect(isSiteEnabled(enabled, ORIGIN)).toBe(true);
    expect(enabled[ORIGIN]?.enabledAt).toBe("2026-04-04T09:00:00.000Z");

    const disabled = setSiteEnabled(enabled, ORIGIN, false);
    expect(isSiteEnabled(disabled, ORIGIN)).toBe(false);
    expect(disabled[ORIGIN]?.enabledAt).toBeNull();
    expect(enabledOrigins(disabled)).toEqual([]);
  });

  it("treats unknown and null origins as disabled", () => {
    expect(isSiteEnabled({}, ORIGIN)).toBe(false);
    expect(isSiteEnabled({}, null)).toBe(false);
  });

  it("lists only enabled origins", () => {
    let sites = setSiteEnabled({}, ORIGIN, true);
    sites = setSiteEnabled(sites, "https://shop.example.org", false);
    expect(enabledOrigins(sites)).toEqual([ORIGIN]);
  });

  it("returns enabled records alphabetically for the site list", () => {
    let sites = setSiteEnabled({}, "https://shop.example.org", true, "2026-05-02T08:00:00.000Z");
    sites = setSiteEnabled(sites, ORIGIN, true, "2026-05-01T08:00:00.000Z");
    sites = setSiteEnabled(sites, "https://disabled.example.org", false);

    const records = enabledSiteRecords(sites);
    expect(records.map((record) => record.origin)).toEqual([ORIGIN, "https://shop.example.org"]);
    expect(records.every((record) => record.enabled)).toBe(true);
  });

  it("has an empty site list before any consent", () => {
    expect(enabledSiteRecords({})).toEqual([]);
  });
});

describe("tabStatusFor", () => {
  const base = {
    url: `${ORIGIN}/apply`,
    origin: ORIGIN,
    hostPermissionGranted: true,
    siteEnabled: true,
    contentConnected: true,
    contentScriptRegistered: true,
  };

  it("reports connected only when everything is true", () => {
    expect(tabStatusFor(base).status).toBe("connected");
  });

  it("explains each blocking condition instead of failing silently", () => {
    expect(tabStatusFor({ ...base, url: null, origin: null }).status).toBe("no-tab");
    expect(tabStatusFor({ ...base, url: "chrome://settings", origin: null }).status).toBe("restricted-url");
    expect(tabStatusFor({ ...base, siteEnabled: false }).status).toBe("permission-required");
    expect(tabStatusFor({ ...base, hostPermissionGranted: false }).status).toBe("permission-required");
    expect(tabStatusFor({ ...base, contentScriptRegistered: false }).status).toBe("connecting");
    expect(tabStatusFor({ ...base, contentConnected: false }).status).toBe("connecting");
  });

  it("never claims a connection without permission", () => {
    const result = tabStatusFor({ ...base, hostPermissionGranted: false, contentConnected: true });
    expect(result.status).toBe("permission-required");
    expect(result.note).toContain("Enable the site again");
  });
});
