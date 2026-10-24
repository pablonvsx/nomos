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
    // One key per form ("1 item pendente" / "N itens pendentes"): no "item(ns)" in the text.
    case "pending":
      return {
        key: status.pendingCount === 1 ? "driveBackup.status.pendingOne" : "driveBackup.status.pendingOther",
        params: { count: String(status.pendingCount) },
      };
    case "never":
      return {
        key: status.pendingCount === 1 ? "driveBackup.status.neverOne" : "driveBackup.status.neverOther",
        params: { count: String(status.pendingCount) },
      };
    case "unverifiable":
      return { key: status.reason === "account" ? "driveBackup.status.unverifiableAccount" : "driveBackup.status.unverifiable" };
  }
}

/** The backup button is available unless the project is verifiably up to date. */
export function isBackupActionEnabled(status: BackupStatus | null): boolean {
  return status !== null && status.kind !== "upToDate";
}
