import { refreshAfterImport } from "../refresh-after-import";

describe("refreshAfterImport", () => {
  it("clears the map cache, then awaits the reload, in that order", async () => {
    const calls: string[] = [];
    const clearMapData = jest.fn(() => {
      calls.push("clear");
    });
    const reload = jest.fn(async () => {
      calls.push("reload-start");
      await new Promise((resolve) => setTimeout(resolve, 10));
      calls.push("reload-end");
    });

    await refreshAfterImport({ clearMapData, reload });

    expect(clearMapData).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    // The caller only continues once the reload has fully finished.
    expect(calls).toEqual(["clear", "reload-start", "reload-end"]);
  });

  it("propagates a failing reload instead of swallowing it", async () => {
    await expect(
      refreshAfterImport({
        clearMapData: () => {},
        reload: async () => {
          throw new Error("db down");
        },
      }),
    ).rejects.toThrow("db down");
  });
});
