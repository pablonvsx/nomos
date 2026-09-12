import {
  createFolder,
  findChildByName,
  listChildren,
  uploadJsonFile,
  updateJsonFile,
  readJsonFile,
  type DriveFile,
} from './drive-api-client';
import { generateUuid } from '@/utils/uuid';
import { createProject, setProjectCollaborative } from '@/db/queries/projects';
import {
  getCustomProtocolById,
  getCustomProtocolByUuid,
  setCustomProtocolUuid,
  createCustomProtocolFromPackage,
} from '@/db/queries/custom-protocols';
import type { CustomProtocolSchema } from '@/types/database';

export interface ProjectManifest {
  project_uuid: string;
  project_name: string;
  protocol_id: string;
  protocol_source: 'official' | 'custom';
  drive_ids?: {
    submissions_folder_id: string;
    approved_folder_id: string;
  };
}

// manifest.json written before this field was standardized to snake_case
// used camelCase keys here - accept either on read, always write the new
// shape from here on so old projects migrate silently on their next write.
function normalizeDriveIds(raw: unknown): ProjectManifest['drive_ids'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, string | undefined>;
  const submissions_folder_id = obj.submissions_folder_id ?? obj.submissionsFolderId;
  const approved_folder_id = obj.approved_folder_id ?? obj.approvedFolderId;
  if (!submissions_folder_id || !approved_folder_id) return undefined;
  return { submissions_folder_id, approved_folder_id };
}

const NOMOS_ROOT_FOLDER_NAME = 'Nomos';

async function ensureNomosRootFolder(): Promise<string> {
  const existing = await findChildByName('root', NOMOS_ROOT_FOLDER_NAME);
  if (existing) return existing.id;
  const created = await createFolder(NOMOS_ROOT_FOLDER_NAME, 'root');
  return created.id;
}

export async function ensureFolder(name: string, parentId: string): Promise<string> {
  const existing = await findChildByName(parentId, name);
  if (existing) return existing.id;
  const created = await createFolder(name, parentId);
  return created.id;
}

export interface CreateCollaborativeProjectParams {
  projectName: string;
  protocolId: string;
  protocolSource: 'official' | 'custom';
}

export interface CreateCollaborativeProjectResult {
  driveFolderId: string;
  manifest: ProjectManifest;
}

export interface CustomProtocolPackage {
  uuid: string;
  name: string;
  theme: string;
  schema: CustomProtocolSchema; // Only this app produces/consumes this file, so no need for `unknown`.
}

export async function uploadProtocolPackage(
  driveFolderId: string,
  pkg: CustomProtocolPackage
): Promise<void> {
  const existing = await findChildByName(driveFolderId, 'protocol-package.json');
  if (existing) {
    await updateJsonFile(existing.id, pkg);
  } else {
    await uploadJsonFile('protocol-package.json', driveFolderId, pkg);
  }
}

export async function getProtocolPackage(
  driveFolderId: string
): Promise<CustomProtocolPackage | null> {
  const file = await findChildByName(driveFolderId, 'protocol-package.json');
  if (!file) return null;
  return readJsonFile<CustomProtocolPackage>(file.id);
}

export async function createCollaborativeProjectStructure(
  params: CreateCollaborativeProjectParams
): Promise<CreateCollaborativeProjectResult> {
  const rootFolderId = await ensureNomosRootFolder();
  const projectUuid = generateUuid();

  const projectFolder = await createFolder(
    `Nomos_${params.projectName}_${projectUuid}`,
    rootFolderId
  );
  const submissionsFolder = await createFolder('submissions', projectFolder.id);
  const approvedFolder = await createFolder('approved', projectFolder.id);

  const manifest: ProjectManifest = {
    project_uuid: projectUuid,
    project_name: params.projectName,
    protocol_id: params.protocolId,
    protocol_source: params.protocolSource,
    drive_ids: {
      submissions_folder_id: submissionsFolder.id,
      approved_folder_id: approvedFolder.id,
    },
  };
  await uploadJsonFile('manifest.json', projectFolder.id, manifest);

  if (params.protocolSource === 'custom') {
    const protocol = await getCustomProtocolById(Number(params.protocolId));
    if (!protocol) {
      throw new Error('Protocolo personalizado deste projeto não encontrado localmente.');
    }
    let protocolUuid = protocol.uuid;
    if (!protocolUuid) {
      protocolUuid = generateUuid();
      await setCustomProtocolUuid(protocol.id, protocolUuid);
    }
    await uploadProtocolPackage(projectFolder.id, {
      uuid: protocolUuid,
      name: protocol.name,
      theme: protocol.theme,
      schema: protocol.schema,
    });
  }

  return { driveFolderId: projectFolder.id, manifest };
}

export async function getManifest(driveFolderId: string): Promise<ProjectManifest> {
  const manifestFile = await findChildByName(driveFolderId, 'manifest.json');
  if (!manifestFile) throw new Error('manifest.json não encontrado na pasta do projeto.');
  const raw = await readJsonFile<ProjectManifest>(manifestFile.id);
  return { ...raw, drive_ids: normalizeDriveIds(raw.drive_ids) };
}

export async function updateManifest(driveFolderId: string, manifest: ProjectManifest): Promise<void> {
  const manifestFile = await findChildByName(driveFolderId, 'manifest.json');
  if (!manifestFile) throw new Error('manifest.json não encontrado na pasta do projeto.');
  await updateJsonFile(manifestFile.id, manifest);
}

export interface ProjectDriveIds {
  submissions_folder_id: string;
  approved_folder_id: string;
}

export async function resolveProjectDriveIds(
  driveFolderId: string,
  manifest: ProjectManifest
): Promise<ProjectDriveIds> {
  if (manifest.drive_ids?.submissions_folder_id && manifest.drive_ids?.approved_folder_id) {
    return manifest.drive_ids;
  }
  const submissions_folder_id = await ensureFolder('submissions', driveFolderId);
  const approved_folder_id = await ensureFolder('approved', driveFolderId);
  const updatedManifest: ProjectManifest = {
    ...manifest,
    drive_ids: { submissions_folder_id, approved_folder_id },
  };
  await updateManifest(driveFolderId, updatedManifest);
  return updatedManifest.drive_ids!;
}

export interface SharedProjectOption {
  driveFolderId: string;
  manifest: ProjectManifest;
}

export async function listOwnNomosProjectFolders(): Promise<DriveFile[]> {
  const rootId = await ensureNomosRootFolder();
  const children = await listChildren(rootId);
  return children.filter(
    (f) => f.mimeType === 'application/vnd.google-apps.folder' && f.name.startsWith('Nomos_')
  );
}

// Single-owner model: the only projects the app ever needs to discover on
// Drive are the ones this account itself created (to restore/sync them on
// another of its own devices) - there is no more "shared by someone else"
// case to merge in.
export async function listAllDriveProjects(): Promise<SharedProjectOption[]> {
  const ownFolders = await listOwnNomosProjectFolders();

  const results: SharedProjectOption[] = [];
  for (const folder of ownFolders) {
    try {
      const manifest = await getManifest(folder.id);
      results.push({ driveFolderId: folder.id, manifest });
    } catch {
      // pasta sem manifest.json válido, ignora
    }
  }
  return results;
}

// Restores a project this account already made collaborative, onto another
// of its own devices.
export async function joinAndCreateLocalProject(
  driveFolderId: string,
): Promise<{ projectId: number; manifest: ProjectManifest }> {
  const manifest = await getManifest(driveFolderId);

  let localProtocolId = manifest.protocol_id;
  if (manifest.protocol_source === 'custom') {
    const pkg = await getProtocolPackage(driveFolderId);
    if (!pkg) {
      throw new Error('Protocolo personalizado deste projeto não encontrado no Drive.');
    }
    const existingLocal = await getCustomProtocolByUuid(pkg.uuid);
    localProtocolId = String(
      existingLocal ? existingLocal.id : await createCustomProtocolFromPackage(pkg)
    );
  }

  const newId = await createProject(manifest.project_name, localProtocolId, "", manifest.protocol_source);
  if (!newId) throw new Error("Local project creation failed");
  await setProjectCollaborative(newId, driveFolderId);
  return { projectId: newId, manifest };
}
