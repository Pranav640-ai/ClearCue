import type { InferenceMode, InferenceSource } from "@firebase/ai";
import type { StructuredContract } from "./contracts";

/** The source the caller *asked* for. Never treated as the actual source. */
export type RequestedMode = InferenceMode;

/** The source the SDK actually used, read from `response.inferenceSource`. */
export type ActualSource = InferenceSource | "unknown";

export interface InferenceRequest {
  key: string;
  label: string;
  description: string;
  mode: RequestedMode;
  prompt: string;
  /** Isolated, synthetic PNG as base64. Permitted only in ONLY_ON_DEVICE mode. */
  imagePng?: string;
  systemInstruction?: string;
  contract?: StructuredContract;
  signal?: AbortSignal;
}

export interface InferenceFailure {
  code: string;
  message: string;
  hint: string;
}

export interface StructuredValidation {
  jsonParsed: boolean;
  schemaValid: boolean;
  issues: string[];
  data: unknown;
}

export type InferenceStatus = "success" | "error" | "skipped";

export interface InferenceOutcome {
  key: string;
  label: string;
  requestedMode: RequestedMode;
  /** Whether generateContent was invoked. SDK dispatch does not establish actual source. */
  attempted?: boolean;
  status: InferenceStatus;
  actualSource: ActualSource;
  latencyMs: number | null;
  /** Reported model identifier, only claimed when the source is known. */
  model: string | null;
  /** True when an ONLY_* mode returned from the other source; surfaced, never hidden. */
  sourceMismatch: boolean;
  text: string | null;
  structured: StructuredValidation | null;
  error: InferenceFailure | null;
  startedAt: string;
}

export interface DeviceInitializationState {
  status: "idle" | "initializing" | "ready" | "error";
  progress: number;
  message: string | null;
  completedAt: string | null;
}

export type DeviceAvailability = "available" | "downloadable" | "downloading" | "unavailable" | "unknown";

export interface DeviceCapability {
  languageModelGlobalPresent: boolean;
  availability: DeviceAvailability;
  chromeVersion: string | null;
  userAgent: string;
  detail: string | null;
}
