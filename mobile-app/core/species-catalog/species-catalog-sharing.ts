import { ProjectSpeciesCatalog } from "@/types/database";

export type CatalogParseErrorCode =
  | "invalid_json"
  | "invalid_format"
  | "unsupported_version"
  | "missing_species_list";

// core/ cannot depend on the i18n context (one-way dependency rule), so this
// carries a stable `code` instead of a hardcoded message. The catching UI
// layer (which has access to t()) maps the code to a translated string.
export class CatalogParseError extends Error {
  code: CatalogParseErrorCode;

  constructor(code: CatalogParseErrorCode, message: string) {
    super(message);
    this.name = "CatalogParseError";
    this.code = code;
  }
}

export const CATALOG_FORMAT_VERSION = "1";
export const CATALOG_MIME_TYPE = "application/json";
export const CATALOG_FILE_EXTENSION = ".json";

const VALID_CATALOG_SOURCES: CatalogEntry["source"][] = [
  "gbif",
  "specieslink",
  "manual",
  "catalog",
];

function sanitizeCatalogSource(value: unknown): CatalogEntry["source"] {
  return typeof value === "string" &&
    (VALID_CATALOG_SOURCES as string[]).includes(value)
    ? (value as CatalogEntry["source"])
    : "catalog";
}

export interface CatalogEntry {
  scientific_name: string;
  family?: string;
  genus?: string;
  gbif_id?: string;
  source: "gbif" | "specieslink" | "manual" | "catalog";
  common_names: Array<{
    common_name: string;
    language: string;
    source: "gbif" | "specieslink" | "manual" | "catalog";
  }>;
}

export interface CatalogFile {
  version: string;
  format: "nomos-species-catalog";
  exported_at: string;
  species_count: number;
  species: CatalogEntry[];
}

export function exportCatalogToJson(
  species: ProjectSpeciesCatalog[],
  projectName?: string,
): { json: string; filename: string } {
  const catalog: CatalogFile = {
    version: CATALOG_FORMAT_VERSION,
    format: "nomos-species-catalog",
    exported_at: new Date().toISOString(),
    species_count: species.length,
    species: species.map((sp) => ({
      scientific_name: sp.scientific_name,
      family: sp.family,
      genus: sp.genus,
      gbif_id: sp.gbif_id,
      source: sp.source as CatalogEntry["source"],
      common_names: (sp.common_names ?? []).map((cn) => ({
        common_name: cn.common_name,
        language: cn.language,
        source: cn.source as CatalogEntry["common_names"][number]["source"],
      })),
    })),
  };

  const slug = projectName
    ? projectName.replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 30)
    : "catalogo";
  const date = new Date().toISOString().slice(0, 10);
  const filename = `nomos-${slug}-${date}${CATALOG_FILE_EXTENSION}`;

  return { json: JSON.stringify(catalog, null, 2), filename };
}

export function parseCatalogJson(json: string): {
  entries: CatalogEntry[];
  meta: Pick<CatalogFile, "exported_at" | "species_count">;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new CatalogParseError("invalid_json", "Invalid file: not valid JSON.");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as CatalogFile).format !== "nomos-species-catalog"
  ) {
    throw new CatalogParseError(
      "invalid_format",
      "Invalid file: unrecognized format. Make sure you are using a catalog exported by Nomos.",
    );
  }

  const catalog = parsed as CatalogFile;

  if (catalog.version !== CATALOG_FORMAT_VERSION) {
    throw new CatalogParseError(
      "unsupported_version",
      "Unsupported catalog version. This file was exported by a different version of Nomos.",
    );
  }

  if (!Array.isArray(catalog.species)) {
    throw new CatalogParseError("missing_species_list", "Corrupted file: species list is missing.");
  }

  const entries: CatalogEntry[] = catalog.species
    .filter(
      (sp) =>
        typeof sp === "object" &&
        sp !== null &&
        typeof sp.scientific_name === "string" &&
        sp.scientific_name.trim().length > 0,
    )
    .map((sp) => ({
      scientific_name: sp.scientific_name.trim(),
      family: sp.family ?? undefined,
      genus: sp.genus ?? undefined,
      gbif_id: sp.gbif_id ?? undefined,
      source: sanitizeCatalogSource(sp.source),
      common_names: Array.isArray(sp.common_names)
        ? sp.common_names
            .filter(
              (cn: unknown) =>
                typeof cn === "object" &&
                cn !== null &&
                typeof (cn as { common_name: unknown }).common_name === "string",
            )
            .map((cn: { common_name: string; language?: string; source?: string }) => ({
              common_name: cn.common_name.trim(),
              language: cn.language ?? "pt",
              source: sanitizeCatalogSource(cn.source),
            }))
        : [],
    }));

  return {
    entries,
    meta: {
      exported_at: catalog.exported_at ?? "",
      species_count: catalog.species_count ?? entries.length,
    },
  };
}
