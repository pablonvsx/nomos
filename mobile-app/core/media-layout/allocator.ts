// The ONE implementation of "where does each media file of a point go", as a
// path relative to the point's media root. Each output picks its own root:
//   "Exportar mídia"        Point_<n>/
//   collaborator package    media/<point uuid>/
//   Drive backup            <point folder>/media/
// and gets the same tree under it. Pure: no database, no file system.

import { mediaLabelKey, type MediaLabelIndex } from "@/core/media-layout/labels";
import {
  AUDIO_FILE_PREFIX,
  AUDIO_FOLDER,
  DATED_AUDIO_FILE_PREFIX,
  PHOTOS_FOLDER,
  PHOTO_FILE_PREFIX,
  extensionOf,
  groupFolderName,
  itemFolderName,
  recordingTimeTag,
  sanitizeName,
  sectionFolderName,
  uniqueName,
} from "@/core/media-layout/names";

/** Where one media list was found in a module's data (see core/project-sharing/module-media.ts). */
export interface MediaLocation {
  moduleId: string;
  groupId?: string;
  itemIndex?: number;
  fieldKey: string;
  kind: "photo" | "audio";
  ordinal: number;
}

export interface MediaPathOptions {
  /**
   * "plain": audio_1.m4a. "dated": audio_note_1_2026-05-01_10-30.m4a, for the
   * export people browse (the recording time is part of the name there; the
   * package and the backup keep it in their own data instead).
   */
  audioNaming?: "plain" | "dated";
}

export interface MediaPathAllocator {
  pointPhoto(uri: string, index: number): string;
  pointAudio(uri: string, index: number, timestamp?: number): string;
  /** `timestamp` (audio) goes into the file name only with the "dated" naming. */
  moduleMedia(location: MediaLocation, uri: string, timestamp?: number): string;
}

/**
 * Hands out the paths of ONE point's media. It remembers the names already
 * given so that two sections, groups, fields or files that would end up with
 * the same name inside one folder are told apart. Deterministic: the same media
 * visited in the same order always gets the same paths, so a retry (a re-backup)
 * reuses the folders and files of the first attempt.
 *
 * A path only exists for a file that is actually handed in, so a folder is never
 * empty: callers create directories when they copy a file into them.
 */
export function createMediaPathAllocator(labels: MediaLabelIndex, options: MediaPathOptions = {}): MediaPathAllocator {
  const dated = options.audioNaming === "dated";

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
    pointPhoto: (uri, index) => `${PHOTOS_FOLDER}/${PHOTO_FILE_PREFIX}_${index + 1}.${extensionOf(uri, "jpg")}`,

    pointAudio: (uri, index, timestamp) => {
      const tag = dated ? recordingTimeTag(timestamp) : "";
      const stem = dated
        ? `${DATED_AUDIO_FILE_PREFIX}_${index + 1}${tag ? `_${tag}` : ""}`
        : `${AUDIO_FILE_PREFIX}_${index + 1}`;
      return `${AUDIO_FOLDER}/${stem}.${extensionOf(uri, "m4a")}`;
    },

    moduleMedia(location, uri, timestamp) {
      const found = labels.get(mediaLabelKey(location.moduleId, location.groupId, location.fieldKey));
      const rootTaken = takenIn("");

      // section_<title>/ or group_<title>/
      const topFolder =
        location.groupId === undefined
          ? resolveOnce(`section|${location.moduleId}`, () =>
              uniqueName(sectionFolderName(found?.sectionTitle ?? location.moduleId), location.moduleId, rootTaken),
            )
          : resolveOnce(`group|${location.moduleId}|${location.groupId}`, () =>
              uniqueName(groupFolderName(found?.groupLabel ?? location.groupId!), location.groupId!, rootTaken),
            );
      let folderPath = topFolder;
      if (location.groupId !== undefined) folderPath += `/${itemFolderName(location.itemIndex ?? 0)}`;

      // <field label>_<n>.<ext>; the label part is unique per field in this folder.
      const fieldBase = resolveOnce(`field|${folderPath}|${location.fieldKey}`, () =>
        uniqueName(sanitizeName(found?.fieldLabel ?? location.fieldKey), location.fieldKey, takenIn(`${folderPath}|fields`)),
      );
      const tag = dated && location.kind === "audio" ? recordingTimeTag(timestamp) : "";
      const stem = uniqueName(
        `${fieldBase}_${location.ordinal + 1}${tag ? `_${tag}` : ""}`,
        location.fieldKey,
        takenIn(folderPath),
      );
      return `${folderPath}/${stem}.${extensionOf(uri, location.kind === "audio" ? "m4a" : "jpg")}`;
    },
  };
}
