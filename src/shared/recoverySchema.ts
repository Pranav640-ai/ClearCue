import { z } from "zod";
import {
  ANNOUNCEMENT_MECHANISMS,
  ANNOUNCEMENT_STATUSES,
  RECOVERY_ACTION_KINDS,
  RECOVERY_CATEGORIES,
  RECOVERY_EVIDENCE_KINDS,
  RECOVERY_SEVERITIES,
  RECOVERY_SOURCES,
} from "./recovery";

/** Zod contracts for the content-to-background recovery boundary. */
export const recoveryEvidenceSchema = z
  .object({
    id: z.string().min(1).max(80),
    kind: z.enum(RECOVERY_EVIDENCE_KINDS),
    value: z.string().max(300),
    privacy: z.literal("local-only"),
  })
  .strict();

export const recoveryRelatedTargetSchema = z
  .object({
    locator: z.string().min(1).max(300),
    tagName: z.string().min(1).max(40),
    role: z.string().max(40).nullable(),
    name: z.string().max(160),
    documentId: z.string().min(8).max(64),
  })
  .strict();

export const recoveryEventSchema = z
  .object({
    id: z.string().min(1).max(80),
    interactionId: z.string().min(1).max(80).nullable(),
    documentId: z.string().min(8).max(64),
    pageUrl: z.string().min(1).max(2048),
    category: z.enum(RECOVERY_CATEGORIES),
    severity: z.enum(RECOVERY_SEVERITIES),
    message: z.string().min(1).max(300),
    evidence: z.array(recoveryEvidenceSchema).max(8),
    related: recoveryRelatedTargetSchema.nullable(),
    association: z.enum(["direct", "inferred", "none"]),
    existingAnnouncement: z.enum(ANNOUNCEMENT_MECHANISMS),
    announcementStatus: z.enum(ANNOUNCEMENT_STATUSES),
    actions: z.array(z.enum(RECOVERY_ACTION_KINDS)).max(3),
    observedAt: z.string().min(1).max(40),
    expiresAt: z.string().min(1).max(40),
    dedupeKey: z.string().min(1).max(240),
    dismissedAt: z.string().min(1).max(40).nullable(),
    replayCount: z.number().int().min(0).max(100),
    source: z.enum(RECOVERY_SOURCES),
  })
  .strict();
