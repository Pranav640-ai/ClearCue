import { describe, expect, it, vi } from "vitest";
import { InferenceMode, type AI, type HybridParams, type InferenceSource } from "@firebase/ai";
import { HybridInferenceEngine, type ModelBuilder } from "../engine";
import type { InferenceRequest } from "../types";
import { pageSummaryContract } from "../schemas";

const fakeAi = {} as AI;

function baseRequest(overrides: Partial<InferenceRequest> = {}): InferenceRequest {
  return {
    key: "t",
    label: "Test",
    description: "unit test",
    mode: InferenceMode.PREFER_ON_DEVICE,
    prompt: "fictional prompt",
    ...overrides,
  };
}

function engineWith(builder: ModelBuilder) {
  return new HybridInferenceEngine({
    ai: fakeAi,
    cloudModel: "gemini-3.5-flash-lite",
    cloudAllowed: true,
    cloudTemperature: 0.2,
    buildModel: builder,
  });
}

describe("HybridInferenceEngine", () => {
  it("accepts inline PNG only in forced local mode and creates a separate image-capable model", async () => {
    const payload = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/v9sAAAAASUVORK5CYII=";
    const generateContent = vi.fn(async () => ({ response: { text: () => "label", inferenceSource: "on_device" as const } }));
    const builder = vi.fn((_params: HybridParams) => ({ generateContent }));
    const engine = engineWith(builder);
    const denied = await engine.run(baseRequest({ imagePng: payload, mode: InferenceMode.PREFER_ON_DEVICE }));
    expect(denied.error?.code).toBe("unsafe-image-request");
    expect(builder).not.toHaveBeenCalled();
    const local = baseRequest({ mode: InferenceMode.ONLY_ON_DEVICE });
    await engine.run(local);
    const result = await engine.run({ ...local, imagePng: payload });
    expect(result.actualSource).toBe("on_device");
    expect(builder).toHaveBeenCalledTimes(2);
    expect(builder.mock.calls[1]?.[0].onDeviceParams?.createOptions?.expectedInputs)
      .toContainEqual({ type: "image" });
    expect(generateContent).toHaveBeenLastCalledWith([
      { type: "text", text: local.prompt },
      { type: "inlineData", inlineData: { mimeType: "image/png", data: payload } },
    ], expect.anything());
  });

  it("blocks any cloud-capable mode before model creation when App Check is missing", async () => {
    const engine = new HybridInferenceEngine({
      ai: {} as AI,
      cloudModel: "test",
      cloudTemperature: 0,
      buildModel: () => { throw new Error("A cloud-capable model must not be created."); },
    });
    const result = await engine.run({
      key: "cloud", label: "Cloud", description: "", prompt: "Fixed diagnostic fixture",
      mode: InferenceMode.ONLY_IN_CLOUD,
    });
    expect(result.status).toBe("error");
    expect(result.actualSource).toBe("unknown");
    expect(result.error?.code).toBe("app-check-not-configured");
    expect(result.attempted).toBe(false);
  });

  it("reports the source the SDK returned, even when it contradicts the requested mode", async () => {
    const builder: ModelBuilder = () => ({
      generateContent: async () => ({ response: { text: () => "device answer", inferenceSource: "on_device" as InferenceSource } }),
    });
    const engine = engineWith(builder);
    const outcome = await engine.run(baseRequest({ mode: InferenceMode.ONLY_IN_CLOUD }));

    expect(outcome.status).toBe("success");
    expect(outcome.requestedMode).toBe(InferenceMode.ONLY_IN_CLOUD);
    expect(outcome.actualSource).toBe("on_device");
    expect(outcome.sourceMismatch).toBe(true);
    expect(outcome.text).toBe("device answer");
    expect(outcome.latencyMs).not.toBeNull();
    expect(outcome.model).toBe("on_device:chrome-language-model");
  });

  it("never labels an unknown source as a model", async () => {
    const builder: ModelBuilder = () => ({ generateContent: async () => ({ response: { text: () => "x" } }) });
    const outcome = await engineWith(builder).run(baseRequest());
    expect(outcome.actualSource).toBe("unknown");
    expect(outcome.model).toBeNull();
  });

  it("maps requested params to the real hybrid SDK shape", async () => {
    let captured: HybridParams | null = null;
    const builder: ModelBuilder = (params) => {
      captured = params;
      return { generateContent: async () => ({ response: { text: () => "{}", inferenceSource: "in_cloud" as InferenceSource } }) };
    };
    await engineWith(builder).run(
      baseRequest({ mode: InferenceMode.ONLY_IN_CLOUD, contract: pageSummaryContract, systemInstruction: "system text" }),
    );

    const params = captured as HybridParams | null;
    expect(params).not.toBeNull();
    expect(params?.mode).toBe(InferenceMode.ONLY_IN_CLOUD);
    expect(params?.inCloudParams?.model).toBe("gemini-3.5-flash-lite");
    expect(params?.inCloudParams?.systemInstruction).toBe("system text");
    expect(params?.inCloudParams?.generationConfig?.responseMimeType).toBe("application/json");
    expect(params?.onDeviceParams?.promptOptions?.responseConstraint).toBeDefined();
    expect(params?.onDeviceParams?.createOptions?.initialPrompts?.[0]?.role).toBe("system");
  });

  it("validates structured output with the shared Zod schema", async () => {
    const builder: ModelBuilder = () => ({
      generateContent: async () => ({
        response: {
          text: () => '```json\n{"summary":"A fictional shop","keyPoints":["rye bread"],"confidence":"high"}\n```',
          inferenceSource: "in_cloud" as InferenceSource,
        },
      }),
    });
    const outcome = await engineWith(builder).run(baseRequest({ contract: pageSummaryContract }));
    expect(outcome.structured?.jsonParsed).toBe(true);
    expect(outcome.structured?.schemaValid).toBe(true);
  });

  it("returns a readable failure with no fabricated result when the SDK throws", async () => {
    const builder: ModelBuilder = () => ({
      generateContent: async () => {
        throw Object.assign(new Error("Local LanguageModel API not available in this environment."), { code: "api-not-enabled" });
      },
    });
    const outcome = await engineWith(builder).run(baseRequest({ mode: InferenceMode.ONLY_ON_DEVICE }));
    expect(outcome.status).toBe("error");
    expect(outcome.text).toBeNull();
    expect(outcome.actualSource).toBe("unknown");
    expect(outcome.error?.code).toBe("api-not-enabled");
    expect(outcome.error?.hint).toContain("chrome://flags");
  });

  it("fails safely without calling the SDK when Firebase is not configured", async () => {
    const buildModel = vi.fn<ModelBuilder>();
    const engine = new HybridInferenceEngine({ ai: null, cloudModel: "m", cloudAllowed: true,
      cloudTemperature: 0, buildModel });
    const outcome = await engine.run(baseRequest());
    expect(outcome.status).toBe("error");
    expect(outcome.error?.code).toBe("firebase-not-configured");
    expect(buildModel).not.toHaveBeenCalled();
  });

  it("forwards download progress from initializeDeviceModel", async () => {
    const progress: number[] = [];
    const builder: ModelBuilder = () => ({
      generateContent: async () => ({ response: { text: () => "" } }),
      initializeDeviceModel: async (onProgress) => {
        onProgress?.(0.25);
        onProgress?.(1);
      },
    });
    const engine = engineWith(builder);
    await engine.initializeDeviceModel((value) => progress.push(value));
    expect(progress).toEqual([0.25, 1]);
  });
});
