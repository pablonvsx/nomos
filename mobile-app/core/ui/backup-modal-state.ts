/**
 * Pure view logic of components/drive-sync/BackupModal.tsx, kept free of
 * react-native so it runs under the node jest setup. The modal is driven by
 * the global backup session plus one local flag: whether the "cancel this
 * backup?" confirmation is open.
 */

import type { BackupResult, BackupSessionState } from "@/core/drive-sync/backup-session";

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
  if (session.phase === "idle") return { kind: "hidden" };
  if (session.phase === "finished") return { kind: "finished", result: session.result };
  if (session.cancelRequested) return { kind: "cancelling" };
  const progress = session.total > 0 ? Math.min(1, session.current / session.total) : null;
  return ui.confirmingCancel ? { kind: "confirmingCancel", progress } : { kind: "running", progress };
}
