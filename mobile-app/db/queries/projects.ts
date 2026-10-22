// src/db/queries/projects.ts
import { db } from "../initialize";
import { Project } from "@/types/database";
import { generateUuid } from "@/core/utils/uuid";

/**
 * Retrieves all projects ordered by last edit (most recently updated
 * first). "Edited" includes project detail edits, geojson updates, and
 * point create/update/delete (see db/queries/points.ts).
 */
export async function getAllProjects(): Promise<Project[]> {
  try {
    const query = "SELECT * FROM projects ORDER BY last_updated DESC";

    // getAllAsync returns an array of objects matching the interface
    const results = await db.getAllAsync<Project>(query);
    return results;
  } catch (error) {
    console.error("Error fetching projects:", error);
    throw error;
  }
}

export async function createProject(
  name: string,
  protocolId: string,
  description: string = "",
  protocolSource: "official" | "custom" = "official",
  projectUuid?: string,
  ownerEmail?: string | null,
  collaborationRole?: "owner" | "collaborator" | null,
): Promise<number | null> {
  try {
    const createdAt = new Date().toISOString();

    const result = await db.runAsync(
      `INSERT INTO projects (name, protocol_id, description, protocol_source, created_at, last_updated, is_classified, project_uuid, owner_email, collaboration_role)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        name,
        protocolId,
        description,
        protocolSource,
        createdAt,
        createdAt,
        projectUuid ?? null,
        ownerEmail ?? null,
        collaborationRole ?? null,
      ],
    );

    return result.lastInsertRowId;
  } catch (error) {
    console.error("Error creating project:", error);
    return null;
  }
}

/**
 * Retrieves a specific project by ID.
 */
export async function getProjectById(
  projectId: number,
): Promise<Project | null> {
  try {
    const result = await db.getFirstAsync<Project>(
      "SELECT * FROM projects WHERE id = ?",
      [projectId],
    );
    return result || null;
  } catch (error) {
    console.error("Error fetching project by ID:", error);
    throw error;
  }
}

/**
 * Updates the GeoJSON files associated with a project.
 */
export async function updateProjectGeoJSON(
  projectId: number,
  layerPath?: string,
  fieldRoutePath?: string,
): Promise<boolean> {
  try {
    const lastUpdated = new Date().toISOString();

    if (layerPath !== undefined && fieldRoutePath !== undefined) {
      await db.runAsync(
        `UPDATE projects 
         SET geojson_layer = ?, geojson_field_route = ?, last_updated = ?
         WHERE id = ?`,
        [layerPath, fieldRoutePath, lastUpdated, projectId],
      );
    } else if (layerPath !== undefined) {
      await db.runAsync(
        `UPDATE projects 
         SET geojson_layer = ?, last_updated = ?
         WHERE id = ?`,
        [layerPath, lastUpdated, projectId],
      );
    } else if (fieldRoutePath !== undefined) {
      await db.runAsync(
        `UPDATE projects 
         SET geojson_field_route = ?, last_updated = ?
         WHERE id = ?`,
        [fieldRoutePath, lastUpdated, projectId],
      );
    }

    return true;
  } catch (error) {
    console.error("Error updating project GeoJSON:", error);
    return false;
  }
}

/**
 * Updates the name and description of a project.
 */
export async function updateProject(
  projectId: number,
  name: string,
  description: string,
): Promise<boolean> {
  try {
    const lastUpdated = new Date().toISOString();

    await db.runAsync(
      `UPDATE projects 
       SET name = ?, description = ?, last_updated = ?
       WHERE id = ?`,
      [name, description, lastUpdated, projectId],
    );

    return true;
  } catch (error) {
    console.error("Error updating project:", error);
    return false;
  }
}

/**
 * Get a project by its stable cross-device uuid (project sharing import
 * idempotency, Fase 0).
 */
export async function getProjectByUuid(
  projectUuid: string,
): Promise<Project | null> {
  try {
    const result = await db.getFirstAsync<Project>(
      "SELECT * FROM projects WHERE project_uuid = ?",
      [projectUuid],
    );
    return result || null;
  } catch (error) {
    console.error("Error fetching project by uuid:", error);
    throw error;
  }
}

/**
 * Returns the project's uuid, generating and persisting one via the shared
 * uuid utility if it doesn't have one yet. Never regenerates an existing
 * uuid, so repeated calls (e.g. re-exporting the same project's
 * configuration package) always return the same value.
 */
export async function ensureProjectUuid(projectId: number): Promise<string> {
  const row = await db.getFirstAsync<{ project_uuid: string | null }>(
    "SELECT project_uuid FROM projects WHERE id = ?",
    [projectId],
  );

  if (row?.project_uuid) return row.project_uuid;

  const uuid = generateUuid();
  await db.runAsync("UPDATE projects SET project_uuid = ? WHERE id = ?", [
    uuid,
    projectId,
  ]);
  return uuid;
}

/**
 * Marks a project as the Drive backup owner, setting the folder id and the
 * connected account's email. Called once, at the moment backup is
 * activated (Fase 5) - never afterward for the same project.
 */
export async function setProjectAsOwner(
  projectId: number,
  driveFolderId: string,
  ownerEmail: string,
): Promise<boolean> {
  try {
    const lastUpdated = new Date().toISOString();
    await db.runAsync(
      `UPDATE projects
       SET collaboration_role = 'owner', drive_folder_id = ?, owner_email = ?, last_updated = ?
       WHERE id = ?`,
      [driveFolderId, ownerEmail, lastUpdated, projectId],
    );
    return true;
  } catch (error) {
    console.error("Error setting project as owner:", error);
    return false;
  }
}

/**
 * Lists the drive_folder_id of every local project already linked to a
 * Drive folder (Fase 7 restore - used to filter out projects that don't
 * need to be offered again).
 */
export async function getAllDriveFolderIds(): Promise<string[]> {
  try {
    const rows = await db.getAllAsync<{ drive_folder_id: string }>(
      "SELECT drive_folder_id FROM projects WHERE drive_folder_id IS NOT NULL",
    );
    return rows.map((r) => r.drive_folder_id);
  } catch (error) {
    console.error("Error fetching drive folder ids:", error);
    return [];
  }
}

/**
 * Deletes a project and all its associated data.
 */
export async function deleteProject(projectId: number): Promise<boolean> {
  try {
    // Deletar pontos do projeto (species e point_modules caem por ON DELETE CASCADE)
    await db.runAsync("DELETE FROM points WHERE project_id = ?", [projectId]);
    await db.runAsync(
      "DELETE FROM project_species_common_names WHERE species_id IN (SELECT id FROM project_species_catalog WHERE project_id = ?)",
      [projectId]
    );
    await db.runAsync("DELETE FROM project_species_catalog WHERE project_id = ?", [projectId]);
    await db.runAsync("DELETE FROM vegetation_classifications WHERE project_id = ?", [projectId]);
    await db.runAsync("DELETE FROM projects WHERE id = ?", [projectId]);

    return true;
  } catch (error) {
    console.error("Error deleting project:", error);
    return false;
  }
}
