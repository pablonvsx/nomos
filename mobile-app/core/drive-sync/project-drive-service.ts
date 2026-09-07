import {
  createFolder,
  findChildByName,
  uploadJsonFile,
  updateJsonFile,
  readJsonFile,
  listSharedFolders,
  shareWithEmail,
} from './drive-api-client';
import { generateUuid } from '@/utils/uuid';

export interface ProjectMemberEntry {
  email: string;
  role: 'admin' | 'collaborator';
  auto_approve: 'herda_projeto' | 'true' | 'false';
}

export interface ProjectManifest {
  project_uuid: string;
  project_name: string;
  protocol_id: string;
  protocol_source: 'official' | 'custom';
  auto_approve_default: boolean;
  members: ProjectMemberEntry[];
}

const NOMOS_ROOT_FOLDER_NAME = 'Nomos';

async function ensureNomosRootFolder(): Promise<string> {
  const existing = await findChildByName('root', NOMOS_ROOT_FOLDER_NAME);
  if (existing) return existing.id;
  const created = await createFolder(NOMOS_ROOT_FOLDER_NAME, 'root');
  return created.id;
}

export interface CreateCollaborativeProjectParams {
  projectName: string;
  protocolId: string;
  protocolSource: 'official' | 'custom';
  creatorEmail: string;
  autoApproveDefault: boolean;
}

export interface CreateCollaborativeProjectResult {
  driveFolderId: string;
  manifest: ProjectManifest;
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
  await createFolder('submissions', projectFolder.id);
  await createFolder('approved', projectFolder.id);

  const manifest: ProjectManifest = {
    project_uuid: projectUuid,
    project_name: params.projectName,
    protocol_id: params.protocolId,
    protocol_source: params.protocolSource,
    auto_approve_default: params.autoApproveDefault,
    members: [{ email: params.creatorEmail, role: 'admin', auto_approve: 'herda_projeto' }],
  };
  await uploadJsonFile('manifest.json', projectFolder.id, manifest);

  return { driveFolderId: projectFolder.id, manifest };
}

export async function getManifest(driveFolderId: string): Promise<ProjectManifest> {
  const manifestFile = await findChildByName(driveFolderId, 'manifest.json');
  if (!manifestFile) throw new Error('manifest.json não encontrado na pasta do projeto.');
  return readJsonFile<ProjectManifest>(manifestFile.id);
}

export async function updateManifest(driveFolderId: string, manifest: ProjectManifest): Promise<void> {
  const manifestFile = await findChildByName(driveFolderId, 'manifest.json');
  if (!manifestFile) throw new Error('manifest.json não encontrado na pasta do projeto.');
  await updateJsonFile(manifestFile.id, manifest);
}

export async function inviteCollaboratorByEmail(driveFolderId: string, email: string): Promise<void> {
  await shareWithEmail(driveFolderId, email, 'writer');
  const manifest = await getManifest(driveFolderId);
  if (!manifest.members.some((m) => m.email === email)) {
    manifest.members.push({ email, role: 'collaborator', auto_approve: 'herda_projeto' });
    await updateManifest(driveFolderId, manifest);
  }
}

export interface SharedProjectOption {
  driveFolderId: string;
  manifest: ProjectManifest;
}

export async function listAvailableSharedProjects(): Promise<SharedProjectOption[]> {
  const folders = await listSharedFolders();
  const results: SharedProjectOption[] = [];
  for (const folder of folders) {
    try {
      const manifest = await getManifest(folder.id);
      results.push({ driveFolderId: folder.id, manifest });
    } catch {
      // pasta sem manifest.json válido, ignora
    }
  }
  return results;
}

export async function joinCollaborativeProject(
  driveFolderId: string,
  userEmail: string
): Promise<ProjectManifest> {
  const manifest = await getManifest(driveFolderId);
  if (!manifest.members.some((m) => m.email === userEmail)) {
    manifest.members.push({ email: userEmail, role: 'collaborator', auto_approve: 'herda_projeto' });
    await updateManifest(driveFolderId, manifest);
  }
  return manifest;
}
