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

// Single-owner model: whoever calls this already is the project's owner
// (see docs/12_COLLABORATION.md) - there is no other party to route a
// pending review through, so every push lands directly in approved/.
export async function submitPointToProject(
  pointId: string,
  projectId: number,
  registry: ProtocolRegistry,
): Promise<{ status: 'approved' | 'updated' }> {
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
  const { approved_folder_id: approvedFolderId } = await resolveProjectDriveIds(project.drive_folder_id, manifest);

  const account = getCurrentGoogleAccount();
  if (!account) {
    throw new Error('Nenhuma conta Google conectada.');
  }

  const pointWithModules = buildPointWithModules(point, modules, registry);
  const envelope = buildPointEnvelope(pointWithModules);
  const localPhotoUris = envelope.photos ?? [];
  const localAudioNotes = envelope.audioNotes ?? [];

  if (localPhotoUris.length > 0 || localAudioNotes.length > 0) {
    const mediaFolderId = await ensureFolder('media', project.drive_folder_id);
    const pointMediaFolderId = await ensureFolder(point.id, mediaFolderId);
    for (const uri of localPhotoUris) {
      const name = basename(uri);
      const existingPhoto = await findChildByName(pointMediaFolderId, name);
      if (existingPhoto) continue;
      await uploadBinaryFile(name, pointMediaFolderId, uri, guessMimeType(name));
    }
    for (const note of localAudioNotes) {
      const name = basename(note.uri);
      const existingAudio = await findChildByName(pointMediaFolderId, name);
      if (existingAudio) continue;
      await uploadBinaryFile(name, pointMediaFolderId, note.uri, 'audio/m4a');
    }
  }
  envelope.photos = localPhotoUris.map(basename);
  envelope.audioNotes = localAudioNotes.map((note) => ({ ...note, uri: basename(note.uri) }));

  const fileName = `${point.id}.json`;
  const wasAlreadyApproved = point.approval_status === 'approved';

  const payload = {
    ...envelope,
    approval_status: 'approved',
    collector_code: point.created_by ?? null,
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

  return { status: wasAlreadyApproved ? 'updated' : 'approved' };
}
