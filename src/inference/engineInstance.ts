import { runtimeConfig } from "./config";
import { HybridInferenceEngine } from "./engine";
import { getFirebaseRuntime } from "./firebase";

/** Builds the engine used by the UI from the real Firebase runtime. */
export function createEngine(): HybridInferenceEngine {
  const runtime = getFirebaseRuntime();
  return new HybridInferenceEngine({
    ai: runtime.ai,
    cloudAllowed: runtime.appCheck !== null,
    cloudModel: runtimeConfig.cloudModel,
    cloudTemperature: runtimeConfig.cloudTemperature,
  });
}
