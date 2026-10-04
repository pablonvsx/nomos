import { File } from 'expo-file-system';
import { getDriveAccessToken } from '@/core/google-auth/google-auth-service';
import { withTimeout } from '@/core/net/network-timeout';
import { DriveTimeoutError } from '@/core/drive-sync/drive-errors';

export { DriveTimeoutError };

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

// Network limits. React Native's Android OkHttp client has none (timeouts of
// 0), so without these a stalled connection blocks the caller forever. A
// timeout surfaces as DriveTimeoutError, which backup (the point fails and
// nothing is written) and restore (everything is undone) already treat like
// any other failure.
//
// Metadata/JSON requests (folder lookups, listings, point and manifest JSON,
// a few KB to a few hundred KB): even on a poor mobile link (~50 kB/s) they
// finish well under 10 s, so 30 s leaves ample slack without keeping the
// person waiting on a dead connection.
export const DRIVE_METADATA_TIMEOUT_MS = 30_000;
// Media transfers (photos and audio, typically 1-10 MB; uploads are base64,
// ~33% larger): at a slow ~100 kB/s that is up to ~140 s, so 180 s lets a
// slow-but-working connection finish while still bounding a dead one.
export const DRIVE_TRANSFER_TIMEOUT_MS = 180_000;

/**
 * The single place that calls fetch. The limit covers the whole exchange -
 * `handle` runs inside it, so a body that stalls after the headers arrived
 * (response.json() / text()) is bounded too, and the abort signal cancels
 * the underlying request.
 */
async function driveRequest<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  handle: (response: Response) => Promise<T>,
): Promise<T> {
  return withTimeout(
    async (signal) => handle(await fetch(url, { ...init, signal })),
    timeoutMs,
    () => new DriveTimeoutError(timeoutMs),
  );
}

async function authHeaders(): Promise<Record<string, string>> {
  const accessToken = await getDriveAccessToken();
  return { Authorization: `Bearer ${accessToken}` };
}

async function parseDriveError(response: Response): Promise<never> {
  const body = await response.text();
  throw new Error(`Drive API error (${response.status}): ${body}`);
}

/** Standard handling of a JSON reply: Drive errors become exceptions. */
async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) await parseDriveError(response);
  return response.json();
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
}

export async function createFolder(name: string, parentId: string): Promise<DriveFile> {
  const headers = await authHeaders();
  return driveRequest(
    `${DRIVE_API_BASE}/files?fields=id,name,mimeType`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME_TYPE, parents: [parentId] }),
    },
    DRIVE_METADATA_TIMEOUT_MS,
    readJson<DriveFile>,
  );
}

export async function findChildByName(parentId: string, name: string): Promise<DriveFile | null> {
  const headers = await authHeaders();
  const escaped = name.replace(/'/g, "\\'");
  const query = encodeURIComponent(`'${parentId}' in parents and name = '${escaped}' and trashed = false`);
  const data = await driveRequest(
    `${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name,mimeType,modifiedTime)`,
    { headers },
    DRIVE_METADATA_TIMEOUT_MS,
    readJson<{ files?: DriveFile[] }>,
  );
  return data.files?.[0] ?? null;
}

export async function ensureFolder(name: string, parentId: string): Promise<string> {
  const existing = await findChildByName(parentId, name);
  if (existing) return existing.id;
  const created = await createFolder(name, parentId);
  return created.id;
}

export async function uploadJsonFile(name: string, parentId: string, content: unknown): Promise<DriveFile> {
  const headers = await authHeaders();
  const metadata = { name, parents: [parentId], mimeType: 'application/json' };
  const boundary = 'nomos-' + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(content)}\r\n--${boundary}--`;
  return driveRequest(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
    DRIVE_METADATA_TIMEOUT_MS,
    readJson<DriveFile>,
  );
}

export async function uploadBinaryFile(
  name: string,
  parentId: string,
  localUri: string,
  mimeType: string,
): Promise<DriveFile> {
  const headers = await authHeaders();
  // Uses the app's established expo-file-system File API (same one used
  // everywhere else since Fase 0), not the legacy readAsStringAsync
  // functional API - same result, consistent with the rest of the code.
  const base64Content = await new File(localUri).base64();
  const metadata = { name, parents: [parentId], mimeType };
  const boundary = 'nomos-' + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64Content}\r\n--${boundary}--`;
  return driveRequest(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
    DRIVE_TRANSFER_TIMEOUT_MS,
    readJson<DriveFile>,
  );
}

export async function updateJsonFile(fileId: string, content: unknown): Promise<DriveFile> {
  const headers = await authHeaders();
  return driveRequest(
    `${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=media&fields=id,name,mimeType,modifiedTime`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(content),
    },
    DRIVE_METADATA_TIMEOUT_MS,
    readJson<DriveFile>,
  );
}

export async function updateBinaryFile(
  fileId: string,
  localUri: string,
  mimeType: string,
): Promise<DriveFile> {
  const headers = await authHeaders();
  // Simple media update (like updateJsonFile), not multipart - no need for
  // the base64 + Content-Transfer-Encoding dance uploadBinaryFile uses,
  // since a plain PATCH body can carry raw bytes directly.
  const bytes = await new File(localUri).bytes();
  return driveRequest(
    `${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=media&fields=id,name,mimeType,modifiedTime`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': mimeType },
      body: bytes,
    },
    DRIVE_TRANSFER_TIMEOUT_MS,
    readJson<DriveFile>,
  );
}

export async function readJsonFile<T = unknown>(fileId: string): Promise<T> {
  const headers = await authHeaders();
  return driveRequest(
    `${DRIVE_API_BASE}/files/${fileId}?alt=media`,
    { headers },
    DRIVE_METADATA_TIMEOUT_MS,
    readJson<T>,
  );
}

export async function listChildren(parentId: string): Promise<DriveFile[]> {
  const headers = await authHeaders();
  const query = encodeURIComponent(`'${parentId}' in parents and trashed = false`);
  const data = await driveRequest(
    `${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name,mimeType,modifiedTime)&pageSize=1000`,
    { headers },
    DRIVE_METADATA_TIMEOUT_MS,
    readJson<{ files?: DriveFile[] }>,
  );
  return data.files ?? [];
}

export async function downloadBinaryFile(fileId: string, destinationUri: string): Promise<void> {
  const headers = await authHeaders();
  // Uses the app's established expo-file-system File API (same one used
  // for uploads since Fase 6), not the legacy downloadAsync functional
  // API - File.downloadFileAsync accepts custom headers too, so Bearer
  // auth works the same way.
  //
  // File.downloadFileAsync takes no AbortSignal and has no cancel handle
  // (DownloadOptions is just headers + idempotent), so it is raced against a
  // timer: the caller stops waiting at the limit, but the native download
  // cannot be cancelled and may keep running (on Android it uses a plain
  // OkHttpClient, whose 10 s per-read default still ends a truly dead
  // socket). If it finishes late it writes into a file the failed restore is
  // already cleaning up, which is harmless.
  await withTimeout(
    () =>
      File.downloadFileAsync(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, new File(destinationUri), {
        headers,
        idempotent: true,
      }),
    DRIVE_TRANSFER_TIMEOUT_MS,
    () => new DriveTimeoutError(DRIVE_TRANSFER_TIMEOUT_MS),
  );
}
