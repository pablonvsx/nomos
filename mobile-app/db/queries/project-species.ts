/**
 * Project Species Catalog Queries (v2)
 * Manages CRUD operations for project species with support for multiple common names
 * Handles both catalog management and CSV import
 */

import { db } from "../initialize";
import {
  ProjectSpeciesCatalog,
  ProjectSpeciesCatalogInput,
  ProjectSpeciesCommonName,
  ProjectSpeciesCommonNameInput,
  Species,
} from "@/types/database";
import { generateUuid } from "@/utils/uuid";

const VALID_CATALOG_SOURCES: ProjectSpeciesCatalog["source"][] = [
  "gbif",
  "manual",
  "specieslink",
  "catalog",
];

function sanitizeCatalogSource(value: string): ProjectSpeciesCatalog["source"] {
  return (VALID_CATALOG_SOURCES as string[]).includes(value)
    ? (value as ProjectSpeciesCatalog["source"])
    : "catalog";
}

// Projects list ("Meu Nomos") is ordered by projects.last_updated, so
// editing the species catalog (add/edit/delete species or common names)
// must bump the parent project too, not just the catalog row.
async function touchProject(projectId: number): Promise<void> {
  await db.runAsync(
    "UPDATE projects SET last_updated = ? WHERE id = ?",
    [new Date().toISOString(), projectId],
  );
}

async function touchProjectBySpeciesId(speciesId: number): Promise<void> {
  await db.runAsync(
    "UPDATE projects SET last_updated = ? WHERE id = (SELECT project_id FROM project_species_catalog WHERE id = ?)",
    [new Date().toISOString(), speciesId],
  );
}

/**
 * Get all species for a project with their common names
 */
export async function getProjectSpeciesCatalogByProject(
  projectId: number,
): Promise<ProjectSpeciesCatalog[]> {
  try {
    const species = await db.getAllAsync<any>(
      `SELECT * FROM project_species_catalog 
       WHERE project_id = ? 
       ORDER BY scientific_name`,
      [projectId],
    );

    // Fetch common names for each species
    const result: ProjectSpeciesCatalog[] = [];
    for (const sp of species) {
      const commonNames = await db.getAllAsync<ProjectSpeciesCommonName>(
        `SELECT * FROM project_species_common_names 
         WHERE species_id = ? 
         ORDER BY language, common_name`,
        [sp.id],
      );

      result.push({
        id: sp.id,
        project_id: sp.project_id,
        scientific_name: sp.scientific_name,
        family: sp.family,
        genus: sp.genus,
        gbif_id: sp.gbif_id,
        source: sp.source,
        created_at: sp.created_at,
        last_updated: sp.last_updated,
        common_names: commonNames,
        uuid: sp.uuid ?? null,
      });
    }

    return result;
  } catch (error) {
    console.error("Error fetching project species catalog:", error);
    return [];
  }
}

/**
 * Get a single species with its common names
 */
export async function getProjectSpeciesById(
  speciesId: number,
): Promise<ProjectSpeciesCatalog | null> {
  try {
    const species = await db.getFirstAsync<any>(
      `SELECT * FROM project_species_catalog WHERE id = ?`,
      [speciesId],
    );

    if (!species) return null;

    const commonNames = await db.getAllAsync<ProjectSpeciesCommonName>(
      `SELECT * FROM project_species_common_names 
       WHERE species_id = ? 
       ORDER BY language, common_name`,
      [speciesId],
    );

    return {
      id: species.id,
      project_id: species.project_id,
      scientific_name: species.scientific_name,
      family: species.family,
      genus: species.genus,
      gbif_id: species.gbif_id,
      source: species.source,
      created_at: species.created_at,
      last_updated: species.last_updated,
      common_names: commonNames,
      uuid: species.uuid ?? null,
    };
  } catch (error) {
    console.error("Error fetching species:", error);
    return null;
  }
}

/**
 * Create a new species in the project catalog
 */
export async function createProjectSpecies(
  data: ProjectSpeciesCatalogInput,
): Promise<number | null> {
  try {
    const now = new Date().toISOString();

    const result = await db.runAsync(
      `INSERT INTO project_species_catalog
       (project_id, scientific_name, family, genus, gbif_id, source, created_at, last_updated, uuid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.project_id,
        data.scientific_name,
        data.family || null,
        data.genus || null,
        data.gbif_id || null,
        data.source || "manual",
        now,
        now,
        data.uuid ?? generateUuid(),
      ],
    );

    const speciesId = result.lastInsertRowId as number;

    // Insert common names if provided
    if (data.common_names && data.common_names.length > 0) {
      for (const commonName of data.common_names) {
        await addCommonNameToSpecies(speciesId, commonName);
      }
    }

    await touchProject(data.project_id);

    return speciesId;
  } catch (error) {
    console.error("Error creating species:", error);
    return null;
  }
}

/**
 * Backfills the uuid of a species catalog entry created before this column
 * existed, so it stops being silently skipped by reference-data sync.
 */
export async function setProjectSpeciesUuid(
  id: number,
  uuid: string,
): Promise<void> {
  await db.runAsync(
    "UPDATE project_species_catalog SET uuid = ? WHERE id = ?",
    [uuid, id],
  );
}

/**
 * Finds the local id of a species catalog entry by its gbif_id, used to
 * reconcile a UNIQUE(project_id, gbif_id) conflict during reference-data
 * sync (see reference-data-sync-service.ts).
 */
export async function getProjectSpeciesIdByGbifId(
  projectId: number,
  gbifId: string,
): Promise<number | null> {
  try {
    const row = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM project_species_catalog WHERE project_id = ? AND gbif_id = ?",
      [projectId, gbifId],
    );
    return row?.id ?? null;
  } catch (error) {
    console.error("Error fetching species id by gbif_id:", error);
    return null;
  }
}

/**
 * Update an existing species
 */
export async function updateProjectSpecies(
  speciesId: number,
  data: Partial<ProjectSpeciesCatalogInput>,
): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    
    const updates = [];
    const params = [];

    if (data.scientific_name !== undefined) {
      updates.push("scientific_name = ?");
      params.push(data.scientific_name);
    }
    if (data.family !== undefined) {
      updates.push("family = ?");
      params.push(data.family);
    }
    if (data.genus !== undefined) {
      updates.push("genus = ?");
      params.push(data.genus);
    }
    if (data.gbif_id !== undefined) {
      updates.push("gbif_id = ?");
      params.push(data.gbif_id);
    }

    if (updates.length === 0) return true;

    updates.push("last_updated = ?");
    params.push(now);
    params.push(speciesId);

    await db.runAsync(
      `UPDATE project_species_catalog
       SET ${updates.join(", ")}
       WHERE id = ?`,
      params,
    );

    await touchProjectBySpeciesId(speciesId);

    return true;
  } catch (error) {
    console.error("Error updating species:", error);
    return false;
  }
}

/**
 * Update an existing species with its common names
 * This function updates the species data and replaces all common names
 */
export async function updateProjectSpeciesWithCommonNames(
  speciesId: number,
  data: {
    scientific_name?: string;
    family?: string;
    genus?: string;
    common_names?: Array<{
      common_name: string;
      language: string;
      source?: ProjectSpeciesCommonName["source"];
    }>;
  },
): Promise<boolean> {
  try {
    const now = new Date().toISOString();

    // Update basic species data
    const updates = [];
    const params = [];

    if (data.scientific_name !== undefined) {
      updates.push("scientific_name = ?");
      params.push(data.scientific_name);
    }
    if (data.family !== undefined) {
      updates.push("family = ?");
      params.push(data.family);
    }
    if (data.genus !== undefined) {
      updates.push("genus = ?");
      params.push(data.genus);
    }

    if (updates.length > 0) {
      updates.push("last_updated = ?");
      params.push(now);
      params.push(speciesId);

      await db.runAsync(
        `UPDATE project_species_catalog 
         SET ${updates.join(", ")} 
         WHERE id = ?`,
        params,
      );
    }

    // Delete all existing common names for this species
    await db.runAsync(
      `DELETE FROM project_species_common_names WHERE species_id = ?`,
      [speciesId],
    );

    // Insert new common names
    if (data.common_names && data.common_names.length > 0) {
      for (const commonName of data.common_names) {
        await db.runAsync(
          `INSERT INTO project_species_common_names
           (species_id, common_name, language, source, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            speciesId,
            commonName.common_name,
            commonName.language || "pt",
            commonName.source || "manual",
            now,
          ],
        );
      }
    }

    await touchProjectBySpeciesId(speciesId);

    return true;
  } catch (error) {
    console.error("Error updating species with common names:", error);
    return false;
  }
}

/**
 * Delete a species and all its common names
 */
export async function deleteProjectSpecies(speciesId: number): Promise<boolean> {
  try {
    // Fetch project_id before deleting - the row (and thus the subquery
    // touchProjectBySpeciesId relies on) won't exist afterwards.
    const row = await db.getFirstAsync<{ project_id: number }>(
      `SELECT project_id FROM project_species_catalog WHERE id = ?`,
      [speciesId],
    );

    await db.runAsync(
      `DELETE FROM project_species_catalog WHERE id = ?`,
      [speciesId],
    );

    if (row) await touchProject(row.project_id);

    return true;
  } catch (error) {
    console.error("Error deleting species:", error);
    return false;
  }
}

/**
 * Delete all species from a project catalog
 */
export async function deleteAllProjectSpeciesByProject(projectId: number): Promise<boolean> {
  try {
    await db.runAsync(
      `DELETE FROM project_species_catalog WHERE project_id = ?`,
      [projectId],
    );
    await touchProject(projectId);
    return true;
  } catch (error) {
    console.error("Error deleting all project species:", error);
    return false;
  }
}

/**
 * Add a common name to a species
 */
export async function addCommonNameToSpecies(
  speciesId: number,
  data: ProjectSpeciesCommonNameInput,
): Promise<number | null> {
  try {
    const now = new Date().toISOString();
    
    const result = await db.runAsync(
      `INSERT INTO project_species_common_names
       (species_id, common_name, language, source, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        speciesId,
        data.common_name,
        data.language || "pt",
        data.source || "manual",
        now,
      ],
    );

    await touchProjectBySpeciesId(speciesId);

    return result.lastInsertRowId as number;
  } catch (error) {
    console.error("Error adding common name:", error);
    return null;
  }
}

/**
 * Remove a common name from a species
 */
export async function removeCommonNameFromSpecies(commonNameId: number): Promise<boolean> {
  try {
    // Fetch species_id before deleting - the row won't exist afterwards.
    const row = await db.getFirstAsync<{ species_id: number }>(
      `SELECT species_id FROM project_species_common_names WHERE id = ?`,
      [commonNameId],
    );

    await db.runAsync(
      `DELETE FROM project_species_common_names WHERE id = ?`,
      [commonNameId],
    );

    if (row) await touchProjectBySpeciesId(row.species_id);

    return true;
  } catch (error) {
    console.error("Error removing common name:", error);
    return false;
  }
}

/**
 * Get common names for a species in a specific language
 */
export async function getSpeciesCommonNamesByLanguage(
  speciesId: number,
  language: string,
): Promise<string[]> {
  try {
    const names = await db.getAllAsync<{ common_name: string }>(
      `SELECT common_name FROM project_species_common_names 
       WHERE species_id = ? AND language = ? 
       ORDER BY common_name`,
      [speciesId, language],
    );

    return names.map(n => n.common_name);
  } catch (error) {
    console.error("Error fetching common names:", error);
    return [];
  }
}

/**
 * Check if a species already exists in project catalog by scientific name
 */
export async function projectSpeciesExists(
  projectId: number,
  scientificName: string,
): Promise<boolean> {
  try {
    const result = await db.getFirstAsync(
      `SELECT id FROM project_species_catalog 
       WHERE project_id = ? AND LOWER(scientific_name) = LOWER(?)`,
      [projectId, scientificName],
    );

    return !!result;
  } catch (error) {
    console.error("Error checking species existence:", error);
    return false;
  }
}

/**
 * Import species from GBIF search results
 */
export async function importSpeciesFromGBIF(
  projectId: number,
  gbifResults: Array<{
    scientificName: string;
    family?: string;
    genus?: string;
    gbif_id?: string;
    commonNames: Array<{ name: string; language: string }>;
  }>,
): Promise<{ inserted: number; skipped: number; insertedIds: number[] }> {
  let inserted = 0;
  let skipped = 0;
  const insertedIds: number[] = [];

  try {
    for (const result of gbifResults) {
      // Check if species already exists
      const exists = await projectSpeciesExists(projectId, result.scientificName);
      if (exists) {
        skipped++;
        continue;
      }

      // Create species
      const speciesId = await createProjectSpecies({
        project_id: projectId,
        scientific_name: result.scientificName,
        family: result.family,
        genus: result.genus,
        gbif_id: result.gbif_id,
        source: "gbif",
        common_names: result.commonNames.map(cn => ({
          common_name: cn.name,
          language: cn.language,
          source: "gbif" as const,
        })),
      });

      if (speciesId) {
        inserted++;
        insertedIds.push(speciesId);
      } else {
        skipped++;
      }
    }
  } catch (error) {
    console.error("Error importing species from GBIF:", error);
  }

  return { inserted, skipped, insertedIds };
}

/**
 * Get suggestions for autocomplete (search across species by name)
 */
export async function searchProjectSpecies(
  projectId: number,
  searchText: string,
  language: string = "pt",
  limit: number = 20,
): Promise<Array<{ id: number; scientificName: string; commonNames: string[] }>> {
  try {
    const normalized = `%${searchText.toLowerCase()}%`;
    
    // Search by scientific name
    const scientific = await db.getAllAsync<any>(
      `SELECT DISTINCT sp.id, sp.scientific_name 
       FROM project_species_catalog sp 
       WHERE sp.project_id = ? 
       AND LOWER(sp.scientific_name) LIKE ? 
       LIMIT ?`,
      [projectId, normalized, limit],
    );

    // Search by common name
    const byCommon = await db.getAllAsync<any>(
      `SELECT DISTINCT sp.id, sp.scientific_name 
       FROM project_species_catalog sp 
       INNER JOIN project_species_common_names scn ON sp.id = scn.species_id 
       WHERE sp.project_id = ? 
       AND LOWER(scn.common_name) LIKE ? 
       LIMIT ?`,
      [projectId, normalized, limit],
    );

    // Combine and deduplicate
    const combined = new Map<number, any>();
    
    for (const item of [...scientific, ...byCommon]) {
      if (!combined.has(item.id)) {
        combined.set(item.id, {
          id: item.id,
          scientificName: item.scientific_name,
          commonNames: [],
        });
      }
    }

    // Fetch common names for each result
    const results = [];
    for (const [id, item] of combined) {
      const commonNames = await getSpeciesCommonNamesByLanguage(id, language);
      results.push({
        id,
        scientificName: item.scientificName,
        commonNames,
      });
    }

    return results;
  } catch (error) {
    console.error("Error searching species:", error);
    return [];
  }
}

/**
 * Search project species catalog with autocomplete support
 * Searches in scientific names and all common names
 * Returns species with first common name for display
 */
export async function searchProjectSpeciesCatalogAutocomplete(
  projectId: number,
  searchText: string,
  limit = 20,
): Promise<any[]> {
  try {
    const searchPattern = `%${searchText.toLowerCase()}%`;
    const startPattern = `${searchText.toLowerCase()}%`;

    // Search in both scientific names and common names with JOIN
    const rows = await db.getAllAsync<any>(
      `SELECT DISTINCT psc.id, psc.scientific_name, psc.family, psc.genus, psc.gbif_id, psc.source, psc.created_at, psc.last_updated
       FROM project_species_catalog psc
       LEFT JOIN project_species_common_names pscn ON psc.id = pscn.species_id
       WHERE psc.project_id = ?
         AND (
           LOWER(COALESCE(psc.scientific_name, '')) LIKE ?
           OR LOWER(COALESCE(pscn.common_name, '')) LIKE ?
         )
       ORDER BY
         CASE
           WHEN LOWER(COALESCE(psc.scientific_name, '')) LIKE ? THEN 0
           WHEN LOWER(COALESCE(pscn.common_name, '')) LIKE ? THEN 1
           ELSE 2
         END,
         psc.scientific_name
       LIMIT ?`,
      [projectId, searchPattern, searchPattern, startPattern, startPattern, limit],
    );

    // Map rows with their first common name
    const results = [];
    for (const row of rows) {
      // Get first common name for this species
      const commonNameRow = await db.getFirstAsync<any>(
        `SELECT common_name FROM project_species_common_names 
         WHERE species_id = ? 
         ORDER BY language, common_name 
         LIMIT 1`,
        [row.id],
      );

      results.push({
        id: row.id,
        project_id: projectId,
        point_id: "",
        scientific_name: row.scientific_name,
        family: row.family,
        genus: row.genus,
        common_name: commonNameRow?.common_name || undefined,
        abundance: 1,
        created_at: row.created_at,
        last_updated: row.last_updated,
      });
    }

    return results;
  } catch (error) {
    console.error("Error searching project species catalog:", error);
    return [];
  }
}

/**
 * Import species from SpeciesLink search results
 * SpeciesLink data is particularly robust for Brazilian biodiversity
 */
export async function importSpeciesFromSpeciesLink(
  projectId: number,
  speciesLinkResults: Array<{
    scientificName: string;
    family?: string;
    genus?: string;
    specificEpithet?: string;
    commonNames: Array<{ name: string; language: string }>;
    sourceDetails?: {
      institutionCode?: string;
      collectionCode?: string;
      recordedBy?: string;
      yearCollected?: number;
      basisOfRecord?: string;
      locality?: string;
      stateProvince?: string;
    };
  }>,
): Promise<{ inserted: number; skipped: number; insertedIds: number[] }> {
  let inserted = 0;
  let skipped = 0;
  const insertedIds: number[] = [];

  try {
    for (const result of speciesLinkResults) {
      // Check if species already exists
      const exists = await projectSpeciesExists(projectId, result.scientificName);
      if (exists) {
        skipped++;
        continue;
      }

      // Create species
      const speciesId = await createProjectSpecies({
        project_id: projectId,
        scientific_name: result.scientificName,
        family: result.family,
        genus: result.genus,
        gbif_id: undefined, // SpeciesLink doesn't use GBIF IDs
        source: "specieslink",
        common_names: result.commonNames.map(cn => ({
          common_name: cn.name,
          language: cn.language,
          source: "specieslink" as const,
        })),
      });

      if (speciesId) {
        inserted++;
        insertedIds.push(speciesId);
      } else {
        skipped++;
      }
    }
  } catch (error) {
    console.error("Error importing species from SpeciesLink:", error);
  }

  return { inserted, skipped, insertedIds };
}

/**
 * Import species from a Nomos catalog JSON file.
 * New species are inserted; existing ones get their common names merged
 * (new names are added without removing locally added ones).
 */
export async function importSpeciesFromCatalog(
  projectId: number,
  entries: Array<{
    scientific_name: string;
    family?: string;
    genus?: string;
    gbif_id?: string;
    source: string;
    common_names: Array<{
      common_name: string;
      language: string;
      source: string;
    }>;
  }>,
): Promise<{ inserted: number; merged: number; skipped: number }> {
  let inserted = 0;
  let merged = 0;
  let skipped = 0;

  try {
    for (const entry of entries) {
      if (!entry.scientific_name?.trim()) {
        skipped++;
        continue;
      }

      const existing = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM project_species_catalog
         WHERE project_id = ? AND LOWER(scientific_name) = LOWER(?)`,
        [projectId, entry.scientific_name.trim()],
      );

      if (!existing) {
        const speciesId = await createProjectSpecies({
          project_id: projectId,
          scientific_name: entry.scientific_name.trim(),
          family: entry.family,
          genus: entry.genus,
          gbif_id: entry.gbif_id,
          source: sanitizeCatalogSource(entry.source),
          common_names: entry.common_names.map((cn) => ({
            common_name: cn.common_name,
            language: cn.language,
            source: sanitizeCatalogSource(cn.source),
          })),
        });
        if (speciesId) inserted++;
        else skipped++;
      } else {
        // Merge common names: insert only those not already present
        let addedAny = false;
        for (const cn of entry.common_names) {
          if (!cn.common_name?.trim()) continue;
          try {
            await db.runAsync(
              `INSERT OR IGNORE INTO project_species_common_names
               (species_id, common_name, language, source, created_at)
               VALUES (?, ?, ?, ?, ?)`,
              [
                existing.id,
                cn.common_name.trim(),
                cn.language ?? "pt",
                sanitizeCatalogSource(cn.source),
                new Date().toISOString(),
              ],
            );
            addedAny = true;
          } catch {
            // Duplicate — silently skip
          }
        }
        if (addedAny) merged++;
        else skipped++;
      }
    }

    // The `inserted` case already bumps the project via createProjectSpecies;
    // the merge-only case (existing species, new common names) needs its own touch.
    if (merged > 0) {
      await touchProject(projectId);
    }
  } catch (error) {
    console.error("Error importing species from catalog:", error);
  }

  return { inserted, merged, skipped };
}
