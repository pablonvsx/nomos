import {
  ensureFolder,
  findChildByName,
  listChildren,
  readJsonFile,
  updateJsonFile,
  uploadJsonFile,
  type DriveFile,
} from "@/core/drive-sync/drive-api-client";
import { getCurrentGoogleAccount } from "@/core/google-auth/google-auth-service";
import { getAllDriveFolderIds, getProjectById, setProjectAsOwner } from "@/db/queries/projects";
import { buildProjectConfigPackage } from "@/core/project-sharing/project-config-package";
import { UnsupportedPackageVersionError } from "@/core/project-sharing/package-errors";

const NOMOS_ROOT_FOLDER_NAME = "Nomos";
const DRIVE_ROOT_PARENT_ID = "root";

export const MANIFEST_FORMAT_VERSION = 1;

export interface ProjectManifest {
  format_version: 1;
  project_uuid: string;
  project_name: string;
  protocol_id: string;
  protocol_source: "official" | "custom";
  owner_email: string;
  active_vegetation_classification: {
    type: "standard" | "custom";
    custom_classification_uuid?: string;
  };
}

/** Thrown when an action needs a connected Google account and none is set - the UI recognizes this to open the connection modal (section 10.1). */
export class GoogleAccountRequiredError extends Error {
  constructor() {
    super("É necessário conectar uma conta Google para ativar o backup no Drive.");
    this.name = "GoogleAccountRequiredError";
  }
}

/** Thrown when trying to activate backup on a project that already has a collaboration role (section 3.1/13 - a collaborator copy can never become an owner, and an owner can't be re-activated). */
export class InvalidCollaborationRoleError extends Error {
  constructor(role: "owner" | "collaborator") {
    super(
      role === "owner"
        ? "Este projeto já tem o backup no Drive ativado."
        : "Este projeto é uma cópia de colaborador e não pode ser vinculado ao Drive.",
    );
    this.name = "InvalidCollaborationRoleError";
  }
}

async function ensureNomosRootFolder(): Promise<string> {
  return ensureFolder(NOMOS_ROOT_FOLDER_NAME, DRIVE_ROOT_PARENT_ID);
}

export async function getManifest(driveFolderId: string): Promise<ProjectManifest> {
  const file = await findChildByName(driveFolderId, "manifest.json");
  if (!file) throw new Error("manifest.json não encontrado na pasta do projeto.");
  const manifest = await readJsonFile<ProjectManifest>(file.id);
  // format_version must be checked before trusting any other field (14.6),
  // same discipline already applied to both packages.
  if (manifest.format_version !== MANIFEST_FORMAT_VERSION) {
    throw new UnsupportedPackageVersionError();
  }
  return manifest;
}

/**
 * IMPORTANT (sections 14.1 and 14.3): every future write to manifest.json,
 * in this phase and the following ones, MUST go through this function -
 * never through an ad hoc updateJsonFile call elsewhere in the code. Reads
 * the current file, applies the updater, and refuses to write if the
 * update would lose the manifest's identity (project_uuid) or drop an
 * owner_email that was already set.
 */
export async function updateManifest(
  driveFolderId: string,
  updater: (current: ProjectManifest) => ProjectManifest,
): Promise<void> {
  const current = await getManifest(driveFolderId);
  const updated = updater(current);

  if (updated.project_uuid !== current.project_uuid) {
    throw new Error("Recusado: a escrita perderia o project_uuid do manifest.");
  }
  if (current.owner_email && updated.owner_email !== current.owner_email) {
    throw new Error("Recusado: a escrita perderia/mudaria o owner_email do manifest.");
  }
  if (updated.format_version !== current.format_version) {
    throw new Error("Recusado: a escrita perderia/mudaria o format_version do manifest.");
  }

  const file = await findChildByName(driveFolderId, "manifest.json");
  if (!file) throw new Error("manifest.json não encontrado na pasta do projeto.");
  await updateJsonFile(file.id, updated);
}

export async function activateDriveBackup(projectId: number): Promise<void> {
  const account = getCurrentGoogleAccount();
  if (!account) {
    throw new GoogleAccountRequiredError();
  }

  const project = await getProjectById(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }
  if (project.collaboration_role === "owner" || project.collaboration_role === "collaborator") {
    throw new InvalidCollaborationRoleError(project.collaboration_role);
  }

  // buildProjectConfigPackage (Fase 0) already ensures project_uuid, the
  // custom protocol's uuid, and a uuid on every species/vegetation row -
  // reused here instead of re-implementing that check-before-generate
  // logic a second time.
  const pkg = await buildProjectConfigPackage(projectId);

  const rootFolderId = await ensureNomosRootFolder();
  // ensureFolder (not createFolder) so a retry after a failed activation
  // doesn't create a second folder with the same name.
  const projectFolderId = await ensureFolder(
    `Nomos_${project.name}_${pkg.project_uuid}`,
    rootFolderId,
  );

  await ensureFolder("approved", projectFolderId);

  if (pkg.protocol_source === "custom" && pkg.custom_protocol) {
    await uploadJsonFile("protocol-package.json", projectFolderId, pkg.custom_protocol);
  }

  const speciesCatalogFolderId = await ensureFolder("species-catalog", projectFolderId);
  for (const speciesEntry of pkg.species_catalog) {
    await uploadJsonFile(`${speciesEntry.uuid}.json`, speciesCatalogFolderId, speciesEntry);
  }

  const vegetationClassesFolderId = await ensureFolder("vegetation-classes", projectFolderId);
  for (const vegEntry of pkg.vegetation_classes) {
    await uploadJsonFile(`${vegEntry.uuid}.json`, vegetationClassesFolderId, vegEntry);
  }

  const manifest: ProjectManifest = {
    format_version: MANIFEST_FORMAT_VERSION,
    project_uuid: pkg.project_uuid,
    project_name: pkg.project_name,
    protocol_id: pkg.protocol_id,
    protocol_source: pkg.protocol_source,
    owner_email: account.email,
    active_vegetation_classification: pkg.active_vegetation_classification,
  };
  await uploadJsonFile("manifest.json", projectFolderId, manifest);

  await setProjectAsOwner(projectId, projectFolderId, account.email);
}

const NOMOS_PROJECT_FOLDER_PREFIX = "Nomos_";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

/**
 * Lists the signed-in account's own Nomos project folders in Drive (Fase 7
 * restore) - every subfolder of the shared "Nomos" root whose name follows
 * the convention set by activateDriveBackup (`Nomos_<name>_<uuid>`).
 */
export async function listOwnNomosProjectFolders(): Promise<DriveFile[]> {
  const rootId = await ensureNomosRootFolder();
  const children = await listChildren(rootId);
  return children.filter(
    (f) => f.mimeType === FOLDER_MIME_TYPE && f.name.startsWith(NOMOS_PROJECT_FOLDER_PREFIX),
  );
}

/**
 * Drive folder ids already linked to a local project - used to filter out
 * projects that don't need to be offered again in the restore list.
 */
export async function getUsedDriveFolderIds(): Promise<Set<string>> {
  return new Set(await getAllDriveFolderIds());
}
