import { File, Paths } from 'expo-file-system';
import { findChildByName, listChildren, readJsonFile, downloadBinaryFile } from './drive-api-client';
import { getProjectById } from '@/db/queries/projects';
import { createPoint, pointExists } from '@/db/queries/points';
import type { ProtocolRegistry } from '@/protocol-kernel/types';

export interface SyncProjectOptions {
  includeMedia: boolean;
}

export interface SyncProjectResult {
  imported: number;
  skipped: number;
  mediaDownloaded: number;
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
    return { imported: 0, skipped: 0, mediaDownloaded: 0 };
  }

  const approvedFolder = await findChildByName(project.drive_folder_id, 'approved');
  if (!approvedFolder) {
    return { imported: 0, skipped: 0, mediaDownloaded: 0 };
  }

  const files = await listChildren(approvedFolder.id);
  let imported = 0;
  let skipped = 0;
  let mediaDownloaded = 0;

  for (const file of files) {
    if (!file.name.endsWith('.json')) continue;
    const pointUuid = file.name.replace('.json', '');

    if (await pointExists(pointUuid)) {
      skipped++;
      continue;
    }

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
      const pointMediaFolder = mediaFolder ? await findChildByName(mediaFolder.id, pointUuid) : null;
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
    });

    if (newId) imported++; else skipped++;
  }

  return { imported, skipped, mediaDownloaded };
}
