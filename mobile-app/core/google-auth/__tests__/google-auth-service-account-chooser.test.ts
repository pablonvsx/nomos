// Android's legacy Google Sign-In SDK has no "force account chooser" flag:
// signIn() returns the last signed-in / previously consented account without
// any UI (this is why clearing the app's data still reconnected the same
// account). Calling signOut() first is the documented way to get the chooser
// back, so signInWithGoogle({ forceAccountChooser: true }) must do exactly that.
const calls: string[] = [];
const signOutMock = jest.fn(async () => {
  calls.push("signOut");
});
const signInMock = jest.fn(async () => {
  calls.push("signIn");
  return { type: "success", data: { user: { email: "new@example.com", name: "New" } } };
});

const getTokensMock = jest.fn(async () => ({ accessToken: "access-token" }));

jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: () => signInMock(),
    signOut: () => signOutMock(),
    getCurrentUser: jest.fn(() => null),
    getTokens: () => getTokensMock(),
  },
}));

jest.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { googleWebClientId: "test-client-id" } } },
}));

import {
  GOOGLE_AUTH_TIMEOUT_MS,
  GOOGLE_SIGN_IN_TIMEOUT_MS,
  getDriveAccessToken,
  signInWithGoogle,
} from "../google-auth-service";
import { NetworkTimeoutError } from "@/core/net/network-timeout";

beforeEach(() => {
  calls.length = 0;
  jest.clearAllMocks();
});

describe("signInWithGoogle - account chooser", () => {
  it("signs out before signing in when forceAccountChooser is set", async () => {
    const account = await signInWithGoogle({ forceAccountChooser: true });

    expect(calls).toEqual(["signOut", "signIn"]);
    expect(account.email).toBe("new@example.com");
  });

  it("still signs in when the preliminary signOut fails", async () => {
    signOutMock.mockRejectedValueOnce(new Error("no cached account"));

    const account = await signInWithGoogle({ forceAccountChooser: true });

    expect(signInMock).toHaveBeenCalledTimes(1);
    expect(account.email).toBe("new@example.com");
  });

  it("does not sign out first by default", async () => {
    await signInWithGoogle();

    expect(calls).toEqual(["signIn"]);
  });
});

describe("network timeouts", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("getDriveAccessToken resolves normally when getTokens answers in time", async () => {
    await expect(getDriveAccessToken()).resolves.toBe("access-token");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("getDriveAccessToken fails with NetworkTimeoutError at the short level when getTokens never answers", async () => {
    getTokensMock.mockImplementationOnce(() => new Promise(() => {}));
    const outcome = getDriveAccessToken().catch((error) => error);

    await jest.advanceTimersByTimeAsync(GOOGLE_AUTH_TIMEOUT_MS);

    expect(await outcome).toBeInstanceOf(NetworkTimeoutError);
  });

  it("the interactive sign-in gets a longer limit than a plain request (a person picks the account, types a password...)", async () => {
    expect(GOOGLE_SIGN_IN_TIMEOUT_MS).toBeGreaterThan(GOOGLE_AUTH_TIMEOUT_MS);
    signInMock.mockImplementationOnce(() => new Promise(() => {}));
    const outcome = signInWithGoogle().catch((error) => error);

    await jest.advanceTimersByTimeAsync(GOOGLE_AUTH_TIMEOUT_MS + 1);
    expect(jest.getTimerCount()).toBe(1); // still waiting for the person

    await jest.advanceTimersByTimeAsync(GOOGLE_SIGN_IN_TIMEOUT_MS - GOOGLE_AUTH_TIMEOUT_MS);
    expect(await outcome).toBeInstanceOf(NetworkTimeoutError);
  });
});
