// Decides whether exporting the project's configuration package needs a
// warning first. Only the OWNER of a project linked to Drive is warned: a
// collaborator (or a plain local project) exports straight away, because for
// them the package is the way data travels, not something a Drive backup
// stands in for. The warning never blocks: "export anyway" is always there.

import type { BackupStatusKind } from "@/core/drive-sync/change-detection";

export type ExportGateReason = "pending" | "unverifiable";

export type ExportGate =
  | { kind: "direct" }
  | {
      kind: "warn";
      reason: ExportGateReason;
      /** False when it is known there is no connection: "Fazer backup" is then offered disabled. */
      canBackup: boolean;
    };

export function decideExportGate(input: {
  role: "owner" | "collaborator" | null | undefined;
  driveFolderId: string | null | undefined;
  /** The project-data backup status, or null when it could not be computed at all. */
  status: BackupStatusKind | null;
  /** Connection state, or null when unknown. */
  online: boolean | null;
}): ExportGate {
  if (input.role !== "owner" || !input.driveFolderId) return { kind: "direct" };
  if (input.status === "upToDate") return { kind: "direct" };

  const reason: ExportGateReason = input.status === "pending" || input.status === "never" ? "pending" : "unverifiable";
  return { kind: "warn", reason, canBackup: input.online !== false };
}
