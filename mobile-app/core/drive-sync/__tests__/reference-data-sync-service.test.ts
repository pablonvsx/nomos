jest.mock("@/utils/uuid", () => ({ generateUuid: jest.fn() }));
jest.mock("@/db/queries/projects", () => ({ getProjectById: jest.fn() }));
jest.mock("@/core/google-auth/google-auth-service", () => ({ getCurrentGoogleAccount: jest.fn() }));
jest.mock("../drive-api-client", () => ({
  listChildren: jest.fn(),
  uploadJsonFile: jest.fn(),
  readJsonFile: jest.fn(),
}));
jest.mock("../project-drive-service", () => ({
  ensureFolder: jest.fn(),
  getManifest: jest.fn(),
  updateManifest: jest.fn(),
}));
jest.mock("@/db/queries/vegetation-classifications", () => ({
  getVegetationClassificationsByProject: jest.fn(),
  createVegetationClassification: jest.fn(),
  setVegetationClassificationUuid: jest.fn(),
  setVegetationClassificationDriveSyncedAt: jest.fn(),
  getActiveVegetationClassificationConfig: jest.fn(),
  getVegetationClassificationById: jest.fn(),
}));
jest.mock("@/db/queries/project-species", () => ({
  getProjectSpeciesCatalogByProject: jest.fn(),
  createProjectSpecies: jest.fn(),
  setProjectSpeciesUuid: jest.fn(),
  setProjectSpeciesDriveSyncedAt: jest.fn(),
  getProjectSpeciesIdByGbifId: jest.fn(),
}));

import {
  insertSpeciesFromRemote,
  pushSpeciesEntryIfCollaborative,
  pushVegetationClassificationIfCollaborative,
  pushAllReferenceDataToDrive,
} from "../reference-data-sync-service";
import { getManifest, updateManifest } from "../project-drive-service";
import { uploadJsonFile } from "../drive-api-client";
import { getProjectById } from "@/db/queries/projects";
import { getCurrentGoogleAccount } from "@/core/google-auth/google-auth-service";
import {
  createProjectSpecies,
  setProjectSpeciesUuid,
  setProjectSpeciesDriveSyncedAt,
  getProjectSpeciesIdByGbifId,
  getProjectSpeciesCatalogByProject,
} from "@/db/queries/project-species";
import {
  getVegetationClassificationsByProject,
  setVegetationClassificationDriveSyncedAt,
  getActiveVegetationClassificationConfig,
  getVegetationClassificationById,
} from "@/db/queries/vegetation-classifications";
import type { ProjectSpeciesCatalog, VegetationClassification } from "@/types/database";

const mockCreateProjectSpecies = createProjectSpecies as jest.Mock;
const mockSetProjectSpeciesUuid = setProjectSpeciesUuid as jest.Mock;
const mockSetProjectSpeciesDriveSyncedAt = setProjectSpeciesDriveSyncedAt as jest.Mock;
const mockGetProjectSpeciesIdByGbifId = getProjectSpeciesIdByGbifId as jest.Mock;
const mockGetProjectSpeciesCatalogByProject = getProjectSpeciesCatalogByProject as jest.Mock;
const mockGetVegetationClassificationsByProject = getVegetationClassificationsByProject as jest.Mock;
const mockSetVegetationClassificationDriveSyncedAt = setVegetationClassificationDriveSyncedAt as jest.Mock;
const mockGetActiveVegetationClassificationConfig = getActiveVegetationClassificationConfig as jest.Mock;
const mockGetVegetationClassificationById = getVegetationClassificationById as jest.Mock;
const mockGetProjectById = getProjectById as jest.Mock;
const mockGetCurrentGoogleAccount = getCurrentGoogleAccount as jest.Mock;
const mockUploadJsonFile = uploadJsonFile as jest.Mock;
const mockGetManifest = getManifest as jest.Mock;
const mockUpdateManifest = updateManifest as jest.Mock;

describe("insertSpeciesFromRemote — gbif_id conflict reconciliation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("adopts the incoming uuid onto the existing local row when createProjectSpecies conflicts on gbif_id", async () => {
    // createProjectSpecies returns null on a UNIQUE(project_id, gbif_id)
    // violation - this simulates a species independently added on another
    // device before the first sync (same gbif_id, different uuid).
    mockCreateProjectSpecies.mockResolvedValue(null);
    mockGetProjectSpeciesIdByGbifId.mockResolvedValue(42);

    await insertSpeciesFromRemote(
      1,
      {
        scientific_name: "Handroanthus impetiginosus",
        gbif_id: "12345",
        source: "gbif",
        common_names: [],
      },
      "remote-uuid-999",
    );

    expect(mockGetProjectSpeciesIdByGbifId).toHaveBeenCalledWith(1, "12345");
    expect(mockSetProjectSpeciesUuid).toHaveBeenCalledWith(42, "remote-uuid-999");
  });

  it("does nothing extra when createProjectSpecies succeeds (no conflict)", async () => {
    mockCreateProjectSpecies.mockResolvedValue(7);

    await insertSpeciesFromRemote(
      1,
      { scientific_name: "Some species", gbif_id: "1", source: "gbif", common_names: [] },
      "uuid-1",
    );

    expect(mockGetProjectSpeciesIdByGbifId).not.toHaveBeenCalled();
    expect(mockSetProjectSpeciesUuid).not.toHaveBeenCalled();
  });

  it("does not try to reconcile when the payload has no gbif_id", async () => {
    mockCreateProjectSpecies.mockResolvedValue(null);

    await insertSpeciesFromRemote(
      1,
      { scientific_name: "Manual entry", source: "manual", common_names: [] },
      "uuid-2",
    );

    expect(mockGetProjectSpeciesIdByGbifId).not.toHaveBeenCalled();
    expect(mockSetProjectSpeciesUuid).not.toHaveBeenCalled();
  });
});

const collaborativeProject = { collaboration_role: "owner", drive_folder_id: "drive-folder-1" };

const speciesEntry: ProjectSpeciesCatalog = {
  id: 10,
  project_id: 1,
  scientific_name: "Handroanthus impetiginosus",
  source: "manual",
  created_at: "2026-01-01",
  last_updated: "2026-01-01",
  uuid: "species-uuid-1",
  drive_synced_at: null,
};

const vegetationRow: VegetationClassification = {
  id: 20,
  project_id: 1,
  name: "Minha Classificação",
  classes: [],
  created_at: "2026-01-01",
  last_updated: "2026-01-01",
  uuid: "veg-uuid-1",
  drive_synced_at: null,
};

describe("pushSpeciesEntryIfCollaborative", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uploads the entry and records drive_synced_at on success", async () => {
    mockGetProjectById.mockResolvedValue(collaborativeProject);
    mockGetCurrentGoogleAccount.mockReturnValue({ email: "owner@example.com" });

    const result = await pushSpeciesEntryIfCollaborative(1, speciesEntry);

    expect(result).toBe(true);
    expect(mockUploadJsonFile).toHaveBeenCalledWith(
      "species-uuid-1.json",
      undefined,
      expect.objectContaining({ scientific_name: "Handroanthus impetiginosus" }),
    );
    expect(mockSetProjectSpeciesDriveSyncedAt).toHaveBeenCalledWith(10, expect.any(String));
  });

  it("returns false without uploading when the entry has no uuid yet", async () => {
    const result = await pushSpeciesEntryIfCollaborative(1, { ...speciesEntry, uuid: null });

    expect(result).toBe(false);
    expect(mockUploadJsonFile).not.toHaveBeenCalled();
    expect(mockSetProjectSpeciesDriveSyncedAt).not.toHaveBeenCalled();
  });

  it("returns false without uploading when the project isn't a collaborative owner", async () => {
    mockGetProjectById.mockResolvedValue({ collaboration_role: null, drive_folder_id: null });

    const result = await pushSpeciesEntryIfCollaborative(1, speciesEntry);

    expect(result).toBe(false);
    expect(mockUploadJsonFile).not.toHaveBeenCalled();
  });

  it("returns false and logs when the upload throws", async () => {
    mockGetProjectById.mockResolvedValue(collaborativeProject);
    mockGetCurrentGoogleAccount.mockReturnValue({ email: "owner@example.com" });
    mockUploadJsonFile.mockRejectedValueOnce(new Error("network down"));
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await pushSpeciesEntryIfCollaborative(1, speciesEntry);

    expect(result).toBe(false);
    expect(mockSetProjectSpeciesDriveSyncedAt).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("pushVegetationClassificationIfCollaborative", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uploads the row and records drive_synced_at on success", async () => {
    mockGetProjectById.mockResolvedValue(collaborativeProject);
    mockGetCurrentGoogleAccount.mockReturnValue({ email: "owner@example.com" });

    const result = await pushVegetationClassificationIfCollaborative(1, vegetationRow);

    expect(result).toBe(true);
    expect(mockSetVegetationClassificationDriveSyncedAt).toHaveBeenCalledWith(20, expect.any(String));
  });

  it("returns false when there's no Google account connected", async () => {
    mockGetProjectById.mockResolvedValue(collaborativeProject);
    mockGetCurrentGoogleAccount.mockReturnValue(null);

    const result = await pushVegetationClassificationIfCollaborative(1, vegetationRow);

    expect(result).toBe(false);
    expect(mockUploadJsonFile).not.toHaveBeenCalled();
  });
});

describe("pushAllReferenceDataToDrive", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProjectById.mockResolvedValue(collaborativeProject);
    mockGetCurrentGoogleAccount.mockReturnValue({ email: "owner@example.com" });
    mockGetManifest.mockResolvedValue({
      project_uuid: "folder-uuid",
      project_name: "Projeto",
      protocol_id: "paisageo",
      protocol_source: "official",
    });
    mockGetActiveVegetationClassificationConfig.mockResolvedValue({ type: "standard", classificationId: null });
  });

  it("pushes every existing species and vegetation classification, and writes the active pointer", async () => {
    mockGetProjectSpeciesCatalogByProject.mockResolvedValue([speciesEntry, { ...speciesEntry, id: 11, uuid: "species-uuid-2" }]);
    mockGetVegetationClassificationsByProject.mockResolvedValue([vegetationRow]);
    mockGetActiveVegetationClassificationConfig.mockResolvedValue({ type: "custom", classificationId: 20 });
    mockGetVegetationClassificationById.mockResolvedValue(vegetationRow);

    await pushAllReferenceDataToDrive(1, "drive-folder-1");

    expect(mockUploadJsonFile).toHaveBeenCalledTimes(3); // 2 species + 1 vegetation classification
    expect(mockSetProjectSpeciesDriveSyncedAt).toHaveBeenCalledTimes(2);
    expect(mockSetVegetationClassificationDriveSyncedAt).toHaveBeenCalledTimes(1);
    expect(mockUpdateManifest).toHaveBeenCalledWith(
      "drive-folder-1",
      expect.objectContaining({
        active_vegetation_classification: { type: "custom", custom_classification_uuid: "veg-uuid-1" },
      }),
    );
  });

  it("does not rewrite the manifest when the active pointer already matches", async () => {
    mockGetProjectSpeciesCatalogByProject.mockResolvedValue([]);
    mockGetVegetationClassificationsByProject.mockResolvedValue([]);
    mockGetManifest.mockResolvedValue({
      project_uuid: "folder-uuid",
      project_name: "Projeto",
      protocol_id: "paisageo",
      protocol_source: "official",
      active_vegetation_classification: { type: "standard" },
    });

    await pushAllReferenceDataToDrive(1, "drive-folder-1");

    expect(mockUpdateManifest).not.toHaveBeenCalled();
  });

  it("does not throw when the manifest read/update fails", async () => {
    mockGetProjectSpeciesCatalogByProject.mockResolvedValue([]);
    mockGetVegetationClassificationsByProject.mockResolvedValue([]);
    mockGetManifest.mockRejectedValue(new Error("manifest.json not found"));
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(pushAllReferenceDataToDrive(1, "drive-folder-1")).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
