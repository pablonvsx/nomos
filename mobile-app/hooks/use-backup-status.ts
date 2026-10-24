import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { computeBackupStatus } from "@/core/drive-sync/backup-status-service";
import type { BackupScope, BackupStatus } from "@/core/drive-sync/change-detection";
import { useBackupSession } from "@/hooks/use-backup-session";

/**
 * The backup status of one scope of a project (see backup-status-service.ts).
 * Computed locally when the screen gains focus and whenever a backup ends, in
 * small async steps, so opening the screen never blocks on it. `null` while
 * the first answer is on its way (or when disabled).
 */
export function useBackupStatus(projectId: number | undefined, scope: BackupScope, enabled: boolean) {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const session = useBackupSession();
  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled || projectId === undefined) {
      setStatus(null);
      return;
    }
    const request = ++latestRequest.current;
    const next = await computeBackupStatus(projectId, scope);
    if (request === latestRequest.current) setStatus(next);
  }, [enabled, projectId, scope]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // A backup ending (result shown, then dismissed) changes what is pending.
  useEffect(() => {
    if (session.phase !== "running") refresh();
  }, [session.phase, refresh]);

  return { status, refresh };
}
