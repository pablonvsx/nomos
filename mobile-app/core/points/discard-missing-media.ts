import { File } from "expo-file-system";
import { getPoint, updatePoint } from "@/db/queries/points";
import { getProjectById } from "@/db/queries/projects";
import { parseJsonText } from "@/db/mappers/json-utils";
import { getModuleMediaFields, mapModuleMediaUris } from "@/core/project-sharing/module-media";

/**
 * Keeps only the entries of a photo / audio list whose file still exists.
 * Entries are either a plain uri string or an object with a `uri`; their
 * shape is preserved. Returns null when nothing changes.
 */
function keepExistingEntries(raw: string | null | undefined): { json: string; removed: number } | null {
  const list = parseJsonText<unknown[] | null>(raw, null);
  if (!Array.isArray(list)) return null;

  const kept = list.filter((item) => {
    const uri = typeof item === "string" ? item : (item as { uri?: unknown } | null)?.uri;
    return typeof uri === "string" && new File(uri).exists;
  });
  if (kept.length === list.length) return null;
  return { json: JSON.stringify(kept), removed: list.length - kept.length };
}

/**
 * Removes from a point every reference to a photo or audio file that no
 * longer exists on this device (point-level columns and, for custom
 * protocols, the media fields inside module data), so the point can be
 * backed up with the media it actually still has. Only references are
 * removed: files that exist are never touched, and the point's backup state
 * (`drive_synced_at`) is left alone. Returns how many references were
 * removed; 0 means nothing was written.
 */
export async function discardMissingMedia(pointId: number): Promise<number> {
  const loaded = await getPoint(pointId);
  if (!loaded) return 0;
  const { point, modules } = loaded;

  let removed = 0;
  const updates: {
    photos?: string;
    audio_notes?: string;
    modules?: Record<string, string>;
    schema_version?: string;
  } = {};

  const photos = keepExistingEntries(point.photos);
  if (photos) {
    updates.photos = photos.json;
    removed += photos.removed;
  }
  const audioNotes = keepExistingEntries(point.audio_notes);
  if (audioNotes) {
    updates.audio_notes = audioNotes.json;
    removed += audioNotes.removed;
  }

  const project = await getProjectById(point.project_id);
  const moduleMediaFields = project
    ? await getModuleMediaFields(project.protocol_id, project.protocol_source)
    : [];
  for (const mod of modules) {
    const fieldsOfModule = moduleMediaFields.filter((f) => f.moduleId === mod.module_id);
    if (fieldsOfModule.length === 0) continue;

    let removedInModule = 0;
    const cleaned = await mapModuleMediaUris(mod.data_json, fieldsOfModule, (uri) => {
      if (new File(uri).exists) return uri;
      removedInModule += 1;
      return null;
    });
    if (removedInModule > 0) {
      updates.modules = { ...updates.modules, [mod.module_id]: cleaned };
      updates.schema_version = mod.schema_version;
      removed += removedInModule;
    }
  }

  if (removed > 0) {
    await updatePoint(pointId, updates);
  }
  return removed;
}
