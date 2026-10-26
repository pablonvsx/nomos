import { useSyncExternalStore } from "react";
import { getBackupSession, subscribeBackupSession, type BackupSessionState } from "@/core/drive-sync/backup-session";

/** The global backup session (see core/drive-sync/backup-session.ts); re-renders on every change. Only the backup modal needs this much. */
export function useBackupSession(): BackupSessionState {
  return useSyncExternalStore(subscribeBackupSession, getBackupSession, getBackupSession);
}

const getBackupPhase = (): BackupSessionState["phase"] => getBackupSession().phase;

/**
 * Just the phase of the session. A string, so a screen that only cares whether
 * a backup is running re-renders when that changes, not on every progress report.
 */
export function useBackupPhase(): BackupSessionState["phase"] {
  return useSyncExternalStore(subscribeBackupSession, getBackupPhase, getBackupPhase);
}
