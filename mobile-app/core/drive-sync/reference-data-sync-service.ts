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
} from '@/db/queries/vegetation-classifications';
import { getCurrentGoogleAccount } from '@/core/google-auth/google-auth-service';
import type {
  ProjectSpeciesCatalog,
  ProjectSpeciesCommonName,
  VegetationClassification,
  VegetationClass,
} from '@/types/database';

interface PullOneCollectionParams {
  folderId: string;
  existingUuids: Set<string>;
  insertLocal: (payload: Record<string, unknown>, uuid: string) => Promise<void>;
}

// Pull-only half of what used to be syncOneReferenceCollection's push+pull
// pair - the push side lives on in pushSpeciesEntryIfCollaborative /
// pushVegetationClassificationIfCollaborative below (best-effort, fired when
// an item is created), so this only ever needs to bring down remote entries
// not yet present locally (by uuid), never push back up.
async function pullOneReferenceCollection(
  params: PullOneCollectionParams
): Promise<number> {
  const remoteFiles = (await listChildren(params.folderId)).filter((f) => f.name.endsWith('.json'));

  let pulled = 0;
  for (const file of remoteFiles) {
    const uuid = file.name.replace('.json', '');
    if (!params.existingUuids.has(uuid)) {
      const content = await readJsonFile<Record<string, unknown>>(file.id);
      await params.insertLocal(content, uuid);
      pulled++;
    }
  }

  return pulled;
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

export interface PullReferenceDataResult {
  speciesPulled: number;
  vegetationClassesPulled: number;
}

// Restoring the owner's own project onto another device
// (COLLAB_MODEL_V2_REFERENCE.md section 9) needs to bring down whatever
// species/vegetation-classification entries were pushed by
// pushSpeciesEntryIfCollaborative/pushVegetationClassificationIfCollaborative
// after the project's initial setup - restoreOwnProjectFromDrive
// (core/drive-sync/project-drive-service.ts) only restores the manifest,
// protocol and approved points on its own, so without this call anything
// added to the catalog after that initial setup would be silently lost on
// restore (it was written to Drive, just never read back).
export async function pullReferenceDataFromDrive(
  projectId: number,
  driveFolderId: string
): Promise<PullReferenceDataResult> {
  const speciesFolderId = await ensureFolder('species-catalog', driveFolderId);
  const vegClassesFolderId = await ensureFolder('vegetation-classes', driveFolderId);

  const existingSpecies = await getProjectSpeciesCatalogByProject(projectId);
  const existingSpeciesUuids = new Set(
    existingSpecies.map((row) => row.uuid).filter((uuid): uuid is string => !!uuid)
  );
  const speciesPulled = await pullOneReferenceCollection({
    folderId: speciesFolderId,
    existingUuids: existingSpeciesUuids,
    insertLocal: (payload, uuid) => insertSpeciesFromRemote(projectId, payload, uuid),
  });

  const existingVegetation = await getVegetationClassificationsByProject(projectId);
  const existingVegetationUuids = new Set(
    existingVegetation.map((row) => row.uuid).filter((uuid): uuid is string => !!uuid)
  );
  const vegetationClassesPulled = await pullOneReferenceCollection({
    folderId: vegClassesFolderId,
    existingUuids: existingVegetationUuids,
    insertLocal: (payload, uuid) => insertVegetationClassificationFromRemote(projectId, payload, uuid),
  });

  return { speciesPulled, vegetationClassesPulled };
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
    if (project?.collaboration_role !== "owner" || !project.drive_folder_id) return;
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
    if (project?.collaboration_role !== "owner" || !project.drive_folder_id) return;
    if (!getCurrentGoogleAccount()) return;
    const folderId = await ensureFolder('vegetation-classes', project.drive_folder_id);
    await uploadJsonFile(`${row.uuid}.json`, folderId, toVegetationPayload(row));
  } catch (error) {
    console.error('Error pushing vegetation classification to Drive:', error);
  }
}
