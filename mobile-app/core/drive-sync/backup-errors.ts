// Turns the raw errors a backup can hit (Drive API bodies, Google Sign-In
// library messages, timeouts) into a reason the person can understand. The
// reason is an i18n key, not text: core/ has no access to the translations,
// the backup modal calls t(key). The technical message is kept next to it as
// `detail` for the log and the collapsed "details" view, and is never the
// primary text.

import { isNetworkTimeoutError } from "@/core/net/network-timeout";

export type BackupReasonKey =
  | "driveBackup.reason.timeout"
  | "driveBackup.reason.offline"
  | "driveBackup.reason.auth"
  | "driveBackup.reason.quota"
  | "driveBackup.reason.folderMissing"
  | "driveBackup.reason.server"
  | "driveBackup.reason.missingMedia"
  | "driveBackup.reason.unknown";

export interface BackupReason {
  key: BackupReasonKey;
  /** The original technical message, for the log and the "details" view only. */
  detail: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

const DRIVE_STATUS = /Drive API error \((\d{3})\)/;
const OFFLINE = /network request failed|failed to fetch|network error|unable to resolve host|enotfound|econnreset|offline/i;
const AUTH = /getTokens|PGMN|sign[- ]?in|login|play services|DEVELOPER_ERROR|invalid[_ ]credentials|unauthenticated/i;
const QUOTA = /rate ?limit|quota|userRateLimitExceeded|storageQuotaExceeded|too many requests/i;

/** Maps any thrown value or message to a friendly reason (the detail is the original text). */
export function describeBackupError(error: unknown): BackupReason {
  const detail = messageOf(error);

  if (isNetworkTimeoutError(error)) return { key: "driveBackup.reason.timeout", detail };

  const status = DRIVE_STATUS.exec(detail)?.[1];
  if (status) {
    const code = Number(status);
    if (code === 401) return { key: "driveBackup.reason.auth", detail };
    if (code === 429 || ((code === 403 || code === 400) && QUOTA.test(detail))) {
      return { key: "driveBackup.reason.quota", detail };
    }
    if (code === 403) return { key: "driveBackup.reason.auth", detail };
    if (code === 404) return { key: "driveBackup.reason.folderMissing", detail };
    if (code >= 500) return { key: "driveBackup.reason.server", detail };
  }

  if (OFFLINE.test(detail)) return { key: "driveBackup.reason.offline", detail };
  if (QUOTA.test(detail)) return { key: "driveBackup.reason.quota", detail };
  if (AUTH.test(detail)) return { key: "driveBackup.reason.auth", detail };
  return { key: "driveBackup.reason.unknown", detail };
}
