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
  parents?: string[];
  modifiedTime?: string;
}

export async function createFolder(name: string, parentId?: string): Promise<DriveFile> {
  const headers = await authHeaders();
  const response = await fetch(`${DRIVE_API_BASE}/files?fields=id,name,mimeType,parents`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME_TYPE,
      parents: parentId ? [parentId] : undefined,
    }),
  });
  if (!response.ok) await parseDriveError(response);
  return response.json();
}

export async function findChildByName(parentId: string, name: string): Promise<DriveFile | null> {
  const headers = await authHeaders();
  const escaped = name.replace(/'/g, "\\'");
  const query = encodeURIComponent(`'${parentId}' in parents and name = '${escaped}' and trashed = false`);
  const response = await fetch(
    `${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name,mimeType,parents,modifiedTime)`,
    { headers }
  );
  if (!response.ok) await parseDriveError(response);
  const data = await response.json();
  return data.files?.[0] ?? null;
}

export async function listChildren(parentId: string): Promise<DriveFile[]> {
  const headers = await authHeaders();
  const query = encodeURIComponent(`'${parentId}' in parents and trashed = false`);
  const response = await fetch(
    `${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name,mimeType,parents,modifiedTime)&pageSize=1000`,
    { headers }
  );
  if (!response.ok) await parseDriveError(response);
  const data = await response.json();
  return data.files ?? [];
}

export async function uploadJsonFile(name: string, parentId: string, content: unknown): Promise<DriveFile> {
  const headers = await authHeaders();
  const metadata = { name, parents: [parentId], mimeType: 'application/json' };
  const boundary = 'nomos-boundary-' + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${JSON.stringify(content)}\r\n` +
    `--${boundary}--`;

  const response = await fetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,parents`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }
  );
  if (!response.ok) await parseDriveError(response);
  return response.json();
}

export async function updateJsonFile(fileId: string, content: unknown): Promise<DriveFile> {
  const headers = await authHeaders();
  const response = await fetch(
    `${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=media&fields=id,name,mimeType,parents`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(content),
    }
  );
  if (!response.ok) await parseDriveError(response);
  return response.json();
}

export async function readJsonFile<T = unknown>(fileId: string): Promise<T> {
  const headers = await authHeaders();
  const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, { headers });
  if (!response.ok) await parseDriveError(response);
  return response.json();
}

export async function shareWithEmail(
  fileId: string,
  email: string,
  role: 'writer' | 'reader' = 'writer'
): Promise<void> {
  const headers = await authHeaders();
  const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}/permissions`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'user', role, emailAddress: email }),
  });
  if (!response.ok) await parseDriveError(response);
}

export async function setAnyoneWithLinkPermission(fileId: string, role: 'writer' | 'reader'): Promise<void> {
  const headers = await authHeaders();
  const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}/permissions`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'anyone', role }),
  });
  if (!response.ok) await parseDriveError(response);
}

export async function revokeAnyoneWithLinkPermission(fileId: string): Promise<void> {
  const headers = await authHeaders();
  const listResponse = await fetch(
    `${DRIVE_API_BASE}/files/${fileId}/permissions?fields=permissions(id,type)`,
    { headers }
  );
  if (!listResponse.ok) await parseDriveError(listResponse);
  const { permissions } = await listResponse.json();
  const anyonePermission = permissions?.find((p: { type: string }) => p.type === 'anyone');
  if (!anyonePermission) return;
  const deleteResponse = await fetch(
    `${DRIVE_API_BASE}/files/${fileId}/permissions/${anyonePermission.id}`,
    { method: 'DELETE', headers }
  );
  if (!deleteResponse.ok) await parseDriveError(deleteResponse);
}
