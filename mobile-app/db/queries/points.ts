import { db } from "@/db/initialize";
import type { Point, PointModule, PointWithModules } from "@/types/database";
import type { ProtocolRegistry } from "@/protocol-kernel/types";
import { buildPointWithModules } from "@/db/mappers/point.mapper";
import { generatePointId } from "@/utils/uuid";

// ──────────────────────────────────────────────
// Input types
// ──────────────────────────────────────────────

export interface CreatePointInput {
  project_id: number;
  protocol_id: string;
  lat: number;
  lon: number;
  altitude?: number | null;
  generated_name?: string | null;
  photos?: string | null;
  audio_notes?: string | null;
  additional_notes?: string | null;
  point_size?: number | null;
  schema_version: string;              // manifest version (applied to all modules)
  modules: Record<string, string>;     // moduleId → already-serialized data_json
  approval_status?: "local" | "pending" | "approved" | "rejected";
  created_by?: string | null;
  rejection_reason?: string | null;
  drive_synced_at?: string | null;
  id?: string; // if provided (sync), use this uuid instead of generating a new one
}

export type UpdatePointInput = Partial<Omit<CreatePointInput, "project_id" | "protocol_id">>;

// ──────────────────────────────────────────────
// Database functions
// ──────────────────────────────────────────────

export async function createPoint(input: CreatePointInput): Promise<string | null> {
  try {
    const now = new Date().toISOString();
    const id = input.id ?? generatePointId();

    // Next point_number for the project
    const maxRow = await db.getFirstAsync<{ max_num: number | null }>(
      "SELECT MAX(point_number) as max_num FROM points WHERE project_id = ?",
      [input.project_id],
    );
    const point_number = (maxRow?.max_num ?? 0) + 1;

    await db.runAsync(
      `INSERT INTO points
         (id, project_id, protocol_id, point_number, lat, lon, altitude,
          generated_name, photos, audio_notes, additional_notes, point_size,
          created_at, updated_at, created_by, approval_status, rejection_reason,
          drive_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.project_id,
        input.protocol_id,
        point_number,
        input.lat,
        input.lon,
        input.altitude ?? null,
        input.generated_name ?? null,
        input.photos ?? null,
        input.audio_notes ?? null,
        input.additional_notes ?? null,
        input.point_size ?? null,
        now,
        now,
        input.created_by ?? null,
        input.approval_status ?? "local",
        input.rejection_reason ?? null,
        input.drive_synced_at ?? null,
      ],
    );

    // Write modules
    for (const [module_id, data_json] of Object.entries(input.modules)) {
      await db.runAsync(
        `INSERT INTO point_modules (point_id, module_id, schema_version, data_json)
         VALUES (?, ?, ?, ?)`,
        [id, module_id, input.schema_version, data_json],
      );
    }

    // Projects list ("Meu Nomos") is ordered by projects.last_updated, so
    // adding a point must bump the parent project too, not just the point.
    await db.runAsync(
      "UPDATE projects SET last_updated = ? WHERE id = ?",
      [now, input.project_id],
    );

    return id;
  } catch (error) {
    console.error("Error creating point:", error);
    return null;
  }
}

export async function getPoint(
  pointId: string,
): Promise<{ point: Point; modules: PointModule[] } | null> {
  try {
    const point = await db.getFirstAsync<Point>(
      "SELECT * FROM points WHERE id = ?",
      [pointId],
    );
    if (!point) return null;

    const modules = await db.getAllAsync<PointModule>(
      "SELECT * FROM point_modules WHERE point_id = ?",
      [pointId],
    );

    return { point, modules };
  } catch (error) {
    console.error("Error loading point:", error);
    return null;
  }
}

export async function getPointById(pointId: string): Promise<Point | null> {
  try {
    const point = await db.getFirstAsync<Point>(
      "SELECT * FROM points WHERE id = ?",
      [pointId],
    );
    return point ?? null;
  } catch (error) {
    console.error("Error loading point by id:", error);
    return null;
  }
}

export async function pointExists(pointId: string): Promise<boolean> {
  try {
    const row = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM points WHERE id = ? LIMIT 1",
      [pointId],
    );
    return !!row;
  } catch (error) {
    console.error("Error checking point existence:", error);
    return false;
  }
}

export async function getPointsByProject(projectId: number): Promise<Point[]> {
  try {
    return await db.getAllAsync<Point>(
      "SELECT * FROM points WHERE project_id = ? ORDER BY point_number ASC",
      [projectId],
    );
  } catch (error) {
    console.error("Error listing project points:", error);
    return [];
  }
}

/**
 * All point ids for a project, regardless of approval_status - used for
 * bulk-exporting a collaborator's entire local project (no status filter,
 * unlike getPendingPointsByProject).
 */
export async function getAllPointIdsForProject(projectId: number): Promise<string[]> {
  try {
    const results = await db.getAllAsync<{ id: string }>(
      "SELECT id FROM points WHERE project_id = ?",
      [projectId],
    );
    return results.map((r) => r.id);
  } catch (error) {
    console.error("Error fetching point ids for project:", error);
    return [];
  }
}

export async function updatePoint(
  pointId: string,
  updates: UpdatePointInput,
): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    const fields: string[] = ["updated_at = ?"];
    const values: (string | number | null)[] = [now];

    if (updates.lat !== undefined) { fields.push("lat = ?"); values.push(updates.lat); }
    if (updates.lon !== undefined) { fields.push("lon = ?"); values.push(updates.lon); }
    if (updates.altitude !== undefined) { fields.push("altitude = ?"); values.push(updates.altitude ?? null); }
    if (updates.generated_name !== undefined) { fields.push("generated_name = ?"); values.push(updates.generated_name ?? null); }
    if (updates.photos !== undefined) { fields.push("photos = ?"); values.push(updates.photos ?? null); }
    if (updates.audio_notes !== undefined) { fields.push("audio_notes = ?"); values.push(updates.audio_notes ?? null); }
    if (updates.additional_notes !== undefined) { fields.push("additional_notes = ?"); values.push(updates.additional_notes ?? null); }
    if (updates.point_size !== undefined) { fields.push("point_size = ?"); values.push(updates.point_size ?? null); }
    if (updates.approval_status !== undefined) { fields.push("approval_status = ?"); values.push(updates.approval_status); }
    if (updates.created_by !== undefined) { fields.push("created_by = ?"); values.push(updates.created_by ?? null); }
    if (updates.rejection_reason !== undefined) { fields.push("rejection_reason = ?"); values.push(updates.rejection_reason ?? null); }
    if (updates.drive_synced_at !== undefined) { fields.push("drive_synced_at = ?"); values.push(updates.drive_synced_at ?? null); }

    values.push(pointId);
    await db.runAsync(
      `UPDATE points SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );

    // Update modules (upsert)
    if (updates.modules) {
      const version = updates.schema_version ?? "1.0.0";
      for (const [module_id, data_json] of Object.entries(updates.modules)) {
        await db.runAsync(
          `INSERT INTO point_modules (point_id, module_id, schema_version, data_json)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(point_id, module_id) DO UPDATE SET
             schema_version = excluded.schema_version,
             data_json = excluded.data_json`,
          [pointId, module_id, version, data_json],
        );
      }
    }

    // Projects list ("Meu Nomos") is ordered by projects.last_updated, so
    // editing a point must bump the parent project too, not just the point.
    await db.runAsync(
      "UPDATE projects SET last_updated = ? WHERE id = (SELECT project_id FROM points WHERE id = ?)",
      [now, pointId],
    );

    return true;
  } catch (error) {
    console.error("Error updating point:", error);
    return false;
  }
}

export async function deletePoint(pointId: string): Promise<boolean> {
  try {
    // Fetch project_id and point_number before deleting
    const row = await db.getFirstAsync<{ project_id: number; point_number: number }>(
      "SELECT project_id, point_number FROM points WHERE id = ?",
      [pointId],
    );
    if (!row) return false;

    // Delete point (point_modules and species cascade)
    await db.runAsync("DELETE FROM points WHERE id = ?", [pointId]);

    // Renumber subsequent points to keep a continuous sequence
    await db.runAsync(
      `UPDATE points
       SET point_number = point_number - 1
       WHERE project_id = ? AND point_number > ?`,
      [row.project_id, row.point_number],
    );

    // Projects list ("Meu Nomos") is ordered by projects.last_updated, so
    // deleting a point must bump the parent project too.
    await db.runAsync(
      "UPDATE projects SET last_updated = ? WHERE id = ?",
      [new Date().toISOString(), row.project_id],
    );

    return true;
  } catch (error) {
    console.error("Error deleting point:", error);
    return false;
  }
}

export async function countPointsByProject(projectId: number): Promise<number> {
  try {
    const row = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM points WHERE project_id = ?",
      [projectId],
    );
    return row?.count ?? 0;
  } catch (error) {
    console.error("Error counting points:", error);
    return 0;
  }
}

export async function getPendingPointsByProject(projectId: number): Promise<Point[]> {
  try {
    return await db.getAllAsync<Point>(
      "SELECT * FROM points WHERE project_id = ? AND approval_status = 'pending' ORDER BY point_number ASC",
      [projectId],
    );
  } catch (error) {
    console.error("Error listing pending points:", error);
    return [];
  }
}

export async function updatePointApprovalStatus(
  pointId: string,
  status: "local" | "pending" | "approved" | "rejected",
  rejectionReason?: string | null,
): Promise<boolean> {
  return updatePoint(pointId, { approval_status: status, rejection_reason: rejectionReason ?? null });
}

export async function getUnsyncedPointCount(projectId: number): Promise<number> {
  try {
    const row = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM points WHERE project_id = ? AND approval_status IN ('local', 'pending', 'rejected')",
      [projectId],
    );
    return row?.count ?? 0;
  } catch (error) {
    console.error("Error counting unsynced points:", error);
    return 0;
  }
}

export async function getPointsWithModulesByProject(
  projectId: number,
  registry: ProtocolRegistry,
): Promise<PointWithModules[]> {
  try {
    const points = await db.getAllAsync<Point>(
      "SELECT * FROM points WHERE project_id = ? ORDER BY point_number ASC",
      [projectId],
    );
    if (!points.length) return [];

    const ids = points.map((p) => p.id);
    const placeholders = ids.map(() => "?").join(",");
    const allModules = await db.getAllAsync<PointModule>(
      `SELECT * FROM point_modules WHERE point_id IN (${placeholders})`,
      ids,
    );

    const modulesByPoint = new Map<string, PointModule[]>();
    for (const mod of allModules) {
      const list = modulesByPoint.get(mod.point_id) ?? [];
      list.push(mod);
      modulesByPoint.set(mod.point_id, list);
    }

    return points.map((point) =>
      buildPointWithModules(point, modulesByPoint.get(point.id) ?? [], registry),
    );
  } catch (error) {
    console.error("Error loading points with modules:", error);
    return [];
  }
}

export async function classifyProjectPoints(projectId: number): Promise<boolean> {
  try {
    const points = await db.getAllAsync<{ id: string; generated_name: string | null }>(
      `SELECT id, generated_name FROM points
       WHERE project_id = ? ORDER BY point_number ASC, id ASC`,
      [projectId],
    );

    if (!points || points.length === 0) return true;

    const classByName = new Map<string, number>();
    let nextClassId = 1;

    for (const point of points) {
      const name = point.generated_name?.trim();

      if (!name) {
        await db.runAsync(
          "UPDATE points SET landscape_class_id = NULL WHERE id = ?",
          [point.id],
        );
        continue;
      }

      if (!classByName.has(name)) {
        classByName.set(name, nextClassId);
        nextClassId += 1;
      }

      await db.runAsync(
        "UPDATE points SET landscape_class_id = ? WHERE id = ?",
        [classByName.get(name) as number, point.id],
      );
    }

    return true;
  } catch (error) {
    console.error("Error classifying points:", error);
    return false;
  }
}
