import type { InferenceFailure } from "./types";

const CONFIG_HINT =
  "Copy .env.example to .env, fill in the Firebase web app config, then rebuild with `npm run build` and reload the extension.";

/**
 * Turn an unknown thrown value into a stable, readable failure with an
 * actionable hint. This does not invent success: every branch reports the
 * error that actually occurred.
 */
export function toInferenceFailure(error: unknown): InferenceFailure {
  const code = extractCode(error);
  const message = extractMessage(error);
  const lower = message.toLowerCase();

  if (code === "api-not-enabled" && lower.includes("languagemodel")) {
    return {
      code,
      message,
      hint:
        "Chrome's built-in LanguageModel API is unavailable in this document. Use Chrome 139+ on desktop, enable chrome://flags/#prompt-api-for-gemini-nano-multimodal-input, then restart Chrome.",
    };
  }
  if (code === "firebase-not-configured" || code === "no-api-key" || code === "no-app-id" || code === "no-project-id") {
    return { code, message, hint: CONFIG_HINT };
  }
  if (code === "api-not-enabled") {
    return {
      code,
      message,
      hint: "Enable Firebase AI Logic for this project in the Firebase console (Build > AI Logic > Get started).",
    };
  }
  if (lower.includes("app check") || lower.includes("appcheck") || code.includes("app-check")) {
    return {
      code,
      message,
      hint:
        "App Check rejected this request. Register the debug token shown in the extension console under Firebase console > App Check > Apps > Manage debug tokens, then reload the extension.",
    };
  }
  const projectDenied =
    lower.includes("user_project_denied") ||
    lower.includes("serviceusage.services.use") ||
    (lower.includes("403") && lower.includes("permission"));
  if (projectDenied) {
    return {
      code,
      message,
      hint: "The request reached Google, but this project is not allowed to use the Gemini API yet. In the Google Cloud console for the Firebase project, enable the Generative Language API (generativelanguage.googleapis.com) as well as Firebase AI Logic, then confirm the API key belongs to this project and its API restrictions include the Generative Language API. Changes can take a few minutes to propagate.",
    };
  }
  if (code === "fetch-error" || lower.includes("failed to fetch") || lower.includes("networkerror")) {
    return {
      code,
      message,
      hint: "The request failed before a usable response arrived. Check connectivity, then read the message above: a 403 from Google is a project or API-key permission problem, not an offline device.",
    };
  }
  if (code === "unsupported") {
    return {
      code,
      message,
      hint: "This feature is not supported for the requested inference path. Use the cloud path for this request.",
    };
  }
  if (code === "parse-failed") {
    return {
      code,
      message,
      hint: "The model output could not be parsed. Re-run the test; if it repeats, the prompt or schema needs adjustment.",
    };
  }
  if (lower.includes("quota") || lower.includes("429") || lower.includes("resource_exhausted")) {
    return {
      code,
      message,
      hint: "The Gemini API quota for this project is exhausted. Wait for the quota window to reset or raise the limit in Google AI Studio.",
    };
  }
  return {
    code,
    message,
    hint: "Unexpected failure. Read the full error above and check the extension console for the SDK's own message.",
  };
}

function extractCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return "unknown-error";
}

function extractMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.length > 0) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
