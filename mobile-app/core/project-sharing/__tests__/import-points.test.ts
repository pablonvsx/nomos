// importPointsPackage's project_uuid guard and crash-instrumentation
// (see the "espécie/classificação não voltam do Drive" + "importar pontos
// derruba o app" investigation, COLLAB_MODEL_V2_REFERENCE.md section 9):
// - restoreOwnProjectFromDrive can leave a just-restored project with no
//   project_uuid at all if the manifest never carried a config_project_uuid
//   (see project-drive-service.test.ts) - importing a points package against
//   such a project must fail with a distinct, actionable message instead of
//   the generic "belongs to another project" one.
// - the whole function body is wrapped in a try/catch that logs the full
//   stack before rethrowing, as a safety net for whatever crash a manual
//   test turns up that isn't explained by the project_uuid gap above.
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

const sourceProject: Project = {
  id: 1,
  name: "Projeto Fonte",
  protocol_id: "paisageo",
  protocol_source: "official",
  created_at: "2026-01-01T00:00:00.000Z",
  last_updated: "2026-01-01T00:00:00.000Z",
  is_classified: 0,
  collaboration_role: "owner",
  project_uuid: "project-uuid-1",
};

const point: Point = {
  id: "point-1",
  project_id: 1,
  protocol_id: "paisageo",
  point_number: 1,
  lat: -8.05,
  lon: -34.9,
  altitude: null,
  generated_name: "Ponto 1",
  landscape_class_id: null,
  photos: null,
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

async function buildPackageZipUri(): Promise<string> {
  await exportPointsPackage([point.id], registry);
  const [zipUri] = FakeFs.__archivePaths();
  return zipUri;
}

describe("importPointsPackage - project_uuid guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FakeFs.__resetFakeFileSystem();
    mockGetPoint.mockResolvedValue({ point, modules: [] });
    mockCreatePoint.mockResolvedValue("created-id");
    mockPointExists.mockResolvedValue(false);
  });

  it("rejects with a specific message when the target project has no project_uuid at all", async () => {
    mockGetProjectById.mockResolvedValue(sourceProject); // for exportPointsPackage
    const zipUri = await buildPackageZipUri();

    // A project restored from Drive before it ever exported/recovered a
    // config_project_uuid - see project-drive-service.test.ts's
    // "config_project_uuid backfill" tests for the other half of this fix.
    mockGetProjectById.mockResolvedValue({ ...sourceProject, id: 2, project_uuid: null });
    mockGetDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: zipUri }] });

    await expect(importPointsPackage(2, registry)).rejects.toThrow(/configuração compartilhada/);
    expect(mockCreatePoint).not.toHaveBeenCalled();
  });

  it("still imports normally when the target project's project_uuid matches the package", async () => {
    mockGetProjectById.mockResolvedValue(sourceProject);
    const zipUri = await buildPackageZipUri();

    mockGetDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: zipUri }] });

    const result = await importPointsPackage(1, registry);

    expect(result.imported).toBe(1);
    expect(result.rejected).toEqual([]);
  });
});

describe("importPointsPackage - crash instrumentation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FakeFs.__resetFakeFileSystem();
    mockGetPoint.mockResolvedValue({ point, modules: [] });
  });

  it("logs the full stack and rethrows the original error when something unexpected fails", async () => {
    mockGetProjectById.mockResolvedValue(sourceProject);
    const zipUri = await buildPackageZipUri();
    mockGetDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: zipUri }] });

    const boom = new Error("unexpected database failure");
    mockGetProjectById.mockRejectedValue(boom);
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(importPointsPackage(1, registry)).rejects.toThrow("unexpected database failure");

    expect(consoleSpy).toHaveBeenCalledWith("importPointsPackage crashed:", boom.stack);
    consoleSpy.mockRestore();
  });
});

// react-native-zip-archive's native unzip() used to crash the whole app
// instead of rejecting its Promise on certain internal errors (a bug in the
// library itself, patched via patches/react-native-zip-archive+7.0.2.patch -
// see the plan/COLLAB_MODEL_V2_REFERENCE.md section 9 audit follow-up for the
// full logcat/root-cause). These tests cover the JS-side behavior once
// unzip() DOES reject normally (post-patch), plus the new guard that avoids
// ever reaching the native call for an obviously invalid file.
describe("importPointsPackage - invalid/empty file handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FakeFs.__resetFakeFileSystem();
    mockGetPoint.mockResolvedValue({ point, modules: [] });
  });

  it("surfaces the standard invalid-package message when unzip() rejects (instead of crashing)", async () => {
    mockGetProjectById.mockResolvedValue(sourceProject);
    // A file that exists (non-empty) but was never actually produced by
    // zip() - FakeFs.unzip rejects for any path with no staged archive,
    // exactly like the real native module rejecting on a corrupt zip.
    FakeFs.__setFile("file://not-a-real-zip.zip", "not a zip");
    mockGetDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: "file://not-a-real-zip.zip" }] });

    await expect(importPointsPackage(1, registry)).rejects.toThrow(
      "Este arquivo não é um pacote de pontos válido do Nomos.",
    );
  });

  it("rejects with a clear message before calling unzip() when the picked file is missing", async () => {
    mockGetProjectById.mockResolvedValue(sourceProject);
    mockGetDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: "file://does-not-exist.zip" }] });

    await expect(importPointsPackage(1, registry)).rejects.toThrow("Arquivo de pontos inválido ou vazio.");
  });

  it("rejects with a clear message before calling unzip() when the picked file is empty", async () => {
    mockGetProjectById.mockResolvedValue(sourceProject);
    FakeFs.__setFile("file://empty.zip", "");
    mockGetDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: "file://empty.zip" }] });

    await expect(importPointsPackage(1, registry)).rejects.toThrow("Arquivo de pontos inválido ou vazio.");
  });
});
