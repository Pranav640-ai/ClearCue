import { z } from "zod";
import { ROUTING_REASONS } from "./repair";
import { recoveryEventSchema } from "./recoverySchema";
import { settingsSchema } from "./settings";
import type { PanelState } from "./types";

/**
 * Typed message protocol.
 *
 * Every message is validated at the background boundary with Zod. Panel
 * messages must come from this extension's own pages; content messages must
 * carry a tab sender. Payloads never carry a trusted tabId: the background
 * always uses `sender.tab.id`.
 */

export const pageSnapshotSchema = z.object({
  documentId: z.string().min(8).max(64),
  url: z.string().max(4096),
  origin: z.string().min(1).max(2048),
  title: z.string().max(512),
  counts: z.object({
    forms: z.number().int().min(0),
    fields: z.number().int().min(0),
    buttons: z.number().int().min(0),
    links: z.number().int().min(0),
  }),
  at: z.string().min(1),
});

export const settingsPatchSchema = settingsSchema
  .omit({ schemaVersion: true })
  .partial()
  .strict();

const scanEvidenceSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum([
    "role",
    "native-element",
    "accessible-name",
    "attribute",
    "icon",
    "nearby-text",
    "heading",
    "label",
    "structure",
    "link-destination",
    "relationship",
  ]),
  value: z.string().max(200),
  privacy: z.enum(["local-only", "cloud-eligible", "prohibited"]),
  note: z.string().max(200).optional(),
});

const repairCandidateSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(["aria-label", "repair-reference", "link-context", "associated-label"]),
  proposedValue: z.string().max(160),
  support: z.enum(["direct", "heuristic"]),
  confidence: z.enum(["high", "medium", "low"]),
  rationale: z.string().max(300),
  evidenceIds: z.array(z.string().max(80)).max(8),
});

const scannedIssueSchema = z.object({
  id: z.string().min(1).max(300),
  category: z.enum([
    "button-name",
    "icon-control-name",
    "link-name",
    "vague-link",
    "form-control-name",
    "custom-control-name",
    "broken-relationship",
    "invalid-aria-reference",
  ]),
  severity: z.enum(["failure", "heuristic"]),
  ruleId: z.string().min(1).max(80),
  element: z.object({
    ref: z.string().min(1).max(300),
    tagName: z.string().min(1).max(40),
    role: z.string().max(40).optional(),
    locator: z.string().max(300),
  }),
  accessibleName: z.string().max(200),
  evidence: z.array(scanEvidenceSchema).max(12),
  candidates: z.array(repairCandidateSchema).max(4),
  needsReasoning: z.boolean(),
  status: z.literal("open"),
  detectedAt: z.string().min(1).max(40),
});

export const scanSummarySchema = z.object({
  documentId: z.string().min(8).max(64),
  url: z.string().max(2048),
  origin: z.string().max(2048),
  scannedAt: z.string().min(1).max(40),
  durationMs: z.number().min(0).max(600000),
  interactiveCount: z.number().int().min(0),
  issueTotal: z.number().int().min(0),
  counts: z.object({
    total: z.number().int().min(0),
    missingButtonLabels: z.number().int().min(0),
    missingFormLabels: z.number().int().min(0),
    missingLinkLabels: z.number().int().min(0),
    vagueLinks: z.number().int().min(0),
    other: z.number().int().min(0),
    byCategory: z.record(
      z.enum([
        "button-name",
        "icon-control-name",
        "link-name",
        "vague-link",
        "form-control-name",
        "custom-control-name",
        "broken-relationship",
        "invalid-aria-reference",
      ]),
      z.number().int().min(0),
    ),
  }),
  issues: z.array(scannedIssueSchema).max(80),
  truncated: z.boolean(),
  limits: z.object({
    maxInteractive: z.number().int().min(1),
    maxIssues: z.number().int().min(1),
    maxReturnedIssues: z.number().int().min(1),
  }),
});

export const repairApplyRequestSchema = z
  .object({
    issueId: z.string().min(1).max(300),
    documentId: z.string().min(8).max(64),
    locator: z.string().min(1).max(300),
    expectedTag: z.string().min(1).max(40),
    label: z.string().min(1).max(120),
    kind: z.enum(["accessible-name", "repair-reference"]),
    target: z.enum(["aria-label", "aria-labelledby"]),
    snapshot: z
      .array(
        z
          .object({
            name: z.enum(["aria-label", "aria-labelledby"]),
            present: z.boolean(),
            value: z.string().max(2000).nullable(),
          })
          .strict(),
      )
      .max(4),
    proposedBy: z.enum(["rule", "on_device", "in_cloud"]),
    explanation: z.string().max(300),
  })
  .strict();

const repairAttemptSchema = z
  .object({
    id: z.string().min(1).max(80),
    issueId: z.string().min(1).max(300),
    category: z.enum([
      "button-name",
      "icon-control-name",
      "link-name",
      "vague-link",
      "form-control-name",
      "custom-control-name",
      "broken-relationship",
      "invalid-aria-reference",
    ]),
    tabId: z.number().int().nullable(),
    documentId: z.string().min(8).max(64),
    pageUrl: z.string().max(2048),
    status: z.enum(["applied", "suggested", "abstained", "failed"]),
    action: z.enum(["apply", "suggest", "abstain"]),
    source: z.enum(["rule", "on_device", "in_cloud", "unknown"]),
    routing: z.array(z.enum(ROUTING_REASONS)).max(8),
    checks: z.array(z.string().max(200)).max(12),
    heuristicNotes: z.array(z.string().max(200)).max(8),
    proposedLabel: z.string().max(120).nullable(),
    appliedRepairId: z.string().max(80).nullable(),
    latencyMs: z.number().min(0).max(600000),
    inferenceMs: z.number().min(0).max(600000).nullable(),
    error: z.string().max(300).nullable(),
    createdAt: z.string().min(1).max(40),
  })
  .strict();

const repairSuggestionSchema = z
  .object({
    id: z.string().min(1).max(80),
    issueId: z.string().min(1).max(300),
    category: z.enum([
      "button-name",
      "icon-control-name",
      "link-name",
      "vague-link",
      "form-control-name",
      "custom-control-name",
      "broken-relationship",
      "invalid-aria-reference",
    ]),
    documentId: z.string().min(8).max(64),
    pageUrl: z.string().max(2048),
    label: z.string().min(1).max(120),
    source: z.enum(["rule", "on_device", "in_cloud"]),
    reasons: z.array(z.enum(ROUTING_REASONS)).max(8),
    heuristicNotes: z.array(z.string().max(200)).max(8),
    createdAt: z.string().min(1).max(40),
  })
  .strict();

export const repairUndoRequestSchema = z
  .object({
    repairId: z.string().min(1).max(80),
    issueId: z.string().min(1).max(300),
    documentId: z.string().min(8).max(64),
    locator: z.string().min(1).max(300),
    target: z.enum(["aria-label", "aria-labelledby"]),
    expectedCurrentValue: z.string().min(1).max(2000),
    previousValue: z.string().max(2000).nullable(),
    previousPresent: z.boolean(),
  })
  .strict();

export const panelRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("panel:getState") }).strict(),
  z.object({ kind: z.literal("panel:setSiteEnabled"), origin: z.string().min(1).max(2048), enabled: z.boolean() }).strict(),
  z.object({ kind: z.literal("panel:updateSettings"), patch: settingsPatchSchema }).strict(),
  z.object({ kind: z.literal("panel:undoRepair"), repairId: z.string().min(1).max(128) }).strict(),
  z.object({ kind: z.literal("panel:rescan") }).strict(),
  z.object({ kind: z.literal("panel:navigationOverview"), tabId: z.number().int(), documentId: z.string().max(128) }).strict(),
  z.object({ kind: z.literal("panel:navigationContext"), tabId: z.number().int(), documentId: z.string().max(128) }).strict(),
  z.object({ kind: z.literal("panel:navigationFocus"), tabId: z.number().int(), documentId: z.string().max(128),
    snapshotId: z.uuid(), candidateId: z.string().regex(/^\d{1,3}$/) }).strict(),
  z
    .object({
      kind: z.literal("panel:checkTarget"),
      documentId: z.string().min(1).max(128),
      issueId: z.string().min(1).max(300),
      locator: z.string().min(1).max(300),
      expectedTag: z.string().min(1).max(40),
    })
    .strict(),
  z.object({
    kind: z.literal("panel:localIcon"),
    issueId: z.string().min(1).max(300),
    documentId: z.string().min(1).max(128),
  }).strict(),
  z.object({ kind: z.literal("panel:repairApply"), request: repairApplyRequestSchema }).strict(),
  z.object({ kind: z.literal("panel:undoAllRepairs") }).strict(),
  z.object({ kind: z.literal("panel:recordAttempt"), attempt: repairAttemptSchema }).strict(),
  z.object({ kind: z.literal("panel:recordSuggestion"), suggestion: repairSuggestionSchema }).strict(),
  z.object({ kind: z.literal("panel:dismissSuggestion"), suggestionId: z.string().min(1).max(80) }).strict(),
  z
    .object({
      kind: z.literal("panel:recordInference"),
      requestedSource: z.enum(["on_device", "in_cloud"]),
      attempted: z.boolean(),
      source: z.enum(["on_device", "in_cloud", "unknown"]),
      latencyMs: z.number().min(0).max(600000),
      purpose: z.string().min(1).max(80),
      ok: z.boolean(),
      error: z.string().max(300).nullable(),
    })
    .strict(),
  z.object({ kind: z.literal("panel:openDiagnostics") }).strict(),
  z.object({ kind: z.literal("panel:focusRecovery"), eventId: z.string().min(1).max(80) }).strict(),
  z.object({ kind: z.literal("panel:replayRecovery"), eventId: z.string().min(1).max(80) }).strict(),
  z.object({ kind: z.literal("panel:dismissRecovery"), eventId: z.string().min(1).max(80) }).strict(),
]);

export const contentMessageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("content:hello"), snapshot: pageSnapshotSchema }).strict(),
  z.object({ kind: z.literal("content:pageChanged"), snapshot: pageSnapshotSchema }).strict(),
  z.object({ kind: z.literal("content:snapshot"), snapshot: pageSnapshotSchema }).strict(),
  z.object({ kind: z.literal("content:scan"), summary: scanSummarySchema }).strict(),
  z
    .object({
      kind: z.literal("content:repairsRestored"),
      documentId: z.string().min(8).max(64),
      repairIds: z.array(z.string().min(1).max(80)).max(50),
    })
    .strict(),
  z
    .object({
      kind: z.literal("content:scanError"),
      documentId: z.string().min(8).max(64),
      error: z.string().min(1).max(300),
    })
    .strict(),
  z
    .object({
      kind: z.literal("content:recovery"),
      event: recoveryEventSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("content:recoveryAnnounced"),
      documentId: z.string().min(8).max(64),
      eventId: z.string().min(1).max(80),
      ok: z.boolean(),
      error: z.string().max(300).nullable(),
    })
    .strict(),
]);

export type PanelRequest = z.infer<typeof panelRequestSchema>;
export type ContentMessage = z.infer<typeof contentMessageSchema>;
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

/** Messages the background sends to content scripts. */
export type BackgroundToContentMessage =
  | { kind: "bg:requestSnapshot" }
  | { kind: "bg:navigationOverview"; documentId: string; pageUrl: string }
  | { kind: "bg:navigationContext"; documentId: string; pageUrl: string; announce?: true }
  | { kind: "bg:navigationFocus"; documentId: string; pageUrl: string; snapshotId: string; candidateId: string }
  | { kind: "bg:requestScan" }
  | { kind: "bg:siteDisabled" }
  | { kind: "bg:applyRepair"; request: import("./repair").RepairApplyRequest }
  | { kind: "bg:localIcon"; documentId: string; issue: import("./scan").ScannedIssue }
  | { kind: "bg:checkTarget"; issue: import("./scan").ScannedIssue }
  | { kind: "bg:undoRepair"; request: import("./repair").RepairUndoRequest }
  | { kind: "bg:undoAllRepairs"; requests: import("./repair").RepairUndoRequest[] }
  | { kind: "bg:focusRecovery"; eventId: string; documentId: string; locator: string }
  | { kind: "bg:announceRecovery"; event: import("./recovery").RecoveryEvent; replay: boolean }
  | { kind: "bg:recoveryStop" };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; code: string };

export type RecoveryActionData =
  | { kind: "focus"; focused: boolean; message: string; name: string }
  | { kind: "replay"; scheduled: boolean; message: string }
  | { kind: "dismiss"; message: string };

export type PanelResponse = ApiResult<PanelState>;

export function failure(error: string, code = "request-failed"): { ok: false; error: string; code: string } {
  return { ok: false, error, code };
}
