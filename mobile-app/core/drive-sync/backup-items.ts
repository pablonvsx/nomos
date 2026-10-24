// Turns the project's current data into backup items with fingerprints. Pure
// builders: the data is handed in (see backup-collectors.ts for the part that
// reads it from SQLite and the file system), so they run under plain Node.
//
// A fingerprint covers exactly what the backup would send for the item and
// nothing else. Two traps to avoid: points.updated_at and drive_synced_at are
// NOT part of it (the backup itself rewrites both, which would flip every
// point back to "pending" right after it was sent), and media is identified by
// path + size + modification time, never by reading the bytes.

import { fingerprintOf, type BackupItem } from "@/core/drive-sync/change-detection";
import { parseAudioNotes, parsePhotoUris } from "@/db/mappers/json-utils";
import type { Point, PointModule } from "@/types/database";
import type { ProjectConfigPackage } from "@/core/project-sharing/project-config-package";

export interface PointItemInput {
  points: Point[];
  modules: PointModule[];
  /** A stable string for a media file: changes when the file is replaced or edited. */
  mediaIdentity(uri: string): string;
  /** Media uris found inside a module's data (custom protocols); [] when the module has none. */
  moduleMediaUris(module: PointModule): Promise<string[]>;
  /** Called every so many points so the caller can yield to the UI thread. */
  yieldToUi?(): Promise<void>;
}

const YIELD_EVERY = 25;

export const pointItemKey = (pointId: number): string => `point:${pointId}`;

export async function buildPointItems(input: PointItemInput): Promise<BackupItem[]> {
  const modulesByPoint = new Map<number, PointModule[]>();
  for (const module of input.modules) {
    const list = modulesByPoint.get(module.point_id) ?? [];
    list.push(module);
    modulesByPoint.set(module.point_id, list);
  }

  const items: BackupItem[] = [];
  for (const [index, point] of input.points.entries()) {
    if (index > 0 && index % YIELD_EVERY === 0) await input.yieldToUi?.();

    const modules = (modulesByPoint.get(point.id) ?? []).slice().sort((a, b) => a.module_id.localeCompare(b.module_id));
    const moduleMedia: string[] = [];
    for (const module of modules) {
      for (const uri of await input.moduleMediaUris(module)) moduleMedia.push(input.mediaIdentity(uri));
    }

    items.push({
      key: pointItemKey(point.id),
      kind: "point",
      label: "",
      point: { number: point.point_number, lat: point.lat, lon: point.lon },
      fingerprint: fingerprintOf({
        lat: point.lat,
        lon: point.lon,
        altitude: point.altitude,
        generated_name: point.generated_name,
        landscape_class_id: point.landscape_class_id,
        additional_notes: point.additional_notes,
        point_size: point.point_size,
        approval_status: point.approval_status,
        created_by: point.created_by,
        photos: parsePhotoUris(point.photos).map(input.mediaIdentity),
        audio: parseAudioNotes(point.audio_notes).map((note) => ({
          media: input.mediaIdentity(note.uri),
          duration: note.duration,
          timestamp: note.timestamp,
        })),
        modules: modules.map((m) => ({ id: m.module_id, schema: m.schema_version, data: m.data_json })),
        moduleMedia,
      }),
    });
  }
  return items;
}

/** What goes to Drive for each project-data item, by item key. */
export type ProjectDataPayloads = Map<string, unknown>;

export interface ProjectDataItems {
  items: BackupItem[];
  payloads: ProjectDataPayloads;
}

/** The pieces of the project that live in the Drive project folder (not the points). */
export function buildProjectDataItems(pkg: ProjectConfigPackage): ProjectDataItems {
  const items: BackupItem[] = [];
  const payloads: ProjectDataPayloads = new Map();
  const add = (item: Omit<BackupItem, "fingerprint">, payload: unknown) => {
    items.push({ ...item, fingerprint: fingerprintOf(payload) });
    payloads.set(item.key, payload);
  };

  if (pkg.protocol_source === "custom" && pkg.custom_protocol) {
    add(
      { key: "protocol", kind: "protocol", label: pkg.custom_protocol.name?.trim() ?? "", group: "protocol" },
      pkg.custom_protocol,
    );
  }
  for (const entry of pkg.vegetation_classes) {
    add(
      { key: `vegclass:${entry.uuid}`, kind: "classification", label: String(entry.name ?? "").trim(), group: "classifications" },
      entry,
    );
  }
  for (const entry of pkg.species_catalog) {
    add(
      { key: `species:${entry.uuid}`, kind: "species", label: (entry.scientific_name ?? "").trim(), group: "catalog" },
      entry,
    );
  }
  // The manifest points at the active classification, so it is sent last.
  add(
    { key: "manifest", kind: "manifest", label: pkg.project_name?.trim() ?? "", group: "manifest" },
    {
      project_name: pkg.project_name,
      project_description: pkg.project_description ?? "",
      protocol_id: pkg.protocol_id,
      protocol_source: pkg.protocol_source,
      active_vegetation_classification: pkg.active_vegetation_classification,
    },
  );
  return { items, payloads };
}
