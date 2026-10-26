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
jest.mock("@/core/drive-sync/drive-api-client", () => ({ findChildByName: jest.fn() }));
jest.mock("@/core/google-auth/google-auth-service", () => ({ getDriveAccessToken: jest.fn() }));
jest.mock("@/core/net/connectivity", () => ({ isOnline: jest.fn() }));
jest.mock("@/db/queries/points", () => ({ getPoint: jest.fn() }));
jest.mock("@/db/queries/projects", () => ({
  getProjectById: jest.fn(async () => ({ id: 1, collaboration_role: "owner", drive_folder_id: "folder" })),
}));
jest.mock("@/core/points/point-label", () => ({ getPointDisplayLabel: (p: { point_number: number }) => `Ponto ${p.point_number}` }));

import { runPointsBackup, runProjectDataBackup } from "../backup-runners";
import { pointItemKey } from "../backup-items";
import type { BackupContext } from "../backup-session";

const ctx: BackupContext = { report: jest.fn(), activity: jest.fn(), isCancelled: () => false };
const point = (id: number) => ({ id, point_number: id });
const pItem = (id: number, fp: string) => ({ key: pointItemKey(id), kind: "point" as const, label: "", fingerprint: fp });

beforeEach(() => {
  snapshotRows.clear();
  scopeTime = null;
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("runPointsBackup: progress and log wiring", () => {
  it("reports the point now going up (1 of N), hands the log callback to the service, and forwards the context's activity", async () => {
    collectPointItems.mockResolvedValue({ items: [pItem(1, "a"), pItem(2, "b")], points: [point(1), point(2)] });
    const report = jest.fn();
    const activity = jest.fn();
    const context: BackupContext = { report, activity, isCancelled: () => false };
    backupAllPendingPoints.mockImplementation(async (_id: number, onProgress: (p: { current: number; total: number }) => void, options: { onEvent: (e: unknown) => void }) => {
      onProgress({ current: 1, total: 2 });
      options.onEvent({ type: "item-start" });
      onProgress({ current: 2, total: 2 });
      return { backedUp: 0, failed: [], cancelled: false, connectionLost: false, notAttempted: 0 };
    });

    await runPointsBackup(1, context);

    expect(report.mock.calls.map(([, current, total]) => [current, total])).toEqual([[1, 2], [2, 2]]);
    expect(activity).toHaveBeenCalledWith({ type: "item-start" });
  });
});

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
      return { backedUp: 2, failed: [], cancelled: false, connectionLost: false, notAttempted: 0 };
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
      return { backedUp: 1, failed: [{ pointId: 2, pointNumber: 2, lat: -8, lon: -34, reason: "Drive API error (503): x", missingMediaCount: 0, timedOut: false }], cancelled: false, connectionLost: false, notAttempted: 0 };
    });

    const result = await runPointsBackup(1, ctx);

    expect(result.outcome).toBe("incomplete");
    expect(snapshotRows.has(pointItemKey(1))).toBe(true);
    expect(snapshotRows.has(pointItemKey(2))).toBe(false);
    expect(result.failures[0].reasonKey).toBe("driveBackup.reason.server");
  });

  it("drops points deleted locally from the snapshot without touching Drive", async () => {
    snapshotRows.set(pointItemKey(9), "gone");
    collectPointItems.mockResolvedValue({ items: [], points: [] });
    backupAllPendingPoints.mockResolvedValue({ backedUp: 0, failed: [], cancelled: false, connectionLost: false, notAttempted: 0 });

    await runPointsBackup(1, ctx);

    expect(snapshotRows.has(pointItemKey(9))).toBe(false);
  });

  it("a cancelled run reports 'cancelled' and leaves the unsent points pending", async () => {
    collectPointItems.mockResolvedValue({ items: [pItem(1, "a"), pItem(2, "b")], points: [point(1), point(2)] });
    backupAllPendingPoints.mockImplementation(async (_i: number, _p: unknown, options: { points: ReturnType<typeof point>[]; onPointDone: (p: unknown, r: unknown) => Promise<void> }) => {
      await options.onPointDone(options.points[0], { success: true });
      return { backedUp: 1, failed: [], cancelled: true, connectionLost: false, notAttempted: 1 };
    });

    const result = await runPointsBackup(1, ctx);

    expect(result).toMatchObject({ outcome: "cancelled", sent: 1, notSent: 1 });
    expect(snapshotRows.has(pointItemKey(1))).toBe(true);
    expect(snapshotRows.has(pointItemKey(2))).toBe(false);
  });
});

describe("runProjectDataBackup", () => {
  const dItem = (key: string, fp: string) => ({ key, kind: "species" as const, label: key, fingerprint: fp, group: "catalog" as const });

  it("sends only pending items and records them one by one", async () => {
    snapshotRows.set("species:s1", "same");
    collectProjectDataItems.mockResolvedValue({
      items: [dItem("species:s1", "same"), dItem("species:s2", "new")],
      payloads: new Map(),
    });
    backupProjectData.mockImplementation(async (params: { pending: { key: string }[]; onItemDone: (i: unknown) => Promise<void> }) => {
      expect(params.pending.map((i) => i.key)).toEqual(["species:s2"]);
      await params.onItemDone(params.pending[0]);
      return { sent: 1, failures: [], cancelled: false, connectionLost: false, notAttempted: 0 };
    });

    const result = await runProjectDataBackup(1, ctx);

    expect(result).toMatchObject({ outcome: "completed", sent: 1 });
    expect(snapshotRows.get("species:s2")).toBe("new");
  });

  it("is 'incomplete' when something was sent and the manifest was held back", async () => {
    collectProjectDataItems.mockResolvedValue({ items: [dItem("manifest", "m")], payloads: new Map() });
    backupProjectData.mockResolvedValue({ sent: 1, failures: [], cancelled: false, connectionLost: false, notAttempted: 1 });

    expect(await runProjectDataBackup(1, ctx)).toMatchObject({ outcome: "incomplete", sent: 1, notSent: 1 });
  });

  it("is 'interrupted' when the connection dropped after some items were sent", async () => {
    collectProjectDataItems.mockResolvedValue({ items: [dItem("species:a", "1"), dItem("species:b", "2")], payloads: new Map() });
    backupProjectData.mockResolvedValue({
      sent: 1,
      failures: [{ kind: "species", label: "b", reasonKey: "driveBackup.reason.offline", detail: "Network request failed" }],
      cancelled: false,
      connectionLost: true,
      notAttempted: 0,
    });

    expect(await runProjectDataBackup(1, ctx)).toMatchObject({ outcome: "interrupted", sent: 1, notSent: 1 });
  });

  it("refuses a project that is not an owner with Drive backup", async () => {
    const { getProjectById } = jest.requireMock("@/db/queries/projects") as { getProjectById: jest.Mock };
    getProjectById.mockResolvedValueOnce({ id: 1, collaboration_role: "collaborator", drive_folder_id: null });
    await expect(runProjectDataBackup(1, ctx)).rejects.toThrow();
  });

  describe("route and layer", () => {
    const mapItem = (key: "maplayer" | "fieldroute", fp: string) => ({
      key,
      kind: key === "maplayer" ? ("mapLayer" as const) : ("fieldRoute" as const),
      label: "",
      fingerprint: fp,
      group: "map" as const,
    });

    it("a route added or edited since the last backup is pending and recorded by its content fingerprint", async () => {
      snapshotRows.set("maplayer", "old");
      collectProjectDataItems.mockResolvedValue({
        items: [mapItem("maplayer", "edited"), mapItem("fieldroute", "fresh"), dItem("manifest", "same")],
        payloads: new Map(),
      });
      snapshotRows.set("manifest", "same");
      backupProjectData.mockImplementation(async (params: { pending: { key: string }[]; onItemDone: (i: unknown) => Promise<void> }) => {
        expect(params.pending.map((i) => i.key)).toEqual(["maplayer", "fieldroute"]);
        for (const item of params.pending) await params.onItemDone(item);
        return { sent: 2, failures: [], cancelled: false, connectionLost: false, notAttempted: 0 };
      });

      await runProjectDataBackup(1, ctx);

      expect(snapshotRows.get("maplayer")).toBe("edited");
      expect(snapshotRows.get("fieldroute")).toBe("fresh");
    });

    it("a route the person removed becomes a removal step before the manifest, and leaves the snapshot only when it was sent", async () => {
      snapshotRows.set("fieldroute", "was-there");
      snapshotRows.set("manifest", "old");
      const payloads = new Map<string, unknown>();
      const manifest = { ...dItem("manifest", "new"), kind: "manifest" as const, group: "manifest" as const };
      collectProjectDataItems.mockResolvedValue({ items: [manifest], payloads });
      backupProjectData.mockImplementation(async (params: { pending: { key: string; fingerprint: string }[]; payloads: Map<string, unknown>; onItemDone: (i: unknown) => Promise<void> }) => {
        expect(params.pending.map((i) => i.key)).toEqual(["fieldroute", "manifest"]);
        expect(params.payloads.get("fieldroute")).toBeNull(); // null payload = clear the slot
        await params.onItemDone(params.pending[0]);
        await params.onItemDone(params.pending[1]);
        return { sent: 2, failures: [], cancelled: false, connectionLost: false, notAttempted: 0 };
      });

      await runProjectDataBackup(1, ctx);

      expect(snapshotRows.has("fieldroute")).toBe(false);
      expect(snapshotRows.get("manifest")).toBe("new");
    });

    it("a removal that failed stays in the snapshot, so it is retried by the next backup", async () => {
      snapshotRows.set("maplayer", "was-there");
      collectProjectDataItems.mockResolvedValue({ items: [], payloads: new Map() });
      backupProjectData.mockResolvedValue({
        sent: 0,
        failures: [{ kind: "mapLayer", label: "", reasonKey: "driveBackup.reason.unknown", detail: "x" }],
        cancelled: false,
        connectionLost: false,
        notAttempted: 0,
      });

      await runProjectDataBackup(1, ctx);

      expect(snapshotRows.get("maplayer")).toBe("was-there");
    });
  });
});
