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
import { parseAudioNotes, parsePhotoUris } from "@/db/mappers/json-utils";
import type { PointPackageAudioNote, PointPackageEntry } from "@/core/project-sharing/export-points";

export interface BackupResult {
  success: boolean;
  error?: string;
  /**
   * Media items that failed to upload or no longer exist locally - purely
   * informational, never affects `success`. Media is a complement to the
   * point's scientific data (module fields); losing a photo/audio note
   * must never block backing up the data itself.
   */
  mediaFailures?: string[];
}

export interface BackupSummary {
  backedUp: number;
  failed: Array<{ pointLabel: string; reason: string }>;
}

function extensionFromUri(uri: string, fallback: string): string {
  const match = uri.split(".").pop();
  return match && match.length <= 5 ? match : fallback;
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
): Promise<{ filename: string } | { failure: string }> {
  const file = new File(uri);
  if (!file.exists) {
    return { failure: `Foto ${index + 1} não encontrada no dispositivo.` };
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
): Promise<{ entry: PointPackageAudioNote } | { failure: string }> {
  const file = new File(note.uri);
  if (!file.exists) {
    return { failure: `Áudio ${index + 1} não encontrado no dispositivo.` };
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

  // Media is best-effort and never blocks the point's data (see BackupResult
  // doc comment) - every failure here is caught per item, never thrown.
  const mediaFailures: string[] = [];
  const photoFilenames: string[] = [];
  const audioEntries: PointPackageAudioNote[] = [];

  const photoUris = parsePhotoUris(point.photos);
  const audioNotes = parseAudioNotes(point.audio_notes);

  if (photoUris.length > 0 || audioNotes.length > 0) {
    let mediaFolderId: string | null = null;
    try {
      const mediaRootId = await ensureFolder("media", approvedFolderId);
      mediaFolderId = await ensureFolder(pointUuid, mediaRootId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      mediaFailures.push(`Não foi possível criar a pasta de mídia: ${message}`);
    }

    if (mediaFolderId) {
      for (let i = 0; i < photoUris.length; i++) {
        const outcome = await uploadPhoto(photoUris[i], i, mediaFolderId);
        if ("filename" in outcome) {
          photoFilenames.push(outcome.filename);
        } else {
          mediaFailures.push(outcome.failure);
        }
      }
      for (let i = 0; i < audioNotes.length; i++) {
        const outcome = await uploadAudioNote(audioNotes[i], i, mediaFolderId);
        if ("entry" in outcome) {
          audioEntries.push(outcome.entry);
        } else {
          mediaFailures.push(outcome.failure);
        }
      }
    } else {
      // Media folder itself couldn't be created - every item is a failure,
      // but the point's data upload still proceeds below.
      photoUris.forEach((_, i) => mediaFailures.push(`Foto ${i + 1} não pôde ser enviada.`));
      audioNotes.forEach((_, i) => mediaFailures.push(`Áudio ${i + 1} não pôde ser enviado.`));
    }
  }

  const modulesRecord: Record<string, string> = {};
  let schemaVersion = "1.0";
  for (const mod of modules) {
    modulesRecord[mod.module_id] = mod.data_json;
    schemaVersion = mod.schema_version;
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

  return {
    success: true,
    ...(mediaFailures.length > 0 ? { mediaFailures } : {}),
  };
}

export async function backupAllPendingPoints(projectId: number): Promise<BackupSummary> {
  const points = await getApprovedUnsyncedPointsByProject(projectId);

  let backedUp = 0;
  const failed: Array<{ pointLabel: string; reason: string }> = [];

  for (const point of points) {
    const result = await backupPoint(point.id.toString());
    if (result.success) {
      backedUp += 1;
    } else {
      failed.push({
        pointLabel: `${point.created_by ?? "?"}-${point.point_number}`,
        reason: result.error ?? "Erro desconhecido.",
      });
    }
  }

  return { backedUp, failed };
}
