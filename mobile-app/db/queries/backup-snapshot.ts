import { db } from "@/db/initialize";
import type { BackupScope } from "@/core/drive-sync/change-detection";

// The local snapshot of what was last sent to Drive, per project and scope.
// One row per item (its fingerprint at the moment it was sent), written as
// each item succeeds, so a cancelled or partial backup leaves exactly the
// unsent items pending. Never uploaded; removed with the project (ON DELETE
// CASCADE). Errors are NOT swallowed here: a snapshot that cannot be read
// must surface as "unverifiable", not as "up to date".

export async function getSnapshot(projectId: number, scope: BackupScope): Promise<Map<string, string>> {
  const rows = await db.getAllAsync<{ item_key: string; fingerprint: string }>(
    "SELECT item_key, fingerprint FROM drive_backup_items WHERE project_id = ? AND scope = ?",
    [projectId, scope],
  );
  return new Map(rows.map((row) => [row.item_key, row.fingerprint]));
}

/** The scope record: null when no backup of this scope ever ran for the project. */
export async function getScopeInfo(
  projectId: number,
  scope: BackupScope,
): Promise<{ lastBackupAt: string } | null> {
  const row = await db.getFirstAsync<{ last_backup_at: string }>(
    "SELECT last_backup_at FROM drive_backup_scope WHERE project_id = ? AND scope = ?",
    [projectId, scope],
  );
  return row ? { lastBackupAt: row.last_backup_at } : null;
}

export async function markItemBackedUp(
  projectId: number,
  scope: BackupScope,
  itemKey: string,
  fingerprint: string,
  at: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO drive_backup_items (project_id, scope, item_key, fingerprint, synced_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(project_id, scope, item_key) DO UPDATE SET
       fingerprint = excluded.fingerprint,
       synced_at = excluded.synced_at`,
    [projectId, scope, itemKey, fingerprint, at],
  );
}

export async function deleteSnapshotItems(projectId: number, scope: BackupScope, itemKeys: string[]): Promise<void> {
  for (const key of itemKeys) {
    await db.runAsync("DELETE FROM drive_backup_items WHERE project_id = ? AND scope = ? AND item_key = ?", [
      projectId,
      scope,
      key,
    ]);
  }
}

export async function setScopeBackupTime(projectId: number, scope: BackupScope, at: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO drive_backup_scope (project_id, scope, last_backup_at) VALUES (?, ?, ?)
     ON CONFLICT(project_id, scope) DO UPDATE SET last_backup_at = excluded.last_backup_at`,
    [projectId, scope, at],
  );
}
