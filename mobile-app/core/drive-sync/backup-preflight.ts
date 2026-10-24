// Checks, BEFORE a backup opens its progress modal, that it can reach Drive at
// all: there is a connection, a token can be obtained, and one light Drive
// request answers within a short limit. A backup that cannot even reach Drive
// must not start: it would only turn a network error into a "failed item".
// Pure logic with injected dependencies; the real wiring is in
// backup-runners.ts (preflightBackup).

import { describeBackupError } from "@/core/drive-sync/backup-errors";

export type PreflightFailure = "offline" | "unreachable" | "auth";

/** How long the light Drive request may take. A dead connection fails at once (NetInfo); this bounds a stalled one. */
export const PREFLIGHT_PROBE_TIMEOUT_MS = 6_000;

export interface PreflightDeps {
  /** null when the state cannot be told. */
  isOnline(): Promise<boolean | null>;
  /** Obtains (or refreshes) the Drive access token. */
  getToken(): Promise<string>;
  /** One light Drive request, aborted after `timeoutMs`. */
  probe(timeoutMs: number): Promise<void>;
}

/** Maps what went wrong while talking to Google/Drive to a preflight failure; null when it is not a reachability problem. */
function failureFromError(error: unknown, fallback: PreflightFailure | null): PreflightFailure | null {
  const { key } = describeBackupError(error);
  if (key === "driveBackup.reason.offline") return "offline";
  if (key === "driveBackup.reason.timeout" || key === "driveBackup.reason.server") return "unreachable";
  if (key === "driveBackup.reason.auth") return "auth";
  return fallback;
}

export async function runPreflightWith(deps: PreflightDeps): Promise<PreflightFailure | null> {
  // 1. A quick local answer: airplane mode fails here, immediately, without touching the network.
  if ((await deps.isOnline()) === false) return "offline";

  // 2. The account: a token must be obtainable.
  try {
    await deps.getToken();
  } catch (error) {
    // An unknown token error is an account problem; a network one is reported as such.
    return failureFromError(error, "auth");
  }

  // 3. The lightest Drive request there is, with a short limit.
  try {
    await deps.probe(PREFLIGHT_PROBE_TIMEOUT_MS);
  } catch (error) {
    // Only reachability and authorization failures block the start; anything else surfaces in the run itself.
    return failureFromError(error, null);
  }
  return null;
}
