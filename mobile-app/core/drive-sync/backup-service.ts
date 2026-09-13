// Backup to Drive (COLLAB_MODEL_V2_REFERENCE.md section 8) - decoupled from
// approval (section 6/13): a point only ever reaches Drive when explicitly
// backed up here, never as a side effect of approving it. submitPointToProject
// already writes unconditionally to approved/ and already records
// drive_synced_at/approval_status on success (core/drive-sync/point-submission-service.ts),
// so backupPoint is a thin wrapper resolving the point's project id, not a
// second place recording the sync timestamp.
import { getPoint, getApprovedUnsyncedPointsByProject } from "@/db/queries/points";
import { getUnsyncedProjectSpeciesByProject } from "@/db/queries/project-species";
import { getUnsyncedVegetationClassificationsByProject } from "@/db/queries/vegetation-classifications";
import { submitPointToProject } from "@/core/drive-sync/point-submission-service";
import {
  pushSpeciesEntryIfCollaborative,
  pushVegetationClassificationIfCollaborative,
} from "@/core/drive-sync/reference-data-sync-service";
import { getPointDisplayLabel } from "@/core/drive-sync/point-label";
import type { ProtocolRegistry } from "@/protocol-kernel/types";

export async function backupPoint(pointId: string, registry: ProtocolRegistry): Promise<void> {
  const result = await getPoint(pointId);
  if (!result) {
    throw new Error("Ponto não encontrado.");
  }
  await submitPointToProject(pointId, result.point.project_id, registry);
}

export interface BackupSummary {
  backedUp: number;
  failed: Array<{ pointLabel: string; reason: string }>;
  speciesSynced: number;
  vegetationClassificationsSynced: number;
}

export async function backupAllPendingPoints(
  projectId: number,
  registry: ProtocolRegistry,
): Promise<BackupSummary> {
  const points = await getApprovedUnsyncedPointsByProject(projectId);
  let backedUp = 0;
  const failed: Array<{ pointLabel: string; reason: string }> = [];

  for (const point of points) {
    try {
      await backupPoint(point.id, registry);
      backedUp++;
    } catch (error) {
      failed.push({
        pointLabel: getPointDisplayLabel({ pointNumber: point.point_number, createdBy: point.created_by ?? null }),
        reason: error instanceof Error ? error.message : "Falha desconhecida.",
      });
    }
  }

  // Species/vegetation classifications are pushed fire-and-forget the moment
  // they're created (reference-data-sync-service.ts) - "Fazer Backup" is
  // also the retry path for whichever of those pushes never landed (a
  // network blip, the app closing mid-push), same as it already is for
  // points above.
  let speciesSynced = 0;
  for (const entry of await getUnsyncedProjectSpeciesByProject(projectId)) {
    if (await pushSpeciesEntryIfCollaborative(projectId, entry)) speciesSynced++;
  }

  let vegetationClassificationsSynced = 0;
  for (const row of await getUnsyncedVegetationClassificationsByProject(projectId)) {
    if (await pushVegetationClassificationIfCollaborative(projectId, row)) vegetationClassificationsSynced++;
  }

  return { backedUp, failed, speciesSynced, vegetationClassificationsSynced };
}
