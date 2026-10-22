import { getCustomProtocolById } from "@/db/queries/custom-protocols";
import { PACKAGE_MEDIA_PREFIX, type ModuleMediaLocation } from "@/core/project-sharing/module-media";
import {
  AUDIO_FILE_PREFIX,
  AUDIO_FOLDER,
  MEDIA_FOLDER,
  PHOTOS_FOLDER,
  PHOTO_FILE_PREFIX,
  groupFolderName,
  itemFolderName,
  sanitizeDriveName,
  sectionFolderName,
  uniqueDriveName,
} from "@/core/drive-sync/drive-layout";
import type { CustomProtocolSchema } from "@/types/database";

/**
 * Where each media file of a point goes on Drive, as a path relative to the
 * point's folder. Drive-specific on purpose: the collaborators' zip names the
 * same files differently (module-media.ts, left untouched), and the Drive
 * layout is meant to be read by people, so it uses the protocol's own titles
 * and labels instead of ids.
 */

export interface MediaLabels {
  sectionId: string;
  sectionTitle: string;
  groupKey?: string;
  groupLabel?: string;
  fieldKey: string;
  fieldLabel: string;
}

export type MediaLabelIndex = Map<string, MediaLabels>;

function labelKey(moduleId: string, groupId: string | undefined, fieldKey: string): string {
  return `${moduleId}|${groupId ?? ""}|${fieldKey}`;
}

/** Section title, group label and field label of every photo / audio field of a custom protocol. */
export function buildMediaLabelIndex(schema: CustomProtocolSchema): MediaLabelIndex {
  const index: MediaLabelIndex = new Map();
  for (const section of schema.sections) {
    if (section.moduleRef) continue;
    for (const field of section.fields) {
      if (field.type === "photo_input" || field.type === "audio_notes_input") {
        index.set(labelKey(section.id, undefined, field.key), {
          sectionId: section.id,
          sectionTitle: section.title,
          fieldKey: field.key,
          fieldLabel: field.label,
        });
      } else if (field.type === "repeatable_group") {
        for (const sub of field.itemFields ?? []) {
          if (sub.type !== "photo_input" && sub.type !== "audio_notes_input") continue;
          index.set(labelKey(section.id, field.key, sub.key), {
            sectionId: section.id,
            sectionTitle: section.title,
            groupKey: field.key,
            groupLabel: field.label,
            fieldKey: sub.key,
            fieldLabel: sub.label,
          });
        }
      }
    }
  }
  return index;
}

/** Empty for official protocols (their media lives in the point's own columns). */
export async function loadMediaLabelIndex(
  protocolId: string,
  protocolSource: "official" | "custom",
): Promise<MediaLabelIndex> {
  if (protocolSource !== "custom") return new Map();
  const id = parseInt(protocolId, 10);
  if (isNaN(id)) return new Map();
  const protocol = await getCustomProtocolById(id);
  return protocol ? buildMediaLabelIndex(protocol.schema) : new Map();
}

function extensionOf(uri: string, fallback: string): string {
  const extension = uri.split(".").pop();
  return extension && extension.length <= 5 && !extension.includes("/") ? extension : fallback;
}

export interface DriveMediaPathAllocator {
  pointPhoto(uri: string, index: number): string;
  pointAudio(uri: string, index: number): string;
  moduleMedia(location: ModuleMediaLocation, uri: string): string;
}

/**
 * Hands out the relative paths of ONE point's media. It remembers the names
 * already given so that two sections, groups, fields or files that would end
 * up with the same name inside one folder get told apart (Drive allows
 * repeated names, which would make a lookup by name ambiguous). Deterministic:
 * the same media visited in the same order always gets the same paths, so a
 * retry reuses the folders and files of the first attempt.
 */
export function createDriveMediaPathAllocator(labels: MediaLabelIndex): DriveMediaPathAllocator {
  // Sibling names already used, per folder path.
  const takenByFolder = new Map<string, Set<string>>();
  const takenIn = (folderPath: string): Set<string> => {
    let taken = takenByFolder.get(folderPath);
    if (!taken) takenByFolder.set(folderPath, (taken = new Set()));
    return taken;
  };
  // Resolved names, so every file of one section/group/field lands together.
  const resolved = new Map<string, string>();
  const resolveOnce = (cacheKey: string, make: () => string): string => {
    let name = resolved.get(cacheKey);
    if (name === undefined) resolved.set(cacheKey, (name = make()));
    return name;
  };

  return {
    pointPhoto: (uri, index) =>
      `${MEDIA_FOLDER}/${PHOTOS_FOLDER}/${PHOTO_FILE_PREFIX}_${index + 1}.${extensionOf(uri, "jpg")}`,
    pointAudio: (uri, index) =>
      `${MEDIA_FOLDER}/${AUDIO_FOLDER}/${AUDIO_FILE_PREFIX}_${index + 1}.${extensionOf(uri, "m4a")}`,

    moduleMedia(location, uri) {
      const found = labels.get(labelKey(location.moduleId, location.groupId, location.fieldKey));
      const mediaTaken = takenIn(MEDIA_FOLDER);

      // media/section_<title>/ or media/group_<title>/
      const topFolder =
        location.groupId === undefined
          ? resolveOnce(`section|${location.moduleId}`, () =>
              uniqueDriveName(sectionFolderName(found?.sectionTitle ?? location.moduleId), location.moduleId, mediaTaken),
            )
          : resolveOnce(`group|${location.moduleId}|${location.groupId}`, () =>
              uniqueDriveName(groupFolderName(found?.groupLabel ?? location.groupId!), location.groupId!, mediaTaken),
            );
      let folderPath = `${MEDIA_FOLDER}/${topFolder}`;
      if (location.groupId !== undefined) folderPath += `/${itemFolderName(location.itemIndex ?? 0)}`;

      // <field label>_<n>.<ext>; the label part is unique per field in this folder.
      const fieldBase = resolveOnce(`field|${folderPath}|${location.fieldKey}`, () =>
        uniqueDriveName(
          sanitizeDriveName(found?.fieldLabel ?? location.fieldKey),
          location.fieldKey,
          takenIn(`${folderPath}|fields`),
        ),
      );
      const stem = uniqueDriveName(`${fieldBase}_${location.ordinal + 1}`, location.fieldKey, takenIn(folderPath));
      return `${folderPath}/${stem}.${extensionOf(uri, location.kind === "audio" ? "m4a" : "jpg")}`;
    },
  };
}

/** `package-media:<relative path>` - the marker written into module data on Drive. */
export function toDriveMediaMarker(relativePath: string): string {
  return `${PACKAGE_MEDIA_PREFIX}${relativePath}`;
}

/** The relative path inside a marker, or null when the value is not a marker. */
export function fromDriveMediaMarker(value: string): string | null {
  return value.startsWith(PACKAGE_MEDIA_PREFIX) ? value.slice(PACKAGE_MEDIA_PREFIX.length) : null;
}

export function splitRelativePath(relativePath: string): string[] {
  return relativePath.split("/").filter((segment) => segment.length > 0);
}
