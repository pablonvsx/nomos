import { getCustomProtocolById } from "@/db/queries/custom-protocols";
import { parseJsonText } from "@/db/mappers/json-utils";

/**
 * Marker written into an exported module's data_json in place of a sender's
 * device URI. The part after it is a path relative to `media/<point_uuid>/`
 * inside the points package zip. The importer swaps it for the persisted
 * local URI of the extracted file.
 */
export const PACKAGE_MEDIA_PREFIX = "package-media:";

/** Subdirectory of `media/<point_uuid>/` that holds media referenced by module data. */
export const MODULE_MEDIA_SUBDIR = "modules";

/**
 * A media field of a custom protocol section. `groupId` is set when the field
 * is a sub-field of a `repeatable_group` (one level only - the builder never
 * nests groups): the value then lives in every item of `data[groupId]`.
 */
export interface ModuleMediaField {
  moduleId: string;
  groupId?: string;
  fieldKey: string;
  kind: "photo" | "audio";
}

/**
 * Where one media list was found in a module's data. `itemIndex` is only set
 * for group sub-fields (it is a property of the data, not of the schema) and
 * `ordinal` is the position of the entry inside that field's list.
 */
export interface ModuleMediaLocation {
  moduleId: string;
  groupId?: string;
  itemIndex?: number;
  fieldKey: string;
  kind: "photo" | "audio";
  ordinal: number;
}

/**
 * Maps a media URI to its replacement, or null to drop the entry from the
 * list. `entry` is the original list entry (a uri string or an object with a
 * `uri`, e.g. an audio note with its duration).
 */
export type MediaUriMapper = (
  uri: string,
  location: ModuleMediaLocation,
  entry: unknown,
) => string | null | Promise<string | null>;

function sanitizePathPart(part: string): string {
  return part.replace(/[^A-Za-z0-9-]/g, "_");
}

/**
 * Package-relative path (`modules/<file>`) for the nth media file of a point.
 * Shared by the zip exporter and the Drive backup so both name module media
 * the same way. Drive stores it flat as the path with `/` -> `__`.
 *
 * Top-level media keeps `<moduleId>_<counter>.<ext>`. Group media is named
 * after its group, item and field: `<moduleId>_<groupId>_<itemIndex>_<fieldKey>_<counter>.<ext>`.
 * `counter` is the running number of media files already named for the same
 * point, so two files of one point can never get the same name.
 */
export function buildModuleMediaRelativePath(
  location: Pick<ModuleMediaLocation, "moduleId" | "groupId" | "itemIndex" | "fieldKey">,
  counter: number,
  sourceUri: string,
): string {
  const extension = sourceUri.split(".").pop();
  const safeExtension = extension && extension.length <= 5 ? extension : "bin";
  const moduleId = location.moduleId.replace(/[^A-Za-z0-9_-]/g, "_");
  const stem =
    location.groupId === undefined
      ? `${moduleId}_${counter}`
      : [
          moduleId,
          sanitizePathPart(location.groupId),
          location.itemIndex ?? 0,
          sanitizePathPart(location.fieldKey),
          counter,
        ].join("_");
  return `${MODULE_MEDIA_SUBDIR}/${stem}.${safeExtension}`;
}

/**
 * Lists the photo_input / audio_notes_input fields of a custom protocol, i.e.
 * the media that lives inside module data_json instead of the points.photos /
 * points.audio_notes columns: top-level fields and the media sub-fields of
 * repeatable groups. Official protocols and shared-module sections
 * (moduleRef) carry no such fields.
 */
export async function getModuleMediaFields(
  protocolId: string,
  protocolSource: "official" | "custom",
): Promise<ModuleMediaField[]> {
  if (protocolSource !== "custom") return [];
  const customProtocolId = parseInt(protocolId, 10);
  if (isNaN(customProtocolId)) return [];

  const protocol = await getCustomProtocolById(customProtocolId);
  if (!protocol) return [];

  const fields: ModuleMediaField[] = [];
  for (const section of protocol.schema.sections) {
    if (section.moduleRef) continue;
    for (const field of section.fields) {
      if (field.type === "photo_input") {
        fields.push({ moduleId: section.id, fieldKey: field.key, kind: "photo" });
      } else if (field.type === "audio_notes_input") {
        fields.push({ moduleId: section.id, fieldKey: field.key, kind: "audio" });
      } else if (field.type === "repeatable_group") {
        // One level only: a nested repeatable_group inside itemFields is not
        // supported by the builder or the renderer, so it is not walked.
        for (const subField of field.itemFields ?? []) {
          if (subField.type === "photo_input") {
            fields.push({ moduleId: section.id, groupId: field.key, fieldKey: subField.key, kind: "photo" });
          } else if (subField.type === "audio_notes_input") {
            fields.push({ moduleId: section.id, groupId: field.key, fieldKey: subField.key, kind: "audio" });
          }
        }
      }
    }
  }
  return fields;
}

/**
 * Rewrites the media list stored in one value (a field of the module, or a
 * field of one group item). The value keeps the shape it had (JSON text or a
 * real array); entries whose mapper returns null are removed. Returns
 * undefined when the value is not a list, meaning "leave it untouched".
 */
async function mapMediaValue(
  raw: unknown,
  baseLocation: Omit<ModuleMediaLocation, "ordinal">,
  mapUri: MediaUriMapper,
): Promise<unknown> {
  const wasJsonText = typeof raw === "string";
  const list = wasJsonText ? parseJsonText<unknown[] | null>(raw, null) : raw;
  if (!Array.isArray(list)) return undefined;

  const mapped: unknown[] = [];
  for (let ordinal = 0; ordinal < list.length; ordinal++) {
    const entry = list[ordinal];
    const uri = typeof entry === "string" ? entry : (entry as { uri?: unknown } | null)?.uri;
    if (typeof uri !== "string" || uri.length === 0) continue;
    const replacement = await mapUri(uri, { ...baseLocation, ordinal }, entry);
    if (replacement === null) continue;
    mapped.push(typeof entry === "string" ? replacement : { ...(entry as object), uri: replacement });
  }
  return wasJsonText ? JSON.stringify(mapped) : mapped;
}

/**
 * Rewrites every media URI of the given fields inside one module's data_json:
 * top-level fields, and the media sub-fields of every item of a repeatable
 * group. Each value is kept in the shape it already had; an entry whose
 * mapper returns null is removed, but the group item that held it stays.
 * Fields or groups that are absent, or values that are not lists, are left
 * untouched.
 */
export async function mapModuleMediaUris(
  dataJson: string,
  fields: ModuleMediaField[],
  mapUri: MediaUriMapper,
): Promise<string> {
  const data = parseJsonText<Record<string, unknown> | null>(dataJson, null);
  if (!data || typeof data !== "object" || Array.isArray(data)) return dataJson;

  for (const field of fields) {
    if (field.groupId === undefined) {
      const next = await mapMediaValue(
        data[field.fieldKey],
        { moduleId: field.moduleId, fieldKey: field.fieldKey, kind: field.kind },
        mapUri,
      );
      if (next !== undefined) data[field.fieldKey] = next;
      continue;
    }

    const rawGroup = data[field.groupId];
    const groupWasJsonText = typeof rawGroup === "string";
    const items = groupWasJsonText ? parseJsonText<unknown[] | null>(rawGroup, null) : rawGroup;
    if (!Array.isArray(items)) continue;

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      const next = await mapMediaValue(
        record[field.fieldKey],
        {
          moduleId: field.moduleId,
          groupId: field.groupId,
          itemIndex,
          fieldKey: field.fieldKey,
          kind: field.kind,
        },
        mapUri,
      );
      if (next !== undefined) record[field.fieldKey] = next;
    }
    data[field.groupId] = groupWasJsonText ? JSON.stringify(items) : items;
  }

  return JSON.stringify(data);
}

export interface ListedModuleMedia {
  uri: string;
  kind: "photo" | "audio";
  location: ModuleMediaLocation;
  /** The original list entry: a uri string or an object such as an audio note. */
  entry: unknown;
}

/**
 * Lists every media reference found in one module's data_json (top-level and
 * group items) using the same traversal as mapModuleMediaUris, so media
 * discovery lives in one place.
 */
export async function listModuleMediaUris(
  dataJson: string,
  fields: ModuleMediaField[],
): Promise<ListedModuleMedia[]> {
  const listed: ListedModuleMedia[] = [];
  await mapModuleMediaUris(dataJson, fields, (uri, location, entry) => {
    listed.push({ uri, kind: location.kind, location, entry });
    return uri;
  });
  return listed;
}
