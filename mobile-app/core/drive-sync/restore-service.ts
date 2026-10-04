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
  MODULE_MEDIA_SUBDIR,
  PACKAGE_MEDIA_PREFIX,
  getModuleMediaFields,
  mapModuleMediaUris,
  type ModuleMediaField,
} from "@/core/project-sharing/module-media";
import { MediaRestoreError } from "@/core/drive-sync/restore-errors";
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
    "",
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

        await createProjectSpecies({
          project_id: newProjectId,
          scientific_name: speciesEntry.scientific_name,
          source: sanitizeSpeciesSource(speciesEntry.source),
          uuid: speciesEntry.uuid,
          common_names: parseImportedCommonNames(speciesEntry.common_names),
        });
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

    // approved/ - every point.
    let imported = 0;
    let mediaDownloaded = 0;
    let duplicatesSkipped = 0;

    const approvedFolder = await findChildByName(driveFolderId, "approved");
    if (approvedFolder) {
      const approvedFiles = (await listChildren(approvedFolder.id)).filter((f) =>
        f.name.endsWith(".json"),
      );

      const mediaRootFolder = await findChildByName(approvedFolder.id, "media");
      const moduleMediaFields = await getModuleMediaFields(localProtocolId, manifest.protocol_source);

      // Defensive dedupe: a stray duplicate `<uuid>.json` in Drive (e.g. from
      // before backupPoint became idempotent) must not produce two local
      // points with the same uuid - points.uuid is now unique per project.
      const seenPointUuids = new Set<string>();

      for (const file of approvedFiles) {
        const entry = await readJsonFile<PointPackageEntry>(file.id);

        if (seenPointUuids.has(entry.point_uuid)) {
          duplicatesSkipped += 1;
          continue;
        }
        seenPointUuids.add(entry.point_uuid);

        processedPointUuids.push(entry.point_uuid);

        // Every photo/audio the point lists must come down, or the whole
        // restore is undone (MediaRestoreError).
        const downloaded = await downloadPointMedia(mediaRootFolder, entry, moduleMediaFields);
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
          drive_synced_at: file.modifiedTime ?? new Date().toISOString(),
        });
        imported += 1;
      }
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
    await deleteProject(newProjectId);
    throw error;
  }
}

/** Drive stores module media flat, as `modules__<file>` inside the point's media folder. */
function driveNameForModuleMedia(relativePath: string): string {
  return relativePath.replace(/\//g, "__");
}

/**
 * Downloads every photo, audio note and module-data media file a point lists
 * into persistent app storage. Throws MediaRestoreError on the first thing
 * that is missing or fails - never returns a partial result.
 */
async function downloadPointMedia(
  mediaRootFolder: DriveFile | null,
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

  const pointMediaFolder = mediaRootFolder
    ? await findChildByName(mediaRootFolder.id, entry.point_uuid)
    : null;
  if (!pointMediaFolder) {
    throw new MediaRestoreError(
      `A pasta de mídia do ponto ${entry.point_uuid} não foi encontrada no Drive.`,
    );
  }

  const filesByName = new Map<string, DriveFile>();
  for (const file of await listChildren(pointMediaFolder.id)) {
    filesByName.set(file.name, file);
  }

  const destDir = new Directory(Paths.document, `${IMPORTED_MEDIA_DIR}/${entry.point_uuid}`);
  if (!destDir.exists) await destDir.create({ intermediates: true });

  const downloadInto = async (driveName: string, destFile: File): Promise<void> => {
    const driveFile = filesByName.get(driveName);
    if (!driveFile) {
      throw new MediaRestoreError(
        `O arquivo ${driveName} do ponto ${entry.point_uuid} não foi encontrado no Drive.`,
      );
    }
    try {
      await downloadBinaryFile(driveFile.id, destFile.uri);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new MediaRestoreError(
        `O arquivo ${driveName} do ponto ${entry.point_uuid} não pôde ser baixado: ${message}`,
      );
    }
    count += 1;
  };

  for (const filename of entry.photos) {
    const destFile = new File(destDir, filename);
    await downloadInto(filename, destFile);
    photoUris.push(destFile.uri);
  }

  for (const note of entry.audio_notes) {
    const destFile = new File(destDir, note.filename);
    await downloadInto(note.filename, destFile);
    audioEntries.push({ uri: destFile.uri, duration: note.duration, timestamp: note.timestamp });
  }

  // Media referenced from module data (custom protocols): the exported JSON
  // carries `package-media:modules/<file>` markers; swap each for the local
  // persisted copy.
  const modules: Record<string, string> = {};
  for (const [moduleId, dataJson] of Object.entries(entry.modules)) {
    const fieldsOfModule = moduleMediaFields.filter((f) => f.moduleId === moduleId);
    if (fieldsOfModule.length === 0) {
      modules[moduleId] = dataJson;
      continue;
    }
    modules[moduleId] = await mapModuleMediaUris(dataJson, fieldsOfModule, async (uri) => {
      if (!uri.startsWith(PACKAGE_MEDIA_PREFIX)) return uri;
      const relativePath = uri.slice(PACKAGE_MEDIA_PREFIX.length);
      const modulesDir = new Directory(destDir, MODULE_MEDIA_SUBDIR);
      if (!modulesDir.exists) await modulesDir.create({ intermediates: true });
      const destFile = new File(destDir, relativePath);
      await downloadInto(driveNameForModuleMedia(relativePath), destFile);
      return destFile.uri;
    });
  }

  return { photoUris, audioEntries, modules, count };
}
