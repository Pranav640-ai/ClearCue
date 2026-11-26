import type { FirebaseOptions } from "@firebase/app";

const read = (value: string | undefined): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

/** Default cloud model documented for the hybrid web SDK (Firebase AI Logic, 2026-11). */
export const DEFAULT_CLOUD_MODEL = "gemini-3.5-flash-lite";

export type BuildChannel = "dev" | "release";

export type AppCheckConfig =
  /**
   * - `debug-auto`: documented debug provider; the SDK generates a token and logs it.
   * - `debug-token`: documented debug provider with a token supplied at build time.
   * - `custom`: production path. An MV3 extension page cannot load the reCAPTCHA
   *   Enterprise script (remote code is forbidden by the extension CSP), so a
   *   backend-issued App Check custom token is the documented-compatible route.
   * - `none`: App Check is not initialized (cloud requests will be rejected while enforced).
   */
  | { mode: "debug-auto" }
  | { mode: "debug-token"; debugToken: string }
  | { mode: "custom"; tokenUrl: string }
  | { mode: "none" };

export interface RuntimeConfig {
  firebase: FirebaseOptions;
  missingFirebaseFields: string[];
  configured: boolean;
  cloudModel: string;
  cloudTemperature: number;
  appCheck: AppCheckConfig;
  buildChannel: BuildChannel;
  /** True when a release build is misconfigured with a debug App Check token. */
  releaseDebugTokenRejected: boolean;
}

const REQUIRED_FIELDS: ReadonlyArray<[keyof FirebaseOptions, string]> = [
  ["apiKey", "VITE_FIREBASE_API_KEY"],
  ["authDomain", "VITE_FIREBASE_AUTH_DOMAIN"],
  ["projectId", "VITE_FIREBASE_PROJECT_ID"],
  ["appId", "VITE_FIREBASE_APP_ID"],
];

export function readRuntimeConfig(env: ImportMetaEnv = import.meta.env): RuntimeConfig {
  const firebase: FirebaseOptions = {
    apiKey: read(env.VITE_FIREBASE_API_KEY),
    authDomain: read(env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: read(env.VITE_FIREBASE_PROJECT_ID),
    storageBucket: read(env.VITE_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: read(env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    appId: read(env.VITE_FIREBASE_APP_ID),
  };

  const missingFirebaseFields = REQUIRED_FIELDS.filter(([key]) => read(firebase[key] as string | undefined) === undefined).map(
    ([, envName]) => envName,
  );

  const buildChannel: BuildChannel = read(env.VITE_BUILD_CHANNEL) === "release" ? "release" : "dev";

  const debugToken = read(env.VITE_APPCHECK_DEBUG_TOKEN);
  const debugRequested = read(env.VITE_APPCHECK_DEBUG)?.toLowerCase() === "true";
  const customTokenUrl = read(env.VITE_APPCHECK_CUSTOM_TOKEN_URL);

  let appCheck: AppCheckConfig;
  if (debugToken) appCheck = { mode: "debug-token", debugToken };
  else if (debugRequested) appCheck = { mode: "debug-auto" };
  else if (customTokenUrl) appCheck = { mode: "custom", tokenUrl: customTokenUrl };
  else appCheck = { mode: "none" };

  // A release artifact must never carry a debug token. Refuse it at runtime and
  // surface the misconfiguration instead of silently shipping a bypass.
  const releaseDebugTokenRejected =
    buildChannel === "release" && (appCheck.mode === "debug-auto" || appCheck.mode === "debug-token");
  if (releaseDebugTokenRejected) appCheck = { mode: "none" };

  const temperatureRaw = Number.parseFloat(read(env.VITE_CLOUD_TEMPERATURE) ?? "");
  const cloudTemperature = Number.isFinite(temperatureRaw) && temperatureRaw >= 0 && temperatureRaw <= 2 ? temperatureRaw : 0.2;

  return {
    firebase,
    missingFirebaseFields,
    configured: missingFirebaseFields.length === 0,
    cloudModel: read(env.VITE_CLOUD_MODEL) ?? DEFAULT_CLOUD_MODEL,
    cloudTemperature,
    appCheck,
    buildChannel,
    releaseDebugTokenRejected,
  };
}

export const runtimeConfig = readRuntimeConfig();
