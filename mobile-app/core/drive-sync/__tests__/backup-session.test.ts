import {
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
});
