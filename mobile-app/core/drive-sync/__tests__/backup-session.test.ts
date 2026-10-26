import {
  startBackupWithPreflight,
  dismissBackupResult,
  getBackupSession,
  isBackupBusy,
  requestBackupCancel,
  resetBackupSessionForTests,
  startBackup,
  subscribeBackupSession,
  type BackupResult,
} from "../backup-session";

const completed: BackupResult = { outcome: "completed", sent: 1, notSent: 0, failures: [] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  resetBackupSessionForTests();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("single-flight backup lock", () => {
  it("does not start a second backup while one is running, even for another scope or project", async () => {
    const gate = deferred<BackupResult>();
    const first = startBackup({ scope: "points", projectId: 1, run: () => gate.promise });
    expect(first.status).toBe("started");

    const run = jest.fn(async () => completed);
    expect(startBackup({ scope: "project", projectId: 1, run }).status).toBe("already-running");
    expect(startBackup({ scope: "points", projectId: 2, run }).status).toBe("already-running");
    expect(run).not.toHaveBeenCalled();

    gate.resolve(completed);
    if (first.status === "started") await first.done;
  });

  it("keeps the lock after the run ends until the result is dismissed", async () => {
    const started = startBackup({ scope: "points", projectId: 1, run: async () => completed });
    if (started.status === "started") await started.done;

    expect(getBackupSession().phase).toBe("finished");
    expect(isBackupBusy()).toBe(true);
    expect(startBackup({ scope: "points", projectId: 1, run: async () => completed }).status).toBe("already-running");

    dismissBackupResult();
    expect(getBackupSession().phase).toBe("idle");
    expect(startBackup({ scope: "points", projectId: 1, run: async () => completed }).status).toBe("started");
  });
});

describe("progress and cancellation", () => {
  it("publishes progress to subscribers and exposes the cancel request to the runner", async () => {
    const seen: string[] = [];
    subscribeBackupSession(() => seen.push(getBackupSession().phase));
    const gate = deferred<BackupResult>();
    let cancelledSeen: boolean | null = null;

    const started = startBackup({
      scope: "points",
      projectId: 1,
      run: async (context) => {
        context.report({ key: "driveBackup.stage.points", params: { current: "1", total: "3" } }, 0, 3);
        await gate.promise;
        cancelledSeen = context.isCancelled();
        return { outcome: "cancelled", sent: 1, notSent: 2, failures: [] };
      },
    });

    const running = getBackupSession();
    expect(running).toMatchObject({ phase: "running", current: 0, total: 3, cancelRequested: false });

    requestBackupCancel();
    expect(getBackupSession()).toMatchObject({ phase: "running", cancelRequested: true });

    gate.resolve(completed);
    if (started.status === "started") await started.done;
    expect(cancelledSeen).toBe(true);
    expect(seen).toContain("running");
    expect(getBackupSession()).toMatchObject({ phase: "finished", result: { outcome: "cancelled" } });
  });
});

describe("progress position, activity log and notification rate", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const stage = { key: "driveBackup.stage.points" };
  const item = { kind: "point" as const, label: "", point: { number: 1, lat: 0, lon: 0 } };

  async function withRun(body: (context: Parameters<Parameters<typeof startBackup>[0]["run"]>[0]) => void) {
    const gate = deferred<BackupResult>();
    const started = startBackup({
      scope: "points",
      projectId: 1,
      run: async (context) => {
        body(context);
        return gate.promise;
      },
    });
    return {
      finish: async () => {
        gate.resolve(completed);
        if (started.status === "started") await started.done;
      },
    };
  }

  it("the position never goes backwards within a run", async () => {
    const run = await withRun((context) => {
      context.report(stage, 1, 4);
      context.report(stage, 3, 4);
      context.report(stage, 2, 4);
    });
    expect(getBackupSession()).toMatchObject({ phase: "running", current: 3, total: 4 });
    await run.finish();
  });

  it("keeps the log bounded to 50 events, newest last", async () => {
    const run = await withRun((context) => {
      for (let i = 1; i <= 60; i++) context.activity({ type: "item-start", item: { ...item, point: { number: i, lat: 0, lon: 0 } } });
    });
    const session = getBackupSession();
    if (session.phase !== "running") throw new Error("expected running");
    expect(session.log).toHaveLength(50);
    expect((session.log[49].item.point as { number: number }).number).toBe(60);
    await run.finish();
  });

  it("coalesces many reports into few notifications, and the state is already current when read", async () => {
    let context!: Parameters<Parameters<typeof startBackup>[0]["run"]>[0];
    const gate = deferred<BackupResult>();
    startBackup({
      scope: "points",
      projectId: 1,
      run: (c) => {
        context = c;
        return gate.promise;
      },
    });
    jest.advanceTimersByTime(500);
    let notifications = 0;
    subscribeBackupSession(() => notifications++);

    for (let i = 1; i <= 100; i++) context.report(stage, i, 100);

    expect(getBackupSession()).toMatchObject({ current: 100, total: 100 }); // read at once, not delayed
    expect(notifications).toBe(1); // the first went out, the other 99 wait
    jest.advanceTimersByTime(100);
    expect(notifications).toBe(2); // one more carries the final state
    jest.advanceTimersByTime(1000);
    expect(notifications).toBe(2);
    gate.resolve(completed);
  });

  it("a change of phase is never delayed: the result is announced at once", async () => {
    let context!: Parameters<Parameters<typeof startBackup>[0]["run"]>[0];
    const gate = deferred<BackupResult>();
    const started = startBackup({
      scope: "points",
      projectId: 1,
      run: (c) => {
        context = c;
        return gate.promise;
      },
    });
    jest.advanceTimersByTime(500);
    const phases: string[] = [];
    subscribeBackupSession(() => phases.push(getBackupSession().phase));
    context.report(stage, 1, 2); // throttled-class update right after: waits
    requestBackupCancel(); // a phase-class change: goes out now
    expect(phases).toContain("running");
    gate.resolve(completed);
    if (started.status === "started") await started.done;
    expect(phases[phases.length - 1]).toBe("finished");
  });
});

describe("results and errors", () => {
  it("turns a thrown error into an 'error' outcome with a friendly reason, never the raw text as the reason", async () => {
    const started = startBackup({
      scope: "project",
      projectId: 1,
      run: async () => {
        throw new Error("Drive API error (403): userRateLimitExceeded");
      },
    });
    if (started.status === "started") await started.done;

    const state = getBackupSession();
    expect(state.phase).toBe("finished");
    if (state.phase === "finished") {
      expect(state.result.outcome).toBe("error");
      expect(state.result.error?.reasonKey).toBe("driveBackup.reason.quota");
      expect(state.result.error?.detail).toContain("403");
    }
  });

  it("calls onFinished when the run ends and onDismissed only after OK", async () => {
    const onFinished = jest.fn();
    const onDismissed = jest.fn();
    const started = startBackup({ scope: "points", projectId: 1, run: async () => completed, onFinished, onDismissed });
    if (started.status === "started") await started.done;

    expect(onFinished).toHaveBeenCalledWith(completed);
    expect(onDismissed).not.toHaveBeenCalled();

    dismissBackupResult();
    expect(onDismissed).toHaveBeenCalledWith(completed);
  });

  it("hands a cancelled or failed result to onDismissed, so a follow-up (like the export) can tell it must not continue", async () => {
    const cancelled: BackupResult = { outcome: "cancelled", sent: 1, notSent: 2, failures: [] };
    const onDismissed = jest.fn();
    const started = startBackup({ scope: "project", projectId: 1, run: async () => cancelled, onDismissed });
    if (started.status === "started") await started.done;

    dismissBackupResult();

    expect(onDismissed).toHaveBeenCalledWith(cancelled);
    expect(onDismissed.mock.calls[0][0].outcome).not.toBe("completed");
  });
});

describe("startBackupWithPreflight", () => {
  it("a failed pre-flight never opens the progress modal, never runs, and releases the lock", async () => {
    const run = jest.fn(async () => completed);
    const onBlocked = jest.fn();
    const phases: string[] = [];
    subscribeBackupSession(() => phases.push(getBackupSession().phase));

    const outcome = await startBackupWithPreflight({
      scope: "points",
      projectId: 1,
      run,
      preflight: async () => "offline",
      onBlocked,
    });

    expect(outcome).toEqual({ status: "blocked", failure: "offline" });
    expect(onBlocked).toHaveBeenCalledWith("offline");
    expect(run).not.toHaveBeenCalled();
    expect(phases).not.toContain("running");
    expect(getBackupSession().phase).toBe("idle");

    // The lock is free: a new backup works right after.
    const next = startBackup({ scope: "points", projectId: 1, run: async () => completed });
    expect(next.status).toBe("started");
    if (next.status === "started") await next.done;
  });

  it("holds the lock while the pre-flight runs, so a second start cannot slip in", async () => {
    const gate = deferred<null>();
    const first = startBackupWithPreflight({
      scope: "project",
      projectId: 1,
      run: async () => completed,
      preflight: () => gate.promise,
      onBlocked: jest.fn(),
    });

    expect(getBackupSession().phase).toBe("checking");
    expect(isBackupBusy()).toBe(true);
    expect(startBackup({ scope: "points", projectId: 2, run: async () => completed }).status).toBe("already-running");
    await expect(
      startBackupWithPreflight({ scope: "points", projectId: 1, run: async () => completed, preflight: async () => null, onBlocked: jest.fn() }),
    ).resolves.toEqual({ status: "already-running" });

    gate.resolve(null);
    const started = await first;
    expect(started.status).toBe("started");
    if (started.status === "started") await started.done;
  });

  it("runs the backup normally once the pre-flight passes, for either scope", async () => {
    for (const scope of ["points", "project"] as const) {
      resetBackupSessionForTests();
      const run = jest.fn(async () => completed);
      const started = await startBackupWithPreflight({ scope, projectId: 1, run, preflight: async () => null, onBlocked: jest.fn() });
      expect(started.status).toBe("started");
      if (started.status === "started") await started.done;
      expect(run).toHaveBeenCalledTimes(1);
      expect(getBackupSession()).toMatchObject({ phase: "finished", scope });
    }
  });

  it("an exception inside the pre-flight still releases the lock and blocks the start", async () => {
    const run = jest.fn(async () => completed);
    const onBlocked = jest.fn();

    const outcome = await startBackupWithPreflight({
      scope: "points",
      projectId: 1,
      run,
      preflight: async () => {
        throw new Error("boom");
      },
      onBlocked,
    });

    expect(outcome.status).toBe("blocked");
    expect(run).not.toHaveBeenCalled();
    expect(getBackupSession().phase).toBe("idle");
  });

  it("reports the reason so a caller can come back to where it started (the export warning)", async () => {
    let backToWarning = false;
    await startBackupWithPreflight({
      scope: "project",
      projectId: 1,
      run: async () => completed,
      preflight: async () => "offline",
      onBlocked: () => {
        backToWarning = true; // the screen reopens the warning when the dialog's OK is tapped
      },
    });
    expect(backToWarning).toBe(true);
  });

  it("the activation of the backup is a session like any other: it takes the same single lock", async () => {
    const gate = deferred<BackupResult>();
    const activation = startBackup({ scope: "activation", projectId: 1, run: () => gate.promise });
    expect(activation.status).toBe("started");
    expect(getBackupSession()).toMatchObject({ phase: "running", scope: "activation" });
    expect(startBackup({ scope: "points", projectId: 1, run: async () => completed }).status).toBe("already-running");

    gate.resolve(completed);
    if (activation.status === "started") await activation.done;
    expect(getBackupSession()).toMatchObject({ phase: "finished", scope: "activation" });
  });
});
