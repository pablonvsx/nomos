// The one-line summary of the collapsed "Backup e Colaboração" card, and the
// badge for the approval queue. Pure (i18n key + params, core/ has no
// translations). "Up to date" is decided by isBackupUpToDate, the same
// function that drives each row of the backup block, so the rule exists once.

import { backupStatusText, isBackupUpToDate, type StatusText } from "@/core/drive-sync/backup-status-text";
import type { BackupStatus } from "@/core/drive-sync/change-detection";

export type BackupSummaryState = "upToDate" | "pending" | "unknown";

function hasPendingItems(status: BackupStatus | null): boolean {
  return status?.kind === "pending" || status?.kind === "never";
}

/**
 * upToDate: both scopes verified and complete. pending: at least one scope is
 * known to have items to send. unknown: nothing is known to be pending but a
 * scope is still being checked or cannot be verified (no claim either way).
 */
export function getBackupSummaryState(
  projectStatus: BackupStatus | null,
  pointsStatus: BackupStatus | null,
): BackupSummaryState {
  if (hasPendingItems(projectStatus) || hasPendingItems(pointsStatus)) return "pending";
  if (isBackupUpToDate(projectStatus) && isBackupUpToDate(pointsStatus)) return "upToDate";
  return "unknown";
}

export function backupSummaryText(
  projectStatus: BackupStatus | null,
  pointsStatus: BackupStatus | null,
  formatDate: (iso: string) => string,
): StatusText {
  const state = getBackupSummaryState(projectStatus, pointsStatus);
  if (state === "upToDate") return { key: "driveBackup.summary.upToDate" };
  if (state === "pending") return { key: "driveBackup.summary.pending" };
  // Unknown: say what the unresolved row says ("Verificando...", "Não foi possível verificar...").
  const unresolved = isBackupUpToDate(projectStatus) ? pointsStatus : projectStatus;
  return backupStatusText(unresolved, formatDate);
}

/** Badge for pending approvals only (rejected points do not count); null hides it. */
export function getPendingQueueBadge(pendingCount: number): StatusText | null {
  if (pendingCount <= 0) return null;
  return {
    key: pendingCount === 1 ? "driveBackup.queueBadgeOne" : "driveBackup.queueBadgeOther",
    params: { count: String(pendingCount) },
  };
}
