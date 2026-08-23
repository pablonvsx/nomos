/**
 * Mapper for Species database operations
 * Handles conversion between database rows and TypeScript interfaces
 */

import { Species } from "@/types/database";
import { parseJsonText, isStringArray } from "./json-utils";

/**
 * Database row structure for species
 * common_names comes back from SQLite as a JSON-serialized string (or NULL), not string[]
 */
export interface SpeciesDbRow extends Omit<Species, "common_names"> {
  common_names: string | null;
}

/**
 * Maps a database row to a Species object
 */
export function mapSpeciesFromDb(row: SpeciesDbRow): Species {
  return {
    id: row.id,
    project_id: row.project_id,
    point_id: row.point_id,
    scientific_name: row.scientific_name ?? undefined,
    common_names: parseJsonText<string[]>(row.common_names, [], isStringArray),
    genus: row.genus ?? undefined,
    family: row.family ?? undefined,
    abundance: row.abundance,
    created_at: row.created_at,
    last_updated: row.last_updated,
  };
}

/**
 * Validates that at least one name (scientific or common) is provided
 */
export function validateSpeciesNames(
  scientific_name: string | undefined,
  common_names: string[] | undefined,
): boolean {
  return !!(
    (scientific_name && scientific_name.trim()) ||
    common_names?.some((name) => name.trim())
  );
}

/**
 * Trims and drops empty entries from a list of common names
 */
export function normalizeCommonNames(names?: string[]): string[] {
  return (names ?? []).map((name) => name.trim()).filter(Boolean);
}

/**
 * Serializes common names for storage; returns null (not "[]") when empty so the
 * "scientific_name IS NOT NULL OR common_names IS NOT NULL" CHECK constraint stays meaningful.
 */
export function serializeCommonNames(names: string[]): string | null {
  return names.length > 0 ? JSON.stringify(names) : null;
}
