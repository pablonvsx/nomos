// submitPointToProject is this model's single Drive-write primitive, reused
// by both the single-point and bulk "Fazer backup" actions (section 8). It's
// also the only place that keeps the manifest's active_vegetation_classification
// field fresh, which restoreOwnProjectFromDrive (project-drive-service.ts)
// later reads to resolve the pointer back on another device - see
// RELATORIO_AUDITORIA_COLABORACAO.md, Crítico 1.
const mockGetPoint = jest.fn();
const mockUpdatePoint = jest.fn();
jest.mock("@/db/queries/points", () => ({
  getPoint: (...args: unknown[]) => mockGetPoint(...args),
  updatePoint: (...args: unknown[]) => mockUpdatePoint(...args),
}));

const mockGetProjectById = jest.fn();
jest.mock("@/db/queries/projects", () => ({
  getProjectById: (...args: unknown[]) => mockGetProjectById(...args),
}));

const mockGetActiveVegetationClassificationConfig = jest.fn();
const mockGetVegetationClassificationById = jest.fn();
jest.mock("@/db/queries/vegetation-classifications", () => ({
  getActiveVegetationClassificationConfig: (...args: unknown[]) => mockGetActiveVegetationClassificationConfig(...args),
  getVegetationClassificationById: (...args: unknown[]) => mockGetVegetationClassificationById(...args),
}));

const mockBuildPointWithModules = jest.fn();
const mockBuildPointEnvelope = jest.fn();
jest.mock("@/db/mappers/point.mapper", () => ({
  buildPointWithModules: (...args: unknown[]) => mockBuildPointWithModules(...args),
  buildPointEnvelope: (...args: unknown[]) => mockBuildPointEnvelope(...args),
}));

const mockGetCurrentGoogleAccount = jest.fn();
jest.mock("@/core/google-auth/google-auth-service", () => ({
  getCurrentGoogleAccount: () => mockGetCurrentGoogleAccount(),
}));

const mockGetManifest = jest.fn();
const mockUpdateManifest = jest.fn();
const mockEnsureFolder = jest.fn();
const mockResolveProjectDriveIds = jest.fn();
jest.mock("../project-drive-service", () => ({
  getManifest: (...args: unknown[]) => mockGetManifest(...args),
  updateManifest: (...args: unknown[]) => mockUpdateManifest(...args),
  ensureFolder: (...args: unknown[]) => mockEnsureFolder(...args),
  resolveProjectDriveIds: (...args: unknown[]) => mockResolveProjectDriveIds(...args),
}));

const mockUploadJsonFile = jest.fn();
const mockUpdateJsonFile = jest.fn();
const mockFindChildByName = jest.fn();
const mockUploadBinaryFile = jest.fn();
jest.mock("../drive-api-client", () => ({
  uploadJsonFile: (...args: unknown[]) => mockUploadJsonFile(...args),
  updateJsonFile: (...args: unknown[]) => mockUpdateJsonFile(...args),
  findChildByName: (...args: unknown[]) => mockFindChildByName(...args),
  uploadBinaryFile: (...args: unknown[]) => mockUploadBinaryFile(...args),
}));

jest.mock("@/core/project-sharing/module-media", () => ({
  resolveCustomModuleDescriptors: jest.fn().mockResolvedValue([]),
  forEachModuleMediaField: jest.fn(),
}));

import { submitPointToProject } from "../point-submission-service";

const driveFolderId = "drive-folder-1";

describe("submitPointToProject - manifest active_vegetation_classification sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProjectById.mockResolvedValue({
      id: 1,
      collaboration_role: "owner",
      drive_folder_id: driveFolderId,
    });
    mockGetPoint.mockResolvedValue({
      point: { id: "point-1", created_by: "PS01", approval_status: "pending" },
      modules: [],
    });
    mockBuildPointWithModules.mockReturnValue({});
    mockBuildPointEnvelope.mockReturnValue({ id: "point-1", photos: [], audioNotes: [], modules: {} });
    mockResolveProjectDriveIds.mockResolvedValue({ approved_folder_id: "approved-1" });
    mockGetCurrentGoogleAccount.mockReturnValue({ email: "owner@example.com" });
    mockFindChildByName.mockResolvedValue(null);
    mockUploadJsonFile.mockResolvedValue({ modifiedTime: "2026-01-05T00:00:00.000Z" });
    mockUpdatePoint.mockResolvedValue(true);
  });

  it("refreshes the manifest when the active classification differs from what's stored", async () => {
    mockGetManifest.mockResolvedValue({
      project_uuid: "p1",
      project_name: "Projeto",
      protocol_id: "paisageo",
      protocol_source: "official",
      active_vegetation_classification: { type: "standard" },
    });
    mockGetActiveVegetationClassificationConfig.mockResolvedValue({ type: "custom", classificationId: 10 });
    mockGetVegetationClassificationById.mockResolvedValue({ id: 10, uuid: "veg-uuid-1" });

    await submitPointToProject("point-1", 1, {} as any);

    expect(mockUpdateManifest).toHaveBeenCalledWith(
      driveFolderId,
      expect.objectContaining({
        active_vegetation_classification: { type: "custom", custom_classification_uuid: "veg-uuid-1" },
      }),
    );
  });

  it("does not rewrite the manifest when the active classification already matches", async () => {
    mockGetManifest.mockResolvedValue({
      project_uuid: "p1",
      project_name: "Projeto",
      protocol_id: "paisageo",
      protocol_source: "official",
      active_vegetation_classification: { type: "custom", custom_classification_uuid: "veg-uuid-1" },
    });
    mockGetActiveVegetationClassificationConfig.mockResolvedValue({ type: "custom", classificationId: 10 });
    mockGetVegetationClassificationById.mockResolvedValue({ id: 10, uuid: "veg-uuid-1" });

    await submitPointToProject("point-1", 1, {} as any);

    expect(mockUpdateManifest).not.toHaveBeenCalled();
  });

  it("resolves to 'standard' when the project has no active custom classification", async () => {
    mockGetManifest.mockResolvedValue({
      project_uuid: "p1",
      project_name: "Projeto",
      protocol_id: "paisageo",
      protocol_source: "official",
      active_vegetation_classification: { type: "custom", custom_classification_uuid: "veg-uuid-1" },
    });
    mockGetActiveVegetationClassificationConfig.mockResolvedValue({ type: "standard", classificationId: null });

    await submitPointToProject("point-1", 1, {} as any);

    expect(mockUpdateManifest).toHaveBeenCalledWith(
      driveFolderId,
      expect.objectContaining({ active_vegetation_classification: { type: "standard" } }),
    );
  });
});
