import { File } from "expo-file-system";
import {
  createFolder,
  ensureFolder,
  findChildByName,
  listChildren,
  updateBinaryFile,
  updateJsonFile,
  uploadBinaryFile,
  uploadJsonFile,
} from "@/core/drive-sync/drive-api-client";
import {
  ensurePointUuid,
  getBackupEligiblePointsByProject,
  getPoint,
  updatePoint,
} from "@/db/queries/points";
import { getProjectById } from "@/db/queries/projects";
import type { Point } from "@/types/database";
import { getModuleMediaFields, loadMediaLabelIndex, mapModuleMediaUris } from "@/core/project-sharing/module-media";
import { parseAudioNotes, parsePhotoUris } from "@/db/mappers/json-utils";
import type { PointPackageAudioNote, PointPackageEntry } from "@/core/project-sharing/export-points";
import { isNetworkTimeoutError } from "@/core/net/network-timeout";
import { isConnectionError } from "@/core/drive-sync/backup-errors";
import { isBackupEligibleStatus } from "@/core/drive-sync/backup-eligibility";
import {
  APPROVED_FOLDER,
  MEDIA_FOLDER,
  POINT_JSON_FILENAME,
  pointFolderLabel,
  pointFolderName,
} from "@/core/drive-sync/drive-layout";
import { splitRelativePath, toDriveMediaMarker } from "@/core/drive-sync/drive-media-paths";
import { createMediaPathAllocator } from "@/core/media-layout/allocator";
import {
  createDriveFolderCache,
  indexPointFolders,
  subfolderKey,
  type DriveFolderCache,
} from "@/core/drive-sync/drive-folder-cache";

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
  /**
   * True when at least one failure was a network timeout (a stalled
   * connection, not a rejected request): the UI shows its friendly "slow
   * connection" message instead of the technical text in `error`.
   */
  timedOut?: boolean;
  /** The person asked to cancel while this point was in progress: nothing was marked as backed up. */
  cancelled?: boolean;
  /**
   * A failure of the connection itself (no network, a stalled one), not of this
   * point: the points after it would fail the same way, so a batch stops here.
   */
  connectionLost?: boolean;
}

export interface BackupSummary {
  backedUp: number;
  /** True when the run stopped early because the person cancelled. */
  cancelled: boolean;
  /** True when the run stopped at the first network error (the rest are in notAttempted). */
  connectionLost: boolean;
  /** Eligible points that were never attempted because of the cancel. */
  notAttempted: number;
  failed: Array<{
    pointId: number;
    pointNumber: number;
    lat: number;
    lon: number;
    reason: string;
    missingMediaCount: number;
    timedOut: boolean;
  }>;
}

function mimeTypeForUri(uri: string): string {
  const extension = uri.split(".").pop()?.toLowerCase();
  if (extension === "m4a" || extension === "aac") return "audio/m4a";
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "wav") return "audio/wav";
  if (extension === "png") return "image/png";
  return "image/jpeg";
}

/**
 * Backs up one point to approved/point_<label>_<uuid>/ in the owner's Drive:
 * point.json plus its media under media/ (photos/, audio/, section_<title>/,
 * group_<title>/item_NN/). Pass the same `cache` for every point of a batch so
 * approved/ is listed once and known folders are not looked up again.
 */
export async function backupPoint(
  pointId: string,
  cache: DriveFolderCache = createDriveFolderCache(),
  options: { shouldCancel?: () => boolean } = {},
): Promise<BackupResult> {
  const isCancelled = () => options.shouldCancel?.() === true;
  const cancelledResult: BackupResult = { success: false, cancelled: true, error: "Cancelado." };
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

  // Only the owner's own collection (no status) and approved points are
  // backed up; a point still under review, or rejected, never is.
  if (!isBackupEligibleStatus(point.approval_status)) {
    return { success: false, error: "Só pontos aprovados ou coletados pelo próprio dono entram no backup." };
  }

  const pointUuid = await ensurePointUuid(point.id);

  // Folders created during THIS call are empty: nothing to look up inside
  // them, so subfolders and files go straight to creation. Everything else
  // (a retry, a re-backup) is looked up by exact name first, so no folder or
  // file is ever duplicated.
  const createdHere = new Set<string>();

  let pointFolderId: string;
  try {
    pointFolderId = await locateOrCreatePointFolder(cache, project.drive_folder_id, pointUuid, point, createdHere);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message, timedOut: isNetworkTimeoutError(error), connectionLost: isConnectionError(error) };
  }

  // Media is part of the collection (section 8): every photo, audio note and
  // module media file must reach Drive, or the point is not backed up at all.
  // Failures are collected so the person sees all of them at once.
  const mediaProblems: string[] = [];
  let missingMediaCount = 0;
  let timedOut = false;
  let connectionLost = false;

  const failedFolders = new Map<string, Error>();
  const ensureSubfolder = async (parentId: string, name: string): Promise<string> => {
    const key = subfolderKey(parentId, name);
    const known = cache.subfolders.get(key);
    if (known) return known;
    const failure = failedFolders.get(key);
    if (failure) throw failure;
    try {
      let id: string | undefined;
      if (!createdHere.has(parentId)) id = (await findChildByName(parentId, name))?.id;
      if (!id) {
        id = (await createFolder(name, parentId)).id;
        createdHere.add(id);
      }
      cache.subfolders.set(key, id);
      return id;
    } catch (error) {
      failedFolders.set(key, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  };

  /** Sends one local file to `relativePath` under the point folder, creating the subfolders it needs. */
  const uploadAt = async (relativePath: string, localUri: string): Promise<void> => {
    const segments = splitRelativePath(relativePath);
    const filename = segments.pop()!;
    let parentId = pointFolderId;
    for (const folderName of segments) parentId = await ensureSubfolder(parentId, folderName);

    const mimeType = mimeTypeForUri(localUri);
    const existing = createdHere.has(parentId) ? null : await findChildByName(parentId, filename);
    if (existing) {
      await updateBinaryFile(existing.id, localUri, mimeType);
    } else {
      await uploadBinaryFile(filename, parentId, localUri, mimeType);
    }
  };

  const noteFailure = (error: unknown): string => {
    if (isNetworkTimeoutError(error)) timedOut = true;
    if (isConnectionError(error)) connectionLost = true;
    return error instanceof Error ? error.message : String(error);
  };

  const labels = await loadMediaLabelIndex(project.protocol_id, project.protocol_source);
  // The shared layout's tree goes under the point folder's media/ folder.
  const paths = createMediaPathAllocator(labels);
  const inMedia = (relativePath: string): string => `${MEDIA_FOLDER}/${relativePath}`;

  const photoPaths: string[] = [];
  const audioEntries: PointPackageAudioNote[] = [];

  const photoUris = parsePhotoUris(point.photos);
  for (let i = 0; i < photoUris.length; i++) {
    if (isCancelled()) return cancelledResult;
    const relativePath = inMedia(paths.pointPhoto(photoUris[i], i));
    if (!new File(photoUris[i]).exists) {
      mediaProblems.push(`Foto ${i + 1} não encontrada no dispositivo.`);
      missingMediaCount += 1;
      continue;
    }
    try {
      await uploadAt(relativePath, photoUris[i]);
      photoPaths.push(relativePath);
    } catch (error) {
      mediaProblems.push(`Foto ${i + 1} falhou ao enviar: ${noteFailure(error)}`);
    }
  }

  const audioNotes = parseAudioNotes(point.audio_notes);
  for (let i = 0; i < audioNotes.length; i++) {
    if (isCancelled()) return cancelledResult;
    const note = audioNotes[i];
    const relativePath = inMedia(paths.pointAudio(note.uri, i));
    if (!new File(note.uri).exists) {
      mediaProblems.push(`Áudio ${i + 1} não encontrado no dispositivo.`);
      missingMediaCount += 1;
      continue;
    }
    try {
      await uploadAt(relativePath, note.uri);
      audioEntries.push({ filename: relativePath, duration: note.duration, timestamp: note.timestamp });
    } catch (error) {
      mediaProblems.push(`Áudio ${i + 1} falhou ao enviar: ${noteFailure(error)}`);
    }
  }

  // Custom protocols keep photo_input / audio_notes_input media inside the
  // module data_json: upload those files too and write markers carrying the
  // exact Drive-relative path in place of this device's paths, so a restore
  // follows them literally.
  const moduleMediaFields = await getModuleMediaFields(project.protocol_id, project.protocol_source);
  const modulesRecord: Record<string, string> = {};
  let schemaVersion = "1.0";
  for (const mod of modules) {
    const fieldsOfModule = moduleMediaFields.filter((f) => f.moduleId === mod.module_id);
    modulesRecord[mod.module_id] =
      fieldsOfModule.length === 0
        ? mod.data_json
        : await mapModuleMediaUris(mod.data_json, fieldsOfModule, async (uri, location) => {
            if (isCancelled()) return null;
            const relativePath = inMedia(paths.moduleMedia(location, uri));
            if (!new File(uri).exists) {
              mediaProblems.push(`Mídia do módulo ${mod.module_id} não encontrada no dispositivo.`);
              missingMediaCount += 1;
              return null;
            }
            try {
              await uploadAt(relativePath, uri);
              return toDriveMediaMarker(relativePath);
            } catch (error) {
              mediaProblems.push(`Mídia do módulo ${mod.module_id} falhou ao enviar: ${noteFailure(error)}`);
              return null;
            }
          });
    schemaVersion = mod.schema_version;
  }

  // Checked after the module media too: a cancel during that step made the
  // mapper skip files without recording a problem, so this must come first.
  if (isCancelled()) return cancelledResult;

  if (mediaProblems.length > 0) {
    // Nothing is written to the point's JSON on Drive, and drive_synced_at
    // stays null: an existing Drive JSON must never be rewritten with fewer
    // media than the point really has. The folders created so far stay, and
    // the next attempt reuses them.
    return { success: false, error: mediaProblems.join(" "), missingMediaCount, timedOut, connectionLost };
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
    photos: photoPaths,
    audio_notes: audioEntries,
  };

  // Uploading the point's data is the last step and still fails the whole
  // point: the scientific data must arrive intact for the point to count as
  // backed up. In a folder that already existed (retry, re-backup) the JSON is
  // looked up by exact name and updated, never duplicated.
  if (isCancelled()) return cancelledResult;

  let uploaded;
  try {
    const existing = createdHere.has(pointFolderId) ? null : await findChildByName(pointFolderId, POINT_JSON_FILENAME);
    uploaded = existing
      ? await updateJsonFile(existing.id, entry)
      : await uploadJsonFile(POINT_JSON_FILENAME, pointFolderId, entry);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message, timedOut: isNetworkTimeoutError(error), connectionLost: isConnectionError(error) };
  }

  const syncedAt = uploaded.modifiedTime ?? new Date().toISOString();
  await updatePoint(point.id, { drive_synced_at: syncedAt });

  return { success: true };
}

/**
 * The id of the point's folder inside approved/. approved/ is listed once per
 * batch and the folder is matched by its `_<uuid>` suffix, so a point that
 * already has one (a retry, a re-backup, a label edited by hand) reuses it.
 * Otherwise the folder is created, named with the label as it is today - the
 * label is never updated afterwards.
 */
async function locateOrCreatePointFolder(
  cache: DriveFolderCache,
  driveFolderId: string,
  pointUuid: string,
  point: { created_by?: string | null; point_number: number },
  createdHere: Set<string>,
): Promise<string> {
  if (!cache.approvedFolderId) {
    cache.approvedFolderId = await ensureFolder(APPROVED_FOLDER, driveFolderId);
  }
  if (!cache.pointFolders) {
    cache.pointFolders = indexPointFolders(await listChildren(cache.approvedFolderId));
  }

  const existing = cache.pointFolders.get(pointUuid.toLowerCase());
  if (existing) return existing.id;

  const name = pointFolderName(pointFolderLabel(point), pointUuid);
  const created = await createFolder(name, cache.approvedFolderId);
  cache.pointFolders.set(pointUuid.toLowerCase(), { id: created.id, name });
  createdHere.add(created.id);
  return created.id;
}

export interface BackupProgress {
  /** 1-based position of the point about to be uploaded. */
  current: number;
  total: number;
}

export interface BackupAllOptions {
  /** Checked between points (and inside backupPoint, between uploads). */
  shouldCancel?: () => boolean;
  /**
   * The points to send. The backup works on the list captured when it
   * started: points created or edited afterwards are not part of this run
   * and stay pending. Defaults to every eligible point of the project.
   */
  points?: Point[];
  /** Called after each point finished, successfully or not. */
  onPointDone?: (point: Point, result: BackupResult) => void | Promise<void>;
}

export async function backupAllPendingPoints(
  projectId: number,
  onProgress?: (progress: BackupProgress) => void,
  options: BackupAllOptions = {},
): Promise<BackupSummary> {
  const points = options.points ?? (await getBackupEligiblePointsByProject(projectId));
  // One cache for the whole batch: approved/ is listed once, known folders are not looked up again.
  const cache = createDriveFolderCache();
  const shouldCancel = options.shouldCancel;

  let backedUp = 0;
  let cancelled = false;
  let connectionLost = false;
  let attempted = 0;
  const failed: BackupSummary["failed"] = [];

  for (const [index, point] of points.entries()) {
    if (shouldCancel?.()) {
      cancelled = true;
      break;
    }
    onProgress?.({ current: index + 1, total: points.length });
    attempted += 1;

    // An unexpected throw (e.g. a DB error) counts as this point failing,
    // not as the whole batch aborting with the earlier points' work unreported.
    let result: BackupResult;
    try {
      result = await backupPoint(point.id.toString(), cache, { shouldCancel });
    } catch (error) {
      result = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timedOut: isNetworkTimeoutError(error),
        connectionLost: isConnectionError(error),
      };
    }

    if (result.cancelled) {
      // Interrupted mid-point: it is neither sent nor failed, it stays pending.
      cancelled = true;
      attempted -= 1;
      break;
    }

    if (result.success) {
      backedUp += 1;
    } else {
      failed.push({
        pointId: point.id,
        pointNumber: point.point_number,
        lat: point.lat,
        lon: point.lon,
        reason: result.error ?? "Erro desconhecido.",
        missingMediaCount: result.missingMediaCount ?? 0,
        timedOut: result.timedOut ?? false,
      });
    }

    try {
      await options.onPointDone?.(point, result);
    } catch (error) {
      console.error("Error in backup onPointDone:", error);
    }

    // The connection itself is gone: do not insist point by point, the rest would fail the same way.
    if (!result.success && result.connectionLost) {
      connectionLost = true;
      break;
    }
  }

  return { backedUp, failed, cancelled, connectionLost, notAttempted: points.length - attempted };
}
