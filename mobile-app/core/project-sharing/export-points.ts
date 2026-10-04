import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { zip } from "react-native-zip-archive";
import { getLocalCollectorCode } from "@/core/local-identity/collector-code";
import { ensureProjectUuid, getProjectById } from "@/db/queries/projects";
import {
  ensurePointUuid,
  getPoint,
  getPointsWithRawModulesByProject,
  updatePoint,
} from "@/db/queries/points";
import { parsePhotoUris, parseAudioNotes } from "@/db/mappers/json-utils";
import { assertProjectActionAllowed } from "@/core/project-sharing/action-visibility";
import {
  PACKAGE_MEDIA_PREFIX,
  buildModuleMediaRelativePath,
  getModuleMediaFields,
  mapModuleMediaUris,
} from "@/core/project-sharing/module-media";
import type { Point, PointModule } from "@/types/database";

export const POINTS_PACKAGE_FORMAT_VERSION = 1;

export interface PointPackageAudioNote {
  filename: string;
  duration: number;
  timestamp: number;
}

export interface PointPackageEntry {
  point_uuid: string;
  point_number: number;
  lat: number;
  lon: number;
  altitude?: number | null;
  generated_name?: string | null;
  landscape_class_id?: number | null;
  additional_notes?: string[];
  point_size?: number | null;
  created_at?: string;
  created_by: string;
  schema_version: string;
  modules: Record<string, string>;
  photos: string[];
  audio_notes: PointPackageAudioNote[];
}

export interface PointsPackage {
  format_version: 1;
  project_uuid: string;
  protocol_id: string;
  protocol_source: "official" | "custom";
  collector_code: string;
  owner_email: string | null;
  points: PointPackageEntry[];
}

/** Thrown when trying to export without a local collector code set yet. */
export class CollectorCodeRequiredError extends Error {
  constructor() {
    super("A local collector code must be set before exporting points.");
    this.name = "CollectorCodeRequiredError";
  }
}

/** What the exporter could not put into the zip; never silently dropped. */
export interface ExportPointsReport {
  /** Source URIs of media files that were missing or failed to copy. */
  skippedMedia: string[];
}

function extensionFromUri(uri: string, fallback: string): string {
  const match = uri.split(".").pop();
  return match && match.length <= 5 ? match : fallback;
}

async function buildAndSharePointsPackage(
  projectId: number,
  points: Array<Point & { rawModules: PointModule[] }>,
): Promise<ExportPointsReport> {
  const project = await getProjectById(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }
  // Only a collaborator copy sends points to the owner. Checked before the
  // collector-code prompt so a wrong role is never asked to set a code.
  assertProjectActionAllowed(project.collaboration_role, "exportPointsToOwner");

  const collectorCode = await getLocalCollectorCode();
  if (!collectorCode) {
    throw new CollectorCodeRequiredError();
  }

  const projectUuid = await ensureProjectUuid(projectId);
  const moduleMediaFields = await getModuleMediaFields(project.protocol_id, project.protocol_source);
  const skippedMedia: string[] = [];

  const stagingDir = new Directory(Paths.cache, `points_export_${Date.now()}`);
  if (stagingDir.exists) await stagingDir.delete();
  await stagingDir.create();

  try {
    const entries: PointPackageEntry[] = [];

    for (const point of points) {
      const pointUuid = await ensurePointUuid(point.id);

      let createdBy = point.created_by;
      if (!createdBy) {
        createdBy = collectorCode;
        await updatePoint(point.id, { created_by: collectorCode });
      }

      // The point's media directory is only created once a file is actually
      // copied into it, so no empty directories end up in the zip.
      const mediaDir = new Directory(stagingDir, `media/${pointUuid}`);
      const copyIntoMediaDir = async (
        sourceUri: string,
        relativePath: string,
      ): Promise<boolean> => {
        const srcFile = new File(sourceUri);
        if (!srcFile.exists) {
          skippedMedia.push(sourceUri);
          return false;
        }
        try {
          const destFile = new File(mediaDir, relativePath);
          const destParent = new Directory(destFile.uri.split("/").slice(0, -1).join("/"));
          await destParent.create({ intermediates: true, idempotent: true });
          await srcFile.copy(destFile);
          return true;
        } catch {
          skippedMedia.push(sourceUri);
          return false;
        }
      };

      const photoFilenames: string[] = [];
      const photoUris = parsePhotoUris(point.photos);
      for (let i = 0; i < photoUris.length; i++) {
        const filename = `photo_${i + 1}.${extensionFromUri(photoUris[i], "jpg")}`;
        if (await copyIntoMediaDir(photoUris[i], filename)) photoFilenames.push(filename);
      }

      const audioFilenames: PointPackageAudioNote[] = [];
      const audioNotes = parseAudioNotes(point.audio_notes ?? null);
      for (let i = 0; i < audioNotes.length; i++) {
        const note = audioNotes[i];
        if (!note?.uri) continue;
        const filename = `audio_note_${i + 1}.${extensionFromUri(note.uri, "m4a")}`;
        if (await copyIntoMediaDir(note.uri, filename)) {
          audioFilenames.push({
            filename,
            duration: note.duration,
            timestamp: note.timestamp,
          });
        }
      }

      // Custom protocols keep photo_input / audio_notes_input media inside the
      // module data_json. Copy those files into the zip too and replace the
      // sender's device URIs with package-relative markers.
      let moduleMediaCounter = 0;
      const modules: Record<string, string> = {};
      let schemaVersion = "1.0";
      for (const mod of point.rawModules) {
        const mediaFieldsOfModule = moduleMediaFields.filter((f) => f.moduleId === mod.module_id);
        modules[mod.module_id] =
          mediaFieldsOfModule.length === 0
            ? mod.data_json
            : await mapModuleMediaUris(mod.data_json, mediaFieldsOfModule, async (uri, location) => {
                moduleMediaCounter += 1;
                const relativePath = buildModuleMediaRelativePath(location, moduleMediaCounter, uri);
                return (await copyIntoMediaDir(uri, relativePath))
                  ? `${PACKAGE_MEDIA_PREFIX}${relativePath}`
                  : null;
              });
        schemaVersion = mod.schema_version;
      }

      entries.push({
        point_uuid: pointUuid,
        point_number: point.point_number,
        lat: point.lat,
        lon: point.lon,
        altitude: point.altitude,
        generated_name: point.generated_name,
        landscape_class_id: point.landscape_class_id,
        additional_notes: point.additional_notes
          ? JSON.parse(point.additional_notes)
          : undefined,
        point_size: point.point_size,
        created_at: point.created_at,
        created_by: createdBy,
        schema_version: schemaVersion,
        modules,
        photos: photoFilenames,
        audio_notes: audioFilenames,
      });
    }

    const pkg: PointsPackage = {
      format_version: POINTS_PACKAGE_FORMAT_VERSION,
      project_uuid: projectUuid,
      protocol_id: project.protocol_id,
      protocol_source: project.protocol_source,
      collector_code: collectorCode,
      owner_email: project.owner_email ?? null,
      points: entries,
    };

    const pointsJsonFile = new File(stagingDir, "points.json");
    await pointsJsonFile.write(JSON.stringify(pkg, null, 2));

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    const zipFile = new File(Paths.cache, `Nomos_Pontos_${collectorCode}_${timestamp}.zip`);
    await zip(stagingDir.uri.replace("file://", ""), zipFile.uri.replace("file://", ""));

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(zipFile.uri, { mimeType: "application/zip" });
    }

    return { skippedMedia };
  } finally {
    if (stagingDir.exists) await stagingDir.delete();
  }
}

export async function exportPointsPackage(pointIds: string[]): Promise<ExportPointsReport> {
  if (pointIds.length === 0) return { skippedMedia: [] };

  const idSet = new Set(pointIds);
  // All exported points belong to the same project - resolve it from any one of them.
  const firstPoint = await getPoint(parseInt(pointIds[0], 10));
  if (!firstPoint) {
    throw new Error(`Point ${pointIds[0]} not found`);
  }
  const projectId = firstPoint.point.project_id;

  const points = await getPointsWithRawModulesByProject(projectId);
  return buildAndSharePointsPackage(
    projectId,
    points.filter((p) => idSet.has(p.id.toString())),
  );
}

export async function exportAllPointsPackage(projectId: number): Promise<ExportPointsReport> {
  const points = await getPointsWithRawModulesByProject(projectId);
  return buildAndSharePointsPackage(projectId, points);
}
