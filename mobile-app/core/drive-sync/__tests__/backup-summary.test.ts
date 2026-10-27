import { isBackupUpToDate } from "../backup-status-text";
import { backupSummaryText, getBackupSummaryState, getPendingQueueBadge } from "../backup-summary";
import type { BackupStatus } from "../change-detection";

const status = (overrides: Partial<BackupStatus>): BackupStatus => ({
  kind: "pending",
  pendingCount: 1,
  lastBackupAt: null,
  pendingKeys: new Set(),
  ...overrides,
});

const upToDate = status({ kind: "upToDate", pendingCount: 0, lastBackupAt: "2026-10-20" });
const pending = status({ kind: "pending", pendingCount: 2 });
const never = status({ kind: "never", pendingCount: 4 });
const unverifiable = status({ kind: "unverifiable", pendingCount: 0, reason: "error" });

describe("isBackupUpToDate", () => {
  it("is true only for a verifiably up to date status", () => {
    expect(isBackupUpToDate(upToDate)).toBe(true);
    expect(isBackupUpToDate(null)).toBe(false);
    expect(isBackupUpToDate(pending)).toBe(false);
    expect(isBackupUpToDate(never)).toBe(false);
    expect(isBackupUpToDate(unverifiable)).toBe(false);
  });
});

describe("getBackupSummaryState", () => {
  it("is upToDate only when project data and points are both up to date", () => {
    expect(getBackupSummaryState(upToDate, upToDate)).toBe("upToDate");
  });

  it("is pending when only the project data is pending", () => {
    expect(getBackupSummaryState(pending, upToDate)).toBe("pending");
  });

  it("is pending when only the points are pending (or never backed up)", () => {
    expect(getBackupSummaryState(upToDate, pending)).toBe("pending");
    expect(getBackupSummaryState(upToDate, never)).toBe("pending");
  });

  it("is pending when both are pending", () => {
    expect(getBackupSummaryState(pending, never)).toBe("pending");
  });

  it("is unknown while a status is still being checked or cannot be verified", () => {
    expect(getBackupSummaryState(null, null)).toBe("unknown");
    expect(getBackupSummaryState(upToDate, null)).toBe("unknown");
    expect(getBackupSummaryState(unverifiable, upToDate)).toBe("unknown");
  });

  it("a known pending scope wins over an unknown one", () => {
    expect(getBackupSummaryState(null, pending)).toBe("pending");
    expect(getBackupSummaryState(unverifiable, never)).toBe("pending");
  });
});

describe("backupSummaryText", () => {
  const fmt = (iso: string) => `<${iso}>`;

  it("uses the summary keys for the two known states", () => {
    expect(backupSummaryText(upToDate, upToDate, fmt)).toEqual({ key: "driveBackup.summary.upToDate" });
    expect(backupSummaryText(pending, upToDate, fmt)).toEqual({ key: "driveBackup.summary.pending" });
  });

  it("reuses the row wording of the unresolved scope when the state is unknown", () => {
    expect(backupSummaryText(null, upToDate, fmt).key).toBe("driveBackup.status.checking");
    expect(backupSummaryText(upToDate, unverifiable, fmt).key).toBe("driveBackup.status.unverifiable");
  });
});

describe("getPendingQueueBadge", () => {
  it("hides the badge when there is nothing pending", () => {
    expect(getPendingQueueBadge(0)).toBeNull();
    expect(getPendingQueueBadge(-1)).toBeNull();
  });

  it("uses the singular for one and the plural for more", () => {
    expect(getPendingQueueBadge(1)).toEqual({ key: "driveBackup.queueBadgeOne", params: { count: "1" } });
    expect(getPendingQueueBadge(7)).toEqual({ key: "driveBackup.queueBadgeOther", params: { count: "7" } });
  });
});
