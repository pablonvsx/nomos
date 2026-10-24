// Change detection for the Drive backup. Pure: it compares what the project
// looks like NOW (a list of items, each with a fingerprint) against the local
// snapshot of what was last sent, and says what is pending. No network, no
// database: the collectors (backup-items.ts) and the snapshot store
// (db/queries/backup-snapshot.ts) feed it.

import type { BackupScope } from "@/core/drive-sync/backup-session";

export type { BackupScope };

/** One thing the backup sends: a point, or one piece of the project data. */
export interface BackupItem {
  /** Stable identity: "point:<id>", "protocol", "species:<uuid>", "vegclass:<uuid>", "manifest". */
  key: string;
  /** What the person recognizes it by (progress and failure lists). */
  label: string;
  /** Project-data items only: which step of the backup sends it (drives the stage text). */
  group?: "protocol" | "classifications" | "catalog" | "manifest";
  /** Changes whenever anything the backup would send for this item changes. */
  fingerprint: string;
}

export interface SnapshotDiff {
  added: BackupItem[];
  changed: BackupItem[];
  /** In the snapshot but gone locally (deleted, or no longer eligible). */
  removedKeys: string[];
}

export type BackupStatusKind = "never" | "pending" | "upToDate" | "unverifiable";

export interface BackupStatus {
  kind: BackupStatusKind;
  /** Items to send plus removals to record. */
  pendingCount: number;
  lastBackupAt: string | null;
  /** Keys of the items that would be sent (added + changed). */
  pendingKeys: Set<string>;
  /** Why the status could not be verified, when kind is "unverifiable". */
  reason?: "error" | "account";
}

/** 53-bit string hash (cyrb53): cheap, synchronous, plenty to notice a change. Not for security. */
function hash53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** JSON with object keys sorted, so key order never changes a fingerprint. */
function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  const body = Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${body.join(",")}}`;
}

export function fingerprintOf(value: unknown): string {
  const text = canonicalJson(value);
  return `${hash53(text)}-${text.length.toString(36)}`;
}

export function diffAgainstSnapshot(current: BackupItem[], snapshot: Map<string, string>): SnapshotDiff {
  const added: BackupItem[] = [];
  const changed: BackupItem[] = [];
  const currentKeys = new Set<string>();

  for (const item of current) {
    currentKeys.add(item.key);
    const known = snapshot.get(item.key);
    if (known === undefined) added.push(item);
    else if (known !== item.fingerprint) changed.push(item);
  }
  const removedKeys = [...snapshot.keys()].filter((key) => !currentKeys.has(key));
  return { added, changed, removedKeys };
}

export function deriveStatus(input: {
  diff: SnapshotDiff;
  /** A backup of this scope has run before (a scope record exists). */
  hasBackedUpBefore: boolean;
  lastBackupAt: string | null;
}): BackupStatus {
  const { diff, hasBackedUpBefore, lastBackupAt } = input;
  const toSend = [...diff.added, ...diff.changed];
  const pendingCount = toSend.length + diff.removedKeys.length;
  const pendingKeys = new Set(toSend.map((item) => item.key));

  if (pendingCount === 0) return { kind: "upToDate", pendingCount: 0, lastBackupAt, pendingKeys };
  return { kind: hasBackedUpBefore ? "pending" : "never", pendingCount, lastBackupAt, pendingKeys };
}

export function unverifiableStatus(reason: "error" | "account", lastBackupAt: string | null = null): BackupStatus {
  return { kind: "unverifiable", pendingCount: 0, lastBackupAt, pendingKeys: new Set(), reason };
}
