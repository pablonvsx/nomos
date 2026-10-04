import { createExclusiveRunner, type OperationState } from "../exclusive-runner";

function setup() {
  const states: Array<OperationState | null> = [];
  const runner = createExclusiveRunner((state) => states.push(state));
  return { runner, states };
}

describe("createExclusiveRunner", () => {
  it("publishes the operation while it runs and null afterwards", async () => {
    const { runner, states } = setup();
    await runner.run("Exporting", async () => 1);
    expect(states).toEqual([{ label: "Exporting" }, null]);
  });

  it("returns the task's result", async () => {
    const { runner } = setup();
    await expect(runner.run("x", async () => 42)).resolves.toBe(42);
  });

  it("releases the lock when the task rejects, and the error still propagates", async () => {
    const { runner, states } = setup();
    await expect(
      runner.run("fails", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(states[states.length - 1]).toBeNull();
    await expect(runner.run("next", async () => "ok")).resolves.toBe("ok");
  });

  it("releases the lock when the task throws synchronously (not an async function)", async () => {
    const { runner, states } = setup();
    await expect(
      runner.run("sync throw", (() => {
        throw new Error("sync boom");
      }) as unknown as () => Promise<void>),
    ).rejects.toThrow("sync boom");

    expect(states[states.length - 1]).toBeNull();
    await expect(runner.run("next", async () => "ok")).resolves.toBe("ok");
  });

  it("releases the lock when the task returns a promise rejected later", async () => {
    const { runner } = setup();
    let rejectLater!: (e: Error) => void;
    const pending = runner.run(
      "late",
      () => new Promise<void>((_, reject) => (rejectLater = reject)),
    );
    // Locked while pending.
    await expect(runner.run("second", async () => "ignored")).resolves.toBeUndefined();

    rejectLater(new Error("late boom"));
    await expect(pending).rejects.toThrow("late boom");
    await expect(runner.run("third", async () => "ok")).resolves.toBe("ok");
  });

  it("ignores re-entry while running: the second task never starts", async () => {
    const { runner } = setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const second = jest.fn(async () => "second");

    const first = runner.run("first", () => gate);
    const ignored = await runner.run("second", second);

    expect(ignored).toBeUndefined();
    expect(second).not.toHaveBeenCalled();
    release();
    await first;
  });

  it("merges progress updates into the published state", async () => {
    const { runner, states } = setup();
    await runner.run("Uploading", async (update) => {
      update({ label: "Point 1 of 2", current: 1, total: 2 });
      update({ current: 2 });
    });

    expect(states).toEqual([
      { label: "Uploading" },
      { label: "Point 1 of 2", current: 1, total: 2 },
      { label: "Point 1 of 2", current: 2, total: 2 },
      null,
    ]);
  });

  it("an update arriving after the operation ended is ignored", async () => {
    const { runner, states } = setup();
    let lateUpdate!: (p: { current: number }) => void;
    await runner.run("x", async (update) => {
      lateUpdate = update;
    });
    const before = states.length;

    lateUpdate({ current: 9 });

    expect(states).toHaveLength(before);
  });
});
