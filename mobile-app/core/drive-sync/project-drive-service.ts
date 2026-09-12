import { File, Paths } from 'expo-file-system';
import {
  createFolder,
  findChildByName,
  listChildren,
  uploadJsonFile,
  updateJsonFile,
  readJsonFile,
  downloadBinaryFile,
  type DriveFile,
} from './drive-api-client';
import { generateUuid } from '@/utils/uuid';
import { createProject, setProjectCollaborative, getProjectById } from '@/db/queries/projects';
import { createPoint } from '@/db/queries/points';
import {
  getCustomProtocolById,
  getCustomProtocolByUuid,
  setCustomProtocolUuid,
  createCustomProtocolFromPackage,
} from '@/db/queries/custom-protocols';
import {
  getVegetationClassificationsByProject,
  setActiveVegetationClassification,
} from '@/db/queries/vegetation-classifications';
import { serializeModules } from './project-sync-service';
import { pullReferenceDataFromDrive } from './reference-data-sync-service';
import { resolveCustomModuleDescriptors, forEachModuleMediaField, type MediaFieldLocation } from '@/core/project-sharing/module-media';
import { parseJsonText } from '@/db/mappers/json-utils';
import type { CustomProtocolSchema, Project } from '@/types/database';
import type { ProtocolRegistry } from '@/protocol-kernel/types';

function basename(uri: string): string {
  return uri.split('/').pop() ?? uri;
}

export interface ProjectManifest {
  project_uuid: string;
  project_name: string;
  protocol_id: string;
  protocol_source: 'official' | 'custom';
  drive_ids?: {
    submissions_folder_id: string;
    approved_folder_id: string;
  };
  // Which vegetation classification this project currently has active -
  // kept fresh by point-submission-service.ts on every backup, and resolved
  // back into the local pointer at the end of restoreOwnProjectFromDrive so
  // a project restored on another device doesn't silently fall back to the
  // standard Nomos tree (COLLAB_MODEL_V2_REFERENCE.md section 9 audit
  // follow-up).
  active_vegetation_classification?: {
    type: 'standard' | 'custom';
    custom_classification_uuid?: string;
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

// Downloads one approved/ Drive file and creates the corresponding point
// locally - photos/audio_notes and module-embedded media (photo_input/
// audio_notes_input, including inside a repeatable_group) all materialized
// into Paths.document, same naming convention as import-points.ts. Shared by
// restoreOwnProjectFromDrive below; only ever called for a brand-new local
// project, so there's no "point already exists" branch to worry about here.
async function createApprovedPointFromDriveFile(
  project: Project,
  driveFolderId: string,
  file: DriveFile,
  registry: ProtocolRegistry,
): Promise<string | null> {
  const envelope = await readJsonFile<Record<string, unknown>>(file.id);
  const pointUuid = file.name.replace(/\.json$/, '');
  const pointProtocolId =
    (envelope.protocolId as string | undefined) ??
    (project.protocol_source === 'custom' ? 'custom' : project.protocol_id);

  const photoNames = (envelope.photos as string[] | undefined) ?? [];
  const audioNotes =
    (envelope.audioNotes as { uri: string; duration: number; timestamp: number }[] | undefined) ?? [];
  const modulesObj = (envelope.modules as Record<string, unknown>) ?? {};

  let pointMediaFolder: DriveFile | null = null;
  if (photoNames.length > 0 || audioNotes.length > 0) {
    const mediaFolder = await findChildByName(driveFolderId, 'media');
    pointMediaFolder = mediaFolder ? await findChildByName(mediaFolder.id, pointUuid) : null;
  }

  let photosJson: string | null = null;
  let audioNotesJson: string | null = null;

  if (pointMediaFolder) {
    if (photoNames.length > 0) {
      const materialized: { uri: string; timestamp: number }[] = [];
      for (let index = 0; index < photoNames.length; index++) {
        const name = photoNames[index];
        const driveFile = await findChildByName(pointMediaFolder.id, name);
        if (!driveFile) continue;
        const localFile = new File(Paths.document, `restore_${pointUuid}_${index}_${name}`);
        await downloadBinaryFile(driveFile.id, localFile.uri);
        materialized.push({ uri: localFile.uri, timestamp: Date.now() });
      }
      photosJson = materialized.length > 0 ? JSON.stringify(materialized) : null;
    }

    if (audioNotes.length > 0) {
      const materialized: { uri: string; duration: number; timestamp: number }[] = [];
      for (let index = 0; index < audioNotes.length; index++) {
        const note = audioNotes[index];
        const name = basename(note.uri);
        const driveFile = await findChildByName(pointMediaFolder.id, name);
        if (!driveFile) continue;
        const localFile = new File(Paths.document, `restore_audio_${pointUuid}_${index}_${name}`);
        await downloadBinaryFile(driveFile.id, localFile.uri);
        materialized.push({ uri: localFile.uri, duration: note.duration, timestamp: note.timestamp });
      }
      audioNotesJson = materialized.length > 0 ? JSON.stringify(materialized) : null;
    }

    const moduleDescriptors = await resolveCustomModuleDescriptors(project);
    const moduleMediaLocations: MediaFieldLocation[] = [];
    forEachModuleMediaField(modulesObj, moduleDescriptors, (loc) => {
      moduleMediaLocations.push(loc);
    });

    for (const loc of moduleMediaLocations) {
      const items = parseJsonText<Array<Record<string, unknown>>>(loc.read() ?? "", [], Array.isArray);
      if (items.length === 0) continue;

      const moduleFolder = await findChildByName(pointMediaFolder.id, 'module');
      const locatorFolder = moduleFolder ? await findChildByName(moduleFolder.id, loc.locatorKey) : null;
      if (!locatorFolder) {
        loc.write(JSON.stringify([]));
        continue;
      }

      const materialized: Record<string, unknown>[] = [];
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const uri = typeof item.uri === "string" ? item.uri : null;
        if (!uri) continue;
        const name = basename(uri);
        const driveFile = await findChildByName(locatorFolder.id, name);
        if (!driveFile) continue;
        const localFile = new File(Paths.document, `restore_module_${pointUuid}_${loc.locatorKey}_${index}_${name}`);
        await downloadBinaryFile(driveFile.id, localFile.uri);
        materialized.push({ ...item, uri: localFile.uri });
      }
      loc.write(JSON.stringify(materialized));
    }
  }

  const moduleData = serializeModules(modulesObj, pointProtocolId, registry);

  return createPoint({
    id: pointUuid,
    project_id: project.id,
    protocol_id: pointProtocolId,
    lat: envelope.lat as number,
    lon: envelope.lon as number,
    altitude: (envelope.altitude as number | undefined) ?? null,
    generated_name: (envelope.generatedName as string | undefined) ?? null,
    photos: photosJson,
    audio_notes: audioNotesJson,
    additional_notes: JSON.stringify((envelope.additionalNotes as string[] | undefined) ?? []),
    point_size: (envelope.pointSize as number | undefined) ?? null,
    schema_version: "1.0.0",
    modules: moduleData,
    approval_status: "approved",
    created_by: (envelope.collector_code as string | undefined) ?? null,
    drive_synced_at: file.modifiedTime ?? null,
  });
}

// Restores the owner's own project onto another of their own devices
// (COLLAB_MODEL_V2_REFERENCE.md section 9) - the only remaining scenario
// where the app reads from Drive proactively. Recreates the local project as
// 'owner' and pulls down every approved (backed-up) point with its media;
// pending/rejected points are never uploaded, so there's nothing else to
// restore.
export async function restoreOwnProjectFromDrive(
  driveFolderId: string,
  registry: ProtocolRegistry,
): Promise<{ projectId: number; imported: number }> {
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

  const project = await getProjectById(newId);
  if (!project) throw new Error("Local project creation failed");

  // Species/vegetation-classification entries added after the project's
  // initial setup were only ever pushed to Drive, never pulled back on their
  // own - without this, restoring on another device silently lost them (see
  // COLLAB_MODEL_V2_REFERENCE.md section 9 audit follow-up). A failure here
  // must not abort the restore of the protocol/points that already worked.
  try {
    await pullReferenceDataFromDrive(newId, driveFolderId);
  } catch (error) {
    console.error('Error pulling species/vegetation reference data from Drive:', error);
  }

  const activeVegetation = manifest.active_vegetation_classification;
  if (activeVegetation?.type === 'custom' && activeVegetation.custom_classification_uuid) {
    const vegRows = await getVegetationClassificationsByProject(newId);
    const activeRow = vegRows.find((row) => row.uuid === activeVegetation.custom_classification_uuid);
    if (activeRow) {
      await setActiveVegetationClassification(newId, activeRow.id, 'custom');
    }
  }

  const { approved_folder_id: approvedFolderId } = await resolveProjectDriveIds(driveFolderId, manifest);
  const files = await listChildren(approvedFolderId);

  let imported = 0;
  for (const file of files) {
    if (!file.name.endsWith('.json')) continue;
    try {
      const newPointId = await createApprovedPointFromDriveFile(project, driveFolderId, file, registry);
      if (newPointId) imported++;
    } catch (error) {
      console.error('Error restoring point from Drive:', error);
    }
  }

  return { projectId: newId, imported };
}
