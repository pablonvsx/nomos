import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import { unzip } from "react-native-zip-archive";
import { hasZipSignature, ZIP_SIGNATURE_LENGTH } from "@/core/project-sharing/zip-signature";
import { ensureProjectUuid, getProjectById } from "@/db/queries/projects";
import { createPoint, getPointByProjectAndUuid, updatePoint } from "@/db/queries/points";
import { getConnectedGoogleAccountEmail } from "@/core/local-identity/connected-account";
import {
  InvalidPackageError,
  NotAZipFileError,
  OutdatedPackageVersionError,
  UnsupportedPackageVersionError,
} from "@/core/project-sharing/package-errors";
import { assertProjectActionAllowed } from "@/core/project-sharing/action-visibility";
import {
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
  if (typeof version === "number" && version < POINTS_PACKAGE_FORMAT_VERSION) {
    throw new OutdatedPackageVersionError();
  }
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

/** Local URIs of a point's media, keyed by the path relative to media/<uuid>/ ("photos/photo_1.jpg"). */
type MediaFilesByPath = Map<string, string>;

/**
 * Copies (or moves) a media tree file by file, creating the sub-folders the
 * shared layout uses (photos, audio, section and group folders). Returns the
 * destination URI of every file under its relative path.
 */
async function transferMediaTree(
  source: Directory,
  dest: Directory,
  mode: "copy" | "move",
  relativePrefix = "",
  into: MediaFilesByPath = new Map(),
): Promise<MediaFilesByPath> {
  await dest.create({ intermediates: true, idempotent: true });
  for (const entry of source.list()) {
    const relativePath = `${relativePrefix}${entry.name}`;
    if (entry instanceof File) {
      const destFile = new File(dest, entry.name);
      if (mode === "copy") await entry.copy(destFile);
      else await entry.move(destFile);
      into.set(relativePath, destFile.uri);
    } else if (entry instanceof Directory) {
      await transferMediaTree(entry, new Directory(dest, entry.name), mode, `${relativePath}/`, into);
    }
  }
  return into;
}

/**
 * Copies every media file for a point from the (temporary) extraction
 * directory into a persistent directory under Paths.document - never leave
 * a point's photos/audio referencing the extraction dir, which gets deleted
 * once import finishes (see the "photos not rendering" bug this replaces).
 */
async function copyMediaToPersistentDir(
  extractDir: Directory,
  pointUuid: string,
  destSubdir: string,
): Promise<MediaFilesByPath> {
  const sourceMediaDir = new Directory(extractDir, `media/${pointUuid}`);
  const destDir = new Directory(Paths.document, `${destSubdir}/${pointUuid}`);
  if (destDir.exists) await destDir.delete();
  await destDir.create({ intermediates: true });

  if (!sourceMediaDir.exists) return new Map();
  return transferMediaTree(sourceMediaDir, destDir, "copy");
}

/**
 * Builds the point's photo and audio lists from what points.json claims,
 * keeping only entries whose file really arrived. Anything claimed but
 * absent is counted instead of being saved as a path that points nowhere.
 */
function resolvePointMedia(
  entry: PointPackageEntry,
  files: MediaFilesByPath,
): {
  photoUris: string[];
  audioNotes: Array<{ uri: string; duration: number; timestamp: number }>;
  missing: number;
} {
  let missing = 0;
  const photoUris: string[] = [];
  for (const relativePath of entry.photos) {
    const uri = files.get(relativePath);
    if (uri) photoUris.push(uri);
    else missing += 1;
  }
  const audioNotes: Array<{ uri: string; duration: number; timestamp: number }> = [];
  for (const note of entry.audio_notes) {
    const uri = files.get(note.filename);
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
  files: MediaFilesByPath,
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
            const localUri = files.get(uri.slice(PACKAGE_MEDIA_PREFIX.length));
            if (!localUri) missing += 1;
            return localUri ?? null;
          });
  }
  return { modules: restored, missing };
}

/** The first `length` bytes of a file, without reading the rest (a points package can be large). */
function readFileStart(file: File, length: number): Uint8Array {
  const handle = file.open();
  try {
    return handle.readBytes(length);
  } finally {
    handle.close();
  }
}

export async function importPointsPackage(
  targetProjectId: number,
): Promise<ImportPointsResult | null> {
  // Only the owner imports points. Checked first, so a wrong role never gets
  // as far as opening the file picker.
  const targetProject = await getProjectById(targetProjectId);
  if (!targetProject) {
    throw new Error(`Project ${targetProjectId} not found`);
  }
  assertProjectActionAllowed(targetProject.collaboration_role, "importPoints");

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

  // Verify the copied file exists, has non-zero size and really IS a zip
  // BEFORE calling any native unzip function - some native zip libraries crash
  // uncatchably (not a rejected JS promise) on a bad/empty source. The picker
  // accepts any file, and a .json handed to the native unzip closed the app.
  try {
    if (!cacheZip.exists || cacheZip.size === 0) {
      throw new Error("O arquivo selecionado está vazio ou não pôde ser lido.");
    }
    if (!hasZipSignature(readFileStart(cacheZip, ZIP_SIGNATURE_LENGTH))) {
      throw new NotAZipFileError();
    }
  } catch (error) {
    if (cacheZip.exists) await cacheZip.delete();
    throw error;
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
        const { photoUris, audioNotes, missing } = resolvePointMedia(entry, copied);
        missingMedia += missing;
        const restored = await restoreModuleMedia(entry.modules, moduleMediaFields, copied);
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
  let files: MediaFilesByPath = new Map();
  if (stagedDir.exists) {
    files = await transferMediaTree(stagedDir, permanentDir, "move");
    await stagedDir.delete();
  }

  const { photoUris, audioNotes } = resolvePointMedia(entry, files);
  const restored = await restoreModuleMedia(entry.modules, duplicate.moduleMediaFields, files);

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
