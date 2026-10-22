import { FOLDER_MIME_TYPE, parsePointFolderUuid } from "@/core/drive-sync/drive-layout";

/**
 * Folder ids learned while backing up a batch of points, so the same folder
 * is never looked up twice: approved/'s id, the point folders already in it
 * (listed once per batch, not once per point) and the subfolders met on the
 * way. Pure data, no Drive calls of its own.
 */
export interface DriveFolderCache {
  approvedFolderId: string | null;
  /** Point folders inside approved/ by lower-cased uuid; null until approved/ was listed. */
  pointFolders: Map<string, { id: string; name: string }> | null;
  /** Subfolder ids by `parentId/name`. */
  subfolders: Map<string, string>;
}

export function createDriveFolderCache(): DriveFolderCache {
  return { approvedFolderId: null, pointFolders: null, subfolders: new Map() };
}

export function subfolderKey(parentId: string, name: string): string {
  return `${parentId}/${name}`;
}

/**
 * Indexes the children of approved/ by point uuid, ignoring anything that is
 * not a point folder (loose files, folders somebody created by hand). If two
 * folders claim the same uuid the one with the smaller name wins, so every
 * run picks the same one.
 */
export function indexPointFolders(
  children: Array<{ id: string; name: string; mimeType: string }>,
): Map<string, { id: string; name: string }> {
  const index = new Map<string, { id: string; name: string }>();
  for (const child of [...children].sort((a, b) => a.name.localeCompare(b.name))) {
    if (child.mimeType !== FOLDER_MIME_TYPE) continue;
    const uuid = parsePointFolderUuid(child.name);
    if (!uuid) continue;
    const key = uuid.toLowerCase();
    if (!index.has(key)) index.set(key, { id: child.id, name: child.name });
  }
  return index;
}
