import { Schema } from "@firebase/ai";
import { z } from "zod";
import { toDeviceResponseConstraint, type StructuredContract } from "./contracts";

/**
 * Contract used by the structured JSON diagnostic. The content is entirely
 * fictional so the test proves JSON generation without touching real data.
 */
const pageSummaryZod = z.object({
  summary: z.string().min(1).max(240),
  keyPoints: z.array(z.string().min(1)).min(1).max(3),
  confidence: z.enum(["high", "medium", "low"]),
});

export const pageSummaryContract: StructuredContract = {
  name: "pageSummary",
  zodSchema: pageSummaryZod,
  cloudSchema: Schema.object({
    properties: {
      summary: Schema.string({ description: "One sentence summary of the page." }),
      keyPoints: Schema.array({
        description: "One to three short key points.",
        items: Schema.string(),
        minItems: 1,
        maxItems: 3,
      }),
      confidence: Schema.enumString({
        description: "How confident the model is, based only on the provided text.",
        enum: ["high", "medium", "low"],
      }),
    },
  }),
  deviceConstraint: toDeviceResponseConstraint(pageSummaryZod),
};

/**
 * Contract for the representative accessibility task: propose an accessible
 * name for an unlabeled control, citing the evidence it relied on and
 * abstaining when the evidence is insufficient.
 */
export const accessibilityLabelZod = z.object({
  label: z.string().max(100),
  evidenceIds: z.array(z.string().min(1)).max(6),
  confidence: z.enum(["high", "medium", "low"]),
  abstained: z.boolean(),
  reason: z.string().min(1).max(240),
});

export type AccessibilityLabelProposal = z.infer<typeof accessibilityLabelZod>;

export const accessibilityLabelContract: StructuredContract = {
  name: "accessibilityLabel",
  zodSchema: accessibilityLabelZod,
  cloudSchema: Schema.object({
    properties: {
      label: Schema.string({
        description: "Proposed accessible name (max 100 characters). Empty string when abstaining.",
      }),
      evidenceIds: Schema.array({
        description: "IDs of the evidence entries that support the label, for example [\"E2\",\"E3\"].",
        items: Schema.string(),
        maxItems: 6,
      }),
      confidence: Schema.enumString({
        description: "Confidence based only on the cited evidence.",
        enum: ["high", "medium", "low"],
      }),
      abstained: Schema.boolean({
        description: "True when the evidence is insufficient to choose a label safely.",
      }),
      reason: Schema.string({
        description: "Short justification naming the evidence, or the reason for abstaining.",
      }),
    },
  }),
  deviceConstraint: toDeviceResponseConstraint(accessibilityLabelZod),
};
