// Duplicate-detection on the owner's import side (COLLAB_MODEL_V2_REFERENCE.md
// section 5): a point whose id already exists locally (any approval_status)
// must NOT be inserted/updated automatically - its media is still
// materialized into persistent storage, and it's returned in
// result.duplicates for the owner to resolve (see resolve-duplicates.test.ts).
// A point with a brand-new id keeps working exactly as before.
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

const mockGetDocumentAsync = jest.fn();
jest.mock("expo-document-picker", () => ({
  getDocumentAsync: (...args: unknown[]) => mockGetDocumentAsync(...args),
}));

const mockGetPoint = jest.fn();
const mockCreatePoint = jest.fn();
const mockPointExists = jest.fn();
jest.mock("@/db/queries/points", () => ({
  getPoint: (...args: unknown[]) => mockGetPoint(...args),
  createPoint: (...args: unknown[]) => mockCreatePoint(...args),
  pointExists: (...args: unknown[]) => mockPointExists(...args),
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

import { exportPointsPackage } from "../export-points";
import { importPointsPackage } from "../import-points";
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
  collaboration_role: "owner",
  project_uuid: "project-uuid-1",
};

const newPhotoUri = "device://photos/new.jpg";
const duplicatePhotoUri = "device://photos/dup.jpg";

const newPoint: Point = {
  id: "point-new",
  project_id: 1,
  protocol_id: "paisageo",
  point_number: 1,
  lat: -8.05,
  lon: -34.9,
  altitude: null,
  generated_name: "Ponto Novo",
  landscape_class_id: null,
  photos: JSON.stringify([{ uri: newPhotoUri, timestamp: 1000 }]),
  audio_notes: null,
  additional_notes: null,
  point_size: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  created_by: "COLA",
  approval_status: "local",
  rejection_reason: null,
  drive_synced_at: null,
};

const duplicatePoint: Point = {
  ...newPoint,
  id: "point-existing",
  point_number: 2,
  generated_name: "Ponto Existente",
  photos: JSON.stringify([{ uri: duplicatePhotoUri, timestamp: 2000 }]),
};

describe("importPointsPackage duplicate detection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FakeFs.__resetFakeFileSystem();

    FakeFs.__setFile(newPhotoUri, "NEW_PHOTO_BYTES");
    FakeFs.__setFile(duplicatePhotoUri, "DUP_PHOTO_BYTES");

    mockGetPoint.mockImplementation((id: string) => {
      const point = id === newPoint.id ? newPoint : id === duplicatePoint.id ? duplicatePoint : null;
      return Promise.resolve(point ? { point, modules: [] } : null);
    });
    mockGetProjectById.mockResolvedValue(project);
    mockCreatePoint.mockResolvedValue("created-id");
  });

  it("still imports a point with a brand-new id as pending, with no duplicates", async () => {
    mockPointExists.mockResolvedValue(false);

    await exportPointsPackage([newPoint.id], registry);
    const [zipUri] = FakeFs.__archivePaths();
    mockGetDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: zipUri }] });

    const result = await importPointsPackage(1, registry);

    expect(result.imported).toBe(1);
    expect(result.rejected).toEqual([]);
    expect(result.duplicates).toEqual([]);
    expect(mockCreatePoint).toHaveBeenCalledTimes(1);
  });

  it("does not insert a point whose id already exists, and returns it as a duplicate with materialized media", async () => {
    mockPointExists.mockImplementation((id: string) => Promise.resolve(id === duplicatePoint.id));

    await exportPointsPackage([duplicatePoint.id], registry);
    const [zipUri] = FakeFs.__archivePaths();
    mockGetDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: zipUri }] });

    const result = await importPointsPackage(1, registry);

    expect(result.imported).toBe(0);
    expect(result.rejected).toEqual([]);
    expect(mockCreatePoint).not.toHaveBeenCalled();

    expect(result.duplicates).toHaveLength(1);
    const [duplicate] = result.duplicates;
    expect(duplicate.pointId).toBe(duplicatePoint.id);
    expect(duplicate.pointLabel).toBe(`PS-${duplicatePoint.point_number}`);

    expect(duplicate.incomingEnvelope.photos).toHaveLength(1);
    const [newUri] = duplicate.incomingEnvelope.photos!;
    expect(newUri).not.toBe(duplicatePhotoUri);
    expect(FakeFs.__getFile(newUri)).toBe("DUP_PHOTO_BYTES");
  });
});
