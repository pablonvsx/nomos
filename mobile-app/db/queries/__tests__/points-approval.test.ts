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
  [key: string]: unknown;
}

let pointsTable: FakePointRow[] = [];

function resetPointsTable() {
  pointsTable = [];
}

const getAllAsyncMock = jest.fn(async (sql: string, params: unknown[]) => {
  if (sql.includes("approval_status = ?")) {
    const [projectId, status] = params as [number, string];
    return pointsTable
      .filter((p) => p.project_id === projectId && p.approval_status === status)
      .sort((a, b) => a.point_number - b.point_number);
  }
  return [];
});

const runAsyncMock = jest.fn(async (sql: string, params: unknown[]) => {
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
  getPendingPointsByProject,
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
