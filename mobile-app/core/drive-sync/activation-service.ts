// Activating the Drive backup of a project: creates its folder in the owner's
// Drive, sends the project data and only THEN makes the project an owner
// project (collaboration_role = 'owner', drive_folder_id). It runs inside the
// backup session like any other backup (modal that holds the person, progress,
// cancel), so it is built to be stopped and repeated:
//
// - folders go through ensureFolder, files through backupProjectData, which
//   updates a file by name instead of creating a second one;
// - the manifest goes last, and the project is NOT marked as owner unless
//   everything was sent. A cancelled, interrupted or failed activation leaves the
//   project local and the next attempt reuses what is already in Drive.

import { backupProjectData } from "@/core/drive-sync/project-data-backup";
import { buildProjectDataItems } from "@/core/drive-sync/backup-items";
import { collectMapFiles } from "@/core/drive-sync/backup-collectors";
import { classifyRun } from "@/core/drive-sync/backup-results";
import { seedBackupSnapshots } from "@/core/drive-sync/backup-status-service";
import type { BackupContext, BackupResult } from "@/core/drive-sync/backup-session";
import { ensureFolder } from "@/core/drive-sync/drive-api-client";
import { APPROVED_FOLDER } from "@/core/drive-sync/drive-layout";
import {
  ensureNomosRootFolder,
  GoogleAccountRequiredError,
  InvalidCollaborationRoleError,
  MANIFEST_FORMAT_VERSION,
  type ProjectManifest,
} from "@/core/drive-sync/project-drive-service";
import { getCurrentGoogleAccount } from "@/core/google-auth/google-auth-service";
import { buildProjectConfigPackage } from "@/core/project-sharing/project-config-package";
import { getProjectById, setProjectAsOwner } from "@/db/queries/projects";

export async function runActivation(projectId: number, context: BackupContext): Promise<BackupResult> {
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

  // buildProjectConfigPackage already ensures project_uuid, the custom
  // protocol's uuid and a uuid on every species/classification row.
  const pkg = await buildProjectConfigPackage(projectId);

  context.report({ key: "driveBackup.stage.activationFolders" }, 0, 1);
  const rootFolderId = await ensureNomosRootFolder();
  // ensureFolder (not createFolder): a retry never creates a second folder with the same name.
  const projectFolderId = await ensureFolder(`Nomos_${project.name}_${pkg.project_uuid}`, rootFolderId);
  await ensureFolder(APPROVED_FOLDER, projectFolderId);

  const { items, payloads } = buildProjectDataItems(pkg, await collectMapFiles(projectId));
  const manifest: ProjectManifest = {
    format_version: MANIFEST_FORMAT_VERSION,
    project_uuid: pkg.project_uuid,
    project_name: pkg.project_name,
    project_description: pkg.project_description ?? "",
    protocol_id: pkg.protocol_id,
    protocol_source: pkg.protocol_source,
    owner_email: account.email,
    active_vegetation_classification: pkg.active_vegetation_classification,
  };

  const outcome = await backupProjectData({
    driveFolderId: projectFolderId,
    pending: items,
    payloads,
    context,
    // The snapshot is written once, at the end, only if the whole activation succeeded.
    onItemDone: async () => {},
    createManifest: manifest,
  });

  const result = classifyRun({
    sent: outcome.sent,
    failures: outcome.failures,
    notAttempted: outcome.notAttempted,
    cancelled: outcome.cancelled,
    connectionLost: outcome.connectionLost,
  });
  if (result.outcome !== "completed") return result;

  if (!(await setProjectAsOwner(projectId, projectFolderId, account.email))) {
    throw new Error("Não foi possível registrar o projeto como dono do backup.");
  }

  // Everything the project data holds was just sent: record it as backed up, so
  // the first look at the status says "up to date". Best effort: if it fails the
  // items show as pending and the next backup re-sends them (idempotent).
  try {
    await seedBackupSnapshots(projectId, ["project"]);
  } catch (error) {
    console.error("Error recording the activation backup snapshot:", error);
  }
  return result;
}
