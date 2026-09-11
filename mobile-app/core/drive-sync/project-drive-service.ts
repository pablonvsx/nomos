import {
  createFolder,
  findChildByName,
  listChildren,
  uploadJsonFile,
  updateJsonFile,
  readJsonFile,
  listSharedFolders,
  shareWithEmail,
  revokePermissionForEmail,
  type DriveFile,
} from './drive-api-client';
import { generateUuid } from '@/utils/uuid';
import { createProject, setProjectCollaborative } from '@/db/queries/projects';
import { upsertProjectMember } from '@/db/queries/project-members';
import {
  getCustomProtocolById,
  getCustomProtocolByUuid,
  setCustomProtocolUuid,
  createCustomProtocolFromPackage,
} from '@/db/queries/custom-protocols';
import type { CustomProtocolSchema } from '@/types/database';

export interface ProjectMemberEntry {
  email: string;
  role: 'admin' | 'collaborator';
  auto_approve: 'herda_projeto' | 'true' | 'false';
  collector_code: string;
}

export function deriveDefaultCollectorCode(email: string, existingCodes: string[]): string {
  const localPart = email.split('@')[0];
  const segments = localPart.split(/[._-]/).filter(Boolean);
  let base =
    segments.length >= 2
      ? (segments[0][0] + segments[1][0]).toUpperCase()
      : localPart.slice(0, 2).toUpperCase();

  if (!existingCodes.includes(base)) return base;

  let suffix = 2;
  while (existingCodes.includes(`${base}${suffix}`)) suffix++;
  return `${base}${suffix}`;
}

export interface ProjectManifest {
  project_uuid: string;
  project_name: string;
  protocol_id: string;
  protocol_source: 'official' | 'custom';
  auto_approve_default: boolean;
  members: ProjectMemberEntry[];
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
  creatorEmail: string;
  autoApproveDefault: boolean;
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
    auto_approve_default: params.autoApproveDefault,
    members: [{
      email: params.creatorEmail,
      role: 'admin',
      auto_approve: 'herda_projeto',
      collector_code: deriveDefaultCollectorCode(params.creatorEmail, []),
    }],
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

export async function isProjectAdmin(driveFolderId: string, email: string): Promise<boolean> {
  const manifest = await getManifest(driveFolderId);
  return manifest.members.some((m) => m.email === email && m.role === 'admin');
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

const MAX_MEMBER_WRITE_ATTEMPTS = 3;

function hasDuplicateCollectorCode(members: ProjectMemberEntry[]): boolean {
  const codes = members.map((m) => m.collector_code);
  return new Set(codes).size !== codes.length;
}

// Adds a new member with a freshly-derived collector_code, then re-reads the
// manifest to check whether a concurrent write (another invite, or someone
// else joining) raced this one and landed a member with the same code -
// there's no locking/ETag support in the Drive REST calls this app makes
// (updateJsonFile is an unconditional overwrite), so this is a detect-and-
// retry loop rather than a true guarantee: it closes the race window down to
// "between two manifest reads" instead of "the whole length of this
// operation", and gives up loudly after a few attempts rather than silently
// leaving two members sharing a code.
async function addMemberWithUniqueCode(
  driveFolderId: string,
  email: string,
  buildEntry: (collectorCode: string) => ProjectMemberEntry,
): Promise<ProjectManifest> {
  let manifest = await getManifest(driveFolderId);
  for (let attempt = 0; attempt < MAX_MEMBER_WRITE_ATTEMPTS; attempt++) {
    const collectorCode = deriveDefaultCollectorCode(email, manifest.members.map((m) => m.collector_code));
    const withNewMember: ProjectManifest = {
      ...manifest,
      members: [...manifest.members, buildEntry(collectorCode)],
    };
    await updateManifest(driveFolderId, withNewMember);

    manifest = await getManifest(driveFolderId);
    if (!hasDuplicateCollectorCode(manifest.members)) {
      return manifest;
    }
    // A concurrent write landed a colliding code between our read and write -
    // drop our own entry and retry, deriving against the freshest member list.
    manifest = { ...manifest, members: manifest.members.filter((m) => m.email !== email) };
  }
  throw new Error(
    'Não foi possível adicionar o colaborador devido a uma atualização concorrente no projeto. Tente novamente.',
  );
}

export async function inviteCollaboratorByEmail(
  driveFolderId: string,
  callerEmail: string,
  emailToInvite: string
): Promise<ProjectManifest> {
  const manifest = await getManifest(driveFolderId);

  const caller = manifest.members.find((m) => m.email === callerEmail);
  if (!caller || caller.role !== 'admin') {
    throw new Error('Apenas administradores podem convidar novos colaboradores.');
  }

  if (manifest.members.some((m) => m.email === emailToInvite)) {
    throw new Error('Essa pessoa já é membro do projeto.');
  }

  await shareWithEmail(driveFolderId, emailToInvite, 'writer');

  return addMemberWithUniqueCode(driveFolderId, emailToInvite, (collectorCode) => ({
    email: emailToInvite,
    role: 'collaborator',
    auto_approve: 'herda_projeto',
    collector_code: collectorCode,
  }));
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

export async function listAllDriveProjects(): Promise<SharedProjectOption[]> {
  const [ownFolders, sharedFolders] = await Promise.all([
    listOwnNomosProjectFolders(),
    listSharedFolders(),
  ]);
  const seen = new Set<string>();
  const uniqueFolders = [...ownFolders, ...sharedFolders].filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });

  const results: SharedProjectOption[] = [];
  for (const folder of uniqueFolders) {
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
    return addMemberWithUniqueCode(driveFolderId, userEmail, (collectorCode) => ({
      email: userEmail,
      role: 'collaborator',
      auto_approve: 'herda_projeto',
      collector_code: collectorCode,
    }));
  }
  return manifest;
}

export async function updateOwnCollectorCode(
  driveFolderId: string,
  callerEmail: string,
  email: string,
  newCode: string
): Promise<ProjectManifest> {
  if (callerEmail !== email) {
    throw new Error('Você só pode alterar o próprio código de coletor.');
  }
  const manifest = await getManifest(driveFolderId);
  const normalized = newCode.trim().toUpperCase();
  const taken = manifest.members.some(
    (m) => m.email !== email && m.collector_code === normalized
  );
  if (taken) throw new Error('Esse código já está em uso por outro membro.');

  const member = manifest.members.find((m) => m.email === email);
  if (!member) throw new Error('Membro não encontrado no projeto.');
  member.collector_code = normalized;

  await updateManifest(driveFolderId, manifest);

  // Re-check for a concurrent write that raced this one (e.g. someone else
  // picking/deriving the same code at nearly the same time) - unlike
  // addMemberWithUniqueCode, this code was chosen manually by the user, so
  // it's surfaced as an error asking them to pick another one rather than
  // silently auto-changed.
  const settled = await getManifest(driveFolderId);
  if (hasDuplicateCollectorCode(settled.members)) {
    throw new Error(
      'Esse código acabou de ser usado por outro membro ao mesmo tempo. Escolha outro código.',
    );
  }
  return settled;
}

export async function removeCollaborator(
  driveFolderId: string,
  emailToRemove: string,
  callerEmail: string
): Promise<ProjectManifest> {
  if (emailToRemove === callerEmail) {
    throw new Error('Você não pode remover a si mesmo do projeto.');
  }

  const manifest = await getManifest(driveFolderId);

  const caller = manifest.members.find((m) => m.email === callerEmail);
  if (!caller || caller.role !== 'admin') {
    throw new Error('Apenas administradores podem remover colaboradores.');
  }

  const target = manifest.members.find((m) => m.email === emailToRemove);
  if (!target) throw new Error('Membro não encontrado no projeto.');

  const remainingAdmins = manifest.members.filter(
    (m) => m.role === 'admin' && m.email !== emailToRemove
  );
  if (target.role === 'admin' && remainingAdmins.length === 0) {
    throw new Error('Não é possível remover o único administrador do projeto.');
  }

  manifest.members = manifest.members.filter((m) => m.email !== emailToRemove);
  await updateManifest(driveFolderId, manifest);
  await revokePermissionForEmail(driveFolderId, emailToRemove);

  return manifest;
}

export async function promoteToAdmin(
  driveFolderId: string,
  callerEmail: string,
  targetEmail: string
): Promise<ProjectManifest> {
  const manifest = await getManifest(driveFolderId);

  const caller = manifest.members.find((m) => m.email === callerEmail);
  if (!caller || caller.role !== 'admin') {
    throw new Error('Apenas administradores podem promover outros membros.');
  }

  const target = manifest.members.find((m) => m.email === targetEmail);
  if (!target) throw new Error('Membro não encontrado no projeto.');
  target.role = 'admin';

  await updateManifest(driveFolderId, manifest);
  return manifest;
}

export async function joinAndCreateLocalProject(
  driveFolderId: string,
  userEmail: string,
): Promise<{ projectId: number; manifest: ProjectManifest }> {
  const manifest = await joinCollaborativeProject(driveFolderId, userEmail);

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
  await setProjectCollaborative(newId, driveFolderId, manifest.auto_approve_default);
  for (const member of manifest.members) {
    await upsertProjectMember(newId, member.email, member.role, member.auto_approve, member.collector_code);
  }
  return { projectId: newId, manifest };
}
