const getCurrentGoogleAccountMock = jest.fn();
const signInWithGoogleMock = jest.fn();
const signOutFromGoogleMock = jest.fn();

class FakeGoogleSignInUnavailableError extends Error {
  constructor() {
    super("unavailable");
    this.name = "GoogleSignInUnavailableError";
  }
}

jest.mock("@/core/google-auth/google-auth-service", () => ({
  getCurrentGoogleAccount: () => getCurrentGoogleAccountMock(),
  signInWithGoogle: () => signInWithGoogleMock(),
  signOutFromGoogle: () => signOutFromGoogleMock(),
  GoogleSignInUnavailableError: FakeGoogleSignInUnavailableError,
}));

import {
  connectGoogleAccount,
  disconnectGoogleAccount,
  getInitialGoogleAccountState,
  type GoogleAccountState,
} from "../google-account-controller";

const CONNECTED_ACCOUNT = { email: "field@example.com", name: "Field Researcher" };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getInitialGoogleAccountState", () => {
  it("reflects a currently connected account", () => {
    getCurrentGoogleAccountMock.mockReturnValue(CONNECTED_ACCOUNT);

    const state = getInitialGoogleAccountState();

    expect(state).toEqual({
      account: CONNECTED_ACCOUNT,
      isConnecting: false,
      error: null,
      unavailable: false,
    });
  });

  it("reflects no connected account", () => {
    getCurrentGoogleAccountMock.mockReturnValue(null);

    const state = getInitialGoogleAccountState();

    expect(state).toEqual({ account: null, isConnecting: false, error: null, unavailable: false });
  });
});

describe("connectGoogleAccount", () => {
  const initialState: GoogleAccountState = {
    account: null,
    isConnecting: false,
    error: null,
    unavailable: false,
  };

  it("reports isConnecting first, then resolves with the connected account on success", async () => {
    signInWithGoogleMock.mockResolvedValue(CONNECTED_ACCOUNT);
    const onStateChange = jest.fn();

    const finalState = await connectGoogleAccount(onStateChange, initialState);

    expect(onStateChange).toHaveBeenCalledWith({
      account: null,
      isConnecting: true,
      error: null,
      unavailable: false,
    });
    expect(finalState).toEqual({
      account: CONNECTED_ACCOUNT,
      isConnecting: false,
      error: null,
      unavailable: false,
    });
  });

  it("keeps account null and reports the error message on failure", async () => {
    signInWithGoogleMock.mockRejectedValue(new Error("Login cancelado pelo usuário."));

    const finalState = await connectGoogleAccount(() => {}, initialState);

    expect(finalState).toEqual({
      account: null,
      isConnecting: false,
      error: "Login cancelado pelo usuário.",
      unavailable: false,
    });
  });

  it("flags unavailable:true when the native module isn't available (e.g. Expo Go)", async () => {
    signInWithGoogleMock.mockRejectedValue(new FakeGoogleSignInUnavailableError());

    const finalState = await connectGoogleAccount(() => {}, initialState);

    expect(finalState.unavailable).toBe(true);
    expect(finalState.error).toBeTruthy();
  });
});

describe("disconnectGoogleAccount", () => {
  const connectedState: GoogleAccountState = {
    account: CONNECTED_ACCOUNT,
    isConnecting: false,
    error: null,
    unavailable: false,
  };

  it("clears the account and any previous error on success", async () => {
    signOutFromGoogleMock.mockResolvedValue(undefined);

    const finalState = await disconnectGoogleAccount({ ...connectedState, error: "stale" });

    expect(finalState).toEqual({
      account: null,
      isConnecting: false,
      error: null,
      unavailable: false,
    });
  });

  it("keeps the account and reports the error message on failure", async () => {
    signOutFromGoogleMock.mockRejectedValue(new Error("Network error"));

    const finalState = await disconnectGoogleAccount(connectedState);

    expect(finalState).toEqual({
      account: CONNECTED_ACCOUNT,
      isConnecting: false,
      error: "Network error",
      unavailable: false,
    });
  });
});
