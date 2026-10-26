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
import { classifyRun, failureFromReason, resultFromPointsSummary } from "@/core/drive-sync/backup-results";
import type { BackupContext, BackupResult } from "@/core/drive-sync/backup-session";
import { getPoint } from "@/db/queries/points";
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
import { findChildByName } from "@/core/drive-sync/drive-api-client";
import { runPreflightWith, type PreflightFailure } from "@/core/drive-sync/backup-preflight";
import { getDriveAccessToken } from "@/core/google-auth/google-auth-service";
import { isOnline } from "@/core/net/connectivity";

/**
 * The pre-flight every backup start goes through, for both scopes, the single
 * point backup, the activation and the export warning's "Fazer backup": connection,
 * token and one light Drive request. null means it is safe to open the progress modal.
 */
export async function preflightBackup(projectId: number): Promise<PreflightFailure | null> {
  const project = await getProjectById(projectId);
  const folderId = project?.drive_folder_id;
  return runPreflightWith({
    isOnline,
    getToken: getDriveAccessToken,
    probe: async (timeoutMs) => {
      // A small GET the client already knows how to make: the project folder's manifest lookup, or,
      // for a project that is not linked to Drive yet (activation), the shared "Nomos" folder.
      if (folderId) await findChildByName(folderId, "manifest.json", timeoutMs);
      else await findChildByName("root", "Nomos", timeoutMs);
    },
  });
}

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

  return classifyRun({
    sent: outcome.sent,
    failures: outcome.failures,
    notAttempted: outcome.notAttempted,
    cancelled: outcome.cancelled,
    connectionLost: outcome.connectionLost,
  });
}

/** Sends one point (the per-point button), through the same lock and modal. */
export async function runSinglePointBackup(
  pointId: number,
  context: BackupContext,
  onDone?: (result: PointBackupResult) => void | Promise<void>,
): Promise<BackupResult> {
  context.report({ key: "driveBackup.stage.singlePoint" }, 0, 1);
  const found = await getPoint(pointId);
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

  const failures = result.success || result.cancelled
    ? []
    : [
        failureFromReason(
          { kind: "point", label: "", point: owner ? { number: owner.point_number, lat: owner.lat, lon: owner.lon } : undefined },
          result.error ?? "",
          {
            missingMediaCount: result.missingMediaCount,
            timedOut: result.timedOut,
            pointId,
          },
        ),
      ];
  return classifyRun({
    sent: result.success ? 1 : 0,
    failures,
    notAttempted: result.cancelled ? 1 : 0,
    cancelled: result.cancelled === true,
    connectionLost: result.connectionLost === true,
  });
}
