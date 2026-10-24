// Words the item a backup failure is about. Pure: the translated bits come in
// through `t` (core/ has no translations of its own). A point is named exactly
// as the project's point list names it ("Ponto 2"); every other item by its own
// name. An item without a name gets a plain fallback by kind, never an id,
// a uuid or a placeholder.

import { formatCoordinates, formatPointName } from "@/core/points/point-label";
import type { BackupFailure } from "@/core/drive-sync/backup-session";

export type Translate = (key: string, params?: Record<string, string>) => string;

/** The name shown for a failed item. */
export function failureName(failure: Pick<BackupFailure, "kind" | "label" | "point">, t: Translate): string {
  if (failure.kind === "point") {
    const name = failure.point ? formatPointName(t("surveyView.point"), { point_number: failure.point.number }) : "";
    return name || t("driveBackup.item.unnamed.point");
  }
  return failure.label.trim() || t(`driveBackup.item.unnamed.${failure.kind}`);
}

/** The name, plus (for a point) where it is, so points can be told apart in the details. */
export function failureHeading(failure: Pick<BackupFailure, "kind" | "label" | "point">, t: Translate): string {
  const name = failureName(failure, t);
  if (failure.kind === "point" && failure.point) {
    return `${name} (${formatCoordinates(failure.point.lat, failure.point.lon)})`;
  }
  return name;
}
