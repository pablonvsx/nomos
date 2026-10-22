/**
 * Short label that identifies a point to people: the collector code plus the
 * point number (e.g. "ABCD-3"). "?" stands in for a point without a collector.
 */
export function getPointDisplayLabel(point: { created_by?: string | null; point_number: number }): string {
  return `${point.created_by ?? "?"}-${point.point_number}`;
}
