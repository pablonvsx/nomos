import { getDriveAccessToken } from '@/core/google-auth/google-auth-service';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

async function authHeaders(): Promise<Record<string, string>> {
  const accessToken = await getDriveAccessToken();
  return { Authorization: `Bearer ${accessToken}` };
}

async function parseDriveError(response: Response): Promise<never> {
  const body = await response.text();
  throw new Error(`Drive API error (${response.status}): ${body}`);
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
}

export async function createFolder(name: string, parentId: string): Promise<DriveFile> {
  const headers = await authHeaders();
  const response = await fetch(`${DRIVE_API_BASE}/files?fields=id,name,mimeType`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME_TYPE, parents: [parentId] }),
  });
  if (!response.ok) await parseDriveError(response);
  return response.json();
}

export async function findChildByName(parentId: string, name: string): Promise<DriveFile | null> {
  const headers = await authHeaders();
  const escaped = name.replace(/'/g, "\\'");
  const query = encodeURIComponent(`'${parentId}' in parents and name = '${escaped}' and trashed = false`);
  const response = await fetch(`${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name,mimeType,modifiedTime)`, { headers });
  if (!response.ok) await parseDriveError(response);
  const data = await response.json();
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
  const response = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!response.ok) await parseDriveError(response);
  return response.json();
}

export async function updateJsonFile(fileId: string, content: unknown): Promise<DriveFile> {
  const headers = await authHeaders();
  const response = await fetch(`${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=media&fields=id,name,mimeType,modifiedTime`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(content),
  });
  if (!response.ok) await parseDriveError(response);
  return response.json();
}

export async function readJsonFile<T = unknown>(fileId: string): Promise<T> {
  const headers = await authHeaders();
  const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, { headers });
  if (!response.ok) await parseDriveError(response);
  return response.json();
}

export async function listChildren(parentId: string): Promise<DriveFile[]> {
  const headers = await authHeaders();
  const query = encodeURIComponent(`'${parentId}' in parents and trashed = false`);
  const response = await fetch(`${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name,mimeType,modifiedTime)&pageSize=1000`, { headers });
  if (!response.ok) await parseDriveError(response);
  const data = await response.json();
  return data.files ?? [];
}
