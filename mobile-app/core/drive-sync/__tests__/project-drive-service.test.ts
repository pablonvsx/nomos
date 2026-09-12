// restoreOwnProjectFromDrive (COLLAB_MODEL_V2_REFERENCE.md section 9): the
// only remaining scenario where the app reads from Drive proactively.
// Recreates the local project as 'owner' and pulls down every approved
// point. A custom-protocol project must resolve its local protocol id via
// protocol-package.json + getCustomProtocolByUuid/createCustomProtocolFromPackage
// (the same reconciliation applyProjectConfigPackage already uses for the
// file-sharing path) - this is the Drive-restore equivalent of the Fase A
// "Crítico 1" regression test, proving a device with no local copy of the
// custom protocol yet still resolves correctly.
jest.mock("expo-file-system", () => ({
  File: class {
    uri = "mock-file-uri";
  },
  Paths: { document: "mock-document" },
}));

const mockCreateFolder = jest.fn();
const mockFindChildByName = jest.fn();
const mockListChildren = jest.fn();
const mockUploadJsonFile = jest.fn();
const mockUpdateJsonFile = jest.fn();
const mockReadJsonFile = jest.fn();
const mockDownloadBinaryFile = jest.fn();
jest.mock("../drive-api-client", () => ({
  createFolder: (...args: unknown[]) => mockCreateFolder(...args),
  findChildByName: (...args: unknown[]) => mockFindChildByName(...args),
  listChildren: (...args: unknown[]) => mockListChildren(...args),
  uploadJsonFile: (...args: unknown[]) => mockUploadJsonFile(...args),
  updateJsonFile: (...args: unknown[]) => mockUpdateJsonFile(...args),
  readJsonFile: (...args: unknown[]) => mockReadJsonFile(...args),
  downloadBinaryFile: (...args: unknown[]) => mockDownloadBinaryFile(...args),
}));

jest.mock("@/utils/uuid", () => ({ generateUuid: jest.fn(() => "uuid-mock") }));

const mockCreateProject = jest.fn();
const mockSetProjectCollaborative = jest.fn();
const mockGetProjectById = jest.fn();
jest.mock("@/db/queries/projects", () => ({
  createProject: (...args: unknown[]) => mockCreateProject(...args),
  setProjectCollaborative: (...args: unknown[]) => mockSetProjectCollaborative(...args),
  getProjectById: (...args: unknown[]) => mockGetProjectById(...args),
}));

const mockCreatePoint = jest.fn();
jest.mock("@/db/queries/points", () => ({
  createPoint: (...args: unknown[]) => mockCreatePoint(...args),
}));

const mockGetCustomProtocolById = jest.fn();
const mockGetCustomProtocolByUuid = jest.fn();
const mockSetCustomProtocolUuid = jest.fn();
const mockCreateCustomProtocolFromPackage = jest.fn();
jest.mock("@/db/queries/custom-protocols", () => ({
  getCustomProtocolById: (...args: unknown[]) => mockGetCustomProtocolById(...args),
  getCustomProtocolByUuid: (...args: unknown[]) => mockGetCustomProtocolByUuid(...args),
  setCustomProtocolUuid: (...args: unknown[]) => mockSetCustomProtocolUuid(...args),
  createCustomProtocolFromPackage: (...args: unknown[]) => mockCreateCustomProtocolFromPackage(...args),
}));

// Module-embedded media isn't exercised by these tests (no module data in
// the fixtures below) - stubbed out just so the import resolves without
// pulling in modules/custom/manifest.ts's transitive Paisageo renderer chain.
jest.mock("@/core/project-sharing/module-media", () => ({
  resolveCustomModuleDescriptors: jest.fn().mockResolvedValue([]),
  forEachModuleMediaField: jest.fn(),
}));

const mockGetVegetationClassificationsByProject = jest.fn();
const mockSetActiveVegetationClassification = jest.fn();
jest.mock("@/db/queries/vegetation-classifications", () => ({
  getVegetationClassificationsByProject: (...args: unknown[]) => mockGetVegetationClassificationsByProject(...args),
  setActiveVegetationClassification: (...args: unknown[]) => mockSetActiveVegetationClassification(...args),
}));

// pullReferenceDataFromDrive (species/vegetation catalog restore) is
// exercised on its own in reference-data-sync-service.test.ts - stubbed out
// here so this file stays focused on protocol/point restoration and the
// active-vegetation-classification pointer resolution.
const mockPullReferenceDataFromDrive = jest.fn();
jest.mock("../reference-data-sync-service", () => ({
  pullReferenceDataFromDrive: (...args: unknown[]) => mockPullReferenceDataFromDrive(...args),
}));

import { restoreOwnProjectFromDrive } from "../project-drive-service";
import type { ProtocolRegistry } from "@/protocol-kernel/types";

const registry = { getProtocol: jest.fn(() => undefined) } as unknown as ProtocolRegistry;

const driveFolderId = "drive-folder-1";

function mockManifestFile(manifest: Record<string, unknown>) {
  mockFindChildByName.mockImplementation((parentId: string, name: string) => {
    if (parentId === driveFolderId && name === "manifest.json") {
      return Promise.resolve({ id: "manifest-file-id", name: "manifest.json" });
    }
    return Promise.resolve(null);
  });
  mockReadJsonFile.mockImplementation((fileId: string) => {
    if (fileId === "manifest-file-id") return Promise.resolve(manifest);
    return Promise.resolve(null);
  });
}

describe("restoreOwnProjectFromDrive", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateProject.mockResolvedValue(42);
    mockSetProjectCollaborative.mockResolvedValue(true);
    mockCreatePoint.mockResolvedValue("point-1");
    mockPullReferenceDataFromDrive.mockResolvedValue({ speciesPulled: 0, vegetationClassesPulled: 0 });
    mockGetVegetationClassificationsByProject.mockResolvedValue([]);
  });

  it("creates the local project as 'owner' and imports approved points with drive_synced_at filled", async () => {
    const manifest = {
      project_uuid: "project-uuid-1",
      project_name: "Projeto Teste",
      protocol_id: "paisageo",
      protocol_source: "official",
      drive_ids: { submissions_folder_id: "submissions-1", approved_folder_id: "approved-1" },
    };
    mockManifestFile(manifest);
    mockGetProjectById.mockResolvedValue({
      id: 42,
      name: "Projeto Teste",
      protocol_id: "paisageo",
      protocol_source: "official",
      collaboration_role: "owner",
      drive_folder_id: driveFolderId,
      project_uuid: "project-uuid-1",
    });

    mockListChildren.mockResolvedValue([
      { id: "point-1-file", name: "point-1.json", mimeType: "application/json", modifiedTime: "2026-01-05T00:00:00.000Z" },
    ]);
    mockReadJsonFile.mockImplementation((fileId: string) => {
      if (fileId === "manifest-file-id") return Promise.resolve(manifest);
      if (fileId === "point-1-file") {
        return Promise.resolve({
          id: "point-1",
          lat: -8.05,
          lon: -34.9,
          generatedName: "Ponto 1",
          modules: {},
          photos: [],
          audioNotes: [],
          additionalNotes: [],
          collector_code: "PS01",
        });
      }
      return Promise.resolve(null);
    });

    const result = await restoreOwnProjectFromDrive(driveFolderId, registry);

    expect(mockCreateProject).toHaveBeenCalledWith("Projeto Teste", "paisageo", "", "official");
    expect(mockSetProjectCollaborative).toHaveBeenCalledWith(42, driveFolderId);
    expect(result).toEqual({ projectId: 42, imported: 1 });

    expect(mockCreatePoint).toHaveBeenCalledTimes(1);
    const createPointInput = mockCreatePoint.mock.calls[0][0];
    expect(createPointInput.id).toBe("point-1");
    expect(createPointInput.project_id).toBe(42);
    expect(createPointInput.approval_status).toBe("approved");
    expect(createPointInput.drive_synced_at).toBe("2026-01-05T00:00:00.000Z");
    expect(createPointInput.created_by).toBe("PS01");
  });

  it("resolves a custom protocol via protocol-package.json when not yet present locally", async () => {
    const manifest = {
      project_uuid: "project-uuid-2",
      project_name: "Projeto Fauna",
      protocol_id: "old-device-local-id",
      protocol_source: "custom",
      drive_ids: { submissions_folder_id: "submissions-2", approved_folder_id: "approved-2" },
    };
    const protocolPackage = {
      uuid: "protocol-uuid-1",
      name: "Fauna",
      theme: "fauna",
      schema: { sections: [] },
    };

    mockFindChildByName.mockImplementation((parentId: string, name: string) => {
      if (parentId !== driveFolderId) return Promise.resolve(null);
      if (name === "manifest.json") return Promise.resolve({ id: "manifest-file-id", name: "manifest.json" });
      if (name === "protocol-package.json") return Promise.resolve({ id: "protocol-package-file-id", name: "protocol-package.json" });
      return Promise.resolve(null);
    });
    mockReadJsonFile.mockImplementation((fileId: string) => {
      if (fileId === "manifest-file-id") return Promise.resolve(manifest);
      if (fileId === "protocol-package-file-id") return Promise.resolve(protocolPackage);
      return Promise.resolve(null);
    });
    mockListChildren.mockResolvedValue([]);
    mockGetCustomProtocolByUuid.mockResolvedValue(null); // not found on this "device" yet
    mockCreateCustomProtocolFromPackage.mockResolvedValue(55);
    mockGetProjectById.mockResolvedValue({
      id: 42,
      name: "Projeto Fauna",
      protocol_id: "55",
      protocol_source: "custom",
      collaboration_role: "owner",
      drive_folder_id: driveFolderId,
      project_uuid: "project-uuid-2",
    });

    await restoreOwnProjectFromDrive(driveFolderId, registry);

    expect(mockGetCustomProtocolByUuid).toHaveBeenCalledWith("protocol-uuid-1");
    expect(mockCreateCustomProtocolFromPackage).toHaveBeenCalledWith(protocolPackage);
    expect(mockCreateProject).toHaveBeenCalledWith("Projeto Fauna", "55", "", "custom");
  });

  // Critical finding from RELATORIO_AUDITORIA_COLABORACAO.md: the
  // vegetation_classifications rows already came back via
  // pullReferenceDataFromDrive, but without resolving the manifest's
  // active_vegetation_classification pointer the restored project silently
  // fell back to the standard Nomos tree.
  describe("active_vegetation_classification", () => {
    const manifest = {
      project_uuid: "project-uuid-3",
      project_name: "Projeto Vegetação",
      protocol_id: "paisageo",
      protocol_source: "official",
      drive_ids: { submissions_folder_id: "submissions-3", approved_folder_id: "approved-3" },
      active_vegetation_classification: { type: "custom", custom_classification_uuid: "veg-uuid-1" },
    };

    beforeEach(() => {
      mockManifestFile(manifest);
      mockGetProjectById.mockResolvedValue({
        id: 42,
        name: "Projeto Vegetação",
        protocol_id: "paisageo",
        protocol_source: "official",
        collaboration_role: "owner",
        drive_folder_id: driveFolderId,
        project_uuid: "project-uuid-3",
      });
      mockListChildren.mockResolvedValue([]);
    });

    it("pulls species/vegetation reference data and resolves the active classification to the local row id", async () => {
      mockGetVegetationClassificationsByProject.mockResolvedValue([
        { id: 77, project_id: 42, name: "Minha Classificação", classes: [], created_at: "x", last_updated: "x", uuid: "veg-uuid-1" },
      ]);

      await restoreOwnProjectFromDrive(driveFolderId, registry);

      expect(mockPullReferenceDataFromDrive).toHaveBeenCalledWith(42, driveFolderId);
      expect(mockSetActiveVegetationClassification).toHaveBeenCalledWith(42, 77, "custom");
    });

    it("does not resolve an active classification when the referenced uuid wasn't pulled down", async () => {
      mockGetVegetationClassificationsByProject.mockResolvedValue([]);

      await restoreOwnProjectFromDrive(driveFolderId, registry);

      expect(mockSetActiveVegetationClassification).not.toHaveBeenCalled();
    });

    it("does not fail the restore when pulling reference data from Drive throws", async () => {
      mockPullReferenceDataFromDrive.mockRejectedValue(new Error("network error"));

      const result = await restoreOwnProjectFromDrive(driveFolderId, registry);

      expect(result.projectId).toBe(42);
    });
  });
});
