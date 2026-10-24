// Pure mapping from the low-level results of backup-service.ts to the
// BackupResult the modal shows. Kept apart from backup-runners.ts so it runs
// under plain Node without the database or the file system.

import { describeBackupError } from "@/core/drive-sync/backup-errors";
import type { BackupSummary } from "@/core/drive-sync/backup-service";
import type { BackupFailure, BackupResult } from "@/core/drive-sync/backup-session";

/** What failed, without wording it: the screen turns this into a name ("Ponto 2", the species name, ...). */
export type FailureSubject = Pick<BackupFailure, "kind" | "label" | "point">;

export function failureFromReason(
  subject: FailureSubject,
  reason: string,
  extras: { missingMediaCount?: number; timedOut?: boolean; pointId?: number } = {},
): BackupFailure {
  const { pointId } = extras;
  const base = { kind: subject.kind, label: subject.label, point: subject.point, pointId };
  if ((extras.missingMediaCount ?? 0) > 0) {
    return {
      ...base,
      reasonKey: "driveBackup.reason.missingMedia",
      reasonParams: { count: String(extras.missingMediaCount) },
      detail: reason,
      missingMediaCount: extras.missingMediaCount,
    };
  }
  if (extras.timedOut) return { ...base, reasonKey: "driveBackup.reason.timeout", detail: reason };
  const described = describeBackupError(reason);
  return { ...base, reasonKey: described.key, detail: described.detail };
}

/** What a run did, before it is given an outcome. */
export interface RunTally {
  sent: number;
  /** Items that failed for their own reason. */
  failures: BackupFailure[];
  /** Items never attempted: left after a cancel, after the connection dropped, or held back. */
  notAttempted: number;
  cancelled: boolean;
  /** The first network error stopped the run: the remaining items would fail the same way. */
  connectionLost: boolean;
}

/** The reason most failures share (counts of missing media are added up). Null without failures. */
export function predominantReason(
  failures: BackupFailure[],
): { reasonKey: BackupFailure["reasonKey"]; reasonParams?: Record<string, string> } | null {
  if (failures.length === 0) return null;
  const counts = new Map<BackupFailure["reasonKey"], number>();
  for (const failure of failures) counts.set(failure.reasonKey, (counts.get(failure.reasonKey) ?? 0) + 1);
  const [reasonKey] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (reasonKey === "driveBackup.reason.missingMedia") {
    const total = failures.reduce((sum, f) => sum + (f.missingMediaCount ?? 0), 0);
    return { reasonKey, reasonParams: { count: String(total) } };
  }
  return { reasonKey };
}

/**
 * The one place that decides how a run ended:
 *
 * | situation                                        | outcome       |
 * |--------------------------------------------------|---------------|
 * | the person cancelled                             | cancelled     |
 * | connection dropped, at least one item was sent   | interrupted   |
 * | connection dropped, nothing sent                 | error (offline) |
 * | nothing failed, nothing left behind              | completed     |
 * | at least one sent, at least one failed           | incomplete    |
 * | nothing sent, items failed on their own          | error         |
 *
 * "0 sent" therefore never lands under completed or incomplete, except a
 * run that had nothing to send in the first place (completed, 0 not sent).
 */
export function classifyRun(tally: RunTally): BackupResult {
  const { sent, failures, notAttempted, cancelled, connectionLost } = tally;
  const notSent = failures.length + notAttempted;
  const detail = failures.map((f) => f.detail).filter(Boolean).join("\n");

  if (cancelled) return { outcome: "cancelled", sent, notSent, failures };
  if (connectionLost) {
    if (sent > 0) return { outcome: "interrupted", sent, notSent, failures };
    return { outcome: "error", sent, notSent, failures, error: { reasonKey: "driveBackup.reason.offline", detail } };
  }
  if (failures.length === 0 && notAttempted === 0) return { outcome: "completed", sent, notSent: 0, failures };
  if (sent > 0) return { outcome: "incomplete", sent, notSent, failures };

  const predominant = predominantReason(failures);
  return {
    outcome: "error",
    sent,
    notSent,
    failures,
    error: { reasonKey: predominant?.reasonKey ?? "driveBackup.reason.unknown", reasonParams: predominant?.reasonParams, detail },
  };
}

/** Builds the result of a points run from backupAllPendingPoints' summary. */
export function resultFromPointsSummary(summary: BackupSummary): BackupResult {
  return classifyRun({
    sent: summary.backedUp,
    failures: summary.failed.map((f) =>
      failureFromReason({ kind: "point", label: "", point: { number: f.pointNumber, lat: f.lat, lon: f.lon } }, f.reason, {
        missingMediaCount: f.missingMediaCount,
        timedOut: f.timedOut,
        pointId: f.pointId,
      }),
    ),
    notAttempted: summary.notAttempted,
    cancelled: summary.cancelled,
    connectionLost: summary.connectionLost,
  });
}
