// Backup status per project and scope: what is pending since the last backup,
// computed locally (no network). The pure logic takes its inputs as `deps` so
// it is testable without the database; the exported functions without a
// "With" suffix wire the real ones.

import { collectPointItems, collectProjectDataItems } from "@/core/drive-sync/backup-collectors";
import {
  deriveStatus,
  diffAgainstSnapshot,
  unverifiableStatus,
  type BackupItem,
  type BackupScope,
  type BackupStatus,
  type SnapshotDiff,
} from "@/core/drive-sync/change-detection";
import { getCurrentGoogleAccount } from "@/core/google-auth/google-auth-service";
import {
  getScopeInfo,
  getSnapshot,
  markItemBackedUp,
  setScopeBackupTime,
} from "@/db/queries/backup-snapshot";
import { getProjectById } from "@/db/queries/projects";

export interface StatusDeps {
  collect(projectId: number, scope: BackupScope): Promise<BackupItem[]>;
  getSnapshot(projectId: number, scope: BackupScope): Promise<Map<string, string>>;
  getScopeInfo(projectId: number, scope: BackupScope): Promise<{ lastBackupAt: string } | null>;
  /** True when the connected Google account is the project owner's (so a backup could actually run). */
  accountMatchesOwner(projectId: number): Promise<boolean>;
}

export interface SnapshotPlan {
  current: BackupItem[];
  diff: SnapshotDiff;
  status: BackupStatus;
}

/** Compares the project now against its snapshot. Throws if either cannot be read. */
export async function planBackupWith(deps: StatusDeps, projectId: number, scope: BackupScope): Promise<SnapshotPlan> {
  const [current, snapshot, scopeInfo] = await Promise.all([
    deps.collect(projectId, scope),
    deps.getSnapshot(projectId, scope),
    deps.getScopeInfo(projectId, scope),
  ]);
  const diff = diffAgainstSnapshot(current, snapshot);
  const status = deriveStatus({
    diff,
    hasBackedUpBefore: scopeInfo !== null || snapshot.size > 0,
    lastBackupAt: scopeInfo?.lastBackupAt ?? null,
  });
  return { current, diff, status };
}

/**
 * The status the UI and the export warning use. Never throws: anything that
 * prevents a reliable answer becomes "unverifiable" (an error reading the
 * snapshot or the project, or no way to run a backup because the connected
 * Google account is not the owner's) instead of a false "up to date".
 */
export async function computeBackupStatusWith(
  deps: StatusDeps,
  projectId: number,
  scope: BackupScope,
): Promise<BackupStatus> {
  let plan: SnapshotPlan;
  try {
    plan = await planBackupWith(deps, projectId, scope);
  } catch (error) {
    console.error("Error computing backup status:", error);
    return unverifiableStatus("error");
  }
  if (plan.status.kind !== "upToDate") return plan.status; // pending is true whatever the account is

  try {
    if (!(await deps.accountMatchesOwner(projectId))) return unverifiableStatus("account", plan.status.lastBackupAt);
  } catch (error) {
    console.error("Error checking the Google account for the backup status:", error);
    return unverifiableStatus("error", plan.status.lastBackupAt);
  }
  return plan.status;
}

/** Records every current item as already sent (used right after the project data was just uploaded or restored from Drive). */
export async function seedSnapshotWith(
  deps: StatusDeps & {
    markItemBackedUp(projectId: number, scope: BackupScope, key: string, fingerprint: string, at: string): Promise<void>;
    setScopeBackupTime(projectId: number, scope: BackupScope, at: string): Promise<void>;
  },
  projectId: number,
  scope: BackupScope,
  at: string = new Date().toISOString(),
): Promise<void> {
  const items = await deps.collect(projectId, scope);
  for (const item of items) await deps.markItemBackedUp(projectId, scope, item.key, item.fingerprint, at);
  await deps.setScopeBackupTime(projectId, scope, at);
}

async function accountMatchesOwner(projectId: number): Promise<boolean> {
  const project = await getProjectById(projectId);
  const account = getCurrentGoogleAccount();
  if (!project || !account) return false;
  if (!project.owner_email) return true;
  return account.email.trim().toLowerCase() === project.owner_email.trim().toLowerCase();
}

export const realStatusDeps: StatusDeps = {
  collect: async (projectId, scope) =>
    scope === "points" ? (await collectPointItems(projectId)).items : (await collectProjectDataItems(projectId)).items,
  getSnapshot,
  getScopeInfo,
  accountMatchesOwner,
};

export const computeBackupStatus = (projectId: number, scope: BackupScope): Promise<BackupStatus> =>
  computeBackupStatusWith(realStatusDeps, projectId, scope);

/** Marks both scopes of a project as fully backed up (after activation or a restore from Drive). */
export async function seedBackupSnapshots(projectId: number, scopes: BackupScope[] = ["project", "points"]): Promise<void> {
  for (const scope of scopes) {
    await seedSnapshotWith({ ...realStatusDeps, markItemBackedUp, setScopeBackupTime }, projectId, scope);
  }
}
