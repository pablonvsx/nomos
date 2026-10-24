// What the backup card says for a status: an i18n key plus its parameters
// (core/ has no translations, the card calls t()). Pure, so the wording rules
// are testable.

import type { BackupStatus } from "@/core/drive-sync/change-detection";

export interface StatusText {
  key: string;
  params?: Record<string, string>;
}

export function backupStatusText(status: BackupStatus | null, formatDate: (iso: string) => string): StatusText {
  if (!status) return { key: "driveBackup.status.checking" };

  switch (status.kind) {
    case "upToDate":
      return status.lastBackupAt
        ? { key: "driveBackup.status.upToDate", params: { date: formatDate(status.lastBackupAt) } }
        : { key: "driveBackup.status.nothingToSend" };
    case "pending":
      return { key: "driveBackup.status.pending", params: { count: String(status.pendingCount) } };
    case "never":
      return { key: "driveBackup.status.never", params: { count: String(status.pendingCount) } };
    case "unverifiable":
      return { key: status.reason === "account" ? "driveBackup.status.unverifiableAccount" : "driveBackup.status.unverifiable" };
  }
}

/** The backup button is available unless the project is verifiably up to date. */
export function isBackupActionEnabled(status: BackupStatus | null): boolean {
  return status !== null && status.kind !== "upToDate";
}
