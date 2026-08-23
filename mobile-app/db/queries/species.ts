/**
 * Queries for Species database operations
 * Handles CRUD operations and statistics for species records
 */

import { db } from "../initialize";
import { Species, SpeciesInput, SpeciesDiversity, SpeciesOccurrence } from "@/types/database";
import {
  mapSpeciesFromDb,
  validateSpeciesNames,
  normalizeCommonNames,
  serializeCommonNames,
  SpeciesDbRow,
} from "../mappers/species.mapper";
import {
  searchProjectSpeciesCatalogAutocomplete,
  getProjectSpeciesCatalogByProject,
} from "./project-species";

function normalizeSpeciesKey(scientificName?: string, commonNames?: string[]): string {
  const commonKey = (commonNames ?? [])
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(",");
  return `${scientificName?.trim().toLowerCase() ?? ""}__${commonKey}`;
}

/**
 * Creates a new species record in the database
 * @param data Species data to insert
 * @returns ID of the created species, or null if creation failed
 */
export async function createSpecies(data: SpeciesInput): Promise<number | null> {
  try {
    // Validate that at least one name is provided
    if (!validateSpeciesNames(data.scientific_name, data.common_names)) {
      console.error(
        "Species creation failed: At least one name (scientific or common) must be provided",
      );
      return null;
    }

    const timestamp = new Date().toISOString();

    const result = await db.runAsync(
      `INSERT INTO species (
        project_id,
        point_id,
        scientific_name,
        common_names,
        genus,
        family,
        abundance,
        created_at,
        last_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.project_id,
        data.point_id,
        data.scientific_name ?? null,
        serializeCommonNames(normalizeCommonNames(data.common_names)),
        data.genus ?? null,
        data.family ?? null,
        data.abundance != null ? Math.max(data.abundance, 1) : null, // null = not recorded
        timestamp,
        timestamp,
      ],
    );

    return result.lastInsertRowId ?? null;
  } catch (error) {
    console.error("Error creating species:", error);
    throw error;
  }
}

/**
 * Retrieves a species record by ID
 * @param speciesId ID of the species to retrieve
 * @returns Species object or null if not found
 */
export async function getSpeciesById(speciesId: number): Promise<Species | null> {
  try {
    const row = await db.getFirstAsync<SpeciesDbRow>(
      "SELECT * FROM species WHERE id = ?",
      [speciesId],
    );

    return row ? mapSpeciesFromDb(row) : null;
  } catch (error) {
    console.error("Error fetching species by ID:", error);
    throw error;
  }
}

/**
 * Retrieves all species for a specific point
 * @param pointId ID of the point
 * @returns Array of species at this point
 */
export async function getSpeciesByPoint(pointId: number): Promise<Species[]> {
  try {
    const rows = await db.getAllAsync<SpeciesDbRow>(
      "SELECT * FROM species WHERE point_id = ? ORDER BY scientific_name, common_names",
      [pointId],
    );

    return rows ? rows.map(mapSpeciesFromDb) : [];
  } catch (error) {
    console.error("Error fetching species by point:", error);
    throw error;
  }
}

/**
 * Searches for species with autocomplete functionality
 * Searches by scientific name or common name (case-insensitive)
 * @param projectId ID of the project to search within
 * @param searchText Text to search for
 * @param limit Maximum number of results to return
 * @returns Array of matching species
 */
export async function searchSpeciesAutocomplete(
  projectId: number,
  searchText: string,
  limit: number = 20,
): Promise<Species[]> {
  try {
    const lowerSearch = searchText.toLowerCase();
    const [surveyRows, catalogRows] = await Promise.all([
      db.getAllAsync<SpeciesDbRow>(
        `SELECT DISTINCT s.* FROM species s
         WHERE s.project_id = ?
         AND (
           LOWER(COALESCE(s.scientific_name, '')) LIKE ?
           OR LOWER(COALESCE(s.common_names, '')) LIKE ?
         )
         ORDER BY
           CASE
             WHEN LOWER(COALESCE(s.scientific_name, '')) LIKE ? THEN 0
             ELSE 1
           END,
           s.scientific_name,
           s.common_names
         LIMIT ?`,
        [projectId, `%${lowerSearch}%`, `%${lowerSearch}%`, `${lowerSearch}%`, limit],
      ),
      searchProjectSpeciesCatalogAutocomplete(projectId, searchText, limit),
    ]);

    const combined = [
      ...surveyRows.map(mapSpeciesFromDb),
      ...catalogRows.map((row) => ({
        ...row,
        common_name: undefined,
        common_names: row.common_name ? [row.common_name] : [],
      })),
    ];

    const deduped = new Map<string, Species>();
    for (const species of combined) {
      const key = normalizeSpeciesKey(species.scientific_name, species.common_names);
      if (!deduped.has(key)) {
        deduped.set(key, species);
      }
    }

    // The SQL "starts with" priority tier only works for scientific_name (common_names is
    // now serialized JSON text, so a raw SQL LIKE prefix match against it is meaningless).
    // Re-derive the common-name "starts with" boost here against the real parsed names.
    const results = Array.from(deduped.values()).sort((a, b) => {
      const scientificStartsA = a.scientific_name?.toLowerCase().startsWith(lowerSearch) ? 0 : 1;
      const scientificStartsB = b.scientific_name?.toLowerCase().startsWith(lowerSearch) ? 0 : 1;
      if (scientificStartsA !== scientificStartsB) return scientificStartsA - scientificStartsB;

      const commonStartsA = a.common_names?.some((n) => n.toLowerCase().startsWith(lowerSearch)) ? 0 : 1;
      const commonStartsB = b.common_names?.some((n) => n.toLowerCase().startsWith(lowerSearch)) ? 0 : 1;
      return commonStartsA - commonStartsB;
    });

    return results.slice(0, limit);
  } catch (error) {
    console.error("Error searching species autocomplete:", error);
    throw error;
  }
}

/**
 * Updates a species record
 * @param speciesId ID of the species to update
 * @param data Partial species data to update
 * @returns true if update was successful, false otherwise
 */
export async function updateSpecies(
  speciesId: number,
  data: Partial<SpeciesInput>,
): Promise<boolean> {
  try {
    // Get the current species to validate names
    const currentSpecies = await getSpeciesById(speciesId);
    if (!currentSpecies) {
      console.error("Species not found for update");
      return false;
    }

    // Validate that at least one name remains
    const newScientificName = data.scientific_name ?? currentSpecies.scientific_name;
    const newCommonNames = data.common_names ?? currentSpecies.common_names;

    if (!validateSpeciesNames(newScientificName, newCommonNames)) {
      console.error(
        "Species update failed: At least one name (scientific or common) must be provided",
      );
      return false;
    }

    const timestamp = new Date().toISOString();
    const updates: string[] = [];
    const values: any[] = [];

    // Build dynamic update query
    if (data.scientific_name !== undefined) {
      updates.push("scientific_name = ?");
      values.push(data.scientific_name || null);
    }

    if (data.common_names !== undefined) {
      updates.push("common_names = ?");
      values.push(serializeCommonNames(normalizeCommonNames(data.common_names)));
    }

    if (data.genus !== undefined) {
      updates.push("genus = ?");
      values.push(data.genus || null);
    }

    if (data.family !== undefined) {
      updates.push("family = ?");
      values.push(data.family || null);
    }

    if (data.abundance !== undefined) {
      updates.push("abundance = ?");
      values.push(data.abundance != null ? Math.max(data.abundance, 1) : null); // null = not recorded
    }

    if (updates.length === 0) {
      return true; // Nothing to update
    }

    updates.push("last_updated = ?");
    values.push(timestamp);
    values.push(speciesId);

    const query = `UPDATE species SET ${updates.join(", ")} WHERE id = ?`;
    await db.runAsync(query, values);

    return true;
  } catch (error) {
    console.error("Error updating species:", error);
    throw error;
  }
}

/**
 * Deletes a species record
 * @param speciesId ID of the species to delete
 * @returns true if deletion was successful
 */
export async function deleteSpecies(speciesId: number): Promise<boolean> {
  try {
    await db.runAsync("DELETE FROM species WHERE id = ?", [speciesId]);
    return true;
  } catch (error) {
    console.error("Error deleting species:", error);
    throw error;
  }
}

/**
 * Retrieves diversity statistics for a survey point
 * Including total species count and individual counts
 * @param surveyPointId ID of the survey point
 * @returns Diversity statistics
 */
export async function getSpeciesDiversityByPoint(
  pointId: number,
): Promise<SpeciesDiversity> {
  try {
    const rows = await db.getAllAsync<SpeciesDbRow>(
      "SELECT * FROM species WHERE point_id = ? ORDER BY scientific_name, common_names",
      [pointId],
    );

    if (!rows || rows.length === 0) {
      return {
        point_id: pointId,
        total_species_count: 0,
        total_individuals: 0,
        species_list: [],
      };
    }

    const species = rows.map(mapSpeciesFromDb);
    const totalIndividuals = species.reduce((sum, s) => sum + (s.abundance ?? 0), 0);

    return {
      point_id: pointId,
      total_species_count: species.length,
      total_individuals: totalIndividuals,
      species_list: species.map((s) => ({
        id: s.id,
        scientific_name: s.scientific_name,
        common_names: s.common_names,
        abundance: s.abundance,
      })),
    };
  } catch (error) {
    console.error("Error getting species diversity:", error);
    throw error;
  }
}

/**
 * Calculates the occurrence rate of a species across a project
 * @param speciesId ID of the species
 * @param projectId ID of the project
 * @returns Occurrence statistics
 */
export async function getSpeciesOccurrence(
  speciesId: number,
  projectId: number,
): Promise<SpeciesOccurrence | null> {
  try {
    // Get the species
    const species = await getSpeciesById(speciesId);
    if (!species) {
      return null;
    }

    // Count points where this species occurs in the project
    const occurrenceResult = await db.getFirstAsync<{ occurrence_count: number }>(
      `SELECT COUNT(DISTINCT point_id) as occurrence_count
       FROM species
       WHERE id = ? AND project_id = ?`,
      [speciesId, projectId],
    );

    // Get total points in the project
    const totalResult = await db.getFirstAsync<{ total_count: number }>(
      "SELECT COUNT(DISTINCT id) as total_count FROM points WHERE project_id = ?",
      [projectId],
    );

    const occurrenceCount = occurrenceResult?.occurrence_count ?? 0;
    const totalSurveyPoints = totalResult?.total_count ?? 0;
    const occurrenceRate =
      totalSurveyPoints > 0 ? (occurrenceCount / totalSurveyPoints) * 100 : 0;

    return {
      species_id: speciesId,
      scientific_name: species.scientific_name,
      common_names: species.common_names,
      occurrence_count: occurrenceCount,
      total_survey_points: totalSurveyPoints,
      occurrence_rate: Math.round(occurrenceRate * 100) / 100, // Round to 2 decimal places
    };
  } catch (error) {
    console.error("Error getting species occurrence:", error);
    throw error;
  }
}

/**
 * Gets all unique species in a project
 * Useful for building the autocomplete suggestion list
 * @param projectId ID of the project
 * @returns Array of unique species in the project
 */
export async function getUniqueSpeicesInProject(projectId: number): Promise<Species[]> {
  try {
    const [surveyRows, catalogRows] = await Promise.all([
      db.getAllAsync<SpeciesDbRow>(
        `SELECT DISTINCT s.* FROM species s
         WHERE s.project_id = ?
         ORDER BY s.scientific_name, s.common_names`,
        [projectId],
      ),
      getProjectSpeciesCatalogByProject(projectId),
    ]);

    const combined = [
      ...surveyRows.map(mapSpeciesFromDb),
      ...catalogRows.map((row) => ({
        id: row.id,
        project_id: row.project_id,
        point_id: 0,
        scientific_name: row.scientific_name,
        common_names: row.common_names?.map((cn) => cn.common_name) ?? [],
        abundance: 1,
        created_at: row.created_at,
        last_updated: row.last_updated,
      })),
    ];

    const deduped = new Map<string, Species>();
    for (const species of combined) {
      const key = normalizeSpeciesKey(species.scientific_name, species.common_names);
      if (!deduped.has(key)) {
        deduped.set(key, species);
      }
    }

    return Array.from(deduped.values());
  } catch (error) {
    console.error("Error getting unique species in project:", error);
    throw error;
  }
}
