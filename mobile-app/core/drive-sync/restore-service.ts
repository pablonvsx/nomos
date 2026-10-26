import { seedBackupSnapshots } from "@/core/drive-sync/backup-status-service";
import { Directory, File, Paths } from "expo-file-system";
import {
  downloadBinaryFile,
  findChildByName,
  listChildren,
  readJsonFile,
  type DriveFile,
} from "@/core/drive-sync/drive-api-client";
import { getManifest } from "@/core/drive-sync/project-drive-service";
import { getCurrentGoogleAccount } from "@/core/google-auth/google-auth-service";
import {
  createCustomProtocolWithUuid,
  getCustomProtocolByUuid,
} from "@/db/queries/custom-protocols";
import {
  createProject,
  deleteProject,
  getProjectByUuid,
  setProjectAsOwner,
  updateProjectGeoJSON,
} from "@/db/queries/projects";
import { createProjectSpecies, getProjectSpeciesByUuid } from "@/db/queries/project-species";
import {
  createVegetationClassification,
  getVegetationClassificationByUuid,
  setActiveVegetationClassification,
  setVegetationClassificationUuid,
} from "@/db/queries/vegetation-classifications";
import { createPoint } from "@/db/queries/points";
import {
  parseImportedCommonNames,
  sanitizeSpeciesSource,
} from "@/core/project-sharing/project-config-package";
import { IMPORTED_MEDIA_DIR } from "@/core/project-sharing/import-points";
import {
  PACKAGE_MEDIA_PREFIX,
  getModuleMediaFields,
  mapModuleMediaUris,
  type ModuleMediaField,
} from "@/core/project-sharing/module-media";
import {
  APPROVED_FOLDER,
  FOLDER_MIME_TYPE,
  POINT_JSON_FILENAME,
  parsePointFolderUuid,
} from "@/core/drive-sync/drive-layout";
import { fromDriveMediaMarker, splitRelativePath } from "@/core/drive-sync/drive-media-paths";
import { MapRestoreError, MediaRestoreError } from "@/core/drive-sync/restore-errors";
import { MAP_FOLDER, MAP_INDEX_FILENAME, fileNameOfSlot, parseMapIndex, type MapSlot } from "@/core/drive-sync/map-index";
import { InvalidPackageError, UnsupportedPackageVersionError } from "@/core/project-sharing/package-errors";
import { isFeatureCollection } from "@/core/utils/geojson";
import { isNetworkTimeoutError } from "@/core/net/network-timeout";
import type { PointPackageEntry } from "@/core/project-sharing/export-points";
import type { CustomProtocolSchema, VegetationClass } from "@/types/database";

export { MediaRestoreError };

export interface RestoreResult {
  projectId: number;
  imported: number;
  /** Photos/audio files downloaded. A failed download aborts and undoes the whole restore, so there is no failure count. */
  mediaDownloaded: number;
  /** Non-blocking signal (section 14.3): the manifest's owner_email differs from the currently connected account. */
  ownerEmailWarning: boolean;
  /** True when the manifest pointed to a custom classification whose file
   * wasn't found among the downloaded ones - the project was restored as
   * 'standard' instead, and the owner should double check (audit finding
   * IMPORTANTE 1). Never silently ignored. */
  activeClassificationWarning: boolean;
  /** Approved point files skipped because their point_uuid was already
   * processed earlier in this same restore (stray Drive duplicate, e.g.
   * from before backupPoint became idempotent). */
  duplicatesSkipped: number;
}

/**
 * Rebuilds the owner's own project from Drive: always complete (every
 * approved point with all of its photos and audio) and all-or-nothing - any
 * failure after the local project was created deletes it again, together
 * with the media already downloaded, so a half-restored project never
 * exists (a point restored without its media would be re-uploaded without
 * it by the next backup).
 */
export async function restoreOwnProjectFromDrive(driveFolderId: string): Promise<RestoreResult> {
  const manifest = await getManifest(driveFolderId);
  if (!manifest.project_uuid || !manifest.owner_email) {
    throw new Error("manifest.json incompleto ou corrompido.");
  }

  const existing = await getProjectByUuid(manifest.project_uuid);
  if (existing) {
    throw new Error("Este projeto já existe neste dispositivo.");
  }

  let localProtocolId = manifest.protocol_id;
  if (manifest.protocol_source === "custom") {
    const protocolFile = await findChildByName(driveFolderId, "protocol-package.json");
    if (!protocolFile) {
      throw new Error("Protocolo personalizado deste projeto não encontrado no Drive.");
    }
    const protocolPackage = await readJsonFile<{
      uuid: string;
      name: string;
      theme: string;
      schema: unknown;
    }>(protocolFile.id);

    const existingProtocol = await getCustomProtocolByUuid(protocolPackage.uuid);
    localProtocolId = existingProtocol
      ? String(existingProtocol.id)
      : String(
          await createCustomProtocolWithUuid(
            protocolPackage.name,
            protocolPackage.schema as CustomProtocolSchema,
            protocolPackage.theme,
            protocolPackage.uuid,
          ),
        );
  }

  const account = getCurrentGoogleAccount();
  const ownerEmailWarning = Boolean(account && manifest.owner_email !== account.email);

  const newProjectId = await createProject(
    manifest.project_name,
    localProtocolId,
    manifest.project_description ?? "",
    manifest.protocol_source,
    manifest.project_uuid,
    manifest.owner_email,
  );
  if (!newProjectId) {
    throw new Error("Falha ao criar o projeto local.");
  }
  await setProjectAsOwner(newProjectId, driveFolderId, manifest.owner_email);

  // Uuids of points whose media directory may exist on disk, for the undo below.
  const processedPointUuids: string[] = [];
  // Route / layer files written to the documents folder, for the same undo.
  const restoredMapFiles: File[] = [];

  try {

    // species-catalog/ - every row, uuid persisted verbatim (never generated
    // fresh), same dedupe-by-uuid discipline as Fase 0's applyProjectConfigPackage.
    const speciesCatalogFolder = await findChildByName(driveFolderId, "species-catalog");
    if (speciesCatalogFolder) {
      const speciesFiles = await listChildren(speciesCatalogFolder.id);
      for (const file of speciesFiles.filter((f) => f.name.endsWith(".json"))) {
        const speciesEntry = await readJsonFile<{
          uuid: string;
          scientific_name: string;
          source: string;
          common_names: unknown;
        }>(file.id);

        const existingSpecies = await getProjectSpeciesByUuid(newProjectId, speciesEntry.uuid);
        if (existingSpecies) continue;

        if (!speciesEntry.scientific_name?.trim()) continue;

        // A name already in the catalog under another uuid keeps the local
        // record: the received one is ignored, not an error. A real failure
        // is not swallowed - the restore is undone like any other failure.
        const created = await createProjectSpecies({
          project_id: newProjectId,
          scientific_name: speciesEntry.scientific_name,
          source: sanitizeSpeciesSource(speciesEntry.source),
          uuid: speciesEntry.uuid,
          common_names: parseImportedCommonNames(speciesEntry.common_names),
        });
        if (created.status === "error") {
          throw new Error(`Falha ao restaurar a espécie ${speciesEntry.scientific_name}: ${created.message}`);
        }
      }
    }

    // vegetation-classes/ - every classification, uuid persisted verbatim.
    const vegClassesFolder = await findChildByName(driveFolderId, "vegetation-classes");
    const localVegetationIdByUuid = new Map<string, number>();
    if (vegClassesFolder) {
      const vegFiles = await listChildren(vegClassesFolder.id);
      for (const file of vegFiles.filter((f) => f.name.endsWith(".json"))) {
        const vegEntry = await readJsonFile<{ uuid: string; name: string; classes: unknown }>(
          file.id,
        );

        const existingVeg = await getVegetationClassificationByUuid(newProjectId, vegEntry.uuid);
        if (existingVeg) {
          localVegetationIdByUuid.set(vegEntry.uuid, existingVeg.id);
          continue;
        }

        const newId = await createVegetationClassification(
          newProjectId,
          vegEntry.name,
          vegEntry.classes as VegetationClass[],
        );
        if (!newId) continue;
        await setVegetationClassificationUuid(newId, vegEntry.uuid);
        localVegetationIdByUuid.set(vegEntry.uuid, newId);
      }
    }

    // Resolve the active vegetation classification to the LOCAL id - this is
    // the exact class of bug the previous attempt shipped (falling back to
    // 'standard' silently instead of resolving the uuid). If the manifest
    // points at a custom uuid that isn't among the downloaded classifications
    // (audit finding IMPORTANTE 1 - the write side can fail to push it),
    // this is now an explicit, reported warning instead of a silent no-op.
    let activeClassificationWarning = false;
    if (manifest.active_vegetation_classification.type === "custom") {
      const targetUuid = manifest.active_vegetation_classification.custom_classification_uuid;
      const localId = targetUuid ? localVegetationIdByUuid.get(targetUuid) : undefined;
      if (localId) {
        await setActiveVegetationClassification(newProjectId, localId, "custom");
      } else {
        activeClassificationWarning = true;
      }
    } else {
      await setActiveVegetationClassification(newProjectId, null, "standard");
    }

    // map/ - the field route and the mapping layer, if the project had them.
    await restoreMapData(driveFolderId, newProjectId, restoredMapFiles);

    // approved/ - every point folder.
    let imported = 0;
    let mediaDownloaded = 0;
    let duplicatesSkipped = 0;

    const approvedFolder = await findChildByName(driveFolderId, APPROVED_FOLDER);
    if (approvedFolder) {
      const moduleMediaFields = await getModuleMediaFields(localProtocolId, manifest.protocol_source);
      const folders = createFolderListings();

      // Only point_<label>_<uuid> folders count; anything else somebody left
      // in approved/ (loose files, other folders) is ignored. The label part
      // may have been renamed by hand - only the uuid suffix is read.
      const candidates: Array<{ folder: DriveFile; entry: PointPackageEntry; modifiedTime?: string }> = [];
      for (const folder of await folders.list(approvedFolder.id)) {
        const folderUuid = folder.mimeType === FOLDER_MIME_TYPE ? parsePointFolderUuid(folder.name) : null;
        if (!folderUuid) continue;

        // A folder without point.json is a backup that never finished
        // (point.json is written last): it is not a point yet.
        const jsonFile = (await folders.list(folder.id)).find(
          (child) => child.name === POINT_JSON_FILENAME && child.mimeType !== FOLDER_MIME_TYPE,
        );
        if (!jsonFile) continue;

        const entry = await readJsonFile<PointPackageEntry>(jsonFile.id);
        if (entry.point_uuid?.toLowerCase() !== folderUuid.toLowerCase()) continue;
        candidates.push({ folder, entry, modifiedTime: jsonFile.modifiedTime });
      }

      // Local point numbers are handed out in insertion order, and Drive lists
      // children in no defined order: restore oldest first, ties by folder
      // name, so the numbering is the same every time.
      candidates.sort(
        (x, y) =>
          (x.entry.created_at ?? "").localeCompare(y.entry.created_at ?? "") ||
          x.folder.name.localeCompare(y.folder.name),
      );

      // Defensive dedupe: two folders claiming one uuid must not produce two
      // local points - points.uuid is unique per project.
      const seenPointUuids = new Set<string>();

      for (const { folder, entry, modifiedTime } of candidates) {
        if (seenPointUuids.has(entry.point_uuid)) {
          duplicatesSkipped += 1;
          continue;
        }
        seenPointUuids.add(entry.point_uuid);

        processedPointUuids.push(entry.point_uuid);

        // Every photo/audio the point lists must come down, or the whole
        // restore is undone (MediaRestoreError).
        const downloaded = await downloadPointMedia(folders, folder, entry, moduleMediaFields);
        mediaDownloaded += downloaded.count;

        await createPoint({
          project_id: newProjectId,
          protocol_id: localProtocolId,
          lat: entry.lat,
          lon: entry.lon,
          altitude: entry.altitude ?? null,
          generated_name: entry.generated_name ?? null,
          photos: JSON.stringify(downloaded.photoUris.map((uri) => ({ uri, timestamp: Date.now() }))),
          audio_notes: JSON.stringify(downloaded.audioEntries),
          additional_notes: entry.additional_notes ? JSON.stringify(entry.additional_notes) : null,
          point_size: entry.point_size ?? null,
          schema_version: entry.schema_version,
          modules: downloaded.modules,
          uuid: entry.point_uuid,
          approval_status: "approved",
          created_by: entry.created_by,
          drive_synced_at: modifiedTime ?? new Date().toISOString(),
        });
        imported += 1;
      }
    }

    // What was just restored IS what Drive holds, so both scopes start "up to
    // date". Best effort: failing to record it must never undo a restore.
    try {
      await seedBackupSnapshots(newProjectId);
    } catch (seedError) {
      console.error("Error recording the restore backup snapshot:", seedError);
    }

    return {
      projectId: newProjectId,
      imported,
      mediaDownloaded,
      ownerEmailWarning,
      activeClassificationWarning,
      duplicatesSkipped,
    };
  } catch (error) {
    // All-or-nothing: remove the media downloaded so far and the partial project.
    for (const pointUuid of processedPointUuids) {
      const mediaDir = new Directory(Paths.document, `${IMPORTED_MEDIA_DIR}/${pointUuid}`);
      if (mediaDir.exists) await mediaDir.delete();
    }
    for (const mapFile of restoredMapFiles) {
      if (mapFile.exists) await mapFile.delete();
    }
    await deleteProject(newProjectId);
    throw error;
  }
}

/**
 * Brings the route and the layer back from `map/`: a new file in the documents
 * folder for each (never the sender's path) and the project's columns pointing
 * at it. No index, or an index slot that is empty, means the project had none.
 * An index this build cannot read, or a file that is not a FeatureCollection,
 * fails the restore, which is then undone like any other failure; the files
 * written are pushed to `written` first so that undo can delete them.
 */
async function restoreMapData(driveFolderId: string, projectId: number, written: File[]): Promise<void> {
  const mapFolder = await findChildByName(driveFolderId, MAP_FOLDER);
  if (!mapFolder) return;
  const indexFile = await findChildByName(mapFolder.id, MAP_INDEX_FILENAME);
  if (!indexFile) return;

  let index;
  try {
    index = parseMapIndex(await readJsonFile(indexFile.id));
  } catch (error) {
    if (error instanceof UnsupportedPackageVersionError || error instanceof InvalidPackageError) {
      throw new MapRestoreError(error.message);
    }
    throw error;
  }

  const children = await listChildren(mapFolder.id);
  const restoredUri: Partial<Record<MapSlot, string>> = {};
  for (const slot of ["layer", "route"] as const) {
    if (!index[slot]) continue;
    // The index names a file that is not on Drive any more: that slot has nothing to restore.
    const file = children.find((child) => child.name === fileNameOfSlot(slot));
    if (!file) continue;

    const geojson = await readJsonFile<unknown>(file.id);
    if (!isFeatureCollection(geojson)) {
      throw new MapRestoreError(`O arquivo ${file.name} do mapa não é um GeoJSON FeatureCollection válido.`);
    }
    const destination = new File(Paths.document, `${slot === "layer" ? "layer" : "route"}_${Date.now()}.geojson`);
    await destination.create();
    written.push(destination);
    await destination.write(JSON.stringify(geojson));
    restoredUri[slot] = destination.uri;
  }

  if (restoredUri.layer === undefined && restoredUri.route === undefined) return;
  if (!(await updateProjectGeoJSON(projectId, restoredUri.layer, restoredUri.route))) {
    throw new Error("Não foi possível registrar a rota e a camada do mapa no projeto restaurado.");
  }
}

/** Folder listings fetched at most once each during one restore. */
function createFolderListings() {
  const listings = new Map<string, Promise<DriveFile[]>>();
  return {
    list(folderId: string): Promise<DriveFile[]> {
      let listing = listings.get(folderId);
      if (!listing) listings.set(folderId, (listing = listChildren(folderId)));
      return listing;
    },
  };
}

/** A name that is safe as a local file name whatever the Drive name held. */
function localFileName(counter: number, relativePath: string): string {
  const base = splitRelativePath(relativePath).pop() ?? "media";
  return `${counter}_${base.replace(/[^A-Za-z0-9._-]/g, "_").slice(-60)}`;
}

/**
 * Downloads every photo, audio note and module-data media file a point lists
 * into persistent app storage. Each media is found by following the exact
 * relative path written in point.json, folder by folder - names are never
 * recomputed, so a path that no longer exists (something renamed or moved
 * inside media/) is an error. Throws MediaRestoreError on the first thing
 * that is missing or fails - never returns a partial result.
 */
async function downloadPointMedia(
  folders: ReturnType<typeof createFolderListings>,
  pointFolder: DriveFile,
  entry: PointPackageEntry,
  moduleMediaFields: ModuleMediaField[],
): Promise<{
  photoUris: string[];
  audioEntries: Array<{ uri: string; duration: number; timestamp: number }>;
  modules: Record<string, string>;
  count: number;
}> {
  const photoUris: string[] = [];
  const audioEntries: Array<{ uri: string; duration: number; timestamp: number }> = [];
  let count = 0;

  const listsMedia =
    entry.photos.length > 0 ||
    entry.audio_notes.length > 0 ||
    Object.values(entry.modules).some((json) => json.includes(PACKAGE_MEDIA_PREFIX));
  if (!listsMedia) {
    return { photoUris, audioEntries, modules: entry.modules, count };
  }

  const destDir = new Directory(Paths.document, `${IMPORTED_MEDIA_DIR}/${entry.point_uuid}`);
  if (!destDir.exists) await destDir.create({ intermediates: true });

  const findByPath = async (relativePath: string): Promise<DriveFile> => {
    const segments = splitRelativePath(relativePath);
    let current: DriveFile = pointFolder;
    for (const [index, segment] of segments.entries()) {
      const isLast = index === segments.length - 1;
      const next: DriveFile | undefined = (await folders.list(current.id)).find(
        (child) => child.name === segment && (child.mimeType === FOLDER_MIME_TYPE) !== isLast,
      );
      if (!next) {
        throw new MediaRestoreError(
          `O ${isLast ? "arquivo" : "diretório"} ${segment} (${relativePath}) do ponto ${entry.point_uuid} não foi encontrado no Drive.`,
        );
      }
      current = next;
    }
    return current;
  };

  const downloadInto = async (relativePath: string): Promise<string> => {
    const driveFile = await findByPath(relativePath);
    const destFile = new File(destDir, localFileName(count + 1, relativePath));
    try {
      await downloadBinaryFile(driveFile.id, destFile.uri);
    } catch (error) {
      // A timeout is reported as itself (friendly "slow connection" message)
      // rather than as a generic media failure; the restore is undone either way.
      if (isNetworkTimeoutError(error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new MediaRestoreError(
        `O arquivo ${relativePath} do ponto ${entry.point_uuid} não pôde ser baixado: ${message}`,
      );
    }
    count += 1;
    return destFile.uri;
  };

  for (const relativePath of entry.photos) {
    photoUris.push(await downloadInto(relativePath));
  }

  for (const note of entry.audio_notes) {
    audioEntries.push({ uri: await downloadInto(note.filename), duration: note.duration, timestamp: note.timestamp });
  }

  // Media referenced from module data (custom protocols): the JSON carries
  // `package-media:<relative path>` markers; swap each for the local
  // persisted copy.
  const modules: Record<string, string> = {};
  for (const [moduleId, dataJson] of Object.entries(entry.modules)) {
    const fieldsOfModule = moduleMediaFields.filter((f) => f.moduleId === moduleId);
    if (fieldsOfModule.length === 0) {
      modules[moduleId] = dataJson;
      continue;
    }
    modules[moduleId] = await mapModuleMediaUris(dataJson, fieldsOfModule, async (uri) => {
      const relativePath = fromDriveMediaMarker(uri);
      return relativePath === null ? uri : downloadInto(relativePath);
    });
  }

  return { photoUris, audioEntries, modules, count };
}
