import { findChildByName, listChildren, uploadJsonFile } from "@/core/drive-sync/drive-api-client";
import { updateManifest } from "@/core/drive-sync/project-drive-service";
import { getAllProjectSpeciesCatalogEnsuringUuids } from "@/db/queries/project-species";
import {
  getAllVegetationClassificationsEnsuringUuids,
  getVegetationClassificationByUuid,
} from "@/db/queries/vegetation-classifications";
import type { Project } from "@/types/database";

/**
 * Best-effort, additive-only sync of the local species catalog and
 * vegetation classifications to Drive, meant to be called after any local
 * write to either (audit finding IMPORTANTE 3: activateDriveBackup only
 * ever pushes these once, at activation time - anything added afterward
 * never reached Drive). No-ops silently when the project isn't an owner
 * with backup active, and swallows any Drive failure without throwing -
 * same philosophy as media uploads in backup-service.ts: the local write
 * already succeeded, this sync must never block or undo it.
 */

function isOwnerWithBackupActive(project: Project): project is Project & { drive_folder_id: string } {
  return project.collaboration_role === "owner" && Boolean(project.drive_folder_id);
}

export async function syncSpeciesCatalogToDrive(project: Project): Promise<void> {
  if (!isOwnerWithBackupActive(project)) return;

  try {
    const speciesRows = await getAllProjectSpeciesCatalogEnsuringUuids(project.id);
    const speciesCatalogFolder = await findChildByName(project.drive_folder_id, "species-catalog");
    if (!speciesCatalogFolder) return;

    const existingFiles = await listChildren(speciesCatalogFolder.id);
    const existingNames = new Set(existingFiles.map((f) => f.name));

    for (const species of speciesRows) {
      if (!species.uuid) continue;
      const filename = `${species.uuid}.json`;
      if (existingNames.has(filename)) continue;

      await uploadJsonFile(filename, speciesCatalogFolder.id, {
        uuid: species.uuid,
        scientific_name: species.scientific_name,
        source: species.source,
        common_names: species.common_names ?? [],
      });
    }
  } catch (error) {
    console.error("Error syncing species catalog to Drive:", error);
  }
}

/** Shared by the bulk sweep below and by the single-item check used to
 * confirm the active classification before pointing the manifest at it. */
async function uploadVegetationClassificationFile(
  vegClassesFolderId: string,
  classification: { uuid: string; name: string; classes: unknown; created_at: string; last_updated: string },
): Promise<void> {
  await uploadJsonFile(`${classification.uuid}.json`, vegClassesFolderId, {
    uuid: classification.uuid,
    name: classification.name,
    classes: classification.classes,
    created_at: classification.created_at,
    last_updated: classification.last_updated,
  });
}

export async function syncVegetationClassesToDrive(project: Project): Promise<void> {
  if (!isOwnerWithBackupActive(project)) return;

  try {
    const vegetationRows = await getAllVegetationClassificationsEnsuringUuids(project.id);
    const vegClassesFolder = await findChildByName(project.drive_folder_id, "vegetation-classes");
    if (!vegClassesFolder) return;

    const existingFiles = await listChildren(vegClassesFolder.id);
    const existingNames = new Set(existingFiles.map((f) => f.name));

    for (const classification of vegetationRows) {
      if (!classification.uuid) continue;
      const filename = `${classification.uuid}.json`;
      if (existingNames.has(filename)) continue;

      await uploadVegetationClassificationFile(vegClassesFolder.id, {
        uuid: classification.uuid,
        name: classification.name,
        classes: classification.classes,
        created_at: classification.created_at,
        last_updated: classification.last_updated,
      });
    }
  } catch (error) {
    console.error("Error syncing vegetation classes to Drive:", error);
  }
}

/**
 * Confirms the active classification's own file actually exists on Drive
 * before syncActiveVegetationClassificationToDrive is allowed to point the
 * manifest at it - closes the gap where syncVegetationClassesToDrive (its
 * own independent, best-effort call) could have silently failed earlier,
 * leaving the manifest referencing a uuid with no file behind it (audit
 * finding IMPORTANTE 1). Uploads it on the spot if missing and the local
 * row is still available; returns false only when neither the existing
 * file nor a successful upload could be confirmed.
 */
async function ensureActiveClassificationFileExists(
  projectId: number,
  driveFolderId: string,
  classificationUuid: string,
): Promise<boolean> {
  const vegClassesFolder = await findChildByName(driveFolderId, "vegetation-classes");
  if (!vegClassesFolder) return false;

  const filename = `${classificationUuid}.json`;
  if (await findChildByName(vegClassesFolder.id, filename)) return true;

  const classification = await getVegetationClassificationByUuid(projectId, classificationUuid);
  if (!classification) return false;

  try {
    await uploadVegetationClassificationFile(vegClassesFolder.id, {
      uuid: classificationUuid,
      name: classification.name,
      classes: classification.classes,
      created_at: classification.created_at,
      last_updated: classification.last_updated,
    });
    return true;
  } catch (error) {
    console.error("Error uploading vegetation classification to Drive:", error);
    return false;
  }
}

export async function syncActiveVegetationClassificationToDrive(
  project: Project,
  type: "standard" | "custom",
  customClassificationUuid?: string,
): Promise<void> {
  if (!isOwnerWithBackupActive(project)) return;

  try {
    if (type === "custom" && customClassificationUuid) {
      const isOnDrive = await ensureActiveClassificationFileExists(
        project.id,
        project.drive_folder_id,
        customClassificationUuid,
      );
      if (!isOnDrive) {
        // Never point the manifest at a classification whose file isn't
        // actually on Drive - exactly the gap that let Fase 7's restore
        // silently fall back to 'standard' (audit finding IMPORTANTE 1).
        console.error(
          `Skipping manifest update: vegetation classification ${customClassificationUuid} could not be confirmed on Drive.`,
        );
        return;
      }
    }

    await updateManifest(project.drive_folder_id, (current) => ({
      ...current,
      active_vegetation_classification:
        type === "custom" && customClassificationUuid
          ? { type: "custom", custom_classification_uuid: customClassificationUuid }
          : { type: "standard" },
    }));
  } catch (error) {
    console.error("Error syncing active vegetation classification to Drive:", error);
  }
}
