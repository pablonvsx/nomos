// Sends the pending pieces of a project's data (protocol, vegetation
// classifications, species catalog, manifest) to its Drive folder. Only what
// is handed in as pending is sent; each item is reported as it succeeds so
// the snapshot is written per item. Nothing here runs by itself: the backup
// button starts it (see backup-runners.ts).

import {
  ensureFolder,
  findChildByName,
  listChildren,
  updateJsonFile,
  uploadJsonFile,
} from "@/core/drive-sync/drive-api-client";
import { failureFromReason } from "@/core/drive-sync/backup-results";
import type { BackupItem } from "@/core/drive-sync/change-detection";
import { updateManifest } from "@/core/drive-sync/project-drive-service";
import type { BackupContext, BackupFailure, BackupStage } from "@/core/drive-sync/backup-session";
import { isConnectionError } from "@/core/drive-sync/backup-errors";
import { isNetworkTimeoutError } from "@/core/net/network-timeout";
import type { ProjectDataPayloads } from "@/core/drive-sync/backup-items";

const SPECIES_FOLDER = "species-catalog";
const CLASSIFICATIONS_FOLDER = "vegetation-classes";
const PROTOCOL_FILE = "protocol-package.json";

const STAGE_KEY: Record<NonNullable<BackupItem["group"]>, string> = {
  protocol: "driveBackup.stage.protocol",
  classifications: "driveBackup.stage.classifications",
  catalog: "driveBackup.stage.catalog",
  manifest: "driveBackup.stage.manifest",
};

export interface ProjectDataBackupOutcome {
  sent: number;
  failures: BackupFailure[];
  cancelled: boolean;
  /** Pending items never attempted (cancelled, connection lost, or the manifest held back). */
  notAttempted: number;
  /** The first network error stopped the run: the rest would fail the same way. */
  connectionLost: boolean;
}

/**
 * `pending` must be in sending order (protocol, classifications, catalog,
 * manifest), as buildProjectDataItems produces it. `onItemDone` runs after
 * each item reached Drive.
 */
export async function backupProjectData(params: {
  driveFolderId: string;
  pending: BackupItem[];
  payloads: ProjectDataPayloads;
  context: BackupContext;
  onItemDone: (item: BackupItem) => Promise<void>;
}): Promise<ProjectDataBackupOutcome> {
  const { driveFolderId, pending, payloads, context, onItemDone } = params;
  const failures: BackupFailure[] = [];
  let sent = 0;
  let attempted = 0;
  let cancelled = false;
  let connectionLost = false;

  // File name -> id inside a folder, listed once per folder per run.
  const folderIds = new Map<string, string>();
  const listings = new Map<string, Map<string, string>>();
  const existingFiles = async (folderName: string): Promise<{ folderId: string; files: Map<string, string> }> => {
    let folderId = folderIds.get(folderName);
    if (!folderId) {
      folderId = await ensureFolder(folderName, driveFolderId);
      folderIds.set(folderName, folderId);
    }
    let files = listings.get(folderName);
    if (!files) {
      files = new Map((await listChildren(folderId)).map((file) => [file.name, file.id]));
      listings.set(folderName, files);
    }
    return { folderId, files };
  };

  const upsertIn = async (folderName: string, fileName: string, payload: unknown) => {
    const { folderId, files } = await existingFiles(folderName);
    const existingId = files.get(fileName);
    if (existingId) {
      await updateJsonFile(existingId, payload);
    } else {
      const created = await uploadJsonFile(fileName, folderId, payload);
      files.set(fileName, created.id);
    }
  };

  const send = async (item: BackupItem): Promise<void> => {
    const payload = payloads.get(item.key);
    if (item.group === "protocol") {
      const existing = await findChildByName(driveFolderId, PROTOCOL_FILE);
      if (existing) await updateJsonFile(existing.id, payload);
      else await uploadJsonFile(PROTOCOL_FILE, driveFolderId, payload);
    } else if (item.group === "classifications") {
      await upsertIn(CLASSIFICATIONS_FOLDER, `${item.key.slice("vegclass:".length)}.json`, payload);
    } else if (item.group === "catalog") {
      await upsertIn(SPECIES_FOLDER, `${item.key.slice("species:".length)}.json`, payload);
    } else {
      // The manifest always goes through updateManifest: it refuses a write
      // that would lose the project_uuid or the owner_email.
      const next = payload as {
        project_name: string;
        project_description?: string;
        protocol_id: string;
        protocol_source: "official" | "custom";
        active_vegetation_classification: { type: "standard" | "custom"; custom_classification_uuid?: string };
      };
      await updateManifest(driveFolderId, (current) => ({
        ...current,
        project_name: next.project_name,
        project_description: next.project_description ?? "",
        protocol_id: next.protocol_id,
        protocol_source: next.protocol_source,
        active_vegetation_classification: next.active_vegetation_classification,
      }));
    }
  };

  // Per-group counters for the stage text ("classifications: 2 of 5").
  const groupTotals = new Map<string, number>();
  for (const item of pending) groupTotals.set(item.group ?? "", (groupTotals.get(item.group ?? "") ?? 0) + 1);
  const groupDone = new Map<string, number>();

  let classificationProblem = false;

  for (const [index, item] of pending.entries()) {
    if (context.isCancelled()) {
      cancelled = true;
      break;
    }

    // Never point the manifest at a classification whose file did not reach Drive.
    if (item.group === "manifest" && classificationProblem) continue;

    const group = item.group ?? "";
    const position = (groupDone.get(group) ?? 0) + 1;
    const stage: BackupStage = {
      key: item.group ? STAGE_KEY[item.group] : "driveBackup.stage.preparing",
      params: { current: String(position), total: String(groupTotals.get(group) ?? 1) },
    };
    context.report(stage, index, pending.length);
    attempted += 1;

    try {
      await send(item);
    } catch (error) {
      console.error(`Error sending ${item.key} to Drive:`, error);
      failures.push(
        failureFromReason(item, error instanceof Error ? error.message : String(error), {
          timedOut: isNetworkTimeoutError(error),
        }),
      );
      if (item.group === "classifications") classificationProblem = true;
      groupDone.set(group, position);
      if (isConnectionError(error)) {
        connectionLost = true;
        break;
      }
      continue;
    }

    groupDone.set(group, position);
    sent += 1;
    try {
      await onItemDone(item);
    } catch (error) {
      // The upload worked; only the local record failed, so the item stays
      // pending and the next backup sends it again (idempotent).
      console.error(`Error recording ${item.key} in the backup snapshot:`, error);
    }
  }

  return { sent, failures, cancelled, connectionLost, notAttempted: pending.length - attempted };
}
