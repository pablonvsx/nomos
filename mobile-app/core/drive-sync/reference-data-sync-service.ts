import { listChildren, uploadJsonFile, readJsonFile } from './drive-api-client';
import { ensureFolder } from './project-drive-service';
import { getProjectById } from '@/db/queries/projects';
import {
  getProjectSpeciesCatalogByProject,
  createProjectSpecies,
  setProjectSpeciesUuid,
  getProjectSpeciesIdByGbifId,
} from '@/db/queries/project-species';
import {
  getVegetationClassificationsByProject,
  createVegetationClassification,
  setVegetationClassificationUuid,
} from '@/db/queries/vegetation-classifications';
import { getCurrentGoogleAccount } from '@/core/google-auth/google-auth-service';
import { generateUuid } from '@/utils/uuid';
import type {
  ProjectSpeciesCatalog,
  ProjectSpeciesCommonName,
  VegetationClassification,
  VegetationClass,
} from '@/types/database';

export interface ReferenceDataSyncResult {
  speciesPushed: number;
  speciesPulled: number;
  vegetationClassesPushed: number;
  vegetationClassesPulled: number;
}

interface SyncOneCollectionParams<T> {
  folderId: string;
  localRows: T[];
  getUuid: (row: T) => string | null | undefined;
  toPayload: (row: T) => Record<string, unknown>;
  insertLocal: (payload: Record<string, unknown>, uuid: string) => Promise<void>;
}

async function syncOneReferenceCollection<T>(
  params: SyncOneCollectionParams<T>
): Promise<{ pushed: number; pulled: number }> {
  const remoteFiles = (await listChildren(params.folderId)).filter((f) => f.name.endsWith('.json'));
  const remoteUuids = new Set(remoteFiles.map((f) => f.name.replace('.json', '')));
  const localUuids = new Set(
    params.localRows.map(params.getUuid).filter((uuid): uuid is string => !!uuid)
  );

  let pushed = 0;
  for (const row of params.localRows) {
    const uuid = params.getUuid(row);
    if (uuid && !remoteUuids.has(uuid)) {
      await uploadJsonFile(`${uuid}.json`, params.folderId, params.toPayload(row));
      pushed++;
    }
  }

  let pulled = 0;
  for (const file of remoteFiles) {
    const uuid = file.name.replace('.json', '');
    if (!localUuids.has(uuid)) {
      const content = await readJsonFile<Record<string, unknown>>(file.id);
      await params.insertLocal(content, uuid);
      pulled++;
    }
  }

  return { pushed, pulled };
}

function toSpeciesPayload(row: ProjectSpeciesCatalog): Record<string, unknown> {
  return {
    scientific_name: row.scientific_name,
    family: row.family,
    genus: row.genus,
    gbif_id: row.gbif_id,
    source: row.source,
    common_names: (row.common_names ?? []).map((cn) => ({
      common_name: cn.common_name,
      language: cn.language,
      source: cn.source,
    })),
  };
}

function toVegetationPayload(row: VegetationClassification): Record<string, unknown> {
  return { name: row.name, classes: row.classes };
}

export async function insertSpeciesFromRemote(
  projectId: number,
  payload: Record<string, unknown>,
  uuid: string,
): Promise<void> {
  const commonNames = (payload.common_names as
    | { common_name: string; language: string; source?: string }[]
    | undefined) ?? [];
  const gbifId = (payload.gbif_id as string | undefined) ?? undefined;

  const createdId = await createProjectSpecies({
    project_id: projectId,
    uuid,
    scientific_name: payload.scientific_name as string,
    family: (payload.family as string | undefined) ?? undefined,
    genus: (payload.genus as string | undefined) ?? undefined,
    gbif_id: gbifId,
    source: (payload.source as ProjectSpeciesCatalog['source']) ?? 'catalog',
    common_names: commonNames.map((cn) => ({
      common_name: cn.common_name,
      language: cn.language,
      source: (cn.source as ProjectSpeciesCommonName['source']) ?? 'catalog',
    })),
  });

  if (createdId !== null) return;

  // createProjectSpecies returns null on a UNIQUE(project_id, gbif_id)
  // conflict, not on a real error (both cases are logged and swallowed the
  // same way) - the species was independently added on another device
  // before the first sync. Adopt the incoming uuid onto the existing local
  // row instead of silently dropping the reconciliation, so future syncs
  // stop retrying (and failing) forever.
  if (!gbifId) return;
  const existingId = await getProjectSpeciesIdByGbifId(projectId, gbifId);
  if (existingId !== null) {
    await setProjectSpeciesUuid(existingId, uuid);
  }
}

async function insertVegetationClassificationFromRemote(
  projectId: number,
  payload: Record<string, unknown>,
  uuid: string,
): Promise<void> {
  await createVegetationClassification(
    projectId,
    (payload.name as string) ?? '',
    (payload.classes as VegetationClass[]) ?? [],
    uuid,
  );
}

export async function syncReferenceData(
  projectId: number,
  driveFolderId: string
): Promise<ReferenceDataSyncResult> {
  const speciesFolderId = await ensureFolder('species-catalog', driveFolderId);
  const vegClassesFolderId = await ensureFolder('vegetation-classes', driveFolderId);

  // Rows created before this feature existed have no uuid yet - give them one
  // now so they don't get silently skipped by the push comparison below.
  const speciesRows = await getProjectSpeciesCatalogByProject(projectId);
  for (const row of speciesRows) {
    if (!row.uuid) {
      row.uuid = generateUuid();
      await setProjectSpeciesUuid(row.id, row.uuid);
    }
  }

  const vegRows = await getVegetationClassificationsByProject(projectId);
  for (const row of vegRows) {
    if (!row.uuid) {
      row.uuid = generateUuid();
      await setVegetationClassificationUuid(row.id, row.uuid);
    }
  }

  const speciesResult = await syncOneReferenceCollection({
    folderId: speciesFolderId,
    localRows: speciesRows,
    getUuid: (row) => row.uuid,
    toPayload: toSpeciesPayload,
    insertLocal: (payload, uuid) => insertSpeciesFromRemote(projectId, payload, uuid),
  });

  const vegResult = await syncOneReferenceCollection({
    folderId: vegClassesFolderId,
    localRows: vegRows,
    getUuid: (row) => row.uuid,
    toPayload: toVegetationPayload,
    insertLocal: (payload, uuid) => insertVegetationClassificationFromRemote(projectId, payload, uuid),
  });

  return {
    speciesPushed: speciesResult.pushed,
    speciesPulled: speciesResult.pulled,
    vegetationClassesPushed: vegResult.pushed,
    vegetationClassesPulled: vegResult.pulled,
  };
}

// Best-effort immediate push for a single newly created item, used by the
// manual "add one species / one classification" flows so collaborators see
// it before the next full project sync. Never throws - a missing connection
// must not block the local creation that already succeeded.
export async function pushSpeciesEntryIfCollaborative(
  projectId: number,
  entry: ProjectSpeciesCatalog
): Promise<void> {
  if (!entry.uuid) return;
  try {
    const project = await getProjectById(projectId);
    if (!project?.is_collaborative || !project.drive_folder_id) return;
    if (!getCurrentGoogleAccount()) return;
    const folderId = await ensureFolder('species-catalog', project.drive_folder_id);
    await uploadJsonFile(`${entry.uuid}.json`, folderId, toSpeciesPayload(entry));
  } catch (error) {
    console.error('Error pushing species entry to Drive:', error);
  }
}

export async function pushVegetationClassificationIfCollaborative(
  projectId: number,
  row: VegetationClassification
): Promise<void> {
  if (!row.uuid) return;
  try {
    const project = await getProjectById(projectId);
    if (!project?.is_collaborative || !project.drive_folder_id) return;
    if (!getCurrentGoogleAccount()) return;
    const folderId = await ensureFolder('vegetation-classes', project.drive_folder_id);
    await uploadJsonFile(`${row.uuid}.json`, folderId, toVegetationPayload(row));
  } catch (error) {
    console.error('Error pushing vegetation classification to Drive:', error);
  }
}
