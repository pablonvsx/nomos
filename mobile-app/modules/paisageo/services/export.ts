import type { PointEnvelope, ProjectRef, LanguageCode } from "@/protocol-kernel/types";
import { buildProtocolExportPlan } from "@/core/export/generic-export-engine";
import { EXTRA_POINT_COLUMNS } from "./export-columns";
import { paisageoManifest } from "../manifest";
import { getSpeciesByPoint } from "@/db/queries/species";
import { ProtocolExporter, MediaFiles, AudioNote } from "@/core/export/types";
import { escapeCsv, writeAndShare } from "@/core/export/file-writer";
import { getTranslations } from "@/utils/i18n";
import { IMPACTS_FIELD_CONFIG } from "../modules/impacts/impact-types-config";
import type { ImpactsModuleData } from "../modules/impacts/serde";

const SPECIES_COLUMNS = [
  "veg_species",
  "veg_species_scientific",
  "veg_species_common",
  "veg_species_abundance",
] as const;

async function fetchSpeciesRow(pointId: string): Promise<Array<string | null>> {
  try {
    const species = await getSpeciesByPoint(parseInt(pointId));
    if (!species || species.length === 0) return ["", "", "", ""];
    // Names of the same species are joined with ", "; different species stay separated by "; ".
    const namesOf = (s: (typeof species)[number]) => (s.common_names ?? []).join(", ");
    return [
      species.map((s) => s.scientific_name || namesOf(s)).filter(Boolean).join("; "),
      species.filter((s) => s.scientific_name).map((s) => s.scientific_name).join("; "),
      species.map(namesOf).filter(Boolean).join("; "),
      species.map((s) => `${s.scientific_name || namesOf(s) || "?"}: ${s.abundance ?? ""}`).join("; "),
    ];
  } catch {
    return ["", "", "", ""];
  }
}

// --- Impact magnitude descriptions (derived, not part of the generic
// column engine: it's a type x magnitude lookup, protocol-specific and
// outside the scope of core/schema's field-driven column building) ---

function localize(field: Record<string, string> | undefined, language: LanguageCode): string {
  if (!field) return "";
  return field[language] ?? field["pt"] ?? "";
}

function magnitudeDescriptionFor(type: string, magnitude: string, language: LanguageCode): string {
  const option = IMPACTS_FIELD_CONFIG.options.find((o) => o.key === type);
  const magIndex = IMPACTS_FIELD_CONFIG.config.magnitude_options.findIndex((m) => m.value === magnitude);
  if (!option || magIndex < 0) return "";
  return localize(option.magnitude_desc?.[magIndex], language);
}

export function impactMagnitudeDescColumns(points: PointEnvelope[], language: LanguageCode) {
  const max = points.reduce((acc, p) => {
    const data = p.modules["impacts"] as ImpactsModuleData | undefined;
    return Math.max(acc, data?.impacts?.length ?? 0);
  }, 0);

  const label = getTranslations(language).surveyView.magnitudeDescription;
  const keys = Array.from({ length: max }, (_, i) => `impact_${i + 1}_magnitude_desc`);
  const headers = keys.map((_, i) => `${label} ${i + 1}`);

  const rowFor = (p: PointEnvelope): string[] => {
    const data = p.modules["impacts"] as ImpactsModuleData | undefined;
    const items = data?.impacts ?? [];
    return Array.from({ length: max }, (_, i) => {
      const item = items[i];
      return item ? magnitudeDescriptionFor(item.type, item.magnitude, language) : "";
    });
  };

  return { keys, headers, rowFor };
}

// --- GeoJSON Export ---

async function exportGeoJSON(points: PointEnvelope[], project: ProjectRef, language: LanguageCode): Promise<void> {
  const plan = buildProtocolExportPlan(paisageoManifest.modules, points, language, EXTRA_POINT_COLUMNS);
  const impactDescCols = impactMagnitudeDescColumns(points, language);

  const features = await Promise.all(
    points.map(async (p) => {
      const props = plan.toGeoJSONProperties(p);
      const impactDescRow = impactDescCols.rowFor(p);
      impactDescCols.keys.forEach((key, i) => {
        props[key] = impactDescRow[i] ?? null;
      });
      const speciesRow = await fetchSpeciesRow(p.id);
      SPECIES_COLUMNS.forEach((col, i) => {
        props[col] = speciesRow[i] ?? null;
      });
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [p.lon, p.lat, p.altitude ?? 0],
        },
        properties: props,
      };
    }),
  );

  const geojsonData = {
    type: "FeatureCollection",
    features,
    properties: {
      project_name: project.name,
      project_id: project.id,
      exported_at: new Date().toISOString(),
    },
  };

  const safeName = project.name.replace(/[^a-z0-9]/gi, "_");
  await writeAndShare(
    `${safeName}_geojson_${Date.now()}.geojson`,
    JSON.stringify(geojsonData, null, 2),
    "application/geo+json",
  );
}

// --- CSV Export ---

async function exportCSV(points: PointEnvelope[], project: ProjectRef, language: LanguageCode): Promise<void> {
  const plan = buildProtocolExportPlan(paisageoManifest.modules, points, language, EXTRA_POINT_COLUMNS);
  const impactDescCols = impactMagnitudeDescColumns(points, language);
  const headers = [...plan.columns.map((c) => c.key), ...impactDescCols.headers, ...SPECIES_COLUMNS];

  const rows = await Promise.all(
    points.map(async (p) => {
      const baseValues = plan.rowFor(p);
      const impactDescValues = impactDescCols.rowFor(p);
      const speciesRow = await fetchSpeciesRow(p.id);
      return [...baseValues, ...impactDescValues, ...speciesRow].map(escapeCsv).join(",");
    }),
  );

  const csvContent = [headers.join(","), ...rows].join("\n");
  const safeName = project.name.replace(/[^a-z0-9]/gi, "_");
  await writeAndShare(`${safeName}_data.csv`, csvContent, "text/csv");
}

// --- Media Extraction ---

async function extractMedia(point: PointEnvelope, _project: ProjectRef): Promise<MediaFiles> {
  const photos = point.photos ?? [];
  const audioNotes: AudioNote[] = (point.audioNotes ?? []).map((n) => ({
    uri: n.uri,
    duration: n.duration,
    timestamp: n.timestamp,
  }));
  const notes = point.additionalNotes ?? [];
  return { photos, audioNotes, notes };
}

// --- Exporter ---

export const paisageoExporter: ProtocolExporter = {
  exportGeoJSON,
  exportCSV,
  extractMedia,
};
