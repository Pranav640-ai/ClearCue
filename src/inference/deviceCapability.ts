import { buildDeviceCreateOptions } from "./deviceOptions";
import type { DeviceAvailability, DeviceCapability } from "./types";

function chromeVersionFrom(userAgent: string): string | null {
  const match = /Chrome\/([0-9.]+)/.exec(userAgent);
  return match?.[1] ?? null;
}

/**
 * Report the real capability of this document for Chrome's on-device model.
 * This performs no inference and never claims the model is ready when it is not.
 */
export async function probeDeviceCapability(image = false): Promise<DeviceCapability> {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const chromeVersion = chromeVersionFrom(userAgent);
  const languageModel = typeof LanguageModel === "undefined" ? null : LanguageModel;

  if (languageModel === null || typeof languageModel.availability !== "function") {
    return {
      languageModelGlobalPresent: false,
      availability: "unknown",
      chromeVersion,
      userAgent,
      detail:
        "window.LanguageModel is not exposed in this document. Chrome 139+ on desktop, the multimodal Prompt API flag, and a compatible device are required.",
    };
  }

  try {
    const availability = (await languageModel.availability(buildDeviceCreateOptions(undefined, image))) as DeviceAvailability;
    return {
      languageModelGlobalPresent: true,
      availability,
      chromeVersion,
      userAgent,
      detail: describeAvailability(availability),
    };
  } catch (error) {
    return {
      languageModelGlobalPresent: true,
      availability: "unknown",
      chromeVersion,
      userAgent,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function describeAvailability(availability: DeviceAvailability): string {
  switch (availability) {
    case "available":
      return "On-device model is downloaded and ready for inference.";
    case "downloadable":
      return "On-device model is supported but not downloaded. Use Initialize Local AI to start the download.";
    case "downloading":
      return "On-device model download is already in progress.";
    case "unavailable":
      return "This device or browser profile cannot run the on-device model (hardware, disk space, or policy restriction).";
    default:
      return "Availability could not be determined.";
  }
}
