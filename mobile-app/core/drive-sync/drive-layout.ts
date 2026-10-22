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
 *       media/
 *         photos/                    the point's own photos
 *         audio/                     the point's own audio notes
 *         section_<title>/           media fields of a protocol section
 *         group_<title>/item_01/     media of one repeatable-group item
 *
 * The uuid suffix is the identity of a point. The label is only for the
 * person browsing Drive and stays frozen at the first backup.
 */

/** Drive's mime type for a folder. */
export const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export const APPROVED_FOLDER = "approved";
export const POINT_FOLDER_PREFIX = "point";
export const POINT_JSON_FILENAME = "point.json";
export const MEDIA_FOLDER = "media";
export const PHOTOS_FOLDER = "photos";
export const AUDIO_FOLDER = "audio";
export const SECTION_FOLDER_PREFIX = "section";
export const GROUP_FOLDER_PREFIX = "group";
export const ITEM_FOLDER_PREFIX = "item";
/** File names inside photos/ and audio/: photo_1.jpg, audio_1.m4a. */
export const PHOTO_FILE_PREFIX = "photo";
export const AUDIO_FILE_PREFIX = "audio";

const SEPARATOR = "_";
/**
 * Titles and file base names are capped well below Drive's limit so that the
 * full path stays comfortable when someone downloads the tree to Windows
 * (260 characters for the whole path).
 */
export const MAX_NAME_LENGTH = 40;
const FALLBACK_NAME = "unnamed";

/**
 * Makes text from the data (a protocol title, a field label, a collector code)
 * safe as a Drive/file-system name: drops / \ : * ? " < > | and control
 * characters, collapses repeated whitespace and caps the length. Accents are
 * kept - the person reads these names.
 */
export function sanitizeDriveName(name: string, maxLength: number = MAX_NAME_LENGTH): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
  return cleaned.length > 0 ? cleaned : FALLBACK_NAME;
}

/**
 * Returns `base` if no sibling uses it yet; otherwise `base_<key>`, then
 * `base_<key>_2`, `_3`... and records the result in `taken`. Drive accepts
 * repeated names, which would make a lookup by name ambiguous. Names are
 * compared ignoring case so the tree also extracts cleanly on
 * case-insensitive systems.
 */
export function uniqueDriveName(base: string, key: string, taken: Set<string>): string {
  const claim = (candidate: string): boolean => {
    const folded = candidate.toLowerCase();
    if (taken.has(folded)) return false;
    taken.add(folded);
    return true;
  };

  if (claim(base)) return base;
  const withKey = `${base}${SEPARATOR}${sanitizeDriveName(key)}`;
  if (claim(withKey)) return withKey;
  for (let counter = 2; ; counter++) {
    const candidate = `${withKey}${SEPARATOR}${counter}`;
    if (claim(candidate)) return candidate;
  }
}

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
  return [POINT_FOLDER_PREFIX, sanitizeDriveName(label), uuid].join(SEPARATOR);
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

/** `item_01` for the first item of a repeatable group. */
export function itemFolderName(itemIndex: number): string {
  return `${ITEM_FOLDER_PREFIX}${SEPARATOR}${String(itemIndex + 1).padStart(2, "0")}`;
}

export function sectionFolderName(title: string): string {
  return `${SECTION_FOLDER_PREFIX}${SEPARATOR}${sanitizeDriveName(title)}`;
}

export function groupFolderName(title: string): string {
  return `${GROUP_FOLDER_PREFIX}${SEPARATOR}${sanitizeDriveName(title)}`;
}
