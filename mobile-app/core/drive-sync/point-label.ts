export interface PointLabelInput {
  pointNumber: number;
  createdBy: string | null;
}

// created_by already holds the collector's short code directly (local
// collector code for imported points, see core/local-identity/collector-code.ts) -
// no membership lookup needed.
export function getPointDisplayLabel(point: PointLabelInput): string {
  return point.createdBy ? `${point.createdBy}-${point.pointNumber}` : String(point.pointNumber);
}
