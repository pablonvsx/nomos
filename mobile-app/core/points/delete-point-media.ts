import { File, Paths } from "expo-file-system";
import { deletePoint, getPoint } from "@/db/queries/points";
import { getProjectById } from "@/db/queries/projects";
import { parsePhotoUris } from "@/db/mappers/json-utils";
import { getModuleMediaFields, listModuleMediaUris } from "@/core/project-sharing/module-media";
import type { Point } from "@/types/database";

function parseAudioUris(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (typeof item === "string" ? item : item?.uri))
      .filter((uri): uri is string => typeof uri === "string" && uri.length > 0);
  } catch {
    return [];
  }
}

function withTrailingSlash(uri: string): string {
  return uri.endsWith("/") ? uri : `${uri}/`;
}

/**
 * True only for a file that lives inside the app's own storage (documents or
 * cache). Media references can also point at things the app does not own - a
 * `content://` uri, a picture in the user's gallery - and those must never be
 * deleted. A `..` segment is rejected so a path cannot climb out of the app
 * directories.
 */
export function isInsideAppStorage(uri: string): boolean {
  if (uri.split("/").includes("..")) return false;
  return [Paths.document.uri, Paths.cache.uri].some((root) => uri.startsWith(withTrailingSlash(root)));
}

/**
 * Every media uri a point references: the photo / audio columns and, for
 * custom protocols, the media fields inside module data (top-level fields and
 * repeatable-group items).
 */
async function collectPointMediaUris(point: Point): Promise<string[]> {
  const uris = [...parsePhotoUris(point.photos), ...parseAudioUris(point.audio_notes)];

  const loaded = await getPoint(point.id);
  const project = await getProjectById(point.project_id);
  if (!loaded || !project) return uris;

  const fields = await getModuleMediaFields(project.protocol_id, project.protocol_source);
  for (const mod of loaded.modules) {
    const fieldsOfModule = fields.filter((f) => f.moduleId === mod.module_id);
    if (fieldsOfModule.length === 0) continue;
    for (const media of await listModuleMediaUris(mod.data_json, fieldsOfModule)) {
      uris.push(media.uri);
    }
  }
  return uris;
}

/**
 * Deletes a point and every media file it references (photos, audio notes,
 * and the media inside custom-protocol module data, including repeatable
 * groups), so nothing orphaned is left behind on disk. Single shared
 * deletion path for the app - used by the rejected points area and by the
 * regular point detail screen's delete action, so neither leaks media.
 *
 * Only files inside the app's own storage are deleted (isInsideAppStorage);
 * a reference that points elsewhere is left alone. A missing source file is
 * not an error here (media can already be gone for unrelated reasons); it's
 * simply skipped.
 */
export async function deletePointPermanently(point: Point): Promise<void> {
  const mediaUris = await collectPointMediaUris(point);

  for (const uri of new Set(mediaUris)) {
    if (!isInsideAppStorage(uri)) continue;
    const file = new File(uri);
    if (file.exists) {
      await file.delete();
    }
  }

  await deletePoint(point.id);
}
