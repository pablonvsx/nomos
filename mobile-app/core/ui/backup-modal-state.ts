/**
 * Pure view logic of components/drive-sync/BackupModal.tsx, kept free of
 * react-native so it runs under the node jest setup. The modal is driven by
 * the global backup session plus one local flag: whether the "cancel this
 * backup?" confirmation is open.
 */

import { predominantReason } from "@/core/drive-sync/backup-results";
import type { BackupResult, BackupSessionScope, BackupSessionState } from "@/core/drive-sync/backup-session";
import { getProgressFraction } from "@/core/ui/progress";

export type BackupModalView =
  | { kind: "hidden" }
  | { kind: "running"; progress: number | null }
  | { kind: "confirmingCancel"; progress: number | null }
  | { kind: "cancelling" }
  | { kind: "finished"; result: BackupResult };

export interface BackupModalUiState {
  confirmingCancel: boolean;
}

export type BackupModalEvent =
  | { type: "backPressed" } // Android back, tap outside, or the Cancel button
  | { type: "keepGoing" }
  | { type: "cancelConfirmed" }
  | { type: "sessionChanged" };

export const initialBackupModalUi: BackupModalUiState = { confirmingCancel: false };

export function reduceBackupModal(
  ui: BackupModalUiState,
  event: BackupModalEvent,
  session: BackupSessionState,
): BackupModalUiState {
  switch (event.type) {
    case "backPressed":
      // Only a running backup can be cancelled; a finished one closes only through OK.
      return session.phase === "running" && !session.cancelRequested ? { confirmingCancel: true } : ui;
    case "keepGoing":
    case "cancelConfirmed":
      return { confirmingCancel: false };
    case "sessionChanged":
      return session.phase === "running" ? ui : { confirmingCancel: false };
  }
}

export function deriveBackupModalView(session: BackupSessionState, ui: BackupModalUiState): BackupModalView {
  // While the pre-flight runs (phase "checking") there is nothing to show: no modal until it passes.
  if (session.phase === "idle" || session.phase === "checking") return { kind: "hidden" };
  if (session.phase === "finished") return { kind: "finished", result: session.result };
  if (session.cancelRequested) return { kind: "cancelling" };
  const progress = getProgressFraction(session);
  return ui.confirmingCancel ? { kind: "confirmingCancel", progress } : { kind: "running", progress };
}

/** Translation keys for the modal's fixed texts, which differ for the activation of the backup. */
export interface ModalCopyKeys {
  title: string;
  cancelTitle: string;
  cancelMessage: string;
  keepGoing: string;
  cancelConfirm: string;
  cancelling: string;
}

export function modalCopyKeys(scope: BackupSessionScope): ModalCopyKeys {
  if (scope === "activation") {
    return {
      title: "driveBackup.activation.modalTitle",
      cancelTitle: "driveBackup.activation.cancelTitle",
      cancelMessage: "driveBackup.activation.cancelMessage",
      keepGoing: "driveBackup.activation.keepGoing",
      cancelConfirm: "driveBackup.activation.cancelConfirm",
      cancelling: "driveBackup.cancelling",
    };
  }
  return {
    title: "driveBackup.modalTitle",
    cancelTitle: "driveBackup.cancelTitle",
    cancelMessage: "driveBackup.cancelMessage",
    keepGoing: "driveBackup.keepGoing",
    cancelConfirm: "driveBackup.cancelConfirm",
    cancelling: "driveBackup.cancelling",
  };
}

/** What the result of a run says: the title, the message, and (optionally) a reason added under it. */
export interface ResultCopy {
  titleKey: string;
  messageKey: string;
  params?: Record<string, string>;
  /** A plain-language reason appended to the message (incomplete backups). */
  reason?: { key: string; params?: Record<string, string> };
}

/**
 * The words for how a run ended. A backup says what was sent and what stays pending; the
 * activation of the backup is all or nothing, so it only says it is active, cancelled, or why
 * it could not be activated (never "N sent, M not sent").
 */
export function resultCopy(scope: BackupSessionScope, result: BackupResult): ResultCopy {
  const offline = result.outcome === "error" && result.error?.reasonKey === "driveBackup.reason.offline";

  if (scope === "activation") {
    if (result.outcome === "completed") {
      return { titleKey: "driveBackup.activation.completed.title", messageKey: "driveBackup.activation.completed.message" };
    }
    if (result.outcome === "cancelled") {
      return { titleKey: "driveBackup.activation.cancelled.title", messageKey: "driveBackup.activation.cancelled.message" };
    }
    // Interrupted, incomplete or error: the backup was not activated. Say why in plain words.
    const why =
      result.outcome === "interrupted"
        ? { key: "driveBackup.reason.offline" }
        : result.outcome === "error"
          ? { key: result.error?.reasonKey ?? "driveBackup.reason.unknown", params: result.error?.reasonParams }
          : (() => {
              const predominant = predominantReason(result.failures);
              return { key: predominant?.reasonKey ?? "driveBackup.reason.unknown", params: predominant?.reasonParams };
            })();
    return { titleKey: "driveBackup.activation.failed.title", messageKey: why.key, params: why.params };
  }

  if (offline) return { titleKey: "driveBackup.preflight.offline.title", messageKey: "driveBackup.preflight.offline.message" };
  if (result.outcome === "error") {
    return {
      titleKey: "driveBackup.result.error.title",
      messageKey: result.error?.reasonKey ?? "driveBackup.reason.unknown",
      params: result.error?.reasonParams,
    };
  }
  if (result.outcome === "completed" && result.sent === 0) {
    return { titleKey: "driveBackup.result.completed.title", messageKey: "driveBackup.result.completedNothing.message" };
  }

  const predominant = result.outcome === "incomplete" ? predominantReason(result.failures) : null;
  return {
    titleKey: `driveBackup.result.${result.outcome}.title`,
    messageKey: `driveBackup.result.${result.outcome}.message`,
    params: { sent: String(result.sent), notSent: String(result.notSent) },
    reason: predominant ? { key: predominant.reasonKey, params: predominant.reasonParams } : undefined,
  };
}
