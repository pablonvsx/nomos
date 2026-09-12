import { File, Paths } from 'expo-file-system';
import { findChildByName, listChildren, readJsonFile, downloadBinaryFile } from './drive-api-client';
import { getManifest, resolveProjectDriveIds } from './project-drive-service';
import { syncReferenceData } from './reference-data-sync-service';
import { getProjectById } from '@/db/queries/projects';
import { createPoint, updatePoint, getPointById } from '@/db/queries/points';
import type { ProtocolRegistry } from '@/protocol-kernel/types';

function basename(uri: string): string {
  return uri.split('/').pop() ?? uri;
}

export interface SyncProjectOptions {
  includeMedia: boolean;
}

export interface SyncProjectResult {
  imported: number;
  updated: number;
  skipped: number;
  mediaDownloaded: number;
  speciesPushed: number;
  speciesPulled: number;
  vegetationClassesPushed: number;
  vegetationClassesPulled: number;
}

export function serializeModules(
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
      imported: 0, updated: 0, skipped: 0, mediaDownloaded: 0,
      speciesPushed: 0, speciesPulled: 0, vegetationClassesPushed: 0, vegetationClassesPulled: 0,
    };
  }

  const manifest = await getManifest(project.drive_folder_id);
  const { approved_folder_id: approvedFolderId } = await resolveProjectDriveIds(project.drive_folder_id, manifest);

  const referenceDataResult = await syncReferenceData(projectId, project.drive_folder_id);

  // Custom protocols are registered in the ProtocolRegistry under the
  // generic "custom" id, not the numeric custom_protocols.id stored on the
  // project row - see modules/custom/manifest.ts.
  const registryProtocolId = project.protocol_source === "custom" ? "custom" : project.protocol_id;

  const files = await listChildren(approvedFolderId);
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let mediaDownloaded = 0;

  for (const file of files) {
    if (!file.name.endsWith('.json')) continue;
    const pointUuid = file.name.replace('.json', '');

    try {
      const localPoint = await getPointById(pointUuid);

      if (!localPoint) {
        const envelope = await readJsonFile<Record<string, unknown>>(file.id);
        const moduleData = serializeModules(
          (envelope.modules as Record<string, unknown>) ?? {},
          registryProtocolId,
          registry,
        );

        let photosJson = '[]';
        const photoNames = (envelope.photos as string[] | undefined) ?? [];
        let pointMediaFolder: Awaited<ReturnType<typeof findChildByName>> = null;
        if (options.includeMedia && (photoNames.length > 0 || (envelope.audioNotes as unknown[] | undefined)?.length)) {
          const mediaFolder = await findChildByName(project.drive_folder_id, 'media');
          pointMediaFolder = mediaFolder ? await findChildByName(mediaFolder.id, pointUuid) : null;
        }
        if (options.includeMedia && photoNames.length > 0 && pointMediaFolder) {
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

        let audioNotesJson: string | null = null;
        const audioNotes = (envelope.audioNotes as { uri: string; duration: number; timestamp: number }[] | undefined) ?? [];
        if (options.includeMedia && audioNotes.length > 0 && pointMediaFolder) {
          const downloaded: { uri: string; duration: number; timestamp: number }[] = [];
          for (const [index, note] of audioNotes.entries()) {
            const name = basename(note.uri);
            const driveFile = await findChildByName(pointMediaFolder.id, name);
            if (!driveFile) continue;
            const localFile = new File(Paths.document, `sync_audio_${pointUuid}_${index}_${name}`);
            await downloadBinaryFile(driveFile.id, localFile.uri);
            downloaded.push({ uri: localFile.uri, duration: note.duration, timestamp: note.timestamp });
            mediaDownloaded++;
          }
          audioNotesJson = JSON.stringify(downloaded);
        }

        const newId = await createPoint({
          id: pointUuid,
          project_id: projectId,
          protocol_id: registryProtocolId,
          lat: envelope.lat as number,
          lon: envelope.lon as number,
          altitude: (envelope.altitude as number | undefined) ?? null,
          generated_name: (envelope.generatedName as string | undefined) ?? null,
          photos: photosJson,
          audio_notes: audioNotesJson,
          additional_notes: JSON.stringify((envelope.additionalNotes as string[] | undefined) ?? []),
          point_size: (envelope.pointSize as number | undefined) ?? null,
          schema_version: "1.0.0",
          modules: moduleData,
          approval_status: 'approved',
          created_by: (envelope.collector_code as string | undefined) ?? null,
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
        registryProtocolId,
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
    imported, updated, skipped, mediaDownloaded,
    speciesPushed: referenceDataResult.speciesPushed,
    speciesPulled: referenceDataResult.speciesPulled,
    vegetationClassesPushed: referenceDataResult.vegetationClassesPushed,
    vegetationClassesPulled: referenceDataResult.vegetationClassesPulled,
  };
}
