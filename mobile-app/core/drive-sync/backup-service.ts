import { File } from "expo-file-system";
import {
  ensureFolder,
  findChildByName,
  updateBinaryFile,
  updateJsonFile,
  uploadBinaryFile,
  uploadJsonFile,
} from "@/core/drive-sync/drive-api-client";
import {
  ensurePointUuid,
  getApprovedUnsyncedPointsByProject,
  getPoint,
  updatePoint,
} from "@/db/queries/points";
import { getProjectById } from "@/db/queries/projects";
import {
  PACKAGE_MEDIA_PREFIX,
  buildModuleMediaRelativePath,
  getModuleMediaFields,
  mapModuleMediaUris,
} from "@/core/project-sharing/module-media";
import { parseAudioNotes, parsePhotoUris } from "@/db/mappers/json-utils";
import type { PointPackageAudioNote, PointPackageEntry } from "@/core/project-sharing/export-points";

export interface BackupResult {
  success: boolean;
  /**
   * Why the point was not backed up. Media is part of the collection: when
   * any photo, audio note or module media file is missing locally or fails
   * to upload, the whole point fails (listed here) and nothing is marked as
   * backed up (section 8).
   */
  error?: string;
  /**
   * How many of the failed media items simply no longer exist on this
   * device. When greater than zero the UI can offer to discard those
   * references (discardMissingMedia) and retry.
   */
  missingMediaCount?: number;
}

export interface BackupSummary {
  backedUp: number;
  failed: Array<{ pointId: number; pointLabel: string; reason: string; missingMediaCount: number }>;
}

function extensionFromUri(uri: string, fallback: string): string {
  const match = uri.split(".").pop();
  return match && match.length <= 5 ? match : fallback;
}

function mimeTypeForUri(uri: string): string {
  const extension = uri.split(".").pop()?.toLowerCase();
  if (extension === "m4a" || extension === "aac") return "audio/m4a";
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "wav") return "audio/wav";
  if (extension === "png") return "image/png";
  return "image/jpeg";
}

// Read-before-write (same discipline as updateManifest, 14.1): a re-backup
// of an already-synced point must never create a second Drive file with
// the same name - Drive allows duplicate names, so "just upload again"
// silently corrupts the folder instead of failing loudly.
async function putBinaryFile(
  filename: string,
  mediaFolderId: string,
  localUri: string,
  mimeType: string,
): Promise<void> {
  const existing = await findChildByName(mediaFolderId, filename);
  if (existing) {
    await updateBinaryFile(existing.id, localUri, mimeType);
  } else {
    await uploadBinaryFile(filename, mediaFolderId, localUri, mimeType);
  }
}

async function uploadPhoto(
  uri: string,
  index: number,
  mediaFolderId: string,
): Promise<{ filename: string } | { failure: string; missing?: boolean }> {
  const file = new File(uri);
  if (!file.exists) {
    return { failure: `Foto ${index + 1} não encontrada no dispositivo.`, missing: true };
  }
  const filename = `photo_${index + 1}.${extensionFromUri(uri, "jpg")}`;
  try {
    await putBinaryFile(filename, mediaFolderId, uri, "image/jpeg");
    return { filename };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { failure: `Foto ${index + 1} falhou ao enviar: ${message}` };
  }
}

async function uploadAudioNote(
  note: { uri: string; duration: number; timestamp: number },
  index: number,
  mediaFolderId: string,
): Promise<{ entry: PointPackageAudioNote } | { failure: string; missing?: boolean }> {
  const file = new File(note.uri);
  if (!file.exists) {
    return { failure: `Áudio ${index + 1} não encontrado no dispositivo.`, missing: true };
  }
  const filename = `audio_note_${index + 1}.${extensionFromUri(note.uri, "m4a")}`;
  try {
    await putBinaryFile(filename, mediaFolderId, note.uri, "audio/m4a");
    return { entry: { filename, duration: note.duration, timestamp: note.timestamp } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { failure: `Áudio ${index + 1} falhou ao enviar: ${message}` };
  }
}

export async function backupPoint(pointId: string): Promise<BackupResult> {
  const numericId = parseInt(pointId, 10);
  const result = await getPoint(numericId);
  if (!result) {
    return { success: false, error: "Ponto não encontrado." };
  }
  const { point, modules } = result;

  const project = await getProjectById(point.project_id);
  if (!project || project.collaboration_role !== "owner" || !project.drive_folder_id) {
    return { success: false, error: "O projeto não está com o backup no Drive ativado." };
  }

  const pointUuid = await ensurePointUuid(point.id);

  let approvedFolderId: string;
  try {
    approvedFolderId = await ensureFolder("approved", project.drive_folder_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }

  // Media is part of the collection (section 8): every photo, audio note and
  // module media file must reach Drive, or the point is not backed up at all.
  // Failures are collected so the person sees all of them at once.
  const mediaProblems: string[] = [];
  let missingMediaCount = 0;
  const photoFilenames: string[] = [];
  const audioEntries: PointPackageAudioNote[] = [];

  const photoUris = parsePhotoUris(point.photos);
  const audioNotes = parseAudioNotes(point.audio_notes);

  // Created on first use, so a point without any media never gets a folder.
  let mediaFolderId: string | null = null;
  let mediaFolderFailed = false;
  const ensureMediaFolder = async (): Promise<string | null> => {
    if (mediaFolderId) return mediaFolderId;
    if (mediaFolderFailed) return null;
    try {
      const mediaRootId = await ensureFolder("media", approvedFolderId);
      mediaFolderId = await ensureFolder(pointUuid, mediaRootId);
      return mediaFolderId;
    } catch (error) {
      mediaFolderFailed = true;
      const message = error instanceof Error ? error.message : String(error);
      mediaProblems.push(`Não foi possível criar a pasta de mídia: ${message}`);
      return null;
    }
  };

  for (let i = 0; i < photoUris.length; i++) {
    const folderId = await ensureMediaFolder();
    if (!folderId) {
      mediaProblems.push(`Foto ${i + 1} não pôde ser enviada.`);
      continue;
    }
    const outcome = await uploadPhoto(photoUris[i], i, folderId);
    if ("filename" in outcome) {
      photoFilenames.push(outcome.filename);
    } else {
      mediaProblems.push(outcome.failure);
      if (outcome.missing) missingMediaCount += 1;
    }
  }
  for (let i = 0; i < audioNotes.length; i++) {
    const folderId = await ensureMediaFolder();
    if (!folderId) {
      mediaProblems.push(`Áudio ${i + 1} não pôde ser enviado.`);
      continue;
    }
    const outcome = await uploadAudioNote(audioNotes[i], i, folderId);
    if ("entry" in outcome) {
      audioEntries.push(outcome.entry);
    } else {
      mediaProblems.push(outcome.failure);
      if (outcome.missing) missingMediaCount += 1;
    }
  }

  // Custom protocols keep photo_input / audio_notes_input media inside the
  // module data_json: upload those files too and write package markers in
  // place of this device's paths, so another device can restore them.
  const moduleMediaFields = await getModuleMediaFields(project.protocol_id, project.protocol_source);
  const modulesRecord: Record<string, string> = {};
  let schemaVersion = "1.0";
  let moduleMediaCounter = 0;
  for (const mod of modules) {
    const fieldsOfModule = moduleMediaFields.filter((f) => f.moduleId === mod.module_id);
    modulesRecord[mod.module_id] =
      fieldsOfModule.length === 0
        ? mod.data_json
        : await mapModuleMediaUris(mod.data_json, fieldsOfModule, async (uri, location) => {
            moduleMediaCounter += 1;
            const relativePath = buildModuleMediaRelativePath(location, moduleMediaCounter, uri);
            if (!new File(uri).exists) {
              mediaProblems.push(`Mídia do módulo ${mod.module_id} não encontrada no dispositivo.`);
              missingMediaCount += 1;
              return null;
            }
            const folderId = await ensureMediaFolder();
            if (!folderId) {
              mediaProblems.push(`Mídia do módulo ${mod.module_id} não pôde ser enviada.`);
              return null;
            }
            try {
              await putBinaryFile(relativePath.replace(/\//g, "__"), folderId, uri, mimeTypeForUri(uri));
              return `${PACKAGE_MEDIA_PREFIX}${relativePath}`;
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              mediaProblems.push(`Mídia do módulo ${mod.module_id} falhou ao enviar: ${message}`);
              return null;
            }
          });
    schemaVersion = mod.schema_version;
  }

  if (mediaProblems.length > 0) {
    // Nothing is written to the point's JSON on Drive, and drive_synced_at
    // stays null: an existing Drive JSON must never be rewritten with fewer
    // media than the point really has.
    return { success: false, error: mediaProblems.join(" "), missingMediaCount };
  }

  const entry: PointPackageEntry = {
    point_uuid: pointUuid,
    point_number: point.point_number,
    lat: point.lat,
    lon: point.lon,
    altitude: point.altitude,
    generated_name: point.generated_name,
    landscape_class_id: point.landscape_class_id,
    additional_notes: point.additional_notes ? JSON.parse(point.additional_notes) : undefined,
    point_size: point.point_size,
    created_at: point.created_at,
    created_by: point.created_by ?? "",
    schema_version: schemaVersion,
    modules: modulesRecord,
    photos: photoFilenames,
    audio_notes: audioEntries,
  };

  // Uploading the point's data is the one step that still fails the whole
  // point - unlike media, the scientific data must arrive intact for the
  // point to count as backed up. Read-before-write: a re-backup (e.g. the
  // point's data changed after approval, or a retry) updates the existing
  // Drive file instead of creating a duplicate.
  let uploaded;
  try {
    const pointFilename = `${pointUuid}.json`;
    const existing = await findChildByName(approvedFolderId, pointFilename);
    uploaded = existing
      ? await updateJsonFile(existing.id, entry)
      : await uploadJsonFile(pointFilename, approvedFolderId, entry);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }

  const syncedAt = uploaded.modifiedTime ?? new Date().toISOString();
  await updatePoint(point.id, { drive_synced_at: syncedAt });

  return { success: true };
}

export async function backupAllPendingPoints(projectId: number): Promise<BackupSummary> {
  const points = await getApprovedUnsyncedPointsByProject(projectId);

  let backedUp = 0;
  const failed: BackupSummary["failed"] = [];

  for (const point of points) {
    const result = await backupPoint(point.id.toString());
    if (result.success) {
      backedUp += 1;
    } else {
      failed.push({
        pointId: point.id,
        pointLabel: `${point.created_by ?? "?"}-${point.point_number}`,
        reason: result.error ?? "Erro desconhecido.",
        missingMediaCount: result.missingMediaCount ?? 0,
      });
    }
  }

  return { backedUp, failed };
}
