// The runners decide WHAT is sent (only new/changed items, from the state
// captured at the start) and WHAT is recorded (each item as it succeeds,
// removals, the scope time). The collectors, the snapshot store and the
// upload services are replaced by in-memory fakes.

const snapshotRows = new Map<string, string>();
let scopeTime: string | null = null;

const collectPointItems = jest.fn();
const collectProjectDataItems = jest.fn();
jest.mock("@/core/drive-sync/backup-collectors", () => ({
  collectPointItems: (...a: unknown[]) => collectPointItems(...a),
  collectProjectDataItems: (...a: unknown[]) => collectProjectDataItems(...a),
}));

const backupAllPendingPoints = jest.fn();
jest.mock("@/core/drive-sync/backup-service", () => ({
  backupAllPendingPoints: (...a: unknown[]) => backupAllPendingPoints(...a),
  backupPoint: jest.fn(),
}));

const backupProjectData = jest.fn();
jest.mock("@/core/drive-sync/project-data-backup", () => ({ backupProjectData: (...a: unknown[]) => backupProjectData(...a) }));

jest.mock("@/db/queries/backup-snapshot", () => ({
  getSnapshot: jest.fn(async () => new Map(snapshotRows)),
  markItemBackedUp: jest.fn(async (_p: number, _s: string, key: string, fp: string) => void snapshotRows.set(key, fp)),
  deleteSnapshotItems: jest.fn(async (_p: number, _s: string, keys: string[]) => keys.forEach((k) => snapshotRows.delete(k))),
  setScopeBackupTime: jest.fn(async (_p: number, _s: string, at: string) => void (scopeTime = at)),
}));
jest.mock("@/db/queries/points", () => ({ getPoint: jest.fn() }));
jest.mock("@/db/queries/projects", () => ({
  getProjectById: jest.fn(async () => ({ id: 1, collaboration_role: "owner", drive_folder_id: "folder" })),
}));
jest.mock("@/core/points/point-label", () => ({ getPointDisplayLabel: (p: { point_number: number }) => `Ponto ${p.point_number}` }));

import { runPointsBackup, runProjectDataBackup } from "../backup-runners";
import { pointItemKey } from "../backup-items";
import type { BackupContext } from "../backup-session";

const ctx: BackupContext = { report: jest.fn(), isCancelled: () => false };
const point = (id: number) => ({ id, point_number: id });
const pItem = (id: number, fp: string) => ({ key: pointItemKey(id), label: `Ponto ${id}`, fingerprint: fp });

beforeEach(() => {
  snapshotRows.clear();
  scopeTime = null;
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("runPointsBackup", () => {
  it("sends only new or edited points and records each success with the fingerprint captured at the start", async () => {
    snapshotRows.set(pointItemKey(1), "same");
    snapshotRows.set(pointItemKey(2), "old");
    collectPointItems.mockResolvedValue({
      items: [pItem(1, "same"), pItem(2, "new"), pItem(3, "fresh")],
      points: [point(1), point(2), point(3)],
    });
    backupAllPendingPoints.mockImplementation(async (_id: number, _progress: unknown, options: { points: ReturnType<typeof point>[]; onPointDone: (p: unknown, r: unknown) => Promise<void> }) => {
      expect(options.points.map((p) => p.id)).toEqual([2, 3]); // point 1 is up to date
      for (const p of options.points) await options.onPointDone(p, { success: true });
      return { backedUp: 2, failed: [], cancelled: false, notAttempted: 0 };
    });

    const result = await runPointsBackup(1, ctx);

    expect(result).toMatchObject({ outcome: "completed", sent: 2, notSent: 0 });
    expect(snapshotRows.get(pointItemKey(2))).toBe("new");
    expect(snapshotRows.get(pointItemKey(3))).toBe("fresh");
    expect(scopeTime).not.toBeNull();
  });

  it("does not record a failed point: it stays pending", async () => {
    collectPointItems.mockResolvedValue({ items: [pItem(1, "a"), pItem(2, "b")], points: [point(1), point(2)] });
    backupAllPendingPoints.mockImplementation(async (_i: number, _p: unknown, options: { points: ReturnType<typeof point>[]; onPointDone: (p: unknown, r: unknown) => Promise<void> }) => {
      await options.onPointDone(options.points[0], { success: true });
      await options.onPointDone(options.points[1], { success: false, error: "Drive API error (503): x" });
      return { backedUp: 1, failed: [{ pointId: 2, pointLabel: "Ponto 2", reason: "Drive API error (503): x", missingMediaCount: 0, timedOut: false }], cancelled: false, notAttempted: 0 };
    });

    const result = await runPointsBackup(1, ctx);

    expect(result.outcome).toBe("completedWithPending");
    expect(snapshotRows.has(pointItemKey(1))).toBe(true);
    expect(snapshotRows.has(pointItemKey(2))).toBe(false);
    expect(result.failures[0].reasonKey).toBe("driveBackup.reason.server");
  });

  it("drops points deleted locally from the snapshot without touching Drive", async () => {
    snapshotRows.set(pointItemKey(9), "gone");
    collectPointItems.mockResolvedValue({ items: [], points: [] });
    backupAllPendingPoints.mockResolvedValue({ backedUp: 0, failed: [], cancelled: false, notAttempted: 0 });

    await runPointsBackup(1, ctx);

    expect(snapshotRows.has(pointItemKey(9))).toBe(false);
  });

  it("a cancelled run reports 'cancelled' and leaves the unsent points pending", async () => {
    collectPointItems.mockResolvedValue({ items: [pItem(1, "a"), pItem(2, "b")], points: [point(1), point(2)] });
    backupAllPendingPoints.mockImplementation(async (_i: number, _p: unknown, options: { points: ReturnType<typeof point>[]; onPointDone: (p: unknown, r: unknown) => Promise<void> }) => {
      await options.onPointDone(options.points[0], { success: true });
      return { backedUp: 1, failed: [], cancelled: true, notAttempted: 1 };
    });

    const result = await runPointsBackup(1, ctx);

    expect(result).toMatchObject({ outcome: "cancelled", sent: 1, notSent: 1 });
    expect(snapshotRows.has(pointItemKey(1))).toBe(true);
    expect(snapshotRows.has(pointItemKey(2))).toBe(false);
  });
});

describe("runProjectDataBackup", () => {
  const dItem = (key: string, fp: string) => ({ key, label: key, fingerprint: fp, group: "catalog" as const });

  it("sends only pending items and records them one by one", async () => {
    snapshotRows.set("species:s1", "same");
    collectProjectDataItems.mockResolvedValue({
      items: [dItem("species:s1", "same"), dItem("species:s2", "new")],
      payloads: new Map(),
    });
    backupProjectData.mockImplementation(async (params: { pending: { key: string }[]; onItemDone: (i: unknown) => Promise<void> }) => {
      expect(params.pending.map((i) => i.key)).toEqual(["species:s2"]);
      await params.onItemDone(params.pending[0]);
      return { sent: 1, failures: [], cancelled: false, notAttempted: 0 };
    });

    const result = await runProjectDataBackup(1, ctx);

    expect(result).toMatchObject({ outcome: "completed", sent: 1 });
    expect(snapshotRows.get("species:s2")).toBe("new");
  });

  it("is 'completedWithPending' when the manifest was held back", async () => {
    collectProjectDataItems.mockResolvedValue({ items: [dItem("manifest", "m")], payloads: new Map() });
    backupProjectData.mockResolvedValue({ sent: 0, failures: [], cancelled: false, notAttempted: 1 });

    expect(await runProjectDataBackup(1, ctx)).toMatchObject({ outcome: "completedWithPending", notSent: 1 });
  });

  it("refuses a project that is not an owner with Drive backup", async () => {
    const { getProjectById } = jest.requireMock("@/db/queries/projects") as { getProjectById: jest.Mock };
    getProjectById.mockResolvedValueOnce({ id: 1, collaboration_role: "collaborator", drive_folder_id: null });
    await expect(runProjectDataBackup(1, ctx)).rejects.toThrow();
  });
});
