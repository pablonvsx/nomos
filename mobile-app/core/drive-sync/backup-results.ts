// Pure mapping from the low-level results of backup-service.ts to the
// BackupResult the modal shows. Kept apart from backup-runners.ts so it runs
// under plain Node without the database or the file system.

import { describeBackupError } from "@/core/drive-sync/backup-errors";
import type { BackupSummary } from "@/core/drive-sync/backup-service";
import type { BackupFailure, BackupResult } from "@/core/drive-sync/backup-session";

export function failureFromReason(
  label: string,
  reason: string,
  extras: { missingMediaCount?: number; timedOut?: boolean; pointId?: number } = {},
): BackupFailure {
  const { pointId } = extras;
  if ((extras.missingMediaCount ?? 0) > 0) {
    return {
      label,
      reasonKey: "driveBackup.reason.missingMedia",
      reasonParams: { count: String(extras.missingMediaCount) },
      detail: reason,
      pointId,
      missingMediaCount: extras.missingMediaCount,
    };
  }
  if (extras.timedOut) return { label, reasonKey: "driveBackup.reason.timeout", detail: reason, pointId };
  const described = describeBackupError(reason);
  return { label, reasonKey: described.key, detail: described.detail, pointId };
}

/** Builds the result of a points run: "completed" only when nothing failed and nothing was left behind. */
export function resultFromPointsSummary(summary: BackupSummary): BackupResult {
  const failures = summary.failed.map((f) =>
    failureFromReason(f.pointLabel, f.reason, {
      missingMediaCount: f.missingMediaCount,
      timedOut: f.timedOut,
      pointId: f.pointId,
    }),
  );
  const notSent = summary.failed.length + summary.notAttempted;
  const outcome = summary.cancelled ? "cancelled" : failures.length > 0 ? "completedWithPending" : "completed";
  return { outcome, sent: summary.backedUp, notSent, failures };
}
