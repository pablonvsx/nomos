// Backup runners: the work a BackupSession runs for each scope. They turn the
// low-level results of backup-service.ts into the BackupResult the modal
// shows (distinct outcomes, friendly reasons), and report progress through
// the session context. Nothing here touches the UI.

import {
  backupAllPendingPoints,
  backupPoint,
  type BackupAllOptions,
  type BackupResult as PointBackupResult,
} from "@/core/drive-sync/backup-service";
import { failureFromReason, resultFromPointsSummary } from "@/core/drive-sync/backup-results";
import type { BackupContext, BackupResult } from "@/core/drive-sync/backup-session";
import { getBackupEligiblePointsByProject, getPoint } from "@/db/queries/points";
import { getPointDisplayLabel } from "@/core/points/point-label";

/** Sends every pending point of a project. The list is captured here, once, at the start. */
export async function runPointsBackup(
  projectId: number,
  context: BackupContext,
  options: Pick<BackupAllOptions, "points" | "onPointDone"> = {},
): Promise<BackupResult> {
  const points = options.points ?? (await getBackupEligiblePointsByProject(projectId));
  const summary = await backupAllPendingPoints(
    projectId,
    ({ current, total }) =>
      context.report(
        { key: "driveBackup.stage.points", params: { current: String(current), total: String(total) } },
        current - 1,
        total,
      ),
    { points, shouldCancel: context.isCancelled, onPointDone: options.onPointDone },
  );
  return resultFromPointsSummary(summary);
}

/** Sends one point (the per-point button), through the same lock and modal. */
export async function runSinglePointBackup(
  pointId: number,
  context: BackupContext,
  onDone?: (result: PointBackupResult) => void | Promise<void>,
): Promise<BackupResult> {
  context.report({ key: "driveBackup.stage.singlePoint" }, 0, 1);
  const found = await getPoint(pointId);
  const label = found ? getPointDisplayLabel(found.point) : String(pointId);
  const result = await backupPoint(pointId.toString(), undefined, { shouldCancel: context.isCancelled });
  await onDone?.(result);

  if (result.cancelled) return { outcome: "cancelled", sent: 0, notSent: 1, failures: [] };
  if (result.success) return { outcome: "completed", sent: 1, notSent: 0, failures: [] };
  return {
    outcome: "completedWithPending",
    sent: 0,
    notSent: 1,
    failures: [
      failureFromReason(label, result.error ?? "", {
        missingMediaCount: result.missingMediaCount,
        timedOut: result.timedOut,
        pointId,
      }),
    ],
  };
}
