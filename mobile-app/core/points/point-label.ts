/**
 * Short label that identifies a point by who collected it: the collector code
 * plus the point number (e.g. "ABCD-3"), or just the number when the point has
 * no collector (the owner's own field work, which is the normal case). A
 * placeholder is never shown. Same rule as the Drive folder name.
 */
export function getPointDisplayLabel(point: { created_by?: string | null; point_number: number }): string {
  const code = point.created_by?.trim();
  return code ? `${code}-${point.point_number}` : String(point.point_number);
}

/**
 * The name of a point as the project's point list shows it ("Ponto 2").
 * `pointWord` is the translated word for "point" (core/ has no translations).
 * Returns "" when the point has no usable number, so the caller can use its
 * "unnamed point" fallback.
 */
export function formatPointName(pointWord: string, point: { point_number?: number | null }): string {
  const number = point.point_number;
  return typeof number === "number" && Number.isFinite(number) ? `${pointWord} ${number}` : "";
}

/** "-8.0500, -34.9000": coordinates for telling points apart in a details list. */
export function formatCoordinates(lat: number, lon: number): string {
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}
