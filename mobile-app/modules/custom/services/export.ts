import type { PointEnvelope, ProjectRef, ModuleDescriptor, LanguageCode } from "@/protocol-kernel/types";
import { ProtocolExporter, MediaFiles, AudioNote } from "@/core/export/types";
import { escapeCsv, writeAndShare } from "@/core/export/file-writer";
import { buildProtocolExportPlan } from "@/core/export/generic-export-engine";
import { getCustomProtocolById } from "@/db/queries/custom-protocols";
import { buildCustomModuleDescriptor } from "@/modules/custom/manifest";
import { parsePhotoUris, parseJsonText } from "@/db/mappers/json-utils";

async function resolveCustomModules(protocolId: string): Promise<ModuleDescriptor[]> {
  const cpId = parseInt(protocolId, 10);
  if (isNaN(cpId)) return [];
  const cp = await getCustomProtocolById(cpId);
  if (!cp) return [];
  return cp.schema.sections.map(buildCustomModuleDescriptor);
}

// extractMedia is called once per point during media export; caches the
// schema resolution per protocolId to avoid repeating the same DB query
// for every point of the same project.
let cachedModules: { protocolId: string; modules: Promise<ModuleDescriptor[]> } | null = null;
function resolveCustomModulesCached(protocolId: string): Promise<ModuleDescriptor[]> {
  if (cachedModules?.protocolId !== protocolId) {
    cachedModules = { protocolId, modules: resolveCustomModules(protocolId) };
  }
  return cachedModules.modules;
}

// --- GeoJSON Export ---

async function exportGeoJSON(points: PointEnvelope[], project: ProjectRef, language: LanguageCode): Promise<void> {
  const modules = await resolveCustomModules(project.protocolId);
  const plan = buildProtocolExportPlan(modules, points, language);

  const features = points.map((p) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [p.lon, p.lat, p.altitude ?? 0],
    },
    properties: plan.toGeoJSONProperties(p),
  }));

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
    `${safeName}_custom_${Date.now()}.geojson`,
    JSON.stringify(geojsonData, null, 2),
    "application/geo+json",
  );
}

// --- CSV Export ---

async function exportCSV(points: PointEnvelope[], project: ProjectRef, language: LanguageCode): Promise<void> {
  const modules = await resolveCustomModules(project.protocolId);
  const plan = buildProtocolExportPlan(modules, points, language);
  const headers = plan.columns.map((c) => c.key);

  const rows = points.map((p) =>
    plan.rowFor(p).map(escapeCsv).join(","),
  );

  const csvContent = [headers.join(","), ...rows].join("\n");
  const safeName = project.name.replace(/[^a-z0-9]/gi, "_");
  await writeAndShare(`${safeName}_custom.csv`, csvContent, "text/csv");
}

// --- Media Extraction ---

function isAudioNoteRecord(value: unknown): value is AudioNote {
  return !!value && typeof value === "object" && typeof (value as any).uri === "string";
}

// Schema-based detection for the three field types that carry media/notes
// (photo_input, audio_notes_input, notes_list), instead of inferring from
// the value's shape - tags_input uses the same string[] JSON as notes_list,
// and a generic value could coincidentally look like an AudioNote[]. Without
// the schema there's no way to tell them apart safely.
async function extractMedia(point: PointEnvelope, project: ProjectRef): Promise<MediaFiles> {
  const photos: string[] = [];
  const audioNotes: AudioNote[] = [];
  const notes: string[] = [];

  const modules = await resolveCustomModulesCached(project.protocolId);
  for (const descriptor of modules) {
    const data = (point.modules[descriptor.id] as Record<string, unknown>) ?? {};
    for (const field of descriptor.schema.fields) {
      const raw = data[field.id];
      if (field.renderAs === "photo_input") {
        photos.push(...parsePhotoUris(raw));
      } else if (field.renderAs === "audio_notes_input") {
        const parsed = parseJsonText<unknown[]>(raw as any, [], Array.isArray);
        audioNotes.push(
          ...parsed
            .filter(isAudioNoteRecord)
            .map((n) => ({ uri: n.uri, duration: n.duration, timestamp: n.timestamp })),
        );
      } else if (field.renderAs === "notes_list") {
        const parsed = parseJsonText<string[]>(raw as any, [], Array.isArray);
        notes.push(...parsed.filter((n): n is string => typeof n === "string" && n.trim() !== ""));
      }
    }
  }

  return { photos, audioNotes, notes };
}

export const customExporter: ProtocolExporter = {
  exportGeoJSON,
  exportCSV,
  extractMedia,
};
