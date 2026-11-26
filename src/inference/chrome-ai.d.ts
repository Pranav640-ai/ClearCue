export {};

/**
 * Minimal ambient declarations for Chrome's built-in Prompt API (`LanguageModel`).
 *
 * These are used only for capability reporting. All inference is executed by
 * Firebase AI Logic (`@firebase/ai`), whose own type declarations drive the
 * inference calls.
 */
declare global {
  type ChromeLanguageModelAvailability = "available" | "downloadable" | "downloading" | "unavailable";

  interface ChromeLanguageModelCreateOptions {
    expectedInputs?: Array<{ type: string; languages?: string[] }>;
    expectedOutputs?: Array<{ type: string; languages?: string[] }>;
    initialPrompts?: Array<{ role: string; content: Array<{ type: string; value: string }> }>;
    monitor?: (monitor: {
      addEventListener: (type: "downloadprogress", listener: (event: { loaded: number }) => void) => void;
    }) => void;
  }

  interface ChromeLanguageModelStatic {
    availability(options?: object): Promise<ChromeLanguageModelAvailability>;
    create(options?: object): Promise<unknown>;
    params?(): Promise<{ defaultTopK: number; maxTopK: number; defaultTemperature: number; maxTemperature: number }>;
  }

  var LanguageModel: ChromeLanguageModelStatic | undefined;
}
