// restore-service.ts is the phase most likely to reproduce the two worst
// bugs from the previous attempt at this model: losing project_uuid on a
// read-modify-write, and vegetation classification silently falling back
// to 'standard' instead of being resolved. No real-device validation is
// available until October, so this suite is the only line of defense -
// every critical behavior below has its failure/corruption scenario
// simulated explicitly, not just the happy path (section 14.7).

import { FakeFile, FakeDirectory, FakePaths, resetFakeFs } from "../../project-sharing/__tests__/fixtures/fake-environment";
import type { DriveFile } from "../drive-api-client";

jest.mock("expo-file-system", () => ({
  File: FakeFile,
  Directory: FakeDirectory,
  Paths: FakePaths,
}));

// ---- Fake Drive tree: flat lookup maps, built per test via helpers below ----
let childByParentAndName = new Map<string, DriveFile>();
let childrenByParent = new Map<string, DriveFile[]>();
let contentByFileId = new Map<string, unknown>();

function resetDriveTree() {
  childByParentAndName = new Map();
  childrenByParent = new Map();
  contentByFileId = new Map();
}

function addFolder(parentId: string, id: string, name: string): DriveFile {
  const file: DriveFile = { id, name, mimeType: "application/vnd.google-apps.folder" };
  childByParentAndName.set(`${parentId}::${name}`, file);
  const list = childrenByParent.get(parentId) ?? [];
  list.push(file);
  childrenByParent.set(parentId, list);
  return file;
}

function addJsonFile(
  parentId: string,
  id: string,
  name: string,
  content: unknown,
  modifiedTime = "2026-01-01T00:00:00.000Z",
): DriveFile {
  const file: DriveFile = { id, name, mimeType: "application/json", modifiedTime };
  childByParentAndName.set(`${parentId}::${name}`, file);
  const list = childrenByParent.get(parentId) ?? [];
  list.push(file);
  childrenByParent.set(parentId, list);
  contentByFileId.set(id, content);
  return file;
}

const findChildByNameMock = jest.fn(async (parentId: string, name: string) =>
  childByParentAndName.get(`${parentId}::${name}`) ?? null,
);
const listChildrenMock = jest.fn(async (parentId: string) => childrenByParent.get(parentId) ?? []);
const readJsonFileMock = jest.fn(async (fileId: string) => contentByFileId.get(fileId));
const downloadBinaryFileMock = jest.fn(async (fileId: string, destinationUri: string) => undefined);

jest.mock("@/core/drive-sync/drive-api-client", () => ({
  findChildByName: (parentId: string, name: string) => findChildByNameMock(parentId, name),
  listChildren: (parentId: string) => listChildrenMock(parentId),
  readJsonFile: (fileId: string) => readJsonFileMock(fileId),
  downloadBinaryFile: (fileId: string, destinationUri: string) =>
    downloadBinaryFileMock(fileId, destinationUri),
}));

const getManifestMock = jest.fn();
jest.mock("@/core/drive-sync/project-drive-service", () => ({
  getManifest: (driveFolderId: string) => getManifestMock(driveFolderId),
}));

const getCurrentGoogleAccountMock = jest.fn();
jest.mock("@/core/google-auth/google-auth-service", () => ({
  getCurrentGoogleAccount: () => getCurrentGoogleAccountMock(),
}));

jest.mock("@/core/project-sharing/project-config-package", () => ({
  sanitizeSpeciesSource: (value: string) =>
    ["gbif", "manual", "specieslink", "catalog"].includes(value) ? value : "catalog",
  parseImportedCommonNames: (value: unknown) => (Array.isArray(value) ? value : []),
}));

// import-points.ts pulls in expo-document-picker at module scope, which
// jest can't transform - only IMPORTED_MEDIA_DIR is actually needed here.
jest.mock("@/core/project-sharing/import-points", () => ({
  IMPORTED_MEDIA_DIR: "imported_points_media",
}));

// ---- Fake db state ----
interface FakeProjectRow {
  id: number;
  name: string;
  protocol_id: string;
  protocol_source: "official" | "custom";
  project_uuid: string;
  owner_email: string;
  collaboration_role: "owner" | "collaborator" | null;
  drive_folder_id: string | null;
  vegetation_classification_type: "standard" | "custom";
  active_custom_vegetation_classification_id: number | null;
}
interface FakeCustomProtocolRow {
  id: number;
  uuid: string;
}
interface FakeVegClassRow {
  id: number;
  project_id: number;
  uuid: string;
}

let projects: FakeProjectRow[] = [];
let customProtocols: FakeCustomProtocolRow[] = [];
let vegClasses: FakeVegClassRow[] = [];
let nextProjectId = 1;
let nextCustomProtocolId = 1;
let nextVegId = 1;

function resetFakeDb() {
  projects = [];
  customProtocols = [];
  vegClasses = [];
  nextProjectId = 1;
  nextCustomProtocolId = 1;
  nextVegId = 1;
}

const getCustomProtocolByUuidMock = jest.fn(async (uuid: string) =>
  customProtocols.find((p) => p.uuid === uuid) ?? null,
);
const createCustomProtocolWithUuidMock = jest.fn(
  async (name: string, schema: unknown, theme: string, uuid: string) => {
    const row = { id: nextCustomProtocolId++, uuid };
    customProtocols.push(row);
    return row.id;
  },
);
jest.mock("@/db/queries/custom-protocols", () => ({
  getCustomProtocolByUuid: (uuid: string) => getCustomProtocolByUuidMock(uuid),
  createCustomProtocolWithUuid: (name: string, schema: unknown, theme: string, uuid: string) =>
    createCustomProtocolWithUuidMock(name, schema, theme, uuid),
}));

const createProjectMock = jest.fn(
  async (
    name: string,
    protocolId: string,
    description: string,
    protocolSource: "official" | "custom",
    projectUuid: string,
    ownerEmail: string,
  ) => {
    const row: FakeProjectRow = {
      id: nextProjectId++,
      name,
      protocol_id: protocolId,
      protocol_source: protocolSource,
      project_uuid: projectUuid,
      owner_email: ownerEmail,
      collaboration_role: null,
      drive_folder_id: null,
      vegetation_classification_type: "standard",
      active_custom_vegetation_classification_id: null,
    };
    projects.push(row);
    return row.id;
  },
);
const getProjectByUuidMock = jest.fn(async (uuid: string) =>
  projects.find((p) => p.project_uuid === uuid) ?? null,
);
const setProjectAsOwnerMock = jest.fn(
  async (projectId: number, driveFolderId: string, ownerEmail: string) => {
    const row = projects.find((p) => p.id === projectId);
    if (row) {
      row.collaboration_role = "owner";
      row.drive_folder_id = driveFolderId;
      row.owner_email = ownerEmail;
    }
    return true;
  },
);
jest.mock("@/db/queries/projects", () => ({
  createProject: (...args: [string, string, string, "official" | "custom", string, string]) =>
    createProjectMock(...args),
  getProjectByUuid: (uuid: string) => getProjectByUuidMock(uuid),
  setProjectAsOwner: (projectId: number, driveFolderId: string, ownerEmail: string) =>
    setProjectAsOwnerMock(projectId, driveFolderId, ownerEmail),
}));

const createProjectSpeciesMock = jest.fn(async (data: unknown) => 1);
const getProjectSpeciesByUuidMock = jest.fn(async (projectId: number, uuid: string) => null);
jest.mock("@/db/queries/project-species", () => ({
  createProjectSpecies: (data: unknown) => createProjectSpeciesMock(data),
  getProjectSpeciesByUuid: (projectId: number, uuid: string) =>
    getProjectSpeciesByUuidMock(projectId, uuid),
}));

const createVegetationClassificationMock = jest.fn(
  async (projectId: number, name: string, classes: unknown) => {
    const row = { id: nextVegId++, project_id: projectId, uuid: "" };
    vegClasses.push(row);
    return row.id;
  },
);
const getVegetationClassificationByUuidMock = jest.fn(async (projectId: number, uuid: string) => null);
const setActiveVegetationClassificationMock = jest.fn(
  async (projectId: number, classificationId: number | null, type: "standard" | "custom") => true,
);
const setVegetationClassificationUuidMock = jest.fn(async (id: number, uuid: string) => {
  const row = vegClasses.find((v) => v.id === id);
  if (row) row.uuid = uuid;
});
jest.mock("@/db/queries/vegetation-classifications", () => ({
  createVegetationClassification: (projectId: number, name: string, classes: unknown) =>
    createVegetationClassificationMock(projectId, name, classes),
  getVegetationClassificationByUuid: (projectId: number, uuid: string) =>
    getVegetationClassificationByUuidMock(projectId, uuid),
  setActiveVegetationClassification: (
    projectId: number,
    classificationId: number | null,
    type: "standard" | "custom",
  ) => setActiveVegetationClassificationMock(projectId, classificationId, type),
  setVegetationClassificationUuid: (id: number, uuid: string) =>
    setVegetationClassificationUuidMock(id, uuid),
}));

const createPointMock = jest.fn(async (input: unknown) => 1);
jest.mock("@/db/queries/points", () => ({
  createPoint: (input: unknown) => createPointMock(input),
}));

import { restoreOwnProjectFromDrive } from "../restore-service";

const CONNECTED_ACCOUNT = { email: "owner@example.com", name: "Owner" };

function baseManifest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    project_uuid: "project-uuid-1",
    project_name: "Projeto Restaurado",
    protocol_id: "nomos-paisageo-v1",
    protocol_source: "official" as const,
    owner_email: "owner@example.com",
    active_vegetation_classification: { type: "standard" as const },
    ...overrides,
  };
}

function samplePointEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    point_uuid: "point-uuid-1",
    point_number: 1,
    lat: -8.05,
    lon: -34.9,
    created_by: "ABCD",
    schema_version: "1.0",
    modules: { vegetation: '{"field":"value"}' },
    photos: [] as string[],
    audio_notes: [] as Array<{ filename: string; duration: number; timestamp: number }>,
    ...overrides,
  };
}

beforeEach(() => {
  resetFakeFs();
  resetDriveTree();
  resetFakeDb();
  jest.clearAllMocks();
  getCurrentGoogleAccountMock.mockReturnValue(CONNECTED_ACCOUNT);
  findChildByNameMock.mockImplementation(
    async (parentId: string, name: string) => childByParentAndName.get(`${parentId}::${name}`) ?? null,
  );
  listChildrenMock.mockImplementation(async (parentId: string) => childrenByParent.get(parentId) ?? []);
  readJsonFileMock.mockImplementation(async (fileId: string) => contentByFileId.get(fileId));
  downloadBinaryFileMock.mockImplementation(async () => undefined);
});

describe("restoreOwnProjectFromDrive - identity preservation", () => {
  it("preserves the manifest's exact project_uuid on the local project - direct test of the previous attempt's worst bug", async () => {
    getManifestMock.mockResolvedValue(baseManifest({ project_uuid: "very-specific-uuid-42" }));

    const result = await restoreOwnProjectFromDrive("folder-1", { includeMedia: false });

    const created = projects.find((p) => p.id === result.projectId)!;
    expect(created.project_uuid).toBe("very-specific-uuid-42");
  });
});

describe("restoreOwnProjectFromDrive - manifest validation", () => {
  it("fails with a clear error and creates nothing when project_uuid is missing", async () => {
    getManifestMock.mockResolvedValue(baseManifest({ project_uuid: "" }));

    await expect(restoreOwnProjectFromDrive("folder-1", { includeMedia: false })).rejects.toThrow();
    expect(createProjectMock).not.toHaveBeenCalled();
  });

  it("fails with a clear error and creates nothing when owner_email is missing", async () => {
    getManifestMock.mockResolvedValue(baseManifest({ owner_email: "" }));

    await expect(restoreOwnProjectFromDrive("folder-1", { includeMedia: false })).rejects.toThrow();
    expect(createProjectMock).not.toHaveBeenCalled();
  });
});

describe("restoreOwnProjectFromDrive - duplicate refusal", () => {
  it("refuses to restore a project_uuid that already exists locally, without duplicating", async () => {
    projects.push({
      id: 1,
      name: "Já existe",
      protocol_id: "nomos-paisageo-v1",
      protocol_source: "official",
      project_uuid: "already-here",
      owner_email: "owner@example.com",
      collaboration_role: "owner",
      drive_folder_id: "some-folder",
      vegetation_classification_type: "standard",
      active_custom_vegetation_classification_id: null,
    });
    nextProjectId = 2;
    getManifestMock.mockResolvedValue(baseManifest({ project_uuid: "already-here" }));

    await expect(restoreOwnProjectFromDrive("folder-1", { includeMedia: false })).rejects.toThrow();
    expect(createProjectMock).not.toHaveBeenCalled();
  });
});

describe("restoreOwnProjectFromDrive - custom protocol", () => {
  it("creates the custom protocol locally from protocol-package.json when none exists yet, and the project uses it", async () => {
    getManifestMock.mockResolvedValue(
      baseManifest({ protocol_source: "custom", protocol_id: "placeholder" }),
    );
    addJsonFile("folder-1", "protocol-file-id", "protocol-package.json", {
      uuid: "protocol-uuid-1",
      name: "Fauna Survey",
      theme: "fauna",
      schema: { sections: [] },
    });

    const result = await restoreOwnProjectFromDrive("folder-1", { includeMedia: false });

    expect(createCustomProtocolWithUuidMock).toHaveBeenCalledWith(
      "Fauna Survey",
      { sections: [] },
      "fauna",
      "protocol-uuid-1",
    );
    const created = projects.find((p) => p.id === result.projectId)!;
    expect(created.protocol_id).toBe(String(customProtocols[0].id));
  });

  it("fails with a clear error when protocol-package.json is missing for a custom-protocol project", async () => {
    getManifestMock.mockResolvedValue(baseManifest({ protocol_source: "custom" }));
    // No protocol-package.json registered in the fake Drive tree.

    await expect(restoreOwnProjectFromDrive("folder-1", { includeMedia: false })).rejects.toThrow();
    expect(createProjectMock).not.toHaveBeenCalled();
  });
});

describe("restoreOwnProjectFromDrive - active vegetation classification resolution", () => {
  it("resolves a 'custom' active classification to the correct LOCAL id, not silently 'standard' - direct test of the previous attempt's second worst bug", async () => {
    getManifestMock.mockResolvedValue(
      baseManifest({
        active_vegetation_classification: { type: "custom", custom_classification_uuid: "veg-uuid-1" },
      }),
    );
    addFolder("folder-1", "veg-folder-id", "vegetation-classes");
    addJsonFile("veg-folder-id", "veg-file-id", "veg-uuid-1.json", {
      uuid: "veg-uuid-1",
      name: "Minha Classificação",
      classes: [{ id: "class_1", name: "Cerrado" }],
    });

    await restoreOwnProjectFromDrive("folder-1", { includeMedia: false });

    expect(setActiveVegetationClassificationMock).toHaveBeenCalledWith(
      expect.any(Number),
      vegClasses[0].id,
      "custom",
    );
    // Never silently falls back to standard for a 'custom' manifest.
    expect(setActiveVegetationClassificationMock).not.toHaveBeenCalledWith(
      expect.any(Number),
      null,
      "standard",
    );
  });

  it("sets 'standard' when the manifest says so", async () => {
    getManifestMock.mockResolvedValue(baseManifest({ active_vegetation_classification: { type: "standard" } }));

    await restoreOwnProjectFromDrive("folder-1", { includeMedia: false });

    expect(setActiveVegetationClassificationMock).toHaveBeenCalledWith(expect.any(Number), null, "standard");
  });
});

describe("restoreOwnProjectFromDrive - points and media", () => {
  it("a failed photo download among several does not abort the restore - the point is still created, and later points still process", async () => {
    getManifestMock.mockResolvedValue(baseManifest());
    addFolder("folder-1", "approved-id", "approved");
    addJsonFile(
      "approved-id",
      "point1-file-id",
      "point-uuid-1.json",
      samplePointEntry({ point_uuid: "point-uuid-1", photos: ["photo_1.jpg", "photo_2.jpg"] }),
    );
    addJsonFile("approved-id", "point2-file-id", "point-uuid-2.json", samplePointEntry({ point_uuid: "point-uuid-2" }));
    addFolder("approved-id", "media-root-id", "media");
    addFolder("media-root-id", "point1-media-id", "point-uuid-1");
    childrenByParent.set("point1-media-id", [
      { id: "drive-photo-1", name: "photo_1.jpg", mimeType: "image/jpeg" },
      { id: "drive-photo-2", name: "photo_2.jpg", mimeType: "image/jpeg" },
    ]);
    downloadBinaryFileMock.mockImplementation(async (fileId: string) => {
      if (fileId === "drive-photo-1") throw new Error("network error");
    });

    const result = await restoreOwnProjectFromDrive("folder-1", { includeMedia: true });

    expect(result.imported).toBe(2); // both points still created
    expect(result.mediaFailed).toBe(1);
    expect(result.mediaDownloaded).toBe(1);
    expect(createPointMock).toHaveBeenCalledTimes(2);
  });

  it("includeMedia: false never calls downloadBinaryFile, even when points have photos/audio", async () => {
    getManifestMock.mockResolvedValue(baseManifest());
    addFolder("folder-1", "approved-id", "approved");
    addJsonFile(
      "approved-id",
      "point1-file-id",
      "point-uuid-1.json",
      samplePointEntry({
        photos: ["photo_1.jpg"],
        audio_notes: [{ filename: "audio_note_1.m4a", duration: 5, timestamp: 1 }],
      }),
    );

    const result = await restoreOwnProjectFromDrive("folder-1", { includeMedia: false });

    expect(downloadBinaryFileMock).not.toHaveBeenCalled();
    expect(result.imported).toBe(1);
    expect(result.mediaDownloaded).toBe(0);
  });
});

describe("restoreOwnProjectFromDrive - owner_email non-blocking warning", () => {
  it("completes the restore normally but flags ownerEmailWarning when the manifest's owner_email differs from the connected account", async () => {
    getCurrentGoogleAccountMock.mockReturnValue({ email: "someone-else@example.com", name: "Someone" });
    getManifestMock.mockResolvedValue(baseManifest({ owner_email: "owner@example.com" }));

    const result = await restoreOwnProjectFromDrive("folder-1", { includeMedia: false });

    expect(result.ownerEmailWarning).toBe(true);
    expect(result.projectId).toBeTruthy(); // never blocked
  });

  it("does not warn when the connected account matches the manifest's owner_email", async () => {
    getManifestMock.mockResolvedValue(baseManifest({ owner_email: "owner@example.com" }));

    const result = await restoreOwnProjectFromDrive("folder-1", { includeMedia: false });

    expect(result.ownerEmailWarning).toBe(false);
  });
});
