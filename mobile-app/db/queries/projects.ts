// src/db/queries/projects.ts
import { db } from "../initialize";
import { Project } from "@/types/database";

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

export async function getUsedDriveFolderIds(): Promise<string[]> {
  try {
    const results = await db.getAllAsync<{ drive_folder_id: string }>(
      "SELECT drive_folder_id FROM projects WHERE drive_folder_id IS NOT NULL",
    );
    return results.map((r) => r.drive_folder_id);
  } catch (error) {
    console.error("Error fetching used Drive folder ids:", error);
    return [];
  }
}

export async function createProject(
  name: string,
  protocolId: string,
  description: string = "",
  protocolSource: "official" | "custom" = "official",
): Promise<number | null> {
  try {
    const createdAt = new Date().toISOString();

    const result = await db.runAsync(
      `INSERT INTO projects (name, protocol_id, description, protocol_source, created_at, last_updated, is_classified) 
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [name, protocolId, description, protocolSource, createdAt, createdAt],
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
 * Retrieves a project by its stable cross-device uuid, used to reconcile a
 * project config package against a project already imported on this device.
 */
export async function getProjectByUuid(uuid: string): Promise<Project | null> {
  try {
    const result = await db.getFirstAsync<Project>(
      "SELECT * FROM projects WHERE project_uuid = ?",
      [uuid],
    );
    return result || null;
  } catch (error) {
    console.error("Error fetching project by uuid:", error);
    throw error;
  }
}

/**
 * Backfills the uuid of a project created before this column existed (e.g.
 * when exporting its config package for the first time).
 */
export async function setProjectUuid(id: number, uuid: string): Promise<void> {
  await db.runAsync("UPDATE projects SET project_uuid = ? WHERE id = ?", [
    uuid,
    id,
  ]);
}

/**
 * Creates a local project from an imported project config package,
 * preserving its uuid so it can be found again by getProjectByUuid if the
 * same package is imported again on this or another device.
 */
export async function createProjectFromPackage(
  projectUuid: string,
  name: string,
  protocolId: string,
  protocolSource: "official" | "custom",
): Promise<number | null> {
  try {
    const createdAt = new Date().toISOString();

    const result = await db.runAsync(
      `INSERT INTO projects (name, protocol_id, description, protocol_source, created_at, last_updated, is_classified, project_uuid)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [name, protocolId, "", protocolSource, createdAt, createdAt, projectUuid],
    );

    return result.lastInsertRowId;
  } catch (error) {
    console.error("Error creating project from package:", error);
    return null;
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
 * Marks a project as collaborative, associating it with a Google Drive folder.
 */
export async function setProjectCollaborative(
  projectId: number,
  driveFolderId: string,
): Promise<boolean> {
  try {
    await db.runAsync(
      `UPDATE projects SET is_collaborative = 1, drive_folder_id = ?, last_updated = ? WHERE id = ?`,
      [driveFolderId, new Date().toISOString(), projectId],
    );
    return true;
  } catch (error) {
    console.error("Error setting project as collaborative:", error);
    return false;
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
