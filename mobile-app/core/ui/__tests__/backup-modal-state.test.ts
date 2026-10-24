import type { BackupSessionState } from "@/core/drive-sync/backup-session";
import { deriveBackupModalView, initialBackupModalUi, reduceBackupModal } from "../backup-modal-state";

const running = (overrides: Partial<Extract<BackupSessionState, { phase: "running" }>> = {}): BackupSessionState => ({
  phase: "running",
  scope: "points",
  projectId: 1,
  stage: null,
  current: 1,
  total: 4,
  cancelRequested: false,
  ...overrides,
});

const finished: BackupSessionState = {
  phase: "finished",
  scope: "points",
  projectId: 1,
  result: { outcome: "completed", sent: 4, notSent: 0, failures: [] },
};

describe("deriveBackupModalView", () => {
  it("is hidden when idle", () => {
    expect(deriveBackupModalView({ phase: "idle" }, initialBackupModalUi)).toEqual({ kind: "hidden" });
  });

  it("shows progress as a fraction while running, indeterminate before the total is known", () => {
    expect(deriveBackupModalView(running(), initialBackupModalUi)).toEqual({ kind: "running", progress: 0.25 });
    expect(deriveBackupModalView(running({ total: 0, current: 0 }), initialBackupModalUi)).toEqual({
      kind: "running",
      progress: null,
    });
  });

  it("shows the cancel confirmation when asked, and 'cancelling' once the cancel was requested", () => {
    expect(deriveBackupModalView(running(), { confirmingCancel: true }).kind).toBe("confirmingCancel");
    expect(deriveBackupModalView(running({ cancelRequested: true }), { confirmingCancel: true }).kind).toBe("cancelling");
  });

  it("shows the result once finished", () => {
    expect(deriveBackupModalView(finished, initialBackupModalUi).kind).toBe("finished");
  });
});

describe("reduceBackupModal", () => {
  it("Back / tap outside / Cancel open the confirmation instead of closing, only while running", () => {
    expect(reduceBackupModal(initialBackupModalUi, { type: "backPressed" }, running())).toEqual({ confirmingCancel: true });
    expect(reduceBackupModal(initialBackupModalUi, { type: "backPressed" }, running({ cancelRequested: true }))).toEqual(
      initialBackupModalUi,
    );
  });

  it("Back on a finished backup does nothing: only OK closes it", () => {
    expect(reduceBackupModal(initialBackupModalUi, { type: "backPressed" }, finished)).toEqual(initialBackupModalUi);
  });

  it("'keep going' and a confirmed cancel close the confirmation", () => {
    const open = { confirmingCancel: true };
    expect(reduceBackupModal(open, { type: "keepGoing" }, running())).toEqual({ confirmingCancel: false });
    expect(reduceBackupModal(open, { type: "cancelConfirmed" }, running())).toEqual({ confirmingCancel: false });
  });

  it("resets the confirmation when the session leaves the running phase", () => {
    expect(reduceBackupModal({ confirmingCancel: true }, { type: "sessionChanged" }, finished)).toEqual({
      confirmingCancel: false,
    });
    expect(reduceBackupModal({ confirmingCancel: true }, { type: "sessionChanged" }, running())).toEqual({
      confirmingCancel: true,
    });
  });
});
