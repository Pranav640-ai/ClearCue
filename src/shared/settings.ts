import { z } from "zod";
import type { ExtensionSettings, PrivacyMode } from "./types";

export const SETTINGS_KEY = "clearcue.settings.v1";

export const DEFAULT_SETTINGS: ExtensionSettings = {
  schemaVersion: 1,
  // Local-only is the safe default: cloud requires an explicit user action.
  privacyMode: "local_only",
  cloudOptInAt: null,
  allowCloudForDiagnostics: true,
  maxCloudEvidenceCharacters: 400,
  announceRecoveryMessages: true,
  explanationDetail: "detailed",
  speechOutput: "screen_reader",
  speechVoice: null,
  speechRate: 1,
  onboardingSeen: false,
  autoRepair: false,
  repairPaused: false,
};

export const settingsSchema = z.object({
  schemaVersion: z.literal(1),
  privacyMode: z.enum(["local_only", "cloud_allowed"]),
  cloudOptInAt: z.string().nullable(),
  allowCloudForDiagnostics: z.boolean(),
  maxCloudEvidenceCharacters: z.number().int().min(0).max(4000),
  announceRecoveryMessages: z.boolean(),
  explanationDetail: z.enum(["concise", "detailed"]),
  speechOutput: z.enum(["screen_reader", "local_voice"]),
  speechVoice: z.string().min(1).max(250).nullable(),
  speechRate: z.number().min(0.5).max(2),
  onboardingSeen: z.boolean(),
  autoRepair: z.boolean(),
  repairPaused: z.boolean(),
});

/**
 * Merge a patch into settings while preserving invariants:
 * - turning cloud off clears the opt-in timestamp;
 * - turning cloud on always records a fresh explicit opt-in time.
 */
export function mergeSettings(current: ExtensionSettings, patch: Partial<ExtensionSettings>, now = new Date().toISOString()): ExtensionSettings {
  const next: ExtensionSettings = { ...current, ...patch, schemaVersion: 1 };

  if (next.privacyMode === "local_only") {
    next.cloudOptInAt = null;
  } else if (current.privacyMode !== "cloud_allowed" || current.cloudOptInAt === null) {
    next.cloudOptInAt = now;
  }

  const requested = Number.isFinite(next.maxCloudEvidenceCharacters) ? Math.trunc(next.maxCloudEvidenceCharacters) : current.maxCloudEvidenceCharacters;
  next.maxCloudEvidenceCharacters = Math.min(4000, Math.max(0, requested));

  return next;
}

/** Parse stored settings, falling back to defaults instead of throwing on corrupt data. */
export function parseStoredSettings(raw: unknown): ExtensionSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_SETTINGS };
  const parsed = settingsSchema.safeParse({
    explanationDetail: DEFAULT_SETTINGS.explanationDetail,
    speechOutput: DEFAULT_SETTINGS.speechOutput,
    speechVoice: DEFAULT_SETTINGS.speechVoice,
    speechRate: DEFAULT_SETTINGS.speechRate,
    onboardingSeen: DEFAULT_SETTINGS.onboardingSeen,
    autoRepair: DEFAULT_SETTINGS.autoRepair,
    repairPaused: DEFAULT_SETTINGS.repairPaused,
    ...raw,
  });
  if (!parsed.success) return { ...DEFAULT_SETTINGS };
  return parsed.data;
}

export function isCloudAllowedForPurpose(settings: ExtensionSettings, purpose: "diagnostics" | "page-evidence"): boolean {
  if (purpose === "diagnostics") return settings.allowCloudForDiagnostics;
  return settings.privacyMode === "cloud_allowed" && settings.cloudOptInAt !== null;
}

export function describePrivacyMode(mode: PrivacyMode): string {
  return mode === "cloud_allowed"
    ? "Cloud allowed: minimal evidence may be sent to Gemini when local inference cannot decide."
    : "Local only: nothing from a webpage is sent to the cloud.";
}
