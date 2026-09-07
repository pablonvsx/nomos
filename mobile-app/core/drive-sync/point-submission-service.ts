import { getPoint, updatePoint } from '@/db/queries/points';
import { getProjectById } from '@/db/queries/projects';
import { buildPointWithModules, buildPointEnvelope } from '@/db/mappers/point.mapper';
import { getCurrentGoogleAccount } from '@/core/google-auth/google-auth-service';
import { getManifest, ensureFolder } from './project-drive-service';
import { uploadJsonFile, updateJsonFile, findChildByName, uploadBinaryFile } from './drive-api-client';
import type { ProtocolRegistry } from '@/protocol-kernel/types';

function basename(uri: string): string {
  return uri.split('/').pop() ?? uri;
}

function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'heic') return 'image/heic';
  return 'image/jpeg';
}

export async function submitPointToProject(
  pointId: string,
  projectId: number,
  registry: ProtocolRegistry,
): Promise<{ status: 'approved' | 'pending' }> {
  const project = await getProjectById(projectId);
  if (!project || !project.drive_folder_id) {
    throw new Error('Este projeto não está vinculado a uma pasta do Google Drive.');
  }

  const result = await getPoint(pointId);
  if (!result) {
    throw new Error('Ponto de coleta não encontrado.');
  }
  const { point, modules } = result;

  const manifest = await getManifest(project.drive_folder_id);

  const account = getCurrentGoogleAccount();
  if (!account) {
    throw new Error('Nenhuma conta Google conectada.');
  }

  const member = manifest.members.find((m) => m.email === account.email);
  const effectiveAutoApprove =
    member?.auto_approve === 'true' ? true
      : member?.auto_approve === 'false' ? false
      : manifest.auto_approve_default;

  const pointWithModules = buildPointWithModules(point, modules, registry);
  const envelope = buildPointEnvelope(pointWithModules);
  const localPhotoUris = envelope.photos ?? [];

  if (localPhotoUris.length > 0) {
    const mediaFolderId = await ensureFolder('media', project.drive_folder_id);
    const pointMediaFolderId = await ensureFolder(point.id, mediaFolderId);
    for (const uri of localPhotoUris) {
      const name = basename(uri);
      await uploadBinaryFile(name, pointMediaFolderId, uri, guessMimeType(name));
    }
  }
  envelope.photos = localPhotoUris.map(basename);

  const status: 'approved' | 'pending' = effectiveAutoApprove ? 'approved' : 'pending';
  const targetFolderId = status === 'approved'
    ? await ensureFolder('approved', project.drive_folder_id)
    : await ensureFolder(account.email, await ensureFolder('submissions', project.drive_folder_id));

  const payload = {
    ...envelope,
    submitted_by: account.email,
    submitted_at: new Date().toISOString(),
  };
  const fileName = `${point.id}.json`;
  const existingFile = await findChildByName(targetFolderId, fileName);
  if (existingFile) {
    await updateJsonFile(existingFile.id, payload);
  } else {
    await uploadJsonFile(fileName, targetFolderId, payload);
  }

  await updatePoint(pointId, {
    approval_status: status,
    created_by: point.created_by ?? account.email,
  });

  return { status };
}
