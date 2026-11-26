import type { ActivityStats, AppliedRepair, ExtensionSettings, SiteAccess } from "../shared/types";
import type { RepairAttempt, RepairSuggestion } from "../shared/repair";
import { DEFAULT_SETTINGS, SETTINGS_KEY, parseStoredSettings } from "../shared/settings";
import { SITES_KEY } from "../shared/sites";

const ACTIVITY_KEY = "clearcue.activity.v1";
const REPAIRS_KEY = "clearcue.repairs.v1";
const ATTEMPTS_KEY = "clearcue.attempts.v1";
const SUGGESTIONS_KEY = "clearcue.suggestions.v1";
const INFERENCE_KEY = "clearcue.inference.v1";
const TAB_PREFIX = "clearcue.tab.v1.";

export interface InferenceRecord {
  requestedSource?: "on_device" | "in_cloud";
  attempted?: boolean;
  source: "on_device" | "in_cloud" | "unknown";
  latencyMs: number;
  purpose: string;
  ok: boolean;
  error: string | null;
  at: string;
}

export const EMPTY_ACTIVITY: ActivityStats = {
  repairsApplied: 0,
  repairsUndone: 0,
  recoveryMessages: 0,
  inference: { ruleRepairs: 0, onDeviceCalls: 0, inCloudCalls: 0 },
  updatedAt: null,
};

export async function readSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return parseStoredSettings(stored[SETTINGS_KEY]);
}

export async function writeSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function readSites(): Promise<Record<string, SiteAccess>> {
  const stored = await chrome.storage.local.get(SITES_KEY);
  const value = stored[SITES_KEY];
  return value && typeof value === "object" ? (value as Record<string, SiteAccess>) : {};
}

export async function writeSites(sites: Record<string, SiteAccess>): Promise<void> {
  await chrome.storage.local.set({ [SITES_KEY]: sites });
}

export async function readActivity(): Promise<ActivityStats> {
  const stored = await chrome.storage.local.get(ACTIVITY_KEY);
  const value = stored[ACTIVITY_KEY] as Partial<ActivityStats> | undefined;
  if (!value) return { ...EMPTY_ACTIVITY };
  return {
    ...EMPTY_ACTIVITY,
    ...value,
    inference: { ...EMPTY_ACTIVITY.inference, ...(value.inference ?? {}) },
  };
}

export async function writeActivity(activity: ActivityStats): Promise<void> {
  await chrome.storage.local.set({ [ACTIVITY_KEY]: activity });
}

export async function readRepairs(): Promise<AppliedRepair[]> {
  const stored = await chrome.storage.local.get(REPAIRS_KEY);
  const value = stored[REPAIRS_KEY];
  return Array.isArray(value) ? (value as AppliedRepair[]) : [];
}

export async function writeRepairs(repairs: AppliedRepair[]): Promise<void> {
  await chrome.storage.local.set({ [REPAIRS_KEY]: repairs.slice(-200) });
}

export async function appendAttempt(attempt: RepairAttempt): Promise<void> {
  const stored = await chrome.storage.local.get(ATTEMPTS_KEY);
  const existing = Array.isArray(stored[ATTEMPTS_KEY]) ? (stored[ATTEMPTS_KEY] as RepairAttempt[]) : [];
  await chrome.storage.local.set({ [ATTEMPTS_KEY]: [...existing, attempt].slice(-200) });
}

export async function readAttempts(): Promise<RepairAttempt[]> {
  const stored = await chrome.storage.local.get(ATTEMPTS_KEY);
  return Array.isArray(stored[ATTEMPTS_KEY]) ? (stored[ATTEMPTS_KEY] as RepairAttempt[]) : [];
}

export async function readSuggestions(): Promise<RepairSuggestion[]> {
  const stored = await chrome.storage.local.get(SUGGESTIONS_KEY);
  return Array.isArray(stored[SUGGESTIONS_KEY]) ? (stored[SUGGESTIONS_KEY] as RepairSuggestion[]) : [];
}

export async function writeSuggestions(suggestions: RepairSuggestion[]): Promise<void> {
  await chrome.storage.local.set({ [SUGGESTIONS_KEY]: suggestions.slice(-50) });
}

export async function readInferenceRecord(): Promise<InferenceRecord | null> {
  const stored = await chrome.storage.local.get(INFERENCE_KEY);
  return (stored[INFERENCE_KEY] as InferenceRecord | undefined) ?? null;
}

export async function writeInferenceRecord(record: InferenceRecord): Promise<void> {
  await chrome.storage.local.set({ [INFERENCE_KEY]: record });
}

export async function readTabState<T>(tabId: number): Promise<T | null> {
  const key = `${TAB_PREFIX}${tabId}`;
  const stored = await chrome.storage.session.get(key);
  return (stored[key] as T | undefined) ?? null;
}

export async function writeTabState<T>(tabId: number, state: T): Promise<void> {
  await chrome.storage.session.set({ [`${TAB_PREFIX}${tabId}`]: state });
}

export async function deleteTabState(tabId: number): Promise<void> {
  await chrome.storage.session.remove(`${TAB_PREFIX}${tabId}`);
}

export function defaultSettings(): ExtensionSettings {
  return { ...DEFAULT_SETTINGS };
}
