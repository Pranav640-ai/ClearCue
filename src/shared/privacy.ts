import type { Evidence, ExtensionSettings } from "./types";

export interface CloudEvidenceSelection {
  allowed: boolean;
  reason: string;
  text: string;
  evidenceIds: string[];
  /** Characters kept from the eligible evidence. */
  sentCharacters: number;
}

/**
 * A single item may leave the device only when policy says so *and* the item's
 * own classification is cloud-eligible. Items marked prohibited are rejected
 * even if a caller mistakenly set `cloudSafe`.
 */
export function isCloudEligible(item: Evidence): boolean {
  if (item.privacy === "prohibited") return false;
  if (!item.cloudSafe) return false;
  if (item.privacy === undefined) return true; // legacy fixtures without a privacy field
  return item.privacy === "cloud-eligible";
}

/**
 * Decide whether any page evidence may leave the device, and produce the
 * minimum payload if it may. This is the single place where cloud evidence
 * policy is evaluated; future features must call it instead of re-implementing
 * privacy checks.
 */
export function selectCloudEvidence(
  evidence: readonly Evidence[],
  settings: ExtensionSettings,
  purpose: "diagnostics" | "page-evidence",
): CloudEvidenceSelection {
  if (purpose === "diagnostics") {
    return {
      allowed: settings.allowCloudForDiagnostics,
      reason: settings.allowCloudForDiagnostics
        ? "Diagnostics use hand-written fictional prompts only."
        : "Cloud requests for diagnostics are turned off in settings.",
      text: "",
      evidenceIds: [],
      sentCharacters: 0,
    };
  }

  if (settings.privacyMode !== "cloud_allowed" || settings.cloudOptInAt === null) {
    return {
      allowed: false,
      reason: "Local-only mode is on. Page evidence never leaves the device.",
      text: "",
      evidenceIds: [],
      sentCharacters: 0,
    };
  }

  const eligible = evidence.filter(isCloudEligible);
  const prohibitedCount = evidence.filter((item) => item.privacy === "prohibited").length;
  if (eligible.length === 0) {
    return {
      allowed: false,
      reason:
        prohibitedCount > 0
          ? "All available evidence is classified as prohibited; nothing may be sent."
          : "No evidence on this page is classified as safe to send.",
      text: "",
      evidenceIds: [],
      sentCharacters: 0,
    };
  }

  const lines: string[] = [];
  const evidenceIds: string[] = [];
  let used = 0;
  for (const item of eligible) {
    const line = `${item.id}: ${redactSensitiveText(item.value)}`;
    if (used + line.length > settings.maxCloudEvidenceCharacters) break;
    lines.push(line);
    evidenceIds.push(item.id);
    used += line.length;
  }

  if (lines.length === 0) {
    return {
      allowed: false,
      reason: `The evidence budget (${settings.maxCloudEvidenceCharacters} characters) is too small for the available evidence.`,
      text: "",
      evidenceIds: [],
      sentCharacters: 0,
    };
  }

  return {
    allowed: true,
    reason: "Minimal, evidence-classified content only.",
    text: lines.join("\n"),
    evidenceIds,
    sentCharacters: used,
  };
}

/**
 * Defence in depth: strip obvious secrets before any text can be included in a
 * cloud request. This is not a substitute for never collecting form values.
 */
export function redactSensitiveText(value: string, max = 240): string {
  return value
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "[email]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[number]")
    .replace(/\bpassword\b/gi, "[secret]")
    .slice(0, max);
}
