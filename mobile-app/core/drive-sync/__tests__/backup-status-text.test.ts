import { backupStatusText, isBackupActionEnabled } from "../backup-status-text";
import type { BackupStatus } from "../change-detection";

const status = (overrides: Partial<BackupStatus>): BackupStatus => ({
  kind: "pending",
  pendingCount: 0,
  lastBackupAt: null,
  pendingKeys: new Set(),
  ...overrides,
});

const fmt = (iso: string) => `<${iso}>`;

describe("backupStatusText", () => {
  it("says up to date with the backup date, or that there is nothing to send", () => {
    expect(backupStatusText(status({ kind: "upToDate", lastBackupAt: "2026-10-20" }), fmt)).toEqual({
      key: "driveBackup.status.upToDate",
      params: { date: "<2026-10-20>" },
    });
    expect(backupStatusText(status({ kind: "upToDate" }), fmt).key).toBe("driveBackup.status.nothingToSend");
  });

  it("shows how many items are pending, in the singular for one and the plural for more", () => {
    expect(backupStatusText(status({ kind: "pending", pendingCount: 1 }), fmt)).toEqual({ key: "driveBackup.status.pendingOne", params: { count: "1" } });
    expect(backupStatusText(status({ kind: "pending", pendingCount: 3 }), fmt)).toEqual({ key: "driveBackup.status.pendingOther", params: { count: "3" } });
  });

  it("does the same when a backup was never made", () => {
    expect(backupStatusText(status({ kind: "never", pendingCount: 1 }), fmt)).toEqual({ key: "driveBackup.status.neverOne", params: { count: "1" } });
    expect(backupStatusText(status({ kind: "never", pendingCount: 5 }), fmt)).toEqual({ key: "driveBackup.status.neverOther", params: { count: "5" } });
  });

  it("explains an unverifiable status, and shows 'checking' before the first answer", () => {
    expect(backupStatusText(status({ kind: "unverifiable", reason: "account" }), fmt).key).toBe("driveBackup.status.unverifiableAccount");
    expect(backupStatusText(status({ kind: "unverifiable", reason: "error" }), fmt).key).toBe("driveBackup.status.unverifiable");
    expect(backupStatusText(null, fmt).key).toBe("driveBackup.status.checking");
  });
});

describe("isBackupActionEnabled", () => {
  it("is disabled only when verifiably up to date (or still checking)", () => {
    expect(isBackupActionEnabled(status({ kind: "upToDate" }))).toBe(false);
    expect(isBackupActionEnabled(null)).toBe(false);
    expect(isBackupActionEnabled(status({ kind: "pending" }))).toBe(true);
    expect(isBackupActionEnabled(status({ kind: "never" }))).toBe(true);
    expect(isBackupActionEnabled(status({ kind: "unverifiable" }))).toBe(true);
  });
});
