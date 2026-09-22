// catalog-sync-service.ts closes the gap found by the collaboration model
// audit (RELATORIO_AUDITORIA_COLABORACAO.md, IMPORTANTE 3): species and
// vegetation classifications added after Drive backup is activated never
// used to reach Drive at all. Every function here is best-effort - it must
// never throw, since it runs alongside a local write that already
// succeeded and must not be undone or blocked by a Drive failure.

interface FakeDriveFile {
  id: string;
  name: string;
  mimeType: string;
}

let childByParentAndName = new Map<string, FakeDriveFile>();
let childrenByParent = new Map<string, FakeDriveFile[]>();

function resetDriveTree() {
  childByParentAndName = new Map();
  childrenByParent = new Map();
}

function addFolder(parentId: string, id: string, name: string): FakeDriveFile {
  const file: FakeDriveFile = { id, name, mimeType: "application/vnd.google-apps.folder" };
  childByParentAndName.set(`${parentId}::${name}`, file);
  const list = childrenByParent.get(parentId) ?? [];
  list.push(file);
  childrenByParent.set(parentId, list);
  return file;
}

function addExistingFile(parentId: string, id: string, name: string) {
  const file: FakeDriveFile = { id, name, mimeType: "application/json" };
  childByParentAndName.set(`${parentId}::${name}`, file);
  const list = childrenByParent.get(parentId) ?? [];
  list.push(file);
  childrenByParent.set(parentId, list);
}

const findChildByNameMock = jest.fn(async (parentId: string, name: string) =>
  childByParentAndName.get(`${parentId}::${name}`) ?? null,
);
const listChildrenMock = jest.fn(async (parentId: string) => childrenByParent.get(parentId) ?? []);
const uploadJsonFileMock = jest.fn(async (name: string, parentId: string, content: unknown) => ({
  id: `file-${name}`,
  name,
  mimeType: "application/json",
}));

jest.mock("@/core/drive-sync/drive-api-client", () => ({
  findChildByName: (parentId: string, name: string) => findChildByNameMock(parentId, name),
  listChildren: (parentId: string) => listChildrenMock(parentId),
  uploadJsonFile: (name: string, parentId: string, content: unknown) =>
    uploadJsonFileMock(name, parentId, content),
}));

const updateManifestMock = jest.fn(async (driveFolderId: string, updater: (current: any) => any) => {
  updater(SAMPLE_CURRENT_MANIFEST);
});

jest.mock("@/core/drive-sync/project-drive-service", () => ({
  updateManifest: (driveFolderId: string, updater: (current: any) => any) =>
    updateManifestMock(driveFolderId, updater),
}));

const getAllProjectSpeciesCatalogEnsuringUuidsMock = jest.fn(async (projectId: number) => [] as any[]);
jest.mock("@/db/queries/project-species", () => ({
  getAllProjectSpeciesCatalogEnsuringUuids: (projectId: number) =>
    getAllProjectSpeciesCatalogEnsuringUuidsMock(projectId),
}));

const getAllVegetationClassificationsEnsuringUuidsMock = jest.fn(async (projectId: number) => [] as any[]);
const getVegetationClassificationByUuidMock = jest.fn(async (projectId: number, uuid: string) => null as any);
jest.mock("@/db/queries/vegetation-classifications", () => ({
  getAllVegetationClassificationsEnsuringUuids: (projectId: number) =>
    getAllVegetationClassificationsEnsuringUuidsMock(projectId),
  getVegetationClassificationByUuid: (projectId: number, uuid: string) =>
    getVegetationClassificationByUuidMock(projectId, uuid),
}));

import {
  syncSpeciesCatalogToDrive,
  syncVegetationClassesToDrive,
  syncActiveVegetationClassificationToDrive,
} from "../catalog-sync-service";
import type { Project } from "@/types/database";

const SAMPLE_CURRENT_MANIFEST = {
  format_version: 1,
  project_uuid: "project-uuid-1",
  project_name: "Projeto",
  protocol_id: "nomos-paisageo-v1",
  protocol_source: "official" as const,
  owner_email: "owner@example.com",
  active_vegetation_classification: { type: "standard" as const },
};

function ownerProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 1,
    name: "Projeto",
    protocol_id: "nomos-paisageo-v1",
    protocol_source: "official",
    created_at: "2026-01-01T00:00:00.000Z",
    last_updated: "2026-01-01T00:00:00.000Z",
    is_classified: 0,
    project_uuid: "project-uuid-1",
    owner_email: "owner@example.com",
    collaboration_role: "owner",
    drive_folder_id: "drive-folder-1",
    ...overrides,
  };
}

beforeEach(() => {
  resetDriveTree();
  jest.clearAllMocks();
  findChildByNameMock.mockImplementation(
    async (parentId: string, name: string) => childByParentAndName.get(`${parentId}::${name}`) ?? null,
  );
  listChildrenMock.mockImplementation(async (parentId: string) => childrenByParent.get(parentId) ?? []);
  uploadJsonFileMock.mockImplementation(async (name: string, parentId: string) => ({
    id: `file-${name}`,
    name,
    mimeType: "application/json",
  }));
  getAllProjectSpeciesCatalogEnsuringUuidsMock.mockResolvedValue([]);
  getAllVegetationClassificationsEnsuringUuidsMock.mockResolvedValue([]);
  getVegetationClassificationByUuidMock.mockResolvedValue(null);
});

describe("syncSpeciesCatalogToDrive", () => {
  it("does nothing for a non-owner project", async () => {
    await syncSpeciesCatalogToDrive(ownerProject({ collaboration_role: null, drive_folder_id: null }));

    expect(findChildByNameMock).not.toHaveBeenCalled();
    expect(uploadJsonFileMock).not.toHaveBeenCalled();
  });

  it("does nothing for an owner project without drive_folder_id set", async () => {
    await syncSpeciesCatalogToDrive(ownerProject({ drive_folder_id: null }));

    expect(uploadJsonFileMock).not.toHaveBeenCalled();
  });

  it("uploads a local species whose uuid isn't in the Drive folder yet", async () => {
    const project = ownerProject();
    addFolder(project.drive_folder_id!, "species-folder-id", "species-catalog");
    getAllProjectSpeciesCatalogEnsuringUuidsMock.mockResolvedValue([
      { uuid: "species-uuid-1", scientific_name: "Panthera onca", source: "manual", common_names: [] },
    ]);

    await syncSpeciesCatalogToDrive(project);

    expect(uploadJsonFileMock).toHaveBeenCalledWith(
      "species-uuid-1.json",
      "species-folder-id",
      expect.objectContaining({ uuid: "species-uuid-1", scientific_name: "Panthera onca" }),
    );
  });

  it("is idempotent - a species already present in the Drive folder is never re-uploaded", async () => {
    const project = ownerProject();
    addFolder(project.drive_folder_id!, "species-folder-id", "species-catalog");
    addExistingFile("species-folder-id", "existing-file-id", "species-uuid-1.json");
    getAllProjectSpeciesCatalogEnsuringUuidsMock.mockResolvedValue([
      { uuid: "species-uuid-1", scientific_name: "Panthera onca", source: "manual", common_names: [] },
    ]);

    await syncSpeciesCatalogToDrive(project);

    expect(uploadJsonFileMock).not.toHaveBeenCalled();
  });

  it("never throws when the Drive call fails - best-effort only", async () => {
    const project = ownerProject();
    findChildByNameMock.mockRejectedValue(new Error("network error"));

    await expect(syncSpeciesCatalogToDrive(project)).resolves.toBeUndefined();
  });
});

describe("syncVegetationClassesToDrive", () => {
  it("does nothing for a non-owner project", async () => {
    await syncVegetationClassesToDrive(ownerProject({ collaboration_role: "collaborator" }));

    expect(uploadJsonFileMock).not.toHaveBeenCalled();
  });

  it("uploads a local classification whose uuid isn't in the Drive folder yet", async () => {
    const project = ownerProject();
    addFolder(project.drive_folder_id!, "veg-folder-id", "vegetation-classes");
    getAllVegetationClassificationsEnsuringUuidsMock.mockResolvedValue([
      {
        uuid: "veg-uuid-1",
        name: "Minha Classificação",
        classes: [{ id: "class_1", name: "Cerrado" }],
        created_at: "2026-01-01T00:00:00.000Z",
        last_updated: "2026-01-01T00:00:00.000Z",
      },
    ]);

    await syncVegetationClassesToDrive(project);

    expect(uploadJsonFileMock).toHaveBeenCalledWith(
      "veg-uuid-1.json",
      "veg-folder-id",
      expect.objectContaining({ uuid: "veg-uuid-1", name: "Minha Classificação" }),
    );
  });

  it("is idempotent - a classification already present in the Drive folder is never re-uploaded", async () => {
    const project = ownerProject();
    addFolder(project.drive_folder_id!, "veg-folder-id", "vegetation-classes");
    addExistingFile("veg-folder-id", "existing-file-id", "veg-uuid-1.json");
    getAllVegetationClassificationsEnsuringUuidsMock.mockResolvedValue([
      {
        uuid: "veg-uuid-1",
        name: "Minha Classificação",
        classes: [],
        created_at: "2026-01-01T00:00:00.000Z",
        last_updated: "2026-01-01T00:00:00.000Z",
      },
    ]);

    await syncVegetationClassesToDrive(project);

    expect(uploadJsonFileMock).not.toHaveBeenCalled();
  });

  it("never throws when the Drive call fails - best-effort only", async () => {
    const project = ownerProject();
    listChildrenMock.mockRejectedValue(new Error("network error"));
    addFolder(project.drive_folder_id!, "veg-folder-id", "vegetation-classes");
    getAllVegetationClassificationsEnsuringUuidsMock.mockResolvedValue([
      { uuid: "veg-uuid-1", name: "X", classes: [], created_at: "", last_updated: "" },
    ]);

    await expect(syncVegetationClassesToDrive(project)).resolves.toBeUndefined();
  });
});

describe("syncActiveVegetationClassificationToDrive", () => {
  it("does nothing for a non-owner project", async () => {
    await syncActiveVegetationClassificationToDrive(
      ownerProject({ collaboration_role: null, drive_folder_id: null }),
      "standard",
    );

    expect(updateManifestMock).not.toHaveBeenCalled();
  });

  it("calls updateManifest with an updater that only changes active_vegetation_classification, preserving every other field - when the classification's file already exists on Drive", async () => {
    const project = ownerProject();
    addFolder(project.drive_folder_id!, "veg-folder-id", "vegetation-classes");
    addExistingFile("veg-folder-id", "existing-file-id", "veg-uuid-1.json");

    await syncActiveVegetationClassificationToDrive(project, "custom", "veg-uuid-1");

    expect(uploadJsonFileMock).not.toHaveBeenCalled(); // already there, no re-upload
    expect(updateManifestMock).toHaveBeenCalledWith(project.drive_folder_id, expect.any(Function));
    const updater = updateManifestMock.mock.calls[0][1];
    const updated = updater(SAMPLE_CURRENT_MANIFEST);

    expect(updated).toEqual({
      ...SAMPLE_CURRENT_MANIFEST,
      active_vegetation_classification: { type: "custom", custom_classification_uuid: "veg-uuid-1" },
    });
  });

  it("sets type 'standard' when called without a custom uuid", async () => {
    const project = ownerProject();

    await syncActiveVegetationClassificationToDrive(project, "standard");

    const updater = updateManifestMock.mock.calls[0][1];
    const updated = updater(SAMPLE_CURRENT_MANIFEST);

    expect(updated.active_vegetation_classification).toEqual({ type: "standard" });
  });

  it("never throws when updateManifest rejects - best-effort only", async () => {
    const project = ownerProject();
    updateManifestMock.mockRejectedValue(new Error("Recusado: a escrita perderia o project_uuid do manifest."));

    await expect(
      syncActiveVegetationClassificationToDrive(project, "standard"),
    ).resolves.toBeUndefined();
  });

  describe("closing the gap between pushing the classification and pointing the manifest at it (audit finding IMPORTANTE 1)", () => {
    it("uploads the classification's own file first when it's missing on Drive, then updates the manifest", async () => {
      const project = ownerProject();
      addFolder(project.drive_folder_id!, "veg-folder-id", "vegetation-classes");
      // No file for veg-uuid-1 seeded - it's missing on Drive, but the local
      // row is still available to upload on demand.
      getVegetationClassificationByUuidMock.mockResolvedValue({
        id: 1,
        project_id: project.id,
        uuid: "veg-uuid-1",
        name: "Minha Classificação",
        classes: [{ id: "class_1", name: "Cerrado" }],
        created_at: "2026-01-01T00:00:00.000Z",
        last_updated: "2026-01-01T00:00:00.000Z",
      });

      await syncActiveVegetationClassificationToDrive(project, "custom", "veg-uuid-1");

      expect(uploadJsonFileMock).toHaveBeenCalledWith(
        "veg-uuid-1.json",
        "veg-folder-id",
        expect.objectContaining({ uuid: "veg-uuid-1", name: "Minha Classificação" }),
      );
      expect(updateManifestMock).toHaveBeenCalledWith(project.drive_folder_id, expect.any(Function));
    });

    it("RED/GREEN: never updates the manifest when the classification is missing on Drive AND the upload attempt fails", async () => {
      const project = ownerProject();
      addFolder(project.drive_folder_id!, "veg-folder-id", "vegetation-classes");
      getVegetationClassificationByUuidMock.mockResolvedValue({
        id: 1,
        project_id: project.id,
        uuid: "veg-uuid-1",
        name: "Minha Classificação",
        classes: [],
        created_at: "2026-01-01T00:00:00.000Z",
        last_updated: "2026-01-01T00:00:00.000Z",
      });
      uploadJsonFileMock.mockRejectedValue(new Error("network error"));

      await syncActiveVegetationClassificationToDrive(project, "custom", "veg-uuid-1");

      expect(updateManifestMock).not.toHaveBeenCalled();
    });

    it("never updates the manifest when the classification is missing on Drive AND the local row itself can't be found", async () => {
      const project = ownerProject();
      addFolder(project.drive_folder_id!, "veg-folder-id", "vegetation-classes");
      getVegetationClassificationByUuidMock.mockResolvedValue(null);

      await syncActiveVegetationClassificationToDrive(project, "custom", "veg-uuid-1");

      expect(uploadJsonFileMock).not.toHaveBeenCalled();
      expect(updateManifestMock).not.toHaveBeenCalled();
    });

    it("never updates the manifest when the vegetation-classes folder itself isn't found on Drive", async () => {
      const project = ownerProject();
      // No folder seeded at all.

      await syncActiveVegetationClassificationToDrive(project, "custom", "veg-uuid-1");

      expect(updateManifestMock).not.toHaveBeenCalled();
    });
  });
});
