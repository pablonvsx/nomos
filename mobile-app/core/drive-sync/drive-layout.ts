/**
 * The folder and file names of the owner's Drive backup, and the rules that
 * turn data (point labels, protocol titles) into safe names. Every fixed name
 * lives here, in lowercase English like the ones already on Drive
 * (species-catalog, vegetation-classes, manifest.json), so changing the layout
 * is a one-file edit. Pure and free of react-native: runs under the node jest
 * setup.
 *
 *   approved/
 *     point_<label>_<uuid>/
 *       point.json
 *       media/                       the point's media tree, laid out by
 *                                    core/media-layout (photos/, audio/,
 *                                    section_<title>/, group_<title>/item_01/)
 *
 * The uuid suffix is the identity of a point. The label is only for the
 * person browsing Drive and stays frozen at the first backup.
 */

import { sanitizeName } from "@/core/media-layout/names";

/** Drive's mime type for a folder. */
export const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export const APPROVED_FOLDER = "approved";
export const POINT_FOLDER_PREFIX = "point";
export const POINT_JSON_FILENAME = "point.json";
export const MEDIA_FOLDER = "media";

const SEPARATOR = "_";

/**
 * The human-readable part of a point folder name: collector code plus number
 * ("ABCD-3"), or just the number when the point has no collector code. A
 * placeholder such as "?" is never written into a name.
 */
export function pointFolderLabel(point: { created_by?: string | null; point_number: number }): string {
  const code = point.created_by?.trim();
  return code ? `${code}-${point.point_number}` : String(point.point_number);
}

/** `point_<label>_<uuid>`. */
export function pointFolderName(label: string, uuid: string): string {
  return [POINT_FOLDER_PREFIX, sanitizeName(label), uuid].join(SEPARATOR);
}

const UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const POINT_FOLDER_REGEX = new RegExp(`^${POINT_FOLDER_PREFIX}${SEPARATOR}.+${SEPARATOR}(${UUID_PATTERN})$`);

/**
 * The uuid a point folder name ends with, or null when the name is not a
 * point folder (a stray folder somebody created in approved/). Only the
 * suffix matters: the label may have been edited by hand.
 */
export function parsePointFolderUuid(name: string): string | null {
  return POINT_FOLDER_REGEX.exec(name)?.[1] ?? null;
}
