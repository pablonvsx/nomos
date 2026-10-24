import { useSyncExternalStore } from "react";
import { getBackupSession, subscribeBackupSession, type BackupSessionState } from "@/core/drive-sync/backup-session";

/** The global backup session (see core/drive-sync/backup-session.ts); re-renders on every change. */
export function useBackupSession(): BackupSessionState {
  return useSyncExternalStore(subscribeBackupSession, getBackupSession, getBackupSession);
}
