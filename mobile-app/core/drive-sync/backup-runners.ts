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
import { getPoint } from "@/db/queries/points";
import { getPointDisplayLabel } from "@/core/points/point-label";
import { collectPointItems, collectProjectDataItems } from "@/core/drive-sync/backup-collectors";
import { pointItemKey } from "@/core/drive-sync/backup-items";
import { backupProjectData } from "@/core/drive-sync/project-data-backup";
import { diffAgainstSnapshot, type BackupItem } from "@/core/drive-sync/change-detection";
import {
  deleteSnapshotItems,
  getSnapshot,
  markItemBackedUp,
  setScopeBackupTime,
} from "@/db/queries/backup-snapshot";
import { getProjectById } from "@/db/queries/projects";

/** Records the removals and the time once a run has changed anything in the snapshot. */
async function recordRun(projectId: number, scope: "points" | "project", removedKeys: string[]): Promise<void> {
  if (removedKeys.length > 0) await deleteSnapshotItems(projectId, scope, removedKeys);
  await setScopeBackupTime(projectId, scope, new Date().toISOString());
}

/**
 * Sends the pending points of a project: the ones new or changed since the
 * last backup. The list and the fingerprints are captured here, once, at the
 * start: a point edited or created during the run stays pending. Points that
 * disappeared locally are only dropped from the snapshot (nothing is deleted
 * on Drive).
 */
export async function runPointsBackup(projectId: number, context: BackupContext): Promise<BackupResult> {
  const { items, points } = await collectPointItems(projectId);
  const diff = diffAgainstSnapshot(items, await getSnapshot(projectId, "points"));
  const pendingKeys = new Set([...diff.added, ...diff.changed].map((item) => item.key));
  const fingerprints = new Map(items.map((item) => [item.key, item.fingerprint]));
  const pointsToSend = points.filter((point) => pendingKeys.has(pointItemKey(point.id)));

  let changedSnapshot = false;
  const summary = await backupAllPendingPoints(
    projectId,
    ({ current, total }) =>
      context.report(
        { key: "driveBackup.stage.points", params: { current: String(current), total: String(total) } },
        current - 1,
        total,
      ),
    {
      points: pointsToSend,
      shouldCancel: context.isCancelled,
      onPointDone: async (point, result) => {
        if (!result.success) return;
        const key = pointItemKey(point.id);
        await markItemBackedUp(projectId, "points", key, fingerprints.get(key) ?? "", new Date().toISOString());
        changedSnapshot = true;
      },
    },
  );

  if (changedSnapshot || diff.removedKeys.length > 0) await recordRun(projectId, "points", diff.removedKeys);
  return resultFromPointsSummary(summary);
}

/** Sends the pending project data (protocol, classifications, catalog, manifest). */
export async function runProjectDataBackup(projectId: number, context: BackupContext): Promise<BackupResult> {
  const project = await getProjectById(projectId);
  if (!project || project.collaboration_role !== "owner" || !project.drive_folder_id) {
    throw new Error("O projeto não está com o backup no Drive ativado.");
  }
  const { items, payloads } = await collectProjectDataItems(projectId);
  const diff = diffAgainstSnapshot(items, await getSnapshot(projectId, "project"));
  const pendingKeys = new Set([...diff.added, ...diff.changed].map((item) => item.key));
  const pending: BackupItem[] = items.filter((item) => pendingKeys.has(item.key));

  let changedSnapshot = false;
  const outcome = await backupProjectData({
    driveFolderId: project.drive_folder_id,
    pending,
    payloads,
    context,
    onItemDone: async (item) => {
      await markItemBackedUp(projectId, "project", item.key, item.fingerprint, new Date().toISOString());
      changedSnapshot = true;
    },
  });

  if (changedSnapshot || diff.removedKeys.length > 0) await recordRun(projectId, "project", diff.removedKeys);

  const notSent = outcome.failures.length + outcome.notAttempted;
  return {
    outcome: outcome.cancelled ? "cancelled" : outcome.failures.length > 0 || notSent > 0 ? "completedWithPending" : "completed",
    sent: outcome.sent,
    notSent,
    failures: outcome.failures,
  };
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
  const owner = found?.point;
  const captured = owner ? await collectPointItems(owner.project_id) : null;
  const result = await backupPoint(pointId.toString(), undefined, { shouldCancel: context.isCancelled });
  if (result.success && owner && captured) {
    const item = captured.items.find((i) => i.key === pointItemKey(pointId));
    if (item) {
      await markItemBackedUp(owner.project_id, "points", item.key, item.fingerprint, new Date().toISOString());
      await setScopeBackupTime(owner.project_id, "points", new Date().toISOString());
    }
  }
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
