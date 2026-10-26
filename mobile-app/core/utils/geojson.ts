// The one rule for "is this file a GeoJSON the app accepts as a map layer or a
// field route": a FeatureCollection. Used where the person picks the file and
// where a restore brings it back from Drive, so both agree. Pure.

export interface FeatureCollection {
  type: "FeatureCollection";
  [key: string]: unknown;
}

export function isFeatureCollection(value: unknown): value is FeatureCollection {
  return typeof value === "object" && value !== null && !Array.isArray(value) && (value as { type?: unknown }).type === "FeatureCollection";
}

/** The parsed FeatureCollection, or null when the text is not JSON or not a FeatureCollection. */
export function parseFeatureCollection(content: string | null | undefined): FeatureCollection | null {
  if (!content) return null;
  try {
    const parsed: unknown = JSON.parse(content);
    return isFeatureCollection(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
