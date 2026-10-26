// The short "what is happening now" log under a backup's progress bar. Typed
// events, a bounded list and the words for each line. Pure: the translated
// bits come in through `t` (core/ has no translations of its own), and an item
// is named by the same function the failure list uses, so a point is "Ponto 2"
// and a species its own name in both places.

import { failureName, type Translate } from "@/core/drive-sync/backup-labels";
import type { BackupFailure } from "@/core/drive-sync/backup-session";

/** What an event is about: the same subject a failure names. */
export type ActivityItem = Pick<BackupFailure, "kind" | "label" | "point">;

export type ActivityEvent =
  | { type: "item-start"; item: ActivityItem }
  /** Optional detail inside an item: "photo 2 of 5". */
  | { type: "media"; item: ActivityItem; mediaKind: "photo" | "audio"; index: number; total: number }
  | { type: "item-done"; item: ActivityItem }
  | { type: "item-failed"; item: ActivityItem };

/** How many events the log keeps, and how many lines the screen shows. */
export const ACTIVITY_LOG_LIMIT = 50;
export const ACTIVITY_VISIBLE_LINES = 5;

/** The log with `event` added at the end; the oldest events are dropped beyond `limit`. Never mutates. */
export function appendActivity(
  log: readonly ActivityEvent[],
  event: ActivityEvent,
  limit: number = ACTIVITY_LOG_LIMIT,
): ActivityEvent[] {
  const next = [...log, event];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/** The last `count` events, oldest first (the newest is at the bottom). */
export function visibleActivity(log: readonly ActivityEvent[], count: number = ACTIVITY_VISIBLE_LINES): ActivityEvent[] {
  return count <= 0 ? [] : log.slice(-count);
}

/** The line a person reads for one event. */
export function describeActivity(event: ActivityEvent, t: Translate): string {
  const name = failureName(event.item, t);
  switch (event.type) {
    case "item-start":
      return t("driveBackup.log.start", { name });
    case "media":
      return t(event.mediaKind === "photo" ? "driveBackup.log.photo" : "driveBackup.log.audio", {
        name,
        current: String(event.index),
        total: String(event.total),
      });
    case "item-done":
      return t("driveBackup.log.done", { name });
    case "item-failed":
      return t("driveBackup.log.failed", { name });
  }
}
