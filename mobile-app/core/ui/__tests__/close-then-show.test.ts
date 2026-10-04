import { closeModalThenShow, runThenCloseAndShow } from "../close-then-show";

describe("closeModalThenShow", () => {
  it("closes, waits, and only then shows (in that order)", async () => {
    const calls: string[] = [];
    await closeModalThenShow({
      close: () => calls.push("close"),
      wait: async () => {
        calls.push("wait:start");
        await Promise.resolve();
        calls.push("wait:end");
      },
      show: () => calls.push("show"),
    });

    expect(calls).toEqual(["close", "wait:start", "wait:end", "show"]);
  });

  it("does not show before the wait has resolved", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const show = jest.fn();

    const pending = closeModalThenShow({ close: jest.fn(), wait: () => gate, show });
    await Promise.resolve();
    expect(show).not.toHaveBeenCalled();

    release();
    await pending;
    expect(show).toHaveBeenCalledTimes(1);
  });
});

describe("runThenCloseAndShow", () => {
  it("on success: runs, closes, waits, then shows with the result", async () => {
    const calls: string[] = [];
    await runThenCloseAndShow({
      run: async () => {
        calls.push("run");
        return { imported: 3 };
      },
      close: () => calls.push("close"),
      wait: async () => {
        calls.push("wait");
      },
      showOnSuccess: (result) => calls.push(`show:${result.imported}`),
      onError: () => calls.push("error"),
    });

    expect(calls).toEqual(["run", "close", "wait", "show:3"]);
  });

  it("on error: never closes the modal, never shows the success dialog, reports the error", async () => {
    const boom = new Error("boom");
    const close = jest.fn();
    const wait = jest.fn(async () => {});
    const showOnSuccess = jest.fn();
    const onError = jest.fn();

    await runThenCloseAndShow({
      run: async () => {
        throw boom;
      },
      close,
      wait,
      showOnSuccess,
      onError,
    });

    expect(onError).toHaveBeenCalledWith(boom);
    expect(close).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
    expect(showOnSuccess).not.toHaveBeenCalled();
  });

  it("an exception thrown while showing is not reported as a run error", async () => {
    const onError = jest.fn();
    await expect(
      runThenCloseAndShow({
        run: async () => 1,
        close: jest.fn(),
        wait: async () => {},
        showOnSuccess: () => {
          throw new Error("ui broke");
        },
        onError,
      }),
    ).rejects.toThrow("ui broke");
    expect(onError).not.toHaveBeenCalled();
  });
});
