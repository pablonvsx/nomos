// getAllPointIdsForProject backs exportAllPointsPackage (bulk export of a
// collaborator's whole local project, COLLAB_MODEL_V2_REFERENCE.md section
// 4) - it must NOT filter by approval_status, unlike
// getPendingPointsByProject. Mocks ../../initialize (the raw expo-sqlite db
// object), same pattern as db/queries/__tests__/projects.test.ts.
const mockGetAllAsync = jest.fn();
jest.mock("../../initialize", () => ({
  db: {
    getAllAsync: (...args: unknown[]) => mockGetAllAsync(...args),
  },
}));

// points.ts imports generatePointId (used by createPoint, not exercised
// here) from @/utils/uuid, which pulls in expo-crypto - an ESM package
// ts-jest/node can't transform. Stub it out just to allow the import.
jest.mock("@/utils/uuid", () => ({
  generatePointId: jest.fn(() => "point-id-mock"),
  generateUuid: jest.fn(() => "uuid-mock"),
}));

import {
  getAllPointIdsForProject,
  getRejectedPointsByProject,
  getApprovedUnsyncedPointsByProject,
} from "../points";
import type { Point } from "@/types/database";

describe("getAllPointIdsForProject", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("queries by project_id only, with no approval_status filter, and returns just the ids", async () => {
    mockGetAllAsync.mockResolvedValue([{ id: "point-1" }, { id: "point-2" }, { id: "point-3" }]);

    const ids = await getAllPointIdsForProject(1);

    expect(ids).toEqual(["point-1", "point-2", "point-3"]);
    const [sql, params] = mockGetAllAsync.mock.calls[0];
    expect(sql).not.toMatch(/approval_status/i);
    expect(sql).toContain("WHERE project_id = ?");
    expect(params).toEqual([1]);
  });

  it("returns an empty array if the query fails", async () => {
    mockGetAllAsync.mockRejectedValue(new Error("db error"));

    const ids = await getAllPointIdsForProject(1);

    expect(ids).toEqual([]);
  });
});

// Backs the rejected-points area (COLLAB_MODEL_V2_REFERENCE.md section 7) -
// must filter to this project's rejected points only, same pattern as
// getPendingPointsByProject but with the opposite status.
describe("getRejectedPointsByProject", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("filters by project_id and approval_status = 'rejected'", async () => {
    const rejectedPoint = { id: "point-1", project_id: 1, approval_status: "rejected" } as Point;
    mockGetAllAsync.mockResolvedValue([rejectedPoint]);

    const points = await getRejectedPointsByProject(1);

    expect(points).toEqual([rejectedPoint]);
    const [sql, params] = mockGetAllAsync.mock.calls[0];
    expect(sql).toContain("WHERE project_id = ? AND approval_status = 'rejected'");
    expect(params).toEqual([1]);
  });

  it("returns an empty array if the query fails", async () => {
    mockGetAllAsync.mockRejectedValue(new Error("db error"));

    const points = await getRejectedPointsByProject(1);

    expect(points).toEqual([]);
  });
});

// Backs "Fazer backup" (COLLAB_MODEL_V2_REFERENCE.md section 8) - only
// approved points that haven't been backed up yet (drive_synced_at is only
// ever set by the explicit backup action, never automatically).
describe("getApprovedUnsyncedPointsByProject", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("filters by project_id, approval_status = 'approved' and drive_synced_at IS NULL", async () => {
    const point = { id: "point-1", project_id: 1, approval_status: "approved", drive_synced_at: null } as Point;
    mockGetAllAsync.mockResolvedValue([point]);

    const points = await getApprovedUnsyncedPointsByProject(1);

    expect(points).toEqual([point]);
    const [sql, params] = mockGetAllAsync.mock.calls[0];
    expect(sql).toContain("approval_status = 'approved'");
    expect(sql).toContain("drive_synced_at IS NULL");
    expect(params).toEqual([1]);
  });

  it("returns an empty array if the query fails", async () => {
    mockGetAllAsync.mockRejectedValue(new Error("db error"));

    const points = await getApprovedUnsyncedPointsByProject(1);

    expect(points).toEqual([]);
  });
});
