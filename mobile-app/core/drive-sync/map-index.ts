// The map data of a project on Drive: the field route and the mapping layer the
// person attached, kept in the `map/` folder of the project as raw GeoJSON
// (openable in QGIS). The app has ONE role per file (a layer, a route) and no
// other metadata, so `index.json` exists for two reasons: it carries a
// format_version a restore can refuse (14.6), and it tells "this project has no
// route" apart from "the file is missing". Pure: Drive and the file system are
// reached from project-data-backup.ts and restore-service.ts.

import { InvalidPackageError, UnsupportedPackageVersionError } from "@/core/project-sharing/package-errors";

export const MAP_FOLDER = "map";
export const MAP_INDEX_FILENAME = "index.json";
export const MAP_LAYER_FILENAME = "map-layer.geojson";
export const MAP_ROUTE_FILENAME = "field-route.geojson";
export const MAP_INDEX_FORMAT_VERSION = 1;

/** Backup item keys of the two files. */
export const MAP_LAYER_KEY = "maplayer";
export const MAP_ROUTE_KEY = "fieldroute";

export const isMapItemKey = (key: string): boolean => key === MAP_LAYER_KEY || key === MAP_ROUTE_KEY;

export type MapSlot = "layer" | "route";

export const slotOfKey = (key: string): MapSlot => (key === MAP_LAYER_KEY ? "layer" : "route");
export const fileNameOfSlot = (slot: MapSlot): string => (slot === "layer" ? MAP_LAYER_FILENAME : MAP_ROUTE_FILENAME);

export interface MapIndex {
  format_version: typeof MAP_INDEX_FORMAT_VERSION;
  layer: { file: string } | null;
  route: { file: string } | null;
}

export const emptyMapIndex = (): MapIndex => ({ format_version: MAP_INDEX_FORMAT_VERSION, layer: null, route: null });

/** The index with one slot set (a file went up) or cleared (the person removed it). */
export function withMapSlot(index: MapIndex, slot: MapSlot, present: boolean): MapIndex {
  return { ...index, [slot]: present ? { file: fileNameOfSlot(slot) } : null };
}

/**
 * Reads an index off Drive. The version is checked before anything else; the
 * file names are only the two fixed ones, so a hand-edited index cannot make a
 * restore read some other file of the folder.
 */
export function parseMapIndex(value: unknown): MapIndex {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidPackageError("Arquivo inválido: index.json do mapa não é um objeto.");
  }
  if ((value as { format_version?: unknown }).format_version !== MAP_INDEX_FORMAT_VERSION) {
    throw new UnsupportedPackageVersionError();
  }
  const raw = value as { layer?: unknown; route?: unknown };
  const slot = (entry: unknown, expected: string): { file: string } | null => {
    if (entry === null || entry === undefined) return null;
    if (typeof entry === "object" && (entry as { file?: unknown }).file === expected) return { file: expected };
    throw new InvalidPackageError("Arquivo inválido: index.json do mapa referencia um arquivo desconhecido.");
  };
  return {
    format_version: MAP_INDEX_FORMAT_VERSION,
    layer: slot(raw.layer, MAP_LAYER_FILENAME),
    route: slot(raw.route, MAP_ROUTE_FILENAME),
  };
}

/** Above this the file is sent with the long (transfer) timeout instead of the short one. */
export const MAP_FILE_LARGE_BYTES = 1024 * 1024;
/** Above this the item fails with a clear reason instead of going up without warning. */
export const MAP_FILE_LIMIT_BYTES = 5 * 1024 * 1024;

/** Size of the text as UTF-8, without needing TextEncoder. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4; // a surrogate pair is one 4-byte character
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/** A map file too big to send. Its own class so the failure can say so in plain words. */
export class MapFileTooLargeError extends Error {
  readonly sizeMb: number;
  constructor(bytes: number) {
    super(`Map file is ${bytes} bytes, over the ${MAP_FILE_LIMIT_BYTES} byte limit.`);
    this.name = "MapFileTooLargeError";
    this.sizeMb = Math.round((bytes / (1024 * 1024)) * 10) / 10;
  }
}
