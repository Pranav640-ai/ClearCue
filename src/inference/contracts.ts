import { z } from "zod";
import type { Schema } from "@firebase/ai";

/**
 * A structured-output contract used for BOTH inference paths.
 *
 * The cloud path needs a Firebase `Schema`; Chrome's on-device Prompt API needs
 * a JSON Schema object as `responseConstraint`. Both are derived from one Zod
 * schema so the two paths return the same shape, and the response is validated
 * with the same Zod schema regardless of where it ran.
 */
export interface StructuredContract {
  name: string;
  zodSchema: z.ZodType;
  cloudSchema: Schema;
  deviceConstraint: Record<string, unknown>;
}

/**
 * Convert a Zod schema to a JSON Schema object suitable for Chrome's
 * `responseConstraint`, dropping the `$schema` metadata key which the Prompt
 * API does not need.
 */
export function toDeviceResponseConstraint(zodSchema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(zodSchema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}
