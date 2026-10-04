import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import { unzip } from "react-native-zip-archive";
import { ensureProjectUuid, getProjectById } from "@/db/queries/projects";
import { createPoint, getPointByProjectAndUuid, updatePoint } from "@/db/queries/points";
import { getConnectedGoogleAccountEmail } from "@/core/local-identity/connected-account";
import {
  InvalidPackageError,
  UnsupportedPackageVersionError,
} from "@/core/project-sharing/package-errors";
import {
  MODULE_MEDIA_SUBDIR,
  PACKAGE_MEDIA_PREFIX,
  getModuleMediaFields,
  mapModuleMediaUris,
  type ModuleMediaField,
} from "@/core/project-sharing/module-media";
import type { PointPackageEntry, PointsPackage } from "@/core/project-sharing/export-points";
import { POINTS_PACKAGE_FORMAT_VERSION } from "@/core/project-sharing/export-points";

export interface PendingDuplicate {
  incoming: PointPackageEntry;
  existingPointId: number;
  /** Directory (under Paths.document) holding this point's extracted media, pending resolution. */
  stagedMediaDir: string;
  /** photo_input / audio_notes_input fields of the project's protocol, needed to restore module media on "replace". */
  moduleMediaFields: ModuleMediaField[];
}

export interface ImportPointsResult {
  imported: number;
  duplicates: PendingDuplicate[];
  ownerEmailWarning: boolean;
  /** Media files points.json references that were not found inside the zip. */
  missingMedia: number;
}

/** Thrown when a points package doesn't belong to the target project. */
export class ProjectMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectMismatchError";
  }
}

export const IMPORTED_MEDIA_DIR = "imported_points_media";
const PENDING_DUPLICATES_DIR = "pending_duplicates";

function assertValidPointsPackageShape(pkg: unknown): asserts pkg is PointsPackage {
  if (!pkg || typeof pkg !== "object") {
    throw new InvalidPackageError("Arquivo inválido: não é um pacote de pontos válido.");
  }

  // format_version must be checked before reading any other field.
  const version = (pkg as { format_version?: unknown }).format_version;
  if (version !== POINTS_PACKAGE_FORMAT_VERSION) {
    throw new UnsupportedPackageVersionError();
  }

  const candidate = pkg as Partial<PointsPackage>;
  if (typeof candidate.project_uuid !== "string" || !candidate.project_uuid) {
    throw new InvalidPackageError("Arquivo inválido: project_uuid ausente.");
  }
  if (typeof candidate.protocol_id !== "string" || !candidate.protocol_id) {
    throw new InvalidPackageError("Arquivo inválido: protocol_id ausente.");
  }
  if (typeof candidate.collector_code !== "string" || !candidate.collector_code) {
    throw new InvalidPackageError("Arquivo inválido: collector_code ausente.");
  }
  if (!Array.isArray(candidate.points)) {
    throw new InvalidPackageError("Arquivo inválido: points ausente.");
  }
}

interface CopiedPointMedia {
  /** Files directly under media/<uuid>/ (the point's own photos and audio). */
  pointFileUris: string[];
  /** Files under media/<uuid>/modules/, keyed by their package-relative path ("modules/<name>"). */
  moduleFileUris: Map<string, string>;
}

/**
 * Copies every media file for a point from the (temporary) extraction
 * directory into a persistent directory under Paths.document - never leave
 * a point's photos/audio referencing the extraction dir, which gets deleted
 * once import finishes (see the "photos not rendering" bug this replaces).
 * Returns the destination file URIs, split between the point's own media and
 * the media referenced from module data.
 */
async function copyMediaToPersistentDir(
  extractDir: Directory,
  pointUuid: string,
  destSubdir: string,
): Promise<CopiedPointMedia> {
  const sourceMediaDir = new Directory(extractDir, `media/${pointUuid}`);
  const destDir = new Directory(Paths.document, `${destSubdir}/${pointUuid}`);
  if (destDir.exists) await destDir.delete();
  await destDir.create({ intermediates: true });

  const copied: CopiedPointMedia = { pointFileUris: [], moduleFileUris: new Map() };
  if (!sourceMediaDir.exists) {
    return copied;
  }

  for (const entry of sourceMediaDir.list()) {
    if (entry instanceof File) {
      const destFile = new File(destDir, entry.name);
      await entry.copy(destFile);
      copied.pointFileUris.push(destFile.uri);
    } else if (entry instanceof Directory && entry.name === MODULE_MEDIA_SUBDIR) {
      const destModulesDir = new Directory(destDir, MODULE_MEDIA_SUBDIR);
      await destModulesDir.create({ intermediates: true, idempotent: true });
      for (const moduleEntry of entry.list()) {
        if (!(moduleEntry instanceof File)) continue;
        const destFile = new File(destModulesDir, moduleEntry.name);
        await moduleEntry.copy(destFile);
        copied.moduleFileUris.set(`${MODULE_MEDIA_SUBDIR}/${moduleEntry.name}`, destFile.uri);
      }
    }
  }

  return copied;
}

/**
 * Builds the point's photo and audio lists from what points.json claims,
 * keeping only entries whose file really arrived. Anything claimed but
 * absent is counted instead of being saved as a path that points nowhere.
 */
function resolvePointMedia(
  entry: PointPackageEntry,
  pointFileUris: string[],
): {
  photoUris: string[];
  audioNotes: Array<{ uri: string; duration: number; timestamp: number }>;
  missing: number;
} {
  let missing = 0;
  const photoUris: string[] = [];
  for (const filename of entry.photos) {
    const uri = pointFileUris.find((candidate) => candidate.endsWith(`/${filename}`));
    if (uri) photoUris.push(uri);
    else missing += 1;
  }
  const audioNotes: Array<{ uri: string; duration: number; timestamp: number }> = [];
  for (const note of entry.audio_notes) {
    const uri = pointFileUris.find((candidate) => candidate.endsWith(`/${note.filename}`));
    if (uri) audioNotes.push({ uri, duration: note.duration, timestamp: note.timestamp });
    else missing += 1;
  }
  return { photoUris, audioNotes, missing };
}

/**
 * Replaces the package-media markers inside module data_json with the
 * persisted local URIs. A marker with no matching extracted file is dropped
 * (and counted) rather than saved as a path that points nowhere.
 */
async function restoreModuleMedia(
  modules: Record<string, string>,
  fields: ModuleMediaField[],
  moduleFileUris: Map<string, string>,
): Promise<{ modules: Record<string, string>; missing: number }> {
  let missing = 0;
  const restored: Record<string, string> = {};
  for (const [moduleId, dataJson] of Object.entries(modules)) {
    const fieldsOfModule = fields.filter((f) => f.moduleId === moduleId);
    restored[moduleId] =
      fieldsOfModule.length === 0
        ? dataJson
        : await mapModuleMediaUris(dataJson, fieldsOfModule, (uri) => {
            if (!uri.startsWith(PACKAGE_MEDIA_PREFIX)) return uri;
            const localUri = moduleFileUris.get(uri.slice(PACKAGE_MEDIA_PREFIX.length));
            if (!localUri) missing += 1;
            return localUri ?? null;
          });
  }
  return { modules: restored, missing };
}

export async function importPointsPackage(
  targetProjectId: number,
): Promise<ImportPointsResult | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ["application/zip", "*/*"],
    copyToCacheDirectory: true,
  });

  if (picked.canceled || !picked.assets || picked.assets.length === 0) {
    return null;
  }

  // Never trust the picker's uri directly - copy it into a known local path first.
  const cacheZip = new File(Paths.cache, `import_points_${Date.now()}.zip`);
  const pickedFile = new File(picked.assets[0].uri);
  await pickedFile.copy(cacheZip);

  // Verify the copied file exists and has non-zero size BEFORE calling any
  // native unzip function - some native zip libraries crash uncatchably
  // (not a rejected JS promise) on a bad/empty source.
  if (!cacheZip.exists || cacheZip.size === 0) {
    throw new Error("O arquivo selecionado está vazio ou não pôde ser lido.");
  }

  // Create the extraction destination explicitly and idempotently, also
  // before calling unzip.
  const extractDir = new Directory(Paths.cache, `import_points_extract_${Date.now()}`);
  if (extractDir.exists) await extractDir.delete();
  await extractDir.create();

  try {
    await unzip(cacheZip.uri.replace("file://", ""), extractDir.uri.replace("file://", ""));

    const pointsJsonFile = new File(extractDir, "points.json");
    const raw = await pointsJsonFile.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new InvalidPackageError("Arquivo inválido: points.json não é um JSON válido.");
    }

    assertValidPointsPackageShape(parsed);
    const pkg = parsed;

    const targetProject = await getProjectById(targetProjectId);
    if (!targetProject) {
      throw new Error(`Project ${targetProjectId} not found`);
    }

    const targetProjectUuid = await ensureProjectUuid(targetProjectId);
    if (pkg.project_uuid !== targetProjectUuid) {
      throw new ProjectMismatchError("Este arquivo pertence a outro projeto.");
    }
    if (
      pkg.protocol_id !== targetProject.protocol_id ||
      pkg.protocol_source !== targetProject.protocol_source
    ) {
      throw new ProjectMismatchError(
        "Este arquivo foi exportado com um protocolo diferente do deste projeto.",
      );
    }

    const connectedEmail = await getConnectedGoogleAccountEmail();
    const ownerEmailWarning = Boolean(
      pkg.owner_email && connectedEmail && pkg.owner_email !== connectedEmail,
    );

    const moduleMediaFields = await getModuleMediaFields(
      targetProject.protocol_id,
      targetProject.protocol_source,
    );

    let imported = 0;
    let missingMedia = 0;
    const duplicates: PendingDuplicate[] = [];

    for (const entry of pkg.points) {
      const existing = await getPointByProjectAndUuid(targetProjectId, entry.point_uuid);

      if (!existing) {
        const copied = await copyMediaToPersistentDir(extractDir, entry.point_uuid, IMPORTED_MEDIA_DIR);
        const { photoUris, audioNotes, missing } = resolvePointMedia(entry, copied.pointFileUris);
        missingMedia += missing;
        const restored = await restoreModuleMedia(entry.modules, moduleMediaFields, copied.moduleFileUris);
        missingMedia += restored.missing;

        await createPoint({
          project_id: targetProjectId,
          protocol_id: targetProject.protocol_id,
          lat: entry.lat,
          lon: entry.lon,
          altitude: entry.altitude ?? null,
          generated_name: entry.generated_name ?? null,
          photos: JSON.stringify(photoUris.map((uri) => ({ uri, timestamp: Date.now() }))),
          audio_notes: JSON.stringify(audioNotes),
          additional_notes: entry.additional_notes ? JSON.stringify(entry.additional_notes) : null,
          point_size: entry.point_size ?? null,
          schema_version: entry.schema_version,
          modules: restored.modules,
          uuid: entry.point_uuid,
          approval_status: "pending",
          created_by: entry.created_by,
        });
        imported += 1;
      } else {
        const stagedDir = new Directory(Paths.document, `${PENDING_DUPLICATES_DIR}/${entry.point_uuid}`);
        await copyMediaToPersistentDir(extractDir, entry.point_uuid, PENDING_DUPLICATES_DIR);
        duplicates.push({
          incoming: entry,
          existingPointId: existing.id,
          stagedMediaDir: stagedDir.uri,
          moduleMediaFields,
        });
      }
    }

    return { imported, duplicates, ownerEmailWarning, missingMedia };
  } finally {
    if (extractDir.exists) await extractDir.delete();
    if (cacheZip.exists) await cacheZip.delete();
  }
}

export async function resolvePointDuplicate(
  duplicate: PendingDuplicate,
  action: "replace" | "discard",
): Promise<void> {
  const stagedDir = new Directory(duplicate.stagedMediaDir);

  if (action === "discard") {
    if (stagedDir.exists) await stagedDir.delete();
    return;
  }

  const permanentDir = new Directory(
    Paths.document,
    `${IMPORTED_MEDIA_DIR}/${duplicate.incoming.point_uuid}`,
  );
  if (permanentDir.exists) await permanentDir.delete();
  await permanentDir.create({ intermediates: true });

  const entry = duplicate.incoming;
  const pointFileUris: string[] = [];
  const moduleFileUris = new Map<string, string>();

  if (stagedDir.exists) {
    for (const staged of stagedDir.list()) {
      if (staged instanceof File) {
        const destFile = new File(permanentDir, staged.name);
        await staged.move(destFile);
        pointFileUris.push(destFile.uri);
      } else if (staged instanceof Directory && staged.name === MODULE_MEDIA_SUBDIR) {
        const destModulesDir = new Directory(permanentDir, MODULE_MEDIA_SUBDIR);
        await destModulesDir.create({ intermediates: true, idempotent: true });
        for (const moduleEntry of staged.list()) {
          if (!(moduleEntry instanceof File)) continue;
          const destFile = new File(destModulesDir, moduleEntry.name);
          await moduleEntry.move(destFile);
          moduleFileUris.set(`${MODULE_MEDIA_SUBDIR}/${moduleEntry.name}`, destFile.uri);
        }
      }
    }
    await stagedDir.delete();
  }

  const { photoUris, audioNotes } = resolvePointMedia(entry, pointFileUris);
  const restored = await restoreModuleMedia(entry.modules, duplicate.moduleMediaFields, moduleFileUris);

  await updatePoint(duplicate.existingPointId, {
    lat: entry.lat,
    lon: entry.lon,
    altitude: entry.altitude ?? null,
    generated_name: entry.generated_name ?? null,
    photos: JSON.stringify(photoUris.map((uri) => ({ uri, timestamp: Date.now() }))),
    audio_notes: JSON.stringify(audioNotes),
    additional_notes: entry.additional_notes ? JSON.stringify(entry.additional_notes) : null,
    point_size: entry.point_size ?? null,
    schema_version: entry.schema_version,
    modules: restored.modules,
    created_by: entry.created_by,
    approval_status: "pending",
  });
}
