// Reproduces the real crash reported when opening the app in Expo Go:
// @react-native-google-signin/google-signin's native binding module calls
// TurboModuleRegistry.getEnforcing('RNGoogleSignin') at import time, which
// throws synchronously in any environment without the native module
// compiled in. Simulate that exact failure mode by making require() of the
// package throw, and assert google-auth-service.ts contains it instead of
// letting it propagate and crash whatever screen happens to import this
// service (Settings, in production).
jest.mock("@react-native-google-signin/google-signin", () => {
  throw new Error("TurboModuleRegistry.getEnforcing(...): 'RNGoogleSignin' could not be found.");
});

jest.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { googleWebClientId: "test-client-id" } } },
}));

import {
  getCurrentGoogleAccount,
  signInWithGoogle,
  signOutFromGoogle,
  getDriveAccessToken,
  GoogleSignInUnavailableError,
} from "../google-auth-service";

describe("google-auth-service - native module unavailable (Expo Go)", () => {
  it("getCurrentGoogleAccount never throws, just reports not connected", () => {
    expect(() => getCurrentGoogleAccount()).not.toThrow();
    expect(getCurrentGoogleAccount()).toBeNull();
  });

  it("signInWithGoogle rejects with a specific, catchable error instead of crashing", async () => {
    await expect(signInWithGoogle()).rejects.toBeInstanceOf(GoogleSignInUnavailableError);
  });

  it("signOutFromGoogle rejects with the same specific error", async () => {
    await expect(signOutFromGoogle()).rejects.toBeInstanceOf(GoogleSignInUnavailableError);
  });

  it("getDriveAccessToken rejects with the same specific error", async () => {
    await expect(getDriveAccessToken()).rejects.toBeInstanceOf(GoogleSignInUnavailableError);
  });
});
