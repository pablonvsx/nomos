import { ProjectSpeciesCatalog, Species } from "@/types/database";

export interface ProjectSpeciesCatalogDbRow extends ProjectSpeciesCatalog {}

export function mapProjectSpeciesCatalogFromDb(
  row: ProjectSpeciesCatalogDbRow,
): ProjectSpeciesCatalog {
  return {
    id: row.id,
    project_id: row.project_id,
    scientific_name: row.scientific_name,
    family: row.family,
    genus: row.genus,
    gbif_id: row.gbif_id,
    source: row.source,
    created_at: row.created_at,
    last_updated: row.last_updated,
    common_names: row.common_names,
  };
}

export function mapProjectSpeciesCatalogToSpeciesSuggestion(
  row: ProjectSpeciesCatalogDbRow,
): Species {
  return {
    id: row.id,
    project_id: row.project_id,
    point_id: 0,
    scientific_name: row.scientific_name ?? undefined,
    common_names: row.common_names?.map((cn) => cn.common_name) ?? [],
    abundance: 1,
    created_at: row.created_at,
    last_updated: row.last_updated,
  };
}

