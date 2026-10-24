// The status logic with an in-memory snapshot instead of SQLite and a
// scripted "project", so every scenario of the backup button is checked
// without the database, the file system or the network.

jest.mock("@/core/drive-sync/backup-collectors", () => ({ collectPointItems: jest.fn(), collectProjectDataItems: jest.fn() }));
jest.mock("@/core/google-auth/google-auth-service", () => ({ getCurrentGoogleAccount: jest.fn() }));
jest.mock("@/db/queries/backup-snapshot", () => ({
  getScopeInfo: jest.fn(),
  getSnapshot: jest.fn(),
  markItemBackedUp: jest.fn(),
  setScopeBackupTime: jest.fn(),
}));
jest.mock("@/db/queries/projects", () => ({ getProjectById: jest.fn() }));

import { computeBackupStatusWith, seedSnapshotWith, type StatusDeps } from "../backup-status-service";
import { fingerprintOf, type BackupItem } from "../change-detection";

const item = (key: string, value: unknown): BackupItem => ({ key, label: key, fingerprint: fingerprintOf(value) });

class FakeBackup {
  current: BackupItem[] = [];
  snapshot = new Map<string, string>();
  scope: { lastBackupAt: string } | null = null;
  accountOk = true;
  failCollect = false;
  collectCalls = 0;

  deps(): StatusDeps & {
    markItemBackedUp: (p: number, s: "points" | "project", k: string, f: string, at: string) => Promise<void>;
    setScopeBackupTime: (p: number, s: "points" | "project", at: string) => Promise<void>;
  } {
    return {
      collect: async () => {
        this.collectCalls += 1;
        if (this.failCollect) throw new Error("db unreadable");
        return this.current;
      },
      getSnapshot: async () => this.snapshot,
      getScopeInfo: async () => this.scope,
      accountMatchesOwner: async () => this.accountOk,
      markItemBackedUp: async (_p, _s, key, fp) => {
        this.snapshot.set(key, fp);
      },
      setScopeBackupTime: async (_p, _s, at) => {
        this.scope = { lastBackupAt: at };
      },
    };
  }

  /** What a successful backup does: every pending item recorded, removals dropped, time set. */
  completeBackup(at = "2026-10-20T12:00:00.000Z") {
    for (const i of this.current) this.snapshot.set(i.key, i.fingerprint);
    const keys = new Set(this.current.map((i) => i.key));
    for (const key of [...this.snapshot.keys()]) if (!keys.has(key)) this.snapshot.delete(key);
    this.scope = { lastBackupAt: at };
  }

  status() {
    return computeBackupStatusWith(this.deps(), 1, "project");
  }
}

let fake: FakeBackup;
beforeEach(() => {
  fake = new FakeBackup();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("backup status - when a backup is needed", () => {
  it("no snapshot at all: 'never', everything pending, button enabled", async () => {
    fake.current = [item("a", 1), item("b", 1)];
    const status = await fake.status();
    expect(status).toMatchObject({ kind: "never", pendingCount: 2, lastBackupAt: null });
  });

  it("a full backup brings it to 'up to date' with the backup time", async () => {
    fake.current = [item("a", 1), item("b", 1)];
    fake.completeBackup();
    expect(await fake.status()).toMatchObject({ kind: "upToDate", pendingCount: 0, lastBackupAt: "2026-10-20T12:00:00.000Z" });
  });

  it("adding an item makes it pending", async () => {
    fake.current = [item("a", 1)];
    fake.completeBackup();
    fake.current = [item("a", 1), item("new", 1)];
    const status = await fake.status();
    expect(status.kind).toBe("pending");
    expect([...status.pendingKeys]).toEqual(["new"]);
  });

  it("editing an item makes it pending", async () => {
    fake.current = [item("a", 1)];
    fake.completeBackup();
    fake.current = [item("a", 2)];
    expect([...(await fake.status()).pendingKeys]).toEqual(["a"]);
  });

  it("deleting an item makes the project pending (nothing to send, a removal to record)", async () => {
    fake.current = [item("a", 1), item("b", 1)];
    fake.completeBackup();
    fake.current = [item("a", 1)];
    const status = await fake.status();
    expect(status).toMatchObject({ kind: "pending", pendingCount: 1 });
    expect(status.pendingKeys.size).toBe(0);
  });

  it("a partial or cancelled backup leaves only the unsent items pending", async () => {
    fake.current = [item("a", 1), item("b", 1), item("c", 1)];
    const deps = fake.deps();
    await deps.markItemBackedUp(1, "project", "a", item("a", 1).fingerprint, "t"); // only 'a' made it
    await deps.setScopeBackupTime(1, "project", "t");

    const status = await fake.status();
    expect(status.kind).toBe("pending");
    expect([...status.pendingKeys].sort()).toEqual(["b", "c"]);
  });

  it("local changes alone never call anything but the local collectors", async () => {
    fake.current = [item("a", 1)];
    fake.completeBackup();
    fake.current = [item("a", 2)];
    await fake.status();
    expect(fake.collectCalls).toBe(1); // no Drive client is even reachable from these deps
  });
});

describe("backup status - when it cannot be verified", () => {
  it("an unreadable project or snapshot is 'unverifiable', never a false 'up to date'", async () => {
    fake.failCollect = true;
    expect(await fake.status()).toMatchObject({ kind: "unverifiable", reason: "error" });
  });

  it("up to date locally but the connected account is not the owner's: unverifiable by account", async () => {
    fake.current = [item("a", 1)];
    fake.completeBackup();
    fake.accountOk = false;
    expect(await fake.status()).toMatchObject({ kind: "unverifiable", reason: "account", lastBackupAt: "2026-10-20T12:00:00.000Z" });
  });

  it("pending work stays 'pending' whatever the account (the warning applies either way)", async () => {
    fake.current = [item("a", 1)];
    fake.accountOk = false;
    expect((await fake.status()).kind).toBe("never");
  });
});

describe("seedSnapshotWith (after activation or a restore)", () => {
  it("records every current item as sent, so the status starts 'up to date'", async () => {
    fake.current = [item("a", 1), item("b", 1)];
    await seedSnapshotWith(fake.deps(), 1, "project", "2026-10-21T08:00:00.000Z");
    expect(await fake.status()).toMatchObject({ kind: "upToDate", lastBackupAt: "2026-10-21T08:00:00.000Z" });
  });
});
