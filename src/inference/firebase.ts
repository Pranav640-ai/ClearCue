import { getAI, GoogleAIBackend, type AI } from "@firebase/ai";
import { CustomProvider, getToken, initializeAppCheck, type AppCheck } from "@firebase/app-check";
import { initializeApp, type FirebaseApp } from "@firebase/app";
import { runtimeConfig, type AppCheckConfig } from "./config";

export type AppCheckProviderKind = "debug" | "custom";

export interface AppCheckTokenReport {
  ok: boolean;
  tokenLength: number | null;
  error: string | null;
}

export interface FirebaseRuntime {
  configured: boolean;
  missingFields: string[];
  app: FirebaseApp | null;
  ai: AI | null;
  appCheck: AppCheck | null;
  appCheckProvider: AppCheckProviderKind | null;
  appCheckMode: AppCheckConfig["mode"];
  initError: string | null;
}

let cached: FirebaseRuntime | null = null;

/**
 * The placeholder provider used in debug mode exists only because
 * `initializeAppCheck` requires a provider object. The SDK's debug path never
 * calls it. It is a CustomProvider rather than ReCaptchaEnterpriseProvider
 * because the reCAPTCHA Enterprise provider injects a remote <script>, which
 * MV3's extension CSP forbids (and which produced a real CSP violation).
 */
function unusedPlaceholderProvider(): CustomProvider {
  return new CustomProvider({
    getToken: async () => {
      throw new Error("Placeholder App Check provider was invoked; the debug provider should be active.");
    },
  });
}

function customTokenProvider(tokenUrl: string): CustomProvider {
  return new CustomProvider({
    getToken: async () => {
      const response = await fetch(tokenUrl, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!response.ok) {
        throw new Error(`App Check custom token endpoint returned HTTP ${response.status}.`);
      }
      const body: unknown = await response.json();
      const token = typeof body === "object" && body !== null && "token" in body ? (body as { token?: unknown }).token : undefined;
      if (typeof token !== "string" || token.length === 0) {
        throw new Error("App Check custom token endpoint did not return a token.");
      }
      return { token, expireTimeMillis: Date.now() + 30 * 60 * 1000 };
    },
  });
}

function initializeAppCheckFor(
  app: FirebaseApp,
  config: AppCheckConfig,
): { appCheck: AppCheck; provider: AppCheckProviderKind } | null {
  if (config.mode === "none") return null;

  if (config.mode === "custom") {
    const appCheck = initializeAppCheck(app, {
      provider: customTokenProvider(config.tokenUrl),
      isTokenAutoRefreshEnabled: false,
    });
    return { appCheck, provider: "custom" };
  }

  // Documented local-development configuration: set the global debug token
  // before App Check is initialized. The SDK then uses the debug provider and
  // logs the token to the console for registration in the Firebase console.
  const globals = globalThis as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string };
  globals.FIREBASE_APPCHECK_DEBUG_TOKEN = config.mode === "debug-token" ? config.debugToken : true;

  const appCheck = initializeAppCheck(app, {
    provider: unusedPlaceholderProvider(),
    isTokenAutoRefreshEnabled: false,
  });
  return { appCheck, provider: "debug" };
}

export function getFirebaseRuntime(): FirebaseRuntime {
  if (cached) return cached;

  if (!runtimeConfig.configured) {
    cached = {
      configured: false,
      missingFields: runtimeConfig.missingFirebaseFields,
      app: null,
      ai: null,
      appCheck: null,
      appCheckProvider: null,
      appCheckMode: runtimeConfig.appCheck.mode,
      initError: null,
    };
    return cached;
  }

  try {
    const app = initializeApp(runtimeConfig.firebase);
    let appCheckInit: ReturnType<typeof initializeAppCheckFor> = null;
    let appCheckInitError: string | null = null;
    try {
      appCheckInit = initializeAppCheckFor(app, runtimeConfig.appCheck);
    } catch (error) {
      // App Check is required for cloud dispatch. A failed provider does not
      // remove local model capability or the rest of the panel.
      appCheckInitError = error instanceof Error ? error.message : "App Check initialization failed.";
    }
    const ai = getAI(app, { backend: new GoogleAIBackend() });

    cached = {
      configured: true,
      missingFields: [],
      app,
      ai,
      appCheck: appCheckInit?.appCheck ?? null,
      appCheckProvider: appCheckInit?.provider ?? null,
      appCheckMode: runtimeConfig.appCheck.mode,
      initError: appCheckInitError,
    };
  } catch (error) {
    cached = {
      configured: false,
      missingFields: runtimeConfig.missingFirebaseFields,
      app: null,
      ai: null,
      appCheck: null,
      appCheckProvider: null,
      appCheckMode: runtimeConfig.appCheck.mode,
      initError: error instanceof Error ? error.message : String(error),
    };
  }

  return cached;
}

/** Request an App Check token so the UI can prove App Check is live, without printing the token. */
export async function refreshAppCheckToken(appCheck: AppCheck | null): Promise<AppCheckTokenReport> {
  if (!appCheck) return { ok: false, tokenLength: null, error: "App Check is not initialized." };
  try {
    const result = await getToken(appCheck, false);
    // The SDK can resolve with an empty token when the exchange is rejected
    // (for example an unregistered debug token). Never report that as success.
    if (result.token.length === 0) {
      return {
        ok: false,
        tokenLength: 0,
        error:
          "App Check returned an empty token. The debug token is probably not registered for this project, or App Check is misconfigured.",
      };
    }
    return { ok: true, tokenLength: result.token.length, error: null };
  } catch (error) {
    return { ok: false, tokenLength: null, error: error instanceof Error ? error.message : String(error) };
  }
}
