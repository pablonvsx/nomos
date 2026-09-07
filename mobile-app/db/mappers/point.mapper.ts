import type { Point, PointModule, PointWithModules } from "@/types/database";
import type { PointEnvelope, ProtocolRegistry } from "@/protocol-kernel/types";
import { parsePhotoUris } from "@/db/mappers/json-utils";

// ──────────────────────────────────────────────
// Row bruto retornado pelo SQLite
// ──────────────────────────────────────────────

export interface PointDbRow {
  id: string;
  project_id: number;
  protocol_id: string;
  point_number: number;
  lat: number;
  lon: number;
  altitude: number | null;
  generated_name: string | null;
  landscape_class_id: number | null;
  photos: string | null;
  audio_notes: string | null;
  additional_notes: string | null;
  point_size: number | null;
  created_at: string;
  updated_at: string;
}

// ──────────────────────────────────────────────
// Mappers
// ──────────────────────────────────────────────

export function mapPointFromDb(row: PointDbRow): Point {
  return {
    id: row.id,
    project_id: row.project_id,
    protocol_id: row.protocol_id,
    point_number: row.point_number,
    lat: row.lat,
    lon: row.lon,
    altitude: row.altitude,
    generated_name: row.generated_name,
    landscape_class_id: row.landscape_class_id,
    photos: row.photos,
    audio_notes: row.audio_notes,
    additional_notes: row.additional_notes,
    point_size: row.point_size,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Deserializes a point's modules using the registered manifest's descriptors.
// Unknown modules fall back to a plain JSON.parse.
export function buildPointWithModules(
  point: Point,
  modules: PointModule[],
  registry: ProtocolRegistry,
): PointWithModules {
  const manifest = registry.getProtocol(point.protocol_id);
  const deserializedModules: Record<string, unknown> = {};

  for (const mod of modules) {
    const descriptor = manifest?.modules.find((m) => m.id === mod.module_id);
    try {
      deserializedModules[mod.module_id] = descriptor
        ? descriptor.deserialize(mod.data_json)
        : JSON.parse(mod.data_json);
    } catch {
      deserializedModules[mod.module_id] = mod.data_json;
    }
  }

  return { ...point, modules: deserializedModules };
}

function parseJsonArraySafe<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as T[]; } catch { return []; }
}

// Builds a PointEnvelope (the kernel's contract) from a point with modules.
export function buildPointEnvelope(pointWithModules: PointWithModules): PointEnvelope {
  return {
    id: pointWithModules.id.toString(),
    projectId: pointWithModules.project_id.toString(),
    protocolId: pointWithModules.protocol_id,
    pointNumber: pointWithModules.point_number,
    lat: pointWithModules.lat,
    lon: pointWithModules.lon,
    altitude: pointWithModules.altitude ?? undefined,
    generatedName: pointWithModules.generated_name ?? undefined,
    modules: pointWithModules.modules,
    photos: parsePhotoUris(pointWithModules.photos),
    audioNotes: parseJsonArraySafe<{ uri: string; duration: number; timestamp: number }>(pointWithModules.audio_notes),
    additionalNotes: parseJsonArraySafe<string>(pointWithModules.additional_notes),
    pointSize: pointWithModules.point_size ?? undefined,
    createdAt: pointWithModules.created_at,
    landscapeClassId: pointWithModules.landscape_class_id ?? undefined,
  };
}
