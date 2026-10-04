// points.ts talks to expo-sqlite through the `db` singleton exported by
// db/initialize.ts, which ts-jest ("node" environment) cannot run. Since the
// functions under test here ARE db/queries/points.ts's own functions (not a
// caller of them), we mock @/db/initialize itself with a small fake `db`
// whose getAllAsync/runAsync interpret the actual SQL text/params these
// functions issue against an in-memory points array - this proves real
// filtering/update behavior, not just that some SQL string was built.

interface FakePointRow {
  id: number;
  project_id: number;
  approval_status: string | null;
  rejection_reason: string | null;
  point_number: number;
  drive_synced_at: string | null;
  [key: string]: unknown;
}

let pointsTable: FakePointRow[] = [];

function resetPointsTable() {
  pointsTable = [];
}

const VISIBLE_CLAUSE = "(approval_status IS NULL OR approval_status = 'approved')";

const getAllAsyncMock = jest.fn(async (sql: string, params: unknown[]) => {
  if (sql.includes("FROM point_modules")) return [];
  if (sql.includes(VISIBLE_CLAUSE)) {
    const [projectId] = params as [number];
    return pointsTable
      .filter(
        (p) =>
          p.project_id === projectId && (p.approval_status === null || p.approval_status === "approved"),
      )
      .sort((a, b) => a.point_number - b.point_number);
  }
  if (/^\s*SELECT (\*|id, generated_name) FROM points\s+WHERE project_id = \? ORDER BY/.test(sql)) {
    // No approval_status filter in the SQL text: every status comes back.
    const [projectId] = params as [number];
    return pointsTable
      .filter((p) => p.project_id === projectId)
      .sort((a, b) => a.point_number - b.point_number);
  }
  if (sql.includes("drive_synced_at IS NULL")) {
    const [projectId] = params as [number];
    return pointsTable
      .filter(
        (p) => p.project_id === projectId && p.approval_status === "approved" && !p.drive_synced_at,
      )
      .sort((a, b) => a.point_number - b.point_number);
  }
  if (sql.includes("approval_status = ?")) {
    const [projectId, status] = params as [number, string];
    return pointsTable
      .filter((p) => p.project_id === projectId && p.approval_status === status)
      .sort((a, b) => a.point_number - b.point_number);
  }
  return [];
});

const runAsyncMock = jest.fn(async (sql: string, params: unknown[]) => {
  if (sql.includes("INSERT INTO points") && !sql.includes("point_modules")) {
    // Map the INSERT's column list onto its params, like SQLite would.
    const columnList = sql.match(/INSERT INTO points\s*\(([^)]*)\)/)![1];
    const columns = columnList.split(",").map((c) => c.trim());
    const row: FakePointRow = {
      id: pointsTable.length + 1,
      project_id: 1,
      approval_status: null,
      rejection_reason: null,
      point_number: pointsTable.length + 1,
      drive_synced_at: null,
    };
    columns.forEach((column, i) => {
      row[column] = params[i];
    });
    pointsTable.push(row);
    return { changes: 1, lastInsertRowId: row.id };
  }
  if (sql.startsWith("UPDATE points SET")) {
    const setClause = sql.split("WHERE")[0];
    const fieldNames = [...setClause.matchAll(/(\w+)\s*=\s*\?/g)].map((m) => m[1]);
    const pointId = params[params.length - 1];
    const row = pointsTable.find((p) => p.id === pointId);
    if (row) {
      fieldNames.forEach((field, i) => {
        row[field] = params[i];
      });
    }
  }
  return { changes: 1 };
});

// points.ts also imports the shared uuid helper, which wraps expo-crypto (a
// native module ts-jest/node can't load) - not used by the functions under
// test here, so a trivial stub is enough.
jest.mock("@/core/utils/uuid", () => ({ generateUuid: () => "fake-uuid" }));

jest.mock("@/db/initialize", () => ({
  db: {
    getAllAsync: (...args: [string, unknown[]]) => getAllAsyncMock(...args),
    getFirstAsync: jest.fn(async () => null),
    runAsync: (...args: [string, unknown[]]) => runAsyncMock(...args),
  },
}));

import {
  classifyProjectPoints,
  createPoint,
  getApprovedUnsyncedPointsByProject,
  getPendingPointsByProject,
  getPointsByProject,
  getPointsWithModulesByProject,
  getPointsWithRawModulesByProject,
  getRejectedPointsByProject,
  updatePointApprovalStatus,
} from "../points";

function seedPoint(overrides: Partial<FakePointRow>): FakePointRow {
  const row: FakePointRow = {
    id: pointsTable.length + 1,
    project_id: 1,
    approval_status: null,
    rejection_reason: null,
    point_number: pointsTable.length + 1,
    drive_synced_at: null,
    ...overrides,
  };
  pointsTable.push(row);
  return row;
}

beforeEach(() => {
  resetPointsTable();
  jest.clearAllMocks();
});

describe("getPendingPointsByProject / getRejectedPointsByProject", () => {
  it("returns only pending points from the requested project", async () => {
    seedPoint({ id: 1, project_id: 1, approval_status: "pending" });
    seedPoint({ id: 2, project_id: 1, approval_status: "approved" });
    seedPoint({ id: 3, project_id: 2, approval_status: "pending" }); // other project
    seedPoint({ id: 4, project_id: 1, approval_status: "rejected" });

    const result = await getPendingPointsByProject(1);

    expect(result.map((p) => p.id)).toEqual([1]);
  });

  it("returns only rejected points from the requested project", async () => {
    seedPoint({ id: 1, project_id: 1, approval_status: "rejected" });
    seedPoint({ id: 2, project_id: 1, approval_status: "pending" });
    seedPoint({ id: 3, project_id: 2, approval_status: "rejected" }); // other project
    seedPoint({ id: 4, project_id: 1, approval_status: "rejected" });

    const result = await getRejectedPointsByProject(1);

    expect(result.map((p) => p.id).sort()).toEqual([1, 4]);
  });
});

describe("getApprovedUnsyncedPointsByProject", () => {
  it("returns only approved points with no Drive backup yet, from the requested project", async () => {
    seedPoint({ id: 1, project_id: 1, approval_status: "approved", drive_synced_at: null });
    seedPoint({ id: 2, project_id: 1, approval_status: "approved", drive_synced_at: "2026-01-01T00:00:00.000Z" }); // already synced
    seedPoint({ id: 3, project_id: 1, approval_status: "pending", drive_synced_at: null }); // not approved
    seedPoint({ id: 4, project_id: 1, approval_status: "rejected", drive_synced_at: null }); // not approved
    seedPoint({ id: 5, project_id: 2, approval_status: "approved", drive_synced_at: null }); // other project

    const result = await getApprovedUnsyncedPointsByProject(1);

    expect(result.map((p) => p.id)).toEqual([1]);
  });
});

describe("updatePointApprovalStatus", () => {
  it("approving a point sets approval_status to approved and clears any rejection reason", async () => {
    const point = seedPoint({
      id: 1,
      approval_status: "rejected",
      rejection_reason: "photo missing",
    });

    const ok = await updatePointApprovalStatus(1, "approved");

    expect(ok).toBe(true);
    expect(point.approval_status).toBe("approved");
    expect(point.rejection_reason).toBeNull();
  });

  it("rejecting a point sets approval_status to rejected and stores the reason", async () => {
    const point = seedPoint({ id: 1, approval_status: "pending" });

    await updatePointApprovalStatus(1, "rejected", "duplicate location");

    expect(point.approval_status).toBe("rejected");
    expect(point.rejection_reason).toBe("duplicate location");
  });
});

// Section 6 of COLLAB_MODEL_REFERENCE.md: the general point list/map must only
// ever contain NULL (collected directly) or 'approved' points.
function seedAllStatuses() {
  seedPoint({ id: 1, approval_status: null, generated_name: "A" });
  seedPoint({ id: 2, approval_status: "pending", generated_name: "B" });
  seedPoint({ id: 3, approval_status: "approved", generated_name: "C" });
  seedPoint({ id: 4, approval_status: "rejected", generated_name: "D" });
  seedPoint({ id: 5, project_id: 2, approval_status: null, generated_name: "E" }); // other project
}

describe("general project point list (section 6 visibility rule)", () => {
  it("getPointsByProject returns only NULL and approved points", async () => {
    seedAllStatuses();

    const result = await getPointsByProject(1);

    expect(result.map((p) => p.id)).toEqual([1, 3]);
  });

  it("getPointsWithModulesByProject returns only NULL and approved points", async () => {
    seedAllStatuses();

    const result = await getPointsWithModulesByProject(1, { getProtocol: () => undefined } as never);

    expect(result.map((p) => p.id)).toEqual([1, 3]);
  });

  it("pending and rejected points are still reachable through their own queries", async () => {
    seedAllStatuses();

    expect((await getPendingPointsByProject(1)).map((p) => p.id)).toEqual([2]);
    expect((await getRejectedPointsByProject(1)).map((p) => p.id)).toEqual([4]);
  });

  it("the points package export query still returns every status", async () => {
    seedAllStatuses();

    const result = await getPointsWithRawModulesByProject(1);

    expect(result.map((p) => p.id)).toEqual([1, 2, 3, 4]);
  });

  it("classifyProjectPoints numbers classes only from visible points", async () => {
    seedAllStatuses();

    await classifyProjectPoints(1);

    const updated = runAsyncMock.mock.calls
      .filter(([sql]) => sql.startsWith("UPDATE points SET landscape_class_id"))
      .map(([, params]) => params[params.length - 1]);
    expect(updated.sort()).toEqual([1, 3]);
  });
});

// createPoint used to accept drive_synced_at / rejection_reason in its input
// but silently drop them from the INSERT.
describe("createPoint persists drive_synced_at and rejection_reason", () => {
  const baseInput = {
    project_id: 1,
    protocol_id: "nomos-paisageo-v1",
    lat: -8,
    lon: -34,
    schema_version: "1.0",
    modules: {},
  };

  it("a restored point created with drive_synced_at is not offered for backup again", async () => {
    await createPoint({
      ...baseInput,
      approval_status: "approved",
      drive_synced_at: "2026-01-01T00:00:00.000Z",
    });
    await createPoint({ ...baseInput, approval_status: "approved" }); // never backed up

    expect(pointsTable[0].drive_synced_at).toBe("2026-01-01T00:00:00.000Z");
    const unsynced = await getApprovedUnsyncedPointsByProject(1);
    expect(unsynced.map((p) => p.id)).toEqual([2]);
  });

  it("keeps the rejection reason it was created with", async () => {
    await createPoint({ ...baseInput, approval_status: "rejected", rejection_reason: "blurry photo" });

    expect(pointsTable[0].rejection_reason).toBe("blurry photo");
  });
});
