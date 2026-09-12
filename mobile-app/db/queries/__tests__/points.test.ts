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

import { getAllPointIdsForProject } from "../points";

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
