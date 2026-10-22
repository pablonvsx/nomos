import { NetworkTimeoutError, isNetworkTimeoutError, withTimeout } from "../network-timeout";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const neverResolves = () => new Promise<never>(() => {});

describe("withTimeout", () => {
  it("rejects with the created error once the limit passes, and aborts the signal", async () => {
    let seenSignal!: AbortSignal;
    const pending = withTimeout(
      (signal) => {
        seenSignal = signal;
        return neverResolves();
      },
      1_000,
      () => new NetworkTimeoutError(1_000, "too slow"),
    );
    const outcome = pending.then(
      () => "resolved",
      (error) => error,
    );

    await jest.advanceTimersByTimeAsync(999);
    expect(seenSignal.aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    const error = await outcome;
    expect(error).toBeInstanceOf(NetworkTimeoutError);
    expect(isNetworkTimeoutError(error)).toBe(true);
    expect(seenSignal.aborted).toBe(true);
  });

  it("does not affect a fast response and leaves no timer behind", async () => {
    const result = await withTimeout(
      async () => "ok",
      1_000,
      () => new NetworkTimeoutError(1_000),
    );

    expect(result).toBe("ok");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("propagates the task's own error (not a timeout) when it fails before the limit", async () => {
    await expect(
      withTimeout(
        async () => {
          throw new Error("HTTP 500");
        },
        1_000,
        () => new NetworkTimeoutError(1_000),
      ),
    ).rejects.toThrow("HTTP 500");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("works for a task that ignores the signal (e.g. a native call that cannot be cancelled)", async () => {
    const outcome = withTimeout(
      () => neverResolves(),
      500,
      () => new NetworkTimeoutError(500),
    ).catch((error) => error);

    await jest.advanceTimersByTimeAsync(500);

    expect(await outcome).toBeInstanceOf(NetworkTimeoutError);
  });

  it("a task rejecting only after the timeout (the abort error) does not surface as an unhandled rejection", async () => {
    const unhandled = jest.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const outcome = withTimeout(
        (signal) =>
          new Promise<never>((_, reject) => {
            signal.addEventListener("abort", () => reject(new Error("aborted")));
          }),
        100,
        () => new NetworkTimeoutError(100),
      ).catch((error) => error);

      await jest.advanceTimersByTimeAsync(100);
      expect(await outcome).toBeInstanceOf(NetworkTimeoutError);

      jest.useRealTimers();
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});

describe("isNetworkTimeoutError", () => {
  it("is false for other errors and non-errors", () => {
    expect(isNetworkTimeoutError(new Error("x"))).toBe(false);
    expect(isNetworkTimeoutError("timeout")).toBe(false);
    expect(isNetworkTimeoutError(undefined)).toBe(false);
  });
});
