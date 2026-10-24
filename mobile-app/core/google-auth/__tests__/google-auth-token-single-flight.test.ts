// Every Drive request asks for a token, and the Google Sign-In library admits
// one getTokens() call at a time (a second one overwrites the first: PGMN-2).
// All concurrent callers must share a single real call.

const getTokensMock = jest.fn();

jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    getTokens: () => getTokensMock(),
  },
}));

jest.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { googleWebClientId: "test-client-id" } } },
}));

import {
  GOOGLE_AUTH_TIMEOUT_MS,
  TOKEN_CALL_STALE_MS,
  getDriveAccessToken,
  resetTokenInFlightForTests,
} from "../google-auth-service";
import { NetworkTimeoutError } from "@/core/net/network-timeout";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  getTokensMock.mockReset();
  resetTokenInFlightForTests();
  jest.useFakeTimers();
});

afterEach(() => jest.useRealTimers());

describe("getDriveAccessToken - one native call at a time", () => {
  it("shares one real getTokens call between simultaneous callers", async () => {
    const gate = deferred<{ accessToken: string }>();
    getTokensMock.mockReturnValue(gate.promise);

    const callers = [getDriveAccessToken(), getDriveAccessToken(), getDriveAccessToken()];
    gate.resolve({ accessToken: "tok" });

    await expect(Promise.all(callers)).resolves.toEqual(["tok", "tok", "tok"]);
    expect(getTokensMock).toHaveBeenCalledTimes(1);
  });

  it("asks again once the previous call settled", async () => {
    getTokensMock.mockResolvedValueOnce({ accessToken: "a" }).mockResolvedValueOnce({ accessToken: "b" });

    await expect(getDriveAccessToken()).resolves.toBe("a");
    await expect(getDriveAccessToken()).resolves.toBe("b");
    expect(getTokensMock).toHaveBeenCalledTimes(2);
  });

  it("a caller whose timeout fired does not let the next caller stack a second native call", async () => {
    const gate = deferred<{ accessToken: string }>();
    getTokensMock.mockReturnValue(gate.promise);

    const first = getDriveAccessToken().catch((e) => e);
    await jest.advanceTimersByTimeAsync(GOOGLE_AUTH_TIMEOUT_MS + 1);
    expect(await first).toBeInstanceOf(NetworkTimeoutError);

    const second = getDriveAccessToken();
    expect(getTokensMock).toHaveBeenCalledTimes(1); // joined the still-pending native call
    gate.resolve({ accessToken: "late" });
    await expect(second).resolves.toBe("late");
  });

  it("starts a new call when the pending one is older than the stale limit (the library never answered)", async () => {
    getTokensMock.mockReturnValueOnce(new Promise(() => {})).mockResolvedValueOnce({ accessToken: "fresh" });

    const lost = getDriveAccessToken().catch((e) => e);
    await jest.advanceTimersByTimeAsync(TOKEN_CALL_STALE_MS + 1);
    await lost;

    await expect(getDriveAccessToken()).resolves.toBe("fresh");
    expect(getTokensMock).toHaveBeenCalledTimes(2);
  });

  it("propagates a rejection to every sharing caller and releases the slot", async () => {
    const gate = deferred<{ accessToken: string }>();
    getTokensMock.mockReturnValueOnce(gate.promise).mockResolvedValueOnce({ accessToken: "ok" });

    const callers = [getDriveAccessToken().catch((e) => e), getDriveAccessToken().catch((e) => e)];
    gate.reject(new Error("signed out"));
    const errors = await Promise.all(callers);
    expect(errors.map((e) => (e as Error).message)).toEqual(["signed out", "signed out"]);

    await expect(getDriveAccessToken()).resolves.toBe("ok");
  });
});
