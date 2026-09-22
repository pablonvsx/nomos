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
import type { PointPackageEntry, PointsPackage } from "@/core/project-sharing/export-points";
import { POINTS_PACKAGE_FORMAT_VERSION } from "@/core/project-sharing/export-points";

export interface PendingDuplicate {
  incoming: PointPackageEntry;
  existingPointId: number;
  /** Directory (under Paths.document) holding this point's extracted media, pending resolution. */
  stagedMediaDir: string;
}

export interface ImportPointsResult {
  imported: number;
  duplicates: PendingDuplicate[];
  ownerEmailWarning: boolean;
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

/**
 * Copies every media file for a point from the (temporary) extraction
 * directory into a persistent directory under Paths.document - never leave
 * a point's photos/audio referencing the extraction dir, which gets deleted
 * once import finishes (see the "photos not rendering" bug this replaces).
 * Returns the destination file URIs, one per copied file.
 */
async function copyMediaToPersistentDir(
  extractDir: Directory,
  pointUuid: string,
  destSubdir: string,
): Promise<string[]> {
  const sourceMediaDir = new Directory(extractDir, `media/${pointUuid}`);
  const destDir = new Directory(Paths.document, `${destSubdir}/${pointUuid}`);
  if (destDir.exists) await destDir.delete();
  await destDir.create({ intermediates: true });

  if (!sourceMediaDir.exists) {
    return [];
  }

  const destUris: string[] = [];
  for (const entry of sourceMediaDir.list()) {
    if (!(entry instanceof File)) continue;
    const destFile = new File(destDir, entry.name);
    await entry.copy(destFile);
    destUris.push(destFile.uri);
  }

  return destUris;
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

    let imported = 0;
    const duplicates: PendingDuplicate[] = [];

    for (const entry of pkg.points) {
      const existing = await getPointByProjectAndUuid(targetProjectId, entry.point_uuid);

      if (!existing) {
        const copiedUris = await copyMediaToPersistentDir(
          extractDir,
          entry.point_uuid,
          IMPORTED_MEDIA_DIR,
        );
        const audioNotes = entry.audio_notes.map((note) => ({
          uri: copiedUris.find((uri) => uri.endsWith(note.filename)) ?? "",
          duration: note.duration,
          timestamp: note.timestamp,
        }));
        const photoUris = copiedUris.filter(
          (uri) => !entry.audio_notes.some((n) => uri.endsWith(n.filename)),
        );

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
          modules: entry.modules,
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
        });
      }
    }

    return { imported, duplicates, ownerEmailWarning };
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

  const photoUris: string[] = [];
  const audioEntries: Array<{ uri: string; duration: number; timestamp: number }> = [];

  if (stagedDir.exists) {
    for (const entry of stagedDir.list()) {
      if (!(entry instanceof File)) continue;
      const destFile = new File(permanentDir, entry.name);
      await entry.move(destFile);

      const matchingAudio = duplicate.incoming.audio_notes.find((n) => n.filename === entry.name);
      if (matchingAudio) {
        audioEntries.push({
          uri: destFile.uri,
          duration: matchingAudio.duration,
          timestamp: matchingAudio.timestamp,
        });
      } else {
        photoUris.push(destFile.uri);
      }
    }
    await stagedDir.delete();
  }

  const entry = duplicate.incoming;
  await updatePoint(duplicate.existingPointId, {
    lat: entry.lat,
    lon: entry.lon,
    altitude: entry.altitude ?? null,
    generated_name: entry.generated_name ?? null,
    photos: JSON.stringify(photoUris.map((uri) => ({ uri, timestamp: Date.now() }))),
    audio_notes: JSON.stringify(audioEntries),
    additional_notes: entry.additional_notes ? JSON.stringify(entry.additional_notes) : null,
    point_size: entry.point_size ?? null,
    schema_version: entry.schema_version,
    modules: entry.modules,
    created_by: entry.created_by,
    approval_status: "pending",
  });
}
