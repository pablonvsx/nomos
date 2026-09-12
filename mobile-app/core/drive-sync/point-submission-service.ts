import { getPoint, updatePoint } from '@/db/queries/points';
import { getProjectById } from '@/db/queries/projects';
import {
  getActiveVegetationClassificationConfig,
  getVegetationClassificationById,
} from '@/db/queries/vegetation-classifications';
import { buildPointWithModules, buildPointEnvelope } from '@/db/mappers/point.mapper';
import { getCurrentGoogleAccount } from '@/core/google-auth/google-auth-service';
import { getManifest, updateManifest, ensureFolder, resolveProjectDriveIds, type ProjectManifest } from './project-drive-service';
import { uploadJsonFile, updateJsonFile, findChildByName, uploadBinaryFile } from './drive-api-client';
import { resolveCustomModuleDescriptors, forEachModuleMediaField, type MediaFieldLocation } from '@/core/project-sharing/module-media';
import { parseJsonText } from '@/db/mappers/json-utils';
import type { ProtocolRegistry } from '@/protocol-kernel/types';

function basename(uri: string): string {
  return uri.split('/').pop() ?? uri;
}

function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'heic') return 'image/heic';
  return 'image/jpeg';
}

// Backup (section 8) is this model's only explicit "push current state to
// Drive" moment, so it's also where the manifest's active_vegetation_classification
// gets refreshed - restoreOwnProjectFromDrive (project-drive-service.ts)
// reads this same field to resolve the pointer back on another device (see
// COLLAB_MODEL_V2_REFERENCE.md section 9 audit follow-up).
async function resolveActiveVegetationClassification(
  projectId: number,
): Promise<NonNullable<ProjectManifest['active_vegetation_classification']>> {
  const activeConfig = await getActiveVegetationClassificationConfig(projectId);
  if (activeConfig?.type === 'custom' && activeConfig.classificationId) {
    const row = await getVegetationClassificationById(activeConfig.classificationId);
    if (row?.uuid) {
      return { type: 'custom', custom_classification_uuid: row.uuid };
    }
  }
  return { type: 'standard' };
}

// Single-owner model: whoever calls this already is the project's owner
// (see docs/12_COLLABORATION.md) - there is no other party to route a
// pending review through, so every push lands directly in approved/.
export async function submitPointToProject(
  pointId: string,
  projectId: number,
  registry: ProtocolRegistry,
): Promise<{ status: 'approved' | 'updated' }> {
  const project = await getProjectById(projectId);
  if (!project || !project.drive_folder_id) {
    throw new Error('Este projeto não está vinculado a uma pasta do Google Drive.');
  }

  const result = await getPoint(pointId);
  if (!result) {
    throw new Error('Ponto de coleta não encontrado.');
  }
  const { point, modules } = result;

  const manifest = await getManifest(project.drive_folder_id);
  const { approved_folder_id: approvedFolderId } = await resolveProjectDriveIds(project.drive_folder_id, manifest);

  const activeVegetationClassification = await resolveActiveVegetationClassification(project.id);
  if (JSON.stringify(manifest.active_vegetation_classification) !== JSON.stringify(activeVegetationClassification)) {
    await updateManifest(project.drive_folder_id, {
      ...manifest,
      active_vegetation_classification: activeVegetationClassification,
    });
  }

  const account = getCurrentGoogleAccount();
  if (!account) {
    throw new Error('Nenhuma conta Google conectada.');
  }

  const pointWithModules = buildPointWithModules(point, modules, registry);
  const envelope = buildPointEnvelope(pointWithModules);
  const localPhotoUris = envelope.photos ?? [];
  const localAudioNotes = envelope.audioNotes ?? [];

  // Lazily created: a point whose only media lives inside a custom-protocol
  // module field (no top-level photos/audio_notes at all) still needs this
  // folder for the module-media upload below.
  let pointMediaFolderId: string | null = null;
  const ensurePointMediaFolder = async (): Promise<string> => {
    if (!pointMediaFolderId) {
      const mediaFolderId = await ensureFolder('media', project.drive_folder_id!);
      pointMediaFolderId = await ensureFolder(point.id, mediaFolderId);
    }
    return pointMediaFolderId;
  };

  if (localPhotoUris.length > 0 || localAudioNotes.length > 0) {
    const folderId = await ensurePointMediaFolder();
    for (const uri of localPhotoUris) {
      const name = basename(uri);
      const existingPhoto = await findChildByName(folderId, name);
      if (existingPhoto) continue;
      await uploadBinaryFile(name, folderId, uri, guessMimeType(name));
    }
    for (const note of localAudioNotes) {
      const name = basename(note.uri);
      const existingAudio = await findChildByName(folderId, name);
      if (existingAudio) continue;
      await uploadBinaryFile(name, folderId, note.uri, 'audio/m4a');
    }
  }
  envelope.photos = localPhotoUris.map(basename);
  envelope.audioNotes = localAudioNotes.map((note) => ({ ...note, uri: basename(note.uri) }));

  // Media embedded in custom-protocol module fields (photo_input/
  // audio_notes_input, including inside a repeatable_group) - same gap
  // export-points.ts/import-points.ts already closed for the file-sharing
  // path (Fase A), never closed here until now. forEachModuleMediaField's
  // visit callback is synchronous (built for expo-file-system's sync API),
  // so locations are collected first and the async Drive upload work runs
  // in a plain loop afterwards, instead of changing that shared helper.
  const moduleDescriptors = await resolveCustomModuleDescriptors(project);
  const moduleMediaLocations: MediaFieldLocation[] = [];
  forEachModuleMediaField(envelope.modules ?? {}, moduleDescriptors, (loc) => {
    moduleMediaLocations.push(loc);
  });

  for (const loc of moduleMediaLocations) {
    const items = parseJsonText<Array<Record<string, unknown>>>(loc.read() ?? "", [], Array.isArray);
    if (items.length === 0) continue;

    const pointFolderId = await ensurePointMediaFolder();
    const moduleFolderId = await ensureFolder('module', pointFolderId);
    const locatorFolderId = await ensureFolder(loc.locatorKey, moduleFolderId);

    const uploaded: Record<string, unknown>[] = [];
    for (const item of items) {
      const uri = typeof item.uri === "string" ? item.uri : null;
      if (!uri) continue;
      const name = basename(uri);
      const isAudioItem = typeof item.duration === "number";
      const existingFile = await findChildByName(locatorFolderId, name);
      if (!existingFile) {
        await uploadBinaryFile(name, locatorFolderId, uri, isAudioItem ? 'audio/m4a' : guessMimeType(name));
      }
      uploaded.push({ ...item, uri: name });
    }
    loc.write(JSON.stringify(uploaded));
  }

  const fileName = `${point.id}.json`;
  const wasAlreadyApproved = point.approval_status === 'approved';

  const payload = {
    ...envelope,
    approval_status: 'approved',
    collector_code: point.created_by ?? null,
    submitted_by: account.email,
    submitted_at: new Date().toISOString(),
  };
  const existingFile = await findChildByName(approvedFolderId, fileName);
  const writtenFile = existingFile
    ? await updateJsonFile(existingFile.id, payload)
    : await uploadJsonFile(fileName, approvedFolderId, payload);

  await updatePoint(pointId, {
    approval_status: 'approved',
    drive_synced_at: writtenFile.modifiedTime ?? new Date().toISOString(),
  });

  return { status: wasAlreadyApproved ? 'updated' : 'approved' };
}
