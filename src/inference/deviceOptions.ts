import type { LanguageModelCreateOptions } from "@firebase/ai";

/**
 * The create options sent to Chrome's Prompt API. The same object is passed to
 * `LanguageModel.availability()` so the reported availability matches the
 * options actually used for inference (required by the Prompt API docs).
 */
export const DEVICE_CREATE_OPTIONS: LanguageModelCreateOptions = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

export function buildDeviceCreateOptions(systemInstruction?: string, image = false): LanguageModelCreateOptions {
  const options: LanguageModelCreateOptions = {
    ...DEVICE_CREATE_OPTIONS,
    ...(image ? { expectedInputs: [...(DEVICE_CREATE_OPTIONS.expectedInputs ?? []), { type: "image" }] } : {}),
  };
  if (!systemInstruction) return options;
  return {
    ...options,
    initialPrompts: [
      {
        role: "system",
        content: [{ type: "text", value: systemInstruction }],
      },
    ],
  };
}
