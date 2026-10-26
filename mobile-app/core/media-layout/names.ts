/**
 * The names every media tree in the app is made of, and the rules that turn
 * data (a section title, a group label, a field label) into safe folder and
 * file names. ONE place for all three outputs that put a point's media in
 * folders: "Exportar mídia" (the zip people browse), the collaborator's points
 * package and the owner's Drive backup. Fixed names are lowercase English.
 * Pure and free of react-native, so it runs under the node jest setup.
 *
 *   photos/                      the point's own photos
 *   audio/                       the point's own audio notes
 *   section_<title>/             media fields of a protocol section
 *   group_<title>/item_01/       media of one repeatable-group item
 */

export const PHOTOS_FOLDER = "photos";
export const AUDIO_FOLDER = "audio";
export const SECTION_FOLDER_PREFIX = "section";
export const GROUP_FOLDER_PREFIX = "group";
export const ITEM_FOLDER_PREFIX = "item";
/** File names inside photos/ and audio/: photo_1.jpg, audio_1.m4a. */
export const PHOTO_FILE_PREFIX = "photo";
export const AUDIO_FILE_PREFIX = "audio";
/** Audio files of the human-readable export carry their recording time: audio_note_1_2026-05-01_10-30.m4a. */
export const DATED_AUDIO_FILE_PREFIX = "audio_note";

const SEPARATOR = "_";

/**
 * Titles and file base names are capped well below any file system's limit so
 * the full path stays comfortable when someone extracts the tree on Windows
 * (260 characters for the whole path).
 */
export const MAX_NAME_LENGTH = 40;
const FALLBACK_NAME = "unnamed";

/**
 * Makes text from the data (a protocol title, a field label, a collector code)
 * safe as a folder/file name: drops / \ : * ? " < > | and control characters,
 * collapses repeated whitespace and caps the length. Accents are kept - the
 * person reads these names.
 */
export function sanitizeName(name: string, maxLength: number = MAX_NAME_LENGTH): string {
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
 * `base_<key>_2`, `_3`... and records the result in `taken`. Names are compared
 * ignoring case so the tree also extracts cleanly on case-insensitive systems,
 * and the result never depends on anything but the order of the calls.
 */
export function uniqueName(base: string, key: string, taken: Set<string>): string {
  const claim = (candidate: string): boolean => {
    const folded = candidate.toLowerCase();
    if (taken.has(folded)) return false;
    taken.add(folded);
    return true;
  };

  if (claim(base)) return base;
  const withKey = `${base}${SEPARATOR}${sanitizeName(key)}`;
  if (claim(withKey)) return withKey;
  for (let counter = 2; ; counter++) {
    const candidate = `${withKey}${SEPARATOR}${counter}`;
    if (claim(candidate)) return candidate;
  }
}

/** `item_01` for the first item of a repeatable group. */
export function itemFolderName(itemIndex: number): string {
  return `${ITEM_FOLDER_PREFIX}${SEPARATOR}${String(itemIndex + 1).padStart(2, "0")}`;
}

export function sectionFolderName(title: string): string {
  return `${SECTION_FOLDER_PREFIX}${SEPARATOR}${sanitizeName(title)}`;
}

export function groupFolderName(title: string): string {
  return `${GROUP_FOLDER_PREFIX}${SEPARATOR}${sanitizeName(title)}`;
}

/** The extension of a uri/path, or `fallback` when it has none (or something that is not an extension). */
export function extensionOf(uri: string, fallback: string): string {
  const extension = uri.split(".").pop();
  return extension && extension.length <= 5 && !extension.includes("/") ? extension : fallback;
}

/** "2026-05-01_10-30" from a timestamp in ms; "" when there is none. */
export function recordingTimeTag(timestamp: number | undefined): string {
  if (!timestamp) return "";
  return new Date(timestamp).toISOString().replace("T", "_").replace(/:/g, "-").slice(0, 16);
}
