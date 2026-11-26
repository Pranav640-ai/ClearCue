import { getGenerativeModel, InferenceMode, type AI, type HybridParams, type InferenceSource, type Part } from "@firebase/ai";
import { isLocalIconPng } from "../shared/localIcon";
import { buildDeviceCreateOptions } from "./deviceOptions";
import { toInferenceFailure } from "./errors";
import { parseStructuredResponse } from "./validation";
import type { InferenceOutcome, InferenceRequest } from "./types";

export interface ModelResponseLike {
  text(): string;
  inferenceSource?: InferenceSource;
}

export interface ModelHandle {
  generateContent(prompt: string | Part[], options?: { signal?: AbortSignal }): Promise<{ response: ModelResponseLike }>;
  initializeDeviceModel?(onDownloadProgress?: (progressValue: number) => void): Promise<void>;
}

export type ModelBuilder = (params: HybridParams) => ModelHandle;

export interface EngineOptions {
  ai: AI | null;
  cloudModel: string;
  cloudTemperature: number;
  cloudAllowed?: boolean;
  /** Test seam: lets unit tests drive the engine without a network or SDK. */
  buildModel?: ModelBuilder;
}

const NOT_CONFIGURED = {
  code: "firebase-not-configured",
  message: "Firebase is not configured in this build.",
  hint: "Copy .env.example to .env, add your Firebase web app config, then rebuild and reload the extension.",
} as const;

/**
 * Reusable inference abstraction for ClearCue.
 *
 * Every call goes through Firebase AI Logic (`@firebase/ai`). The engine never
 * infers or invents `inferenceSource`: it reports exactly what the SDK returned,
 * including when that differs from the requested mode.
 */
export class HybridInferenceEngine {
  private readonly ai: AI | null;
  private readonly cloudModel: string;
  private readonly cloudTemperature: number;
  private readonly cloudAllowed: boolean;
  private readonly buildModel: ModelBuilder;
  /**
   * Reuses model handles so repeated repairs avoid rebuilding the same SDK
   * session. Bounded to a handful of distinct configurations.
   */
  private readonly models = new Map<string, ModelHandle>();

  constructor(options: EngineOptions) {
    this.ai = options.ai;
    this.cloudModel = options.cloudModel;
    this.cloudTemperature = options.cloudTemperature;
    this.cloudAllowed = options.cloudAllowed ?? false;
    this.buildModel =
      options.buildModel ??
      ((params: HybridParams) => {
        if (!this.ai) throw new Error(NOT_CONFIGURED.message);
        return getGenerativeModel(this.ai, params);
      });
  }

  isConfigured(): boolean {
    return this.ai !== null;
  }

  /** Must be invoked from a user gesture (button click) per the Prompt API rules. */
  async initializeDeviceModel(onDownloadProgress?: (progressValue: number) => void): Promise<void> {
    if (!this.ai) throw Object.assign(new Error(NOT_CONFIGURED.message), { code: NOT_CONFIGURED.code });
    const model = this.modelFor({
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: { createOptions: buildDeviceCreateOptions() },
    });
    if (!model.initializeDeviceModel) {
      throw new Error("The installed Firebase AI Logic SDK does not expose initializeDeviceModel().");
    }
    await model.initializeDeviceModel(onDownloadProgress);
  }

  private modelFor(params: HybridParams): ModelHandle {
    const key = JSON.stringify({
      mode: params.mode,
      cloud: params.inCloudParams?.model ?? null,
      system: params.inCloudParams?.systemInstruction ?? null,
      device: params.onDeviceParams?.createOptions?.initialPrompts
        ? JSON.stringify(params.onDeviceParams.createOptions.initialPrompts)
        : null,
      modalities: params.onDeviceParams?.createOptions?.expectedInputs ?? null,
      constraint: params.onDeviceParams?.promptOptions?.responseConstraint ?? null,
      cloudGeneration: params.inCloudParams?.generationConfig ?? null,
    });
    const existing = this.models.get(key);
    if (existing) return existing;
    const model = this.buildModel(params);
    if (this.models.size >= 6) {
      const oldest = this.models.keys().next().value;
      if (oldest !== undefined) this.models.delete(oldest);
    }
    this.models.set(key, model);
    return model;
  }

  clearModelCache(): void {
    this.models.clear();
  }

  async run(request: InferenceRequest): Promise<InferenceOutcome> {
    const startedAt = new Date().toISOString();
    const started = now();

    if (!this.ai) {
      return this.failureOutcome(request, startedAt, NOT_CONFIGURED);
    }

    if (!this.cloudAllowed && request.mode !== InferenceMode.ONLY_ON_DEVICE) {
      return this.failureOutcome(request, startedAt, {
        code: "app-check-not-configured",
        message: "Cloud inference requires a configured Firebase App Check provider.",
        hint: "Use forced on-device inference or configure App Check for this build.",
      });
    }

    if (request.imagePng !== undefined &&
      (request.mode !== InferenceMode.ONLY_ON_DEVICE || !isLocalIconPng(request.imagePng))) {
      return this.failureOutcome(request, startedAt, {
        code: "unsafe-image-request",
        message: "Image inference requires a bounded PNG and forced on-device execution.",
        hint: "Use the local visual repair route.",
      });
    }
    let attempted = false;
    let actualSource: InferenceOutcome["actualSource"] = "unknown";
    try {
      const model = this.modelFor(this.paramsFor(request));
      const prompt: string | Part[] = request.imagePng ? [
        { type: "text", text: request.prompt },
        { type: "inlineData", inlineData: { mimeType: "image/png", data: request.imagePng } },
      ] : request.prompt;
      attempted = true;
      const result = await model.generateContent(prompt, { signal: request.signal });
      const latencyMs = Math.round(now() - started);

      // Read the SDK's real source. Do not derive it from request.mode.
      actualSource = result.response.inferenceSource ?? "unknown";
      const text = result.response.text();
      const structured = request.contract
        ? parseStructuredResponse(text, request.contract.zodSchema)
        : null;

      return {
        key: request.key,
        label: request.label,
        requestedMode: request.mode,
        attempted,
        status: "success",
        actualSource,
        latencyMs,
        model: describeModel(actualSource, this.cloudModel),
        sourceMismatch: isMismatch(request.mode, actualSource),
        text,
        structured,
        error: null,
        startedAt,
      };
    } catch (error) {
      const latencyMs = Math.round(now() - started);
      return {
        ...this.failureOutcome(request, startedAt, toInferenceFailure(error)),
        attempted,
        actualSource,
        model: describeModel(actualSource, this.cloudModel),
        latencyMs,
      };
    }
  }

  private paramsFor(request: InferenceRequest): HybridParams {
    const responseConstraint = request.contract?.deviceConstraint;
    return {
      mode: request.mode,
      onDeviceParams: {
        createOptions: buildDeviceCreateOptions(request.systemInstruction, request.imagePng !== undefined),
        ...(responseConstraint ? { promptOptions: { responseConstraint } } : {}),
      },
      inCloudParams: {
        model: this.cloudModel,
        ...(request.systemInstruction ? { systemInstruction: request.systemInstruction } : {}),
        generationConfig: {
          temperature: this.cloudTemperature,
          ...(request.contract
            ? { responseMimeType: "application/json", responseSchema: request.contract.cloudSchema }
            : {}),
        },
      },
    };
  }

  private failureOutcome(
    request: InferenceRequest,
    startedAt: string,
    failure: { code: string; message: string; hint: string },
  ): InferenceOutcome {
    return {
      key: request.key,
      label: request.label,
      requestedMode: request.mode,
      attempted: false,
      status: "error",
      actualSource: "unknown",
      latencyMs: null,
      model: null,
      sourceMismatch: false,
      text: null,
      structured: null,
      error: failure,
      startedAt,
    };
  }
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function isMismatch(requested: InferenceRequest["mode"], actual: InferenceOutcome["actualSource"]): boolean {
  if (requested === InferenceMode.ONLY_ON_DEVICE) return actual !== "on_device";
  if (requested === InferenceMode.ONLY_IN_CLOUD) return actual !== "in_cloud";
  return false;
}

function describeModel(actual: InferenceSource | "unknown", cloudModel: string): string | null {
  if (actual === "in_cloud") return `cloud:${cloudModel}`;
  if (actual === "on_device") return "on_device:chrome-language-model";
  return null;
}
