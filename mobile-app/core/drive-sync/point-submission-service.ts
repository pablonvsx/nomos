import { getPoint, updatePoint } from '@/db/queries/points';
import { getProjectById } from '@/db/queries/projects';
import { buildPointWithModules, buildPointEnvelope } from '@/db/mappers/point.mapper';
import { getCurrentGoogleAccount } from '@/core/google-auth/google-auth-service';
import { getManifest, ensureFolder, resolveProjectDriveIds } from './project-drive-service';
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
): Promise<{ status: 'approved' | 'pending' | 'updated' }> {
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
  const { submissions_folder_id: submissionsFolderId, approved_folder_id: approvedFolderId } = await resolveProjectDriveIds(project.drive_folder_id, manifest);

  const account = getCurrentGoogleAccount();
  if (!account) {
    throw new Error('Nenhuma conta Google conectada.');
  }

  const isAdmin = manifest.members.some(
    (m) => m.email === account.email && m.role === 'admin'
  );
  const isOwner = point.created_by === account.email || point.created_by === null;
  // created_by null cobre pontos locais criados antes desta checagem existir
  // (ou nunca submetidos por ninguém ainda) - tratar como próprios do usuário
  // atual para não travar o uso normal do app.
  if (!isOwner && !isAdmin) {
    throw new Error('Você não tem permissão para enviar este ponto.');
  }

  const pointWithModules = buildPointWithModules(point, modules, registry);
  const envelope = buildPointEnvelope(pointWithModules);
  const localPhotoUris = envelope.photos ?? [];

  if (localPhotoUris.length > 0) {
    const mediaFolderId = await ensureFolder('media', project.drive_folder_id);
    const pointMediaFolderId = await ensureFolder(point.id, mediaFolderId);
    for (const uri of localPhotoUris) {
      const name = basename(uri);
      const existingPhoto = await findChildByName(pointMediaFolderId, name);
      if (existingPhoto) continue;
      await uploadBinaryFile(name, pointMediaFolderId, uri, guessMimeType(name));
    }
  }
  envelope.photos = localPhotoUris.map(basename);

  const fileName = `${point.id}.json`;

  // A point that's already approved skips the auto-approval decision
  // entirely - it's a correction to content already live in approved/, not a
  // new submission.
  if (point.approval_status === 'approved') {
    const payload = {
      ...envelope,
      approval_status: 'approved',
      submitted_by: account.email,
      submitted_at: new Date().toISOString(),
    };
    const existingFile = await findChildByName(approvedFolderId, fileName);
    const writtenFile = existingFile
      ? await updateJsonFile(existingFile.id, payload)
      : await uploadJsonFile(fileName, approvedFolderId, payload);

    await updatePoint(pointId, {
      approval_status: 'approved',
      drive_synced_at: writtenFile.modifiedTime ?? new Date().toISOString(),
    });

    return { status: 'updated' };
  }

  const member = manifest.members.find((m) => m.email === account.email);
  const effectiveAutoApprove =
    member?.auto_approve === 'true' ? true
      : member?.auto_approve === 'false' ? false
      : manifest.auto_approve_default;

  const status: 'approved' | 'pending' = effectiveAutoApprove ? 'approved' : 'pending';
  const targetFolderId = status === 'approved'
    ? approvedFolderId
    : await ensureFolder(account.email, submissionsFolderId);

  const payload = {
    ...envelope,
    approval_status: status,
    submitted_by: account.email,
    submitted_at: new Date().toISOString(),
  };
  const existingFile = await findChildByName(targetFolderId, fileName);
  const writtenFile = existingFile
    ? await updateJsonFile(existingFile.id, payload)
    : await uploadJsonFile(fileName, targetFolderId, payload);

  await updatePoint(pointId, {
    approval_status: status,
    created_by: point.created_by ?? account.email,
    // Only meaningful once the content is actually live in approved/ - keeps
    // this device's own future syncs from re-flagging what it just wrote as
    // "newer" than what it has locally.
    drive_synced_at: status === 'approved' ? (writtenFile.modifiedTime ?? new Date().toISOString()) : undefined,
  });

  return { status };
}
