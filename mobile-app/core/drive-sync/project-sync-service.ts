import { File, Paths } from 'expo-file-system';
import { findChildByName, findChildByNameSuffix, listChildren, readJsonFile, downloadBinaryFile } from './drive-api-client';
import { getManifest, resolveProjectDriveIds } from './project-drive-service';
import { extractPointUuidFromName } from './point-label';
import { syncReferenceData } from './reference-data-sync-service';
import { getProjectById } from '@/db/queries/projects';
import { upsertProjectMember } from '@/db/queries/project-members';
import { createPoint, updatePoint, getPointById, getPendingPointsByProject, updatePointApprovalStatus } from '@/db/queries/points';
import type { ProtocolRegistry } from '@/protocol-kernel/types';

export interface SyncProjectOptions {
  includeMedia: boolean;
}

export interface SyncProjectResult {
  imported: number;
  updated: number;
  rejected: number;
  skipped: number;
  mediaDownloaded: number;
  speciesPushed: number;
  speciesPulled: number;
  vegetationClassesPushed: number;
  vegetationClassesPulled: number;
}

function serializeModules(
  modules: Record<string, unknown>,
  protocolId: string,
  registry: ProtocolRegistry,
): Record<string, string> {
  const manifest = registry.getProtocol(protocolId);
  const data: Record<string, string> = {};
  for (const [moduleId, value] of Object.entries(modules)) {
    const descriptor = manifest?.modules.find((m) => m.id === moduleId);
    data[moduleId] = descriptor ? descriptor.serialize(value) : JSON.stringify(value);
  }
  return data;
}

export async function syncProjectFromDrive(
  projectId: number,
  options: SyncProjectOptions,
  registry: ProtocolRegistry,
): Promise<SyncProjectResult> {
  const project = await getProjectById(projectId);
  if (!project || !project.drive_folder_id) {
    return {
      imported: 0, updated: 0, rejected: 0, skipped: 0, mediaDownloaded: 0,
      speciesPushed: 0, speciesPulled: 0, vegetationClassesPushed: 0, vegetationClassesPulled: 0,
    };
  }

  const manifest = await getManifest(project.drive_folder_id);

  // Keep the local project_members cache (used for the collector-code label
  // and for collaborator-list screens) fresh on every sync, not just when
  // this device itself performs a membership/role change.
  for (const member of manifest.members) {
    await upsertProjectMember(projectId, member.email, member.role, member.auto_approve, member.collector_code);
  }

  const { submissions_folder_id: submissionsFolderId, approved_folder_id: approvedFolderId } = await resolveProjectDriveIds(project.drive_folder_id, manifest);

  const referenceDataResult = await syncReferenceData(projectId, project.drive_folder_id);

  // Rejections only ever live in submissions/<email>/ - the approved/
  // iteration below would never see them, so this stays a separate pass.
  let rejected = 0;
  const pendingLocalPoints = await getPendingPointsByProject(projectId);
  for (const point of pendingLocalPoints) {
    if (!point.created_by) continue;
    try {
      const emailFolder = await findChildByName(submissionsFolderId, point.created_by);
      // approveSubmission/rejectSubmission move a decided file out of
      // submissions/<email>/ into submissions/<email>/_reviewed/ right after
      // deciding it (see approval-service.ts), so a rejection is normally
      // found there, not directly under emailFolder. Looked up by UUID
      // suffix, not exact name, since the file's human-readable label can
      // have changed since this device last submitted it.
      let submissionFile = emailFolder
        ? await findChildByNameSuffix(emailFolder.id, `${point.id}.json`)
        : null;
      if (!submissionFile && emailFolder) {
        const reviewedFolder = await findChildByName(emailFolder.id, '_reviewed');
        submissionFile = reviewedFolder
          ? await findChildByNameSuffix(reviewedFolder.id, `${point.id}.json`)
          : null;
      }
      if (submissionFile) {
        const content = await readJsonFile<Record<string, unknown>>(submissionFile.id);
        if (content.approval_status === 'rejected') {
          await updatePointApprovalStatus(
            point.id,
            'rejected',
            (content.rejection_reason as string | undefined) ?? null,
          );
          rejected++;
        }
      }
    } catch (error) {
      console.error(`Error checking rejection for point ${point.id}:`, error);
    }
  }

  const files = await listChildren(approvedFolderId);
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let mediaDownloaded = 0;

  for (const file of files) {
    if (!file.name.endsWith('.json')) continue;
    const pointUuid = extractPointUuidFromName(file.name);

    try {
      const localPoint = await getPointById(pointUuid);

      if (!localPoint) {
        const envelope = await readJsonFile<Record<string, unknown>>(file.id);
        const moduleData = serializeModules(
          (envelope.modules as Record<string, unknown>) ?? {},
          project.protocol_id,
          registry,
        );

        let photosJson = '[]';
        const photoNames = (envelope.photos as string[] | undefined) ?? [];
        if (options.includeMedia && photoNames.length > 0) {
          const mediaFolder = await findChildByName(project.drive_folder_id, 'media');
          const pointMediaFolder = mediaFolder ? await findChildByNameSuffix(mediaFolder.id, pointUuid) : null;
          if (pointMediaFolder) {
            const downloaded: { uri: string; timestamp: number }[] = [];
            for (const [index, name] of photoNames.entries()) {
              const driveFile = await findChildByName(pointMediaFolder.id, name);
              if (!driveFile) continue;
              const localFile = new File(Paths.document, `sync_${pointUuid}_${index}_${name}`);
              await downloadBinaryFile(driveFile.id, localFile.uri);
              downloaded.push({ uri: localFile.uri, timestamp: Date.now() });
              mediaDownloaded++;
            }
            photosJson = JSON.stringify(downloaded);
          }
        }

        const newId = await createPoint({
          id: pointUuid,
          project_id: projectId,
          protocol_id: project.protocol_id,
          lat: envelope.lat as number,
          lon: envelope.lon as number,
          altitude: (envelope.altitude as number | undefined) ?? null,
          generated_name: (envelope.generatedName as string | undefined) ?? null,
          photos: photosJson,
          audio_notes: null,
          additional_notes: JSON.stringify((envelope.additionalNotes as string[] | undefined) ?? []),
          point_size: (envelope.pointSize as number | undefined) ?? null,
          schema_version: "1.0.0",
          modules: moduleData,
          approval_status: 'approved',
          created_by: (envelope.submitted_by as string | undefined) ?? null,
          drive_synced_at: file.modifiedTime ?? null,
        });

        if (newId) imported++; else skipped++;
        continue;
      }

      const isStale =
        !localPoint.drive_synced_at ||
        (!!file.modifiedTime && new Date(file.modifiedTime) > new Date(localPoint.drive_synced_at));
      if (!isStale) {
        skipped++;
        continue;
      }

      // A newer correction landed in approved/ for a point we already have
      // locally (whether it was pending or already approved before). Update
      // point-level fields + modules only - media is never (re-)downloaded
      // here, only on first import above.
      const envelope = await readJsonFile<Record<string, unknown>>(file.id);
      const moduleData = serializeModules(
        (envelope.modules as Record<string, unknown>) ?? {},
        project.protocol_id,
        registry,
      );

      await updatePoint(pointUuid, {
        lat: envelope.lat as number,
        lon: envelope.lon as number,
        altitude: (envelope.altitude as number | undefined) ?? null,
        generated_name: (envelope.generatedName as string | undefined) ?? null,
        additional_notes: JSON.stringify((envelope.additionalNotes as string[] | undefined) ?? []),
        point_size: (envelope.pointSize as number | undefined) ?? null,
        schema_version: "1.0.0",
        modules: moduleData,
        approval_status: 'approved',
        drive_synced_at: file.modifiedTime ?? new Date().toISOString(),
      });
      updated++;
    } catch (error) {
      console.error(`Error syncing point ${pointUuid}:`, error);
      skipped++;
    }
  }

  return {
    imported, updated, rejected, skipped, mediaDownloaded,
    speciesPushed: referenceDataResult.speciesPushed,
    speciesPulled: referenceDataResult.speciesPulled,
    vegetationClassesPushed: referenceDataResult.vegetationClassesPushed,
    vegetationClassesPulled: referenceDataResult.vegetationClassesPulled,
  };
}
