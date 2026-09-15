// src/db/queries/custom-protocols.ts
/**
 * Database queries for managing custom protocols
 */

import { db } from "@/db/initialize";
import { CustomProtocol, CustomProtocolSchema } from "@/types/database";
import {
  CustomProtocolDbRow,
  mapCustomProtocolFromDb,
  toDbProtocolSchema,
} from "@/db/mappers/custom-protocol.mapper";
import { generateUuid } from "@/core/utils/uuid";

// ============================================
// CREATE
// ============================================

/**
 * Create a new custom protocol
 */
export async function createCustomProtocol(
  name: string,
  schema: CustomProtocolSchema,
  theme: string,
  description?: string,
  collection_instructions?: string,
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO custom_protocols (name, theme, description, collection_instructions, schema, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      name,
      theme,
      description || null,
      collection_instructions || null,
      toDbProtocolSchema(schema),
    ],
  );

  return result.lastInsertRowId;
}

/**
 * Create a custom protocol carrying a uuid that already exists elsewhere
 * (e.g. imported from a project configuration package). The incoming uuid
 * is persisted verbatim so cross-device identity is preserved - never
 * generate a fresh one here.
 */
export async function createCustomProtocolWithUuid(
  name: string,
  schema: CustomProtocolSchema,
  theme: string,
  uuid: string,
  description?: string,
  collection_instructions?: string,
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO custom_protocols (name, theme, description, collection_instructions, schema, created_at, updated_at, uuid)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)`,
    [
      name,
      theme,
      description || null,
      collection_instructions || null,
      toDbProtocolSchema(schema),
      uuid,
    ],
  );

  return result.lastInsertRowId;
}

// ============================================
// READ
// ============================================

/**
 * Get all custom protocols
 */
export async function getAllCustomProtocols(): Promise<CustomProtocol[]> {
  const rows = await db.getAllAsync<CustomProtocolDbRow>(
    "SELECT * FROM custom_protocols ORDER BY created_at DESC",
  );
  return rows.map(mapCustomProtocolFromDb);
}

/**
 * Get a custom protocol by ID
 */
export async function getCustomProtocolById(
  id: number,
): Promise<CustomProtocol | null> {
  const row = await db.getFirstAsync<CustomProtocolDbRow>(
    "SELECT * FROM custom_protocols WHERE id = ?",
    [id],
  );

  if (!row) return null;

  return mapCustomProtocolFromDb(row);
}

/**
 * Get a custom protocol by its stable cross-device uuid (project sharing, Fase 0)
 */
export async function getCustomProtocolByUuid(
  uuid: string,
): Promise<CustomProtocol | null> {
  const row = await db.getFirstAsync<CustomProtocolDbRow>(
    "SELECT * FROM custom_protocols WHERE uuid = ?",
    [uuid],
  );

  if (!row) return null;

  return mapCustomProtocolFromDb(row);
}

/**
 * Get custom protocols by name (search)
 */
export async function searchCustomProtocols(
  searchTerm: string,
): Promise<CustomProtocol[]> {
  const rows = await db.getAllAsync<CustomProtocolDbRow>(
    "SELECT * FROM custom_protocols WHERE name LIKE ? OR description LIKE ? ORDER BY created_at DESC",
    [`%${searchTerm}%`, `%${searchTerm}%`],
  );

  return rows.map(mapCustomProtocolFromDb);
}

// ============================================
// UPDATE
// ============================================

/**
 * Update a custom protocol
 */
export async function updateCustomProtocol(
  id: number,
  updates: {
    name?: string;
    theme?: string;
    description?: string;
    collection_instructions?: string;
    schema?: CustomProtocolSchema;
  },
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }

  if (updates.theme !== undefined) {
    fields.push("theme = ?");
    values.push(updates.theme);
  }

  if (updates.description !== undefined) {
    fields.push("description = ?");
    values.push(updates.description);
  }

  if (updates.collection_instructions !== undefined) {
    fields.push("collection_instructions = ?");
    values.push(updates.collection_instructions);
  }

  if (updates.schema !== undefined) {
    fields.push("schema = ?");
    values.push(toDbProtocolSchema(updates.schema));
  }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  values.push(id);

  await db.runAsync(
    `UPDATE custom_protocols SET ${fields.join(", ")} WHERE id = ?`,
    values,
  );
}


// ============================================
// DELETE
// ============================================

/**
 * Delete a custom protocol (use with caution - check for projects using it first)
 */
export async function deleteCustomProtocol(id: number): Promise<void> {
  await db.runAsync("DELETE FROM custom_protocols WHERE id = ?", [id]);
}

// ============================================
// UTILITY
// ============================================

/**
 * Check if a protocol name already exists
 */
export async function protocolNameExists(
  name: string,
  excludeId?: number,
): Promise<boolean> {
  const query = excludeId
    ? "SELECT COUNT(*) as count FROM custom_protocols WHERE name = ? AND id != ?"
    : "SELECT COUNT(*) as count FROM custom_protocols WHERE name = ?";

  const params = excludeId ? [name, excludeId] : [name];
  const result = await db.getFirstAsync<{ count: number }>(query, params);

  return (result?.count || 0) > 0;
}

/**
 * Get count of projects using this protocol
 */
export async function getProtocolUsageCount(
  protocolId: number,
): Promise<number> {
  const result = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM projects WHERE protocol_id = ?",
    [String(protocolId)],
  );

  return result?.count || 0;
}

/**
 * Returns the custom protocol's uuid, generating and persisting one via the
 * shared uuid utility if it doesn't have one yet. Never regenerates an
 * existing uuid, so repeated calls (e.g. re-exporting a project's
 * configuration package) always return the same value.
 */
export async function ensureCustomProtocolUuid(id: number): Promise<string> {
  const row = await db.getFirstAsync<{ uuid: string | null }>(
    "SELECT uuid FROM custom_protocols WHERE id = ?",
    [id],
  );

  if (row?.uuid) return row.uuid;

  const uuid = generateUuid();
  await db.runAsync("UPDATE custom_protocols SET uuid = ? WHERE id = ?", [
    uuid,
    id,
  ]);
  return uuid;
}
