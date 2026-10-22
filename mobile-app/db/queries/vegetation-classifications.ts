import { db } from "../initialize";
import { VegetationClassification, VegetationClass } from "@/types/database";
import { generateUuid } from "@/core/utils/uuid";

/**
 * Creates a new vegetation classification in the database
 */
export async function createVegetationClassification(
  projectId: number,
  name: string,
  classes: VegetationClass[],
): Promise<number | null> {
  try {
    const timestamp = new Date().toISOString();
    const classesJson = JSON.stringify(classes);

    const result = await db.runAsync(
      `INSERT INTO vegetation_classifications (project_id, name, classes, created_at, last_updated)
       VALUES (?, ?, ?, ?, ?)`,
      [projectId, name, classesJson, timestamp, timestamp],
    );

    return result.lastInsertRowId as number;
  } catch (error) {
    console.error("Error creating vegetation classification:", error);
    return null;
  }
}

/**
 * Gets all vegetation classifications for a project
 */
export async function getVegetationClassificationsByProject(
  projectId: number,
): Promise<VegetationClassification[]> {
  try {
    const results = await db.getAllAsync<{
      id: number;
      project_id: number;
      name: string;
      classes: string;
      created_at: string;
      last_updated: string;
      uuid: string | null;
    }>(
      `SELECT id, project_id, name, classes, created_at, last_updated, uuid
       FROM vegetation_classifications
       WHERE project_id = ?
       ORDER BY created_at DESC`,
      [projectId],
    );

    return results.map(row => ({
      id: row.id,
      project_id: row.project_id,
      name: row.name,
      classes: JSON.parse(row.classes),
      created_at: row.created_at,
      last_updated: row.last_updated,
      uuid: row.uuid ?? null,
    }));
  } catch (error) {
    console.error("Error fetching vegetation classifications:", error);
    return [];
  }
}

/**
 * Gets all vegetation classifications for a project, backfilling a uuid (via
 * the shared uuid utility) for any row that doesn't have one yet. This is
 * what the project configuration package export uses.
 */
export async function getAllVegetationClassificationsEnsuringUuids(
  projectId: number,
): Promise<VegetationClassification[]> {
  const classifications = await getVegetationClassificationsByProject(projectId);
  const result: VegetationClassification[] = [];

  for (const classification of classifications) {
    if (classification.uuid) {
      result.push(classification);
    } else {
      const uuid = await ensureVegetationClassificationUuid(classification.id);
      result.push({ ...classification, uuid });
    }
  }

  return result;
}

/**
 * Gets a vegetation classification by its stable cross-device uuid, scoped
 * to a project (project sharing import dedupe, Fase 0).
 */
export async function getVegetationClassificationByUuid(
  projectId: number,
  uuid: string,
): Promise<VegetationClassification | null> {
  const row = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM vegetation_classifications WHERE project_id = ? AND uuid = ?",
    [projectId, uuid],
  );

  if (!row) return null;

  return getVegetationClassificationById(row.id);
}

/**
 * Gets a specific vegetation classification by ID
 */
export async function getVegetationClassificationById(
  classificationId: number,
): Promise<VegetationClassification | null> {
  try {
    const result = await db.getFirstAsync<{
      id: number;
      project_id: number;
      name: string;
      classes: string;
      created_at: string;
      last_updated: string;
      uuid: string | null;
    }>(
      `SELECT id, project_id, name, classes, created_at, last_updated, uuid
       FROM vegetation_classifications
       WHERE id = ?`,
      [classificationId],
    );

    if (!result) return null;

    return {
      id: result.id,
      project_id: result.project_id,
      name: result.name,
      classes: JSON.parse(result.classes),
      created_at: result.created_at,
      last_updated: result.last_updated,
      uuid: result.uuid ?? null,
    };
  } catch (error) {
    console.error("Error fetching vegetation classification:", error);
    return null;
  }
}

/**
 * Updates a vegetation classification
 */
export async function updateVegetationClassification(
  classificationId: number,
  name: string,
  classes: VegetationClass[],
): Promise<boolean> {
  try {
    const timestamp = new Date().toISOString();
    const classesJson = JSON.stringify(classes);

    await db.runAsync(
      `UPDATE vegetation_classifications
       SET name = ?, classes = ?, last_updated = ?
       WHERE id = ?`,
      [name, classesJson, timestamp, classificationId],
    );

    return true;
  } catch (error) {
    console.error("Error updating vegetation classification:", error);
    return false;
  }
}

/**
 * Deletes a vegetation classification
 */
export async function deleteVegetationClassification(
  classificationId: number,
): Promise<boolean> {
  try {
    await db.runAsync(
      `DELETE FROM vegetation_classifications WHERE id = ?`,
      [classificationId],
    );

    return true;
  } catch (error) {
    console.error("Error deleting vegetation classification:", error);
    return false;
  }
}

/**
 * Updates the project's active vegetation classification
 */
export async function setActiveVegetationClassification(
  projectId: number,
  classificationId: number | null,
  classificationType: "standard" | "custom" = "custom",
): Promise<boolean> {
  try {
    const timestamp = new Date().toISOString();

    await db.runAsync(
      `UPDATE projects
       SET vegetation_classification_type = ?, active_custom_vegetation_classification_id = ?, last_updated = ?
       WHERE id = ?`,
      [classificationType, classificationId, timestamp, projectId],
    );

    return true;
  } catch (error) {
    console.error("Error setting active vegetation classification:", error);
    return false;
  }
}

/**
 * Gets the active vegetation classification type and ID for a project
 */
export async function getActiveVegetationClassificationConfig(projectId: number): Promise<{
  type: "standard" | "custom";
  classificationId: number | null;
} | null> {
  try {
    const result = await db.getFirstAsync<{
      vegetation_classification_type: string;
      active_custom_vegetation_classification_id: number | null;
    }>(
      `SELECT vegetation_classification_type, active_custom_vegetation_classification_id
       FROM projects
       WHERE id = ?`,
      [projectId],
    );

    if (!result) return null;

    return {
      type: (result.vegetation_classification_type || "standard") as "standard" | "custom",
      classificationId: result.active_custom_vegetation_classification_id,
    };
  } catch (error) {
    console.error("Error fetching active vegetation classification config:", error);
    return null;
  }
}

/**
 * Returns the classification's uuid, generating and persisting one via the
 * shared uuid utility if it doesn't have one yet. Never regenerates an
 * existing uuid.
 */
export async function ensureVegetationClassificationUuid(
  classificationId: number,
): Promise<string> {
  const row = await db.getFirstAsync<{ uuid: string | null }>(
    "SELECT uuid FROM vegetation_classifications WHERE id = ?",
    [classificationId],
  );

  if (row?.uuid) return row.uuid;

  const uuid = generateUuid();
  await db.runAsync(
    "UPDATE vegetation_classifications SET uuid = ? WHERE id = ?",
    [uuid, classificationId],
  );
  return uuid;
}

/**
 * Persists a uuid that already exists elsewhere (e.g. imported from a
 * project configuration package) verbatim onto a classification row. Unlike
 * ensureVegetationClassificationUuid, this always overwrites - it must only
 * be called right after creating the row during import, to preserve
 * cross-device identity instead of generating a new random uuid.
 */
export async function setVegetationClassificationUuid(
  classificationId: number,
  uuid: string,
): Promise<void> {
  await db.runAsync(
    "UPDATE vegetation_classifications SET uuid = ? WHERE id = ?",
    [uuid, classificationId],
  );
}
