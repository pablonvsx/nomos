import {
  FakeFile,
  FakeDirectory,
  FakePaths,
  zipMock,
  unzipMock,
  resetFakeFs,
  resetFakeDb,
  seedProject,
  seedPoint,
  fsState,
  projects,
  points,
} from "./fixtures/fake-environment";

jest.mock("expo-file-system", () => ({
  File: FakeFile,
  Directory: FakeDirectory,
  Paths: FakePaths,
}));
jest.mock("react-native-zip-archive", () => ({ zip: zipMock, unzip: unzipMock }));

const shareAsyncMock = jest.fn(async (...args: unknown[]) => {});
const isAvailableAsyncMock = jest.fn(async () => true);
jest.mock("expo-sharing", () => ({
  shareAsync: (...args: unknown[]) => shareAsyncMock(...args),
  isAvailableAsync: () => isAvailableAsyncMock(),
}));

let localCollectorCode: string | null = null;
jest.mock("@/core/local-identity/collector-code", () => ({
  getLocalCollectorCode: jest.fn(async () => localCollectorCode),
}));

jest.mock("@/db/queries/projects", () => ({
  getProjectById: jest.fn(async (id: number) => projects.find((p) => p.id === id) ?? null),
  ensureProjectUuid: jest.fn(async (id: number) => {
    const row = projects.find((p) => p.id === id);
    if (!row) throw new Error("project not found");
    if (!row.project_uuid) row.project_uuid = `project-uuid-${id}`;
    return row.project_uuid;
  }),
}));

jest.mock("@/db/queries/points", () => ({
  ensurePointUuid: jest.fn(async (id: number) => {
    const row = points.find((p) => p.id === id);
    if (!row) throw new Error("point not found");
    if (!row.uuid) row.uuid = `point-uuid-${id}`;
    return row.uuid;
  }),
  getPoint: jest.fn(async (id: number) => {
    const row = points.find((p) => p.id === id);
    return row ? { point: row, modules: [] } : null;
  }),
  getPointsWithRawModulesByProject: jest.fn(async (projectId: number) =>
    points.filter((p) => p.project_id === projectId),
  ),
  updatePoint: jest.fn(async (id: number, updates: any) => {
    const row = points.find((p) => p.id === id);
    if (row && updates.created_by !== undefined) row.created_by = updates.created_by;
    return true;
  }),
}));

import {
  exportAllPointsPackage,
  exportPointsPackage,
  CollectorCodeRequiredError,
  type PointsPackage,
} from "../export-points";

function readPackageFromSharedZip(): PointsPackage {
  const zipUri = shareAsyncMock.mock.calls[0][0] as string;
  const zipEntry = fsState.get(zipUri);
  const { entries } = JSON.parse(zipEntry!.content!) as {
    entries: Record<string, { content?: string }>;
  };
  const pointsJsonEntry = Object.entries(entries).find(([key]) => key.endsWith("/points.json"));
  return JSON.parse(pointsJsonEntry![1].content!);
}

beforeEach(() => {
  resetFakeFs();
  resetFakeDb();
  localCollectorCode = null;
  jest.clearAllMocks();
});

describe("exportAllPointsPackage / exportPointsPackage", () => {
  it("throws CollectorCodeRequiredError when no collector code is set, and never shares anything", async () => {
    const project = seedProject();
    seedPoint(project.id);
    localCollectorCode = null;

    await expect(exportAllPointsPackage(project.id)).rejects.toBeInstanceOf(
      CollectorCodeRequiredError,
    );
    expect(shareAsyncMock).not.toHaveBeenCalled();
  });

  it("includes every point regardless of approval_status", async () => {
    localCollectorCode = "ABCD";
    const project = seedProject();
    seedPoint(project.id, { approval_status: "pending" });
    seedPoint(project.id, { approval_status: "approved" });
    seedPoint(project.id, { approval_status: "rejected" });
    seedPoint(project.id, { approval_status: null });

    await exportAllPointsPackage(project.id);

    const pkg = readPackageFromSharedZip();
    expect(pkg.points).toHaveLength(4);
  });

  it("skips a photo/audio file that no longer exists on disk instead of failing the export", async () => {
    localCollectorCode = "ABCD";
    const project = seedProject();
    seedPoint(project.id, {
      photos: JSON.stringify([{ uri: "file:///gone/photo.jpg", timestamp: 1 }]),
    });

    await expect(exportAllPointsPackage(project.id)).resolves.toBeUndefined();

    const pkg = readPackageFromSharedZip();
    expect(pkg.points[0].photos).toEqual([]);
  });

  it("exportPointsPackage only includes the requested point ids", async () => {
    localCollectorCode = "ABCD";
    const project = seedProject();
    const p1 = seedPoint(project.id);
    seedPoint(project.id);

    await exportPointsPackage([p1.id.toString()]);

    const pkg = readPackageFromSharedZip();
    expect(pkg.points).toHaveLength(1);
  });

  it("stamps created_by from the local collector code once, then reuses it on a later export", async () => {
    localCollectorCode = "WXYZ";
    const project = seedProject();
    const point = seedPoint(project.id);

    await exportAllPointsPackage(project.id);
    expect(point.created_by).toBe("WXYZ");

    localCollectorCode = "OTHR";
    await exportAllPointsPackage(project.id);
    expect(point.created_by).toBe("WXYZ"); // static since first creation/export, per spec section 11
  });
});
