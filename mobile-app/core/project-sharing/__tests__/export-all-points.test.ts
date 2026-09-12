// exportAllPointsPackage (COLLAB_MODEL_V2_REFERENCE.md section 4, "export
// all points") must include every point of the local project regardless of
// approval_status - unlike the local approval queue, there's no filtering
// here. Uses the same fake-file-system harness as export-import-audio.test.ts.
import * as FakeFs from "./test-utils/fake-file-system";

jest.mock("expo-file-system", () => ({
  File: FakeFs.File,
  Directory: FakeFs.Directory,
  Paths: FakeFs.Paths,
}));
jest.mock("react-native-zip-archive", () => ({
  zip: FakeFs.zip,
  unzip: FakeFs.unzip,
}));
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  shareAsync: jest.fn(),
}));

const mockGetPoint = jest.fn();
const mockGetAllPointIdsForProject = jest.fn();
jest.mock("@/db/queries/points", () => ({
  getPoint: (...args: unknown[]) => mockGetPoint(...args),
  getAllPointIdsForProject: (...args: unknown[]) => mockGetAllPointIdsForProject(...args),
}));

const mockGetProjectById = jest.fn();
jest.mock("@/db/queries/projects", () => ({
  getProjectById: (...args: unknown[]) => mockGetProjectById(...args),
}));

jest.mock("@/db/queries/custom-protocols", () => ({
  getCustomProtocolById: jest.fn(),
  setCustomProtocolUuid: jest.fn(),
}));

jest.mock("@/core/local-identity/collector-code", () => ({
  getLocalCollectorCode: jest.fn().mockResolvedValue("PS"),
}));

jest.mock("@/utils/uuid", () => ({
  generateUuid: jest.fn(() => "uuid-mock"),
}));

jest.mock("@/core/drive-sync/project-sync-service", () => ({
  serializeModules: jest.fn(() => ({})),
}));

// Same transitive-import stubs as export-import-audio.test.ts (module-media.ts
// -> modules/custom/manifest.ts -> modules/registry.ts -> Paisageo renderers).
jest.mock("@/modules/paisageo/modules/geoecological-constraints/GeoecologicalConstraintsModuleRenderer", () => ({
  GeoecologicalConstraintsModuleRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/vegetation/VegetationModuleRenderer", () => ({
  VegetationModuleRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/impacts/ImpactsModuleRenderer", () => ({
  ImpactsModuleRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/geoecological-constraints/GeoecologicalConstraintsModuleReadOnlyRenderer", () => ({
  GeoecologicalConstraintsModuleReadOnlyRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/vegetation/VegetationModuleReadOnlyRenderer", () => ({
  VegetationModuleReadOnlyRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/impacts/ImpactsModuleReadOnlyRenderer", () => ({
  ImpactsModuleReadOnlyRenderer: () => null,
}));

import { exportAllPointsPackage } from "../export-points";
import type { Point, Project } from "@/types/database";
import type { ProtocolRegistry } from "@/protocol-kernel/types";

const registry = { getProtocol: jest.fn(() => undefined) } as unknown as ProtocolRegistry;

const project: Project = {
  id: 1,
  name: "Projeto Teste",
  protocol_id: "paisageo",
  protocol_source: "official",
  created_at: "2026-01-01T00:00:00.000Z",
  last_updated: "2026-01-01T00:00:00.000Z",
  is_classified: 0,
  collaboration_role: null,
  project_uuid: "project-uuid-1",
};

function makePoint(id: string, approvalStatus: Point["approval_status"]): Point {
  return {
    id,
    project_id: 1,
    protocol_id: "paisageo",
    point_number: 1,
    lat: -8.05,
    lon: -34.9,
    altitude: null,
    generated_name: `Ponto ${id}`,
    landscape_class_id: null,
    photos: null,
    audio_notes: null,
    additional_notes: null,
    point_size: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    created_by: "PS",
    approval_status: approvalStatus,
    rejection_reason: null,
    drive_synced_at: null,
  };
}

const points: Record<string, Point> = {
  "point-pending": makePoint("point-pending", "pending"),
  "point-approved": makePoint("point-approved", "approved"),
  "point-rejected": makePoint("point-rejected", "rejected"),
};

describe("exportAllPointsPackage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FakeFs.__resetFakeFileSystem();

    mockGetAllPointIdsForProject.mockResolvedValue(Object.keys(points));
    mockGetPoint.mockImplementation((id: string) =>
      Promise.resolve(points[id] ? { point: points[id], modules: [] } : null),
    );
    mockGetProjectById.mockResolvedValue(project);
  });

  it("includes every point of the project regardless of approval_status", async () => {
    await exportAllPointsPackage(1, registry);

    const [zipUri] = FakeFs.__archivePaths();
    expect(zipUri).toBeDefined();

    await FakeFs.unzip(zipUri, "extracted");
    const pointsJson = FakeFs.__getFile("extracted/points.json");
    expect(pointsJson).toBeDefined();

    const pkg = JSON.parse(pointsJson as string);
    const exportedIds = pkg.points.map((p: { id: string }) => p.id).sort();
    expect(exportedIds).toEqual(["point-approved", "point-pending", "point-rejected"]);
  });
});
