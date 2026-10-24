// The ONE backup in flight, for the whole app. State lives here (a plain
// module store, no React) instead of in a screen's hook, so it survives
// navigation: leaving the project screen does not lose the progress, and no
// second backup - of any scope or project - can start while one is running.
// hooks/use-backup-session.ts subscribes to it; components/drive-sync/
// BackupModal.tsx renders it.

import { describeBackupError, type BackupReasonKey } from "@/core/drive-sync/backup-errors";
import type { PreflightFailure } from "@/core/drive-sync/backup-preflight";
import type { BackupItemKind } from "@/core/drive-sync/change-detection";

export type BackupScope = "points" | "project";

/**
 * How a run ended (the table is in backup-results.ts, classifyRun):
 * - completed: every pending item was sent;
 * - incomplete: at least one item was sent and at least one failed for its own reason;
 * - interrupted: the connection dropped mid-run after at least one item was sent;
 * - cancelled: the person cancelled;
 * - error: nothing was sent (no connection, a token failure, every item failed).
 */
export type BackupOutcome = "completed" | "incomplete" | "interrupted" | "cancelled" | "error";

export interface BackupFailure {
  kind: BackupItemKind;
  /** The name of what failed (species, classification, protocol, project); "" when it has none. Never an id. */
  label: string;
  /** Points: the number the list shows and where the point is; the screen words it ("Ponto 2"). */
  point?: { number: number; lat: number; lon: number };
  reasonKey: BackupReasonKey;
  reasonParams?: Record<string, string>;
  /** Technical detail, for the collapsed "details" view. */
  detail?: string;
  /** Points scope only: lets the screen offer to discard media that no longer exists on the device. */
  pointId?: number;
  missingMediaCount?: number;
}

export interface BackupResult {
  outcome: BackupOutcome;
  /** Items sent successfully in this run. */
  sent: number;
  /** Items that were pending when the run started and were not sent (failed or left after a cancel). */
  notSent: number;
  failures: BackupFailure[];
  /** Only for outcome "error": the whole run failed before or outside any item. */
  error?: { reasonKey: BackupReasonKey; reasonParams?: Record<string, string>; detail: string };
}

export interface BackupStage {
  /** i18n key of the step ("driveBackup.stage.points", ...). */
  key: string;
  params?: Record<string, string>;
}

export type BackupSessionState =
  | { phase: "idle" }
  /** The pre-flight is running: the lock is held, but there is nothing to show yet. */
  | { phase: "checking"; scope: BackupScope; projectId: number }
  | {
      phase: "running";
      scope: BackupScope;
      projectId: number;
      stage: BackupStage | null;
      current: number;
      total: number;
      cancelRequested: boolean;
    }
  | { phase: "finished"; scope: BackupScope; projectId: number; result: BackupResult };

/** What a backup runner receives: report progress and learn whether the person asked to cancel. */
export interface BackupContext {
  report(stage: BackupStage, current: number, total: number): void;
  isCancelled(): boolean;
}

export interface StartBackupOptions {
  scope: BackupScope;
  projectId: number;
  run: (context: BackupContext) => Promise<BackupResult>;
  /** Called as soon as the run ends, before the person taps OK (reload the screen data here). */
  onFinished?: (result: BackupResult) => void;
  /** Called when the person taps OK on the result. */
  onDismissed?: (result: BackupResult) => void;
}

export type StartBackupStatus =
  | { status: "started"; done: Promise<BackupResult> }
  | { status: "already-running" };

type Listener = () => void;

let state: BackupSessionState = { phase: "idle" };
let onDismissed: ((result: BackupResult) => void) | undefined;
const listeners = new Set<Listener>();

function setState(next: BackupSessionState): void {
  state = next;
  for (const listener of [...listeners]) listener();
}

export function getBackupSession(): BackupSessionState {
  return state;
}

export function subscribeBackupSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while a backup runs OR its result still waits for the OK: nothing else may start. */
export function isBackupBusy(): boolean {
  return state.phase !== "idle";
}

export function startBackup(options: StartBackupOptions): StartBackupStatus {
  // A plain module variable guards re-entry, so two taps in the same frame
  // (or two screens) cannot both slip through before a re-render.
  if (state.phase !== "idle") return { status: "already-running" };
  return begin(options);
}

export type StartWithPreflightStatus = StartBackupStatus | { status: "blocked"; failure: PreflightFailure };

/**
 * Like startBackup, but first runs `preflight` while holding the lock (so no
 * second start can slip in), and only opens the progress modal when it passes.
 * When it fails, or throws, the lock is ALWAYS released, `onBlocked` is told why,
 * and nothing else happens: `run` is never called, no item and no snapshot is touched.
 */
export async function startBackupWithPreflight(
  options: StartBackupOptions & {
    preflight: () => Promise<PreflightFailure | null>;
    onBlocked: (failure: PreflightFailure) => void;
  },
): Promise<StartWithPreflightStatus> {
  if (state.phase !== "idle") return { status: "already-running" };

  setState({ phase: "checking", scope: options.scope, projectId: options.projectId });
  let failure: PreflightFailure | null;
  try {
    failure = await options.preflight();
  } catch (error) {
    console.error("Backup pre-flight failed unexpectedly:", error);
    failure = "unreachable";
  }

  if (failure) {
    setState({ phase: "idle" });
    options.onBlocked(failure);
    return { status: "blocked", failure };
  }
  return begin(options);
}

function begin(options: StartBackupOptions): StartBackupStatus {
  const { scope, projectId } = options;
  onDismissed = options.onDismissed;
  setState({ phase: "running", scope, projectId, stage: null, current: 0, total: 0, cancelRequested: false });

  const context: BackupContext = {
    report(stage, current, total) {
      if (state.phase !== "running") return;
      setState({ ...state, stage, current, total });
    },
    isCancelled() {
      return state.phase === "running" && state.cancelRequested;
    },
  };

  const done = (async (): Promise<BackupResult> => {
    let result: BackupResult;
    try {
      result = await options.run(context);
    } catch (error) {
      const reason = describeBackupError(error);
      console.error("Backup failed:", error);
      result = { outcome: "error", sent: 0, notSent: 0, failures: [], error: { reasonKey: reason.key, detail: reason.detail } };
    }
    setState({ phase: "finished", scope, projectId, result });
    try {
      options.onFinished?.(result);
    } catch (error) {
      console.error("Error in backup onFinished:", error);
    }
    return result;
  })();

  return { status: "started", done };
}

/** Asks the running backup to stop after the item in progress. No-op when nothing runs. */
export function requestBackupCancel(): void {
  if (state.phase !== "running" || state.cancelRequested) return;
  setState({ ...state, cancelRequested: true });
}

/** The person tapped OK on the result: back to idle, then run the caller's follow-up. */
export function dismissBackupResult(): void {
  if (state.phase !== "finished") return;
  const { result } = state;
  const callback = onDismissed;
  onDismissed = undefined;
  setState({ phase: "idle" });
  try {
    callback?.(result);
  } catch (error) {
    console.error("Error in backup onDismissed:", error);
  }
}

/** Test hook: back to a clean idle store. */
export function resetBackupSessionForTests(): void {
  state = { phase: "idle" };
  onDismissed = undefined;
  listeners.clear();
}
