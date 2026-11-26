import { describe, expect, it } from "vitest";
import { readRuntimeConfig, DEFAULT_CLOUD_MODEL } from "../config";

const fullEnv = {
  VITE_FIREBASE_API_KEY: "test-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "demo.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "demo-project",
  VITE_FIREBASE_APP_ID: "1:2:web:3",
} as ImportMetaEnv;

describe("readRuntimeConfig", () => {
  it("reports missing Firebase fields instead of pretending to be configured", () => {
    const config = readRuntimeConfig({} as ImportMetaEnv);
    expect(config.configured).toBe(false);
    expect(config.missingFirebaseFields).toEqual([
      "VITE_FIREBASE_API_KEY",
      "VITE_FIREBASE_AUTH_DOMAIN",
      "VITE_FIREBASE_PROJECT_ID",
      "VITE_FIREBASE_APP_ID",
    ]);
  });

  it("uses the documented default cloud model when none is set", () => {
    const config = readRuntimeConfig(fullEnv);
    expect(config.configured).toBe(true);
    expect(config.cloudModel).toBe(DEFAULT_CLOUD_MODEL);
  });

  it("accepts the documented debug App Check configuration in development", () => {
    const config = readRuntimeConfig({ ...fullEnv, VITE_APPCHECK_DEBUG: "true" } as ImportMetaEnv);
    expect(config.appCheck.mode).toBe("debug-auto");
    expect(config.releaseDebugTokenRejected).toBe(false);
  });

  it("refuses a debug App Check token in a release build", () => {
    const config = readRuntimeConfig({
      ...fullEnv,
      VITE_APPCHECK_DEBUG: "true",
      VITE_BUILD_CHANNEL: "release",
    } as ImportMetaEnv);
    expect(config.releaseDebugTokenRejected).toBe(true);
    expect(config.appCheck.mode).toBe("none");
  });

  it("prefers an explicit debug token over the auto token", () => {
    const config = readRuntimeConfig({
      ...fullEnv,
      VITE_APPCHECK_DEBUG: "true",
      VITE_APPCHECK_DEBUG_TOKEN: "11111111-2222-3333-4444-555555555555",
    } as ImportMetaEnv);
    expect(config.appCheck).toEqual({ mode: "debug-token", debugToken: "11111111-2222-3333-4444-555555555555" });
  });

  it("uses a backend App Check custom-token provider when configured", () => {
    const config = readRuntimeConfig({
      ...fullEnv,
      VITE_APPCHECK_CUSTOM_TOKEN_URL: "https://example.com/appcheck/token",
    } as ImportMetaEnv);
    expect(config.appCheck).toEqual({ mode: "custom", tokenUrl: "https://example.com/appcheck/token" });
  });
});
