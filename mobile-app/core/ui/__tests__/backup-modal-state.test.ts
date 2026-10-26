import type { BackupSessionState } from "@/core/drive-sync/backup-session";
import { deriveBackupModalView, initialBackupModalUi, modalCopyKeys, reduceBackupModal, resultCopy } from "../backup-modal-state";

const running = (overrides: Partial<Extract<BackupSessionState, { phase: "running" }>> = {}): BackupSessionState => ({
  phase: "running",
  scope: "points",
  projectId: 1,
  stage: null,
  current: 1,
  total: 4,
  log: [],
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

  it("stays hidden while the pre-flight runs: no progress modal until it passes", () => {
    expect(deriveBackupModalView({ phase: "checking", scope: "points", projectId: 1 }, initialBackupModalUi)).toEqual({ kind: "hidden" });
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

describe("modalCopyKeys", () => {
  it("uses the backup texts for the backups and its own for the activation", () => {
    expect(modalCopyKeys("points").title).toBe("driveBackup.modalTitle");
    expect(modalCopyKeys("project").cancelTitle).toBe("driveBackup.cancelTitle");
    expect(modalCopyKeys("activation").title).toBe("driveBackup.activation.modalTitle");
    expect(modalCopyKeys("activation").cancelMessage).toBe("driveBackup.activation.cancelMessage");
  });
});

describe("resultCopy for a backup", () => {
  const result = (overrides: Partial<import("@/core/drive-sync/backup-session").BackupResult>) => ({
    outcome: "completed" as const,
    sent: 2,
    notSent: 0,
    failures: [],
    ...overrides,
  });

  it("names the outcome and gives the counts", () => {
    expect(resultCopy("points", result({}))).toMatchObject({
      titleKey: "driveBackup.result.completed.title",
      messageKey: "driveBackup.result.completed.message",
      params: { sent: "2", notSent: "0" },
    });
  });

  it("says nothing needed to be sent when a complete run sent nothing", () => {
    expect(resultCopy("project", result({ sent: 0 })).messageKey).toBe("driveBackup.result.completedNothing.message");
  });

  it("no connection reads 'Sem conexão', like the pre-flight dialog", () => {
    const copy = resultCopy("points", result({ outcome: "error", sent: 0, error: { reasonKey: "driveBackup.reason.offline", detail: "" } }));
    expect(copy.titleKey).toBe("driveBackup.preflight.offline.title");
  });
});

describe("resultCopy for the activation (all or nothing)", () => {
  const base = { sent: 0, notSent: 0, failures: [] };

  it("is 'activated' only when completed", () => {
    expect(resultCopy("activation", { ...base, outcome: "completed", sent: 4 })).toMatchObject({
      titleKey: "driveBackup.activation.completed.title",
      messageKey: "driveBackup.activation.completed.message",
    });
  });

  it("says it was cancelled and that nothing is activated", () => {
    expect(resultCopy("activation", { ...base, outcome: "cancelled" }).titleKey).toBe("driveBackup.activation.cancelled.title");
  });

  it("any other outcome is 'could not activate', with the reason in plain words and never sent/not-sent counts", () => {
    const interrupted = resultCopy("activation", { ...base, outcome: "interrupted", sent: 2, notSent: 3 });
    expect(interrupted).toMatchObject({ titleKey: "driveBackup.activation.failed.title", messageKey: "driveBackup.reason.offline" });
    expect(interrupted.params).toBeUndefined();

    const error = resultCopy("activation", {
      ...base,
      outcome: "error",
      error: { reasonKey: "driveBackup.reason.quota", detail: "x" },
    });
    expect(error).toMatchObject({ titleKey: "driveBackup.activation.failed.title", messageKey: "driveBackup.reason.quota" });

    const incomplete = resultCopy("activation", {
      ...base,
      outcome: "incomplete",
      sent: 1,
      notSent: 1,
      failures: [{ kind: "species", label: "x", reasonKey: "driveBackup.reason.server", detail: "" }],
    });
    expect(incomplete.messageKey).toBe("driveBackup.reason.server");
  });
});
