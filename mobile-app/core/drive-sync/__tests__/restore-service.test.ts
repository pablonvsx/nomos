// restore-service.ts is the phase most likely to reproduce the two worst
// bugs from the previous attempt at this model: losing project_uuid on a
// read-modify-write, and vegetation classification silently falling back
// to 'standard' instead of being resolved. No real-device validation is
// available until October, so this suite is the only line of defense -
// every critical behavior below has its failure/corruption scenario
// simulated explicitly, not just the happy path (section 14.7).

import { FakeFile, FakeDirectory, FakePaths, resetFakeFs, fsState } from "../../project-sharing/__tests__/fixtures/fake-environment";
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
// The local custom protocol the restored project uses: one section with a
// photo_input and an audio_notes_input field (media that lives in module data).
const getCustomProtocolByIdMock = jest.fn(async (id: number) =>
  customProtocols.some((p) => p.id === id)
    ? {
        id,
        name: "Fauna Survey",
        theme: "fauna",
        schema: {
          sections: [
            {
              id: "section_1",
              title: "Seção 1",
              fields: [
                { key: "fotos", type: "photo_input", label: "Fotos" },
                { key: "gravacoes", type: "audio_notes_input", label: "Gravações" },
                {
                  key: "grupo",
                  type: "repeatable_group",
                  label: "Grupo",
                  itemFields: [
                    { key: "foto_item", type: "photo_input", label: "Foto do item" },
                    { key: "audio_item", type: "audio_notes_input", label: "Audio do item" },
                  ],
                },
              ],
            },
          ],
        },
      }
    : null,
);
jest.mock("@/db/queries/custom-protocols", () => ({
  getCustomProtocolById: (id: number) => getCustomProtocolByIdMock(id),
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
const deleteProjectMock = jest.fn(async (projectId: number) => {
  projects = projects.filter((p) => p.id !== projectId);
  return true;
});
jest.mock("@/db/queries/projects", () => ({
  deleteProject: (projectId: number) => deleteProjectMock(projectId),
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

import { restoreOwnProjectFromDrive, MediaRestoreError } from "../restore-service";
import { DriveTimeoutError } from "../drive-errors";

const restore = (driveFolderId: string) => restoreOwnProjectFromDrive(driveFolderId);

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

const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";

function samplePointEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    point_uuid: P1,
    point_number: 1,
    created_at: "2026-01-01T00:00:00.000Z",
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
  downloadBinaryFileMock.mockImplementation(async (_fileId: string, destinationUri: string) => {
    fsState.set(destinationUri, { isDir: false, content: "downloaded-bytes" });
  });
});

describe("restoreOwnProjectFromDrive - identity preservation", () => {
  it("preserves the manifest's exact project_uuid on the local project - direct test of the previous attempt's worst bug", async () => {
    getManifestMock.mockResolvedValue(baseManifest({ project_uuid: "very-specific-uuid-42" }));

    const result = await restore("folder-1");

    const created = projects.find((p) => p.id === result.projectId)!;
    expect(created.project_uuid).toBe("very-specific-uuid-42");
  });
});

describe("restoreOwnProjectFromDrive - manifest validation", () => {
  it("fails with a clear error and creates nothing when project_uuid is missing", async () => {
    getManifestMock.mockResolvedValue(baseManifest({ project_uuid: "" }));

    await expect(restore("folder-1")).rejects.toThrow();
    expect(createProjectMock).not.toHaveBeenCalled();
  });

  it("fails with a clear error and creates nothing when owner_email is missing", async () => {
    getManifestMock.mockResolvedValue(baseManifest({ owner_email: "" }));

    await expect(restore("folder-1")).rejects.toThrow();
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

    await expect(restore("folder-1")).rejects.toThrow();
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

    const result = await restore("folder-1");

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

    await expect(restore("folder-1")).rejects.toThrow();
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

    const result = await restore("folder-1");

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
    expect(result.activeClassificationWarning).toBe(false);
  });

  it("sets 'standard' when the manifest says so", async () => {
    getManifestMock.mockResolvedValue(baseManifest({ active_vegetation_classification: { type: "standard" } }));

    const result = await restore("folder-1");

    expect(setActiveVegetationClassificationMock).toHaveBeenCalledWith(expect.any(Number), null, "standard");
    expect(result.activeClassificationWarning).toBe(false);
  });

  it("reports activeClassificationWarning instead of silently resolving to 'standard' when the manifest's custom uuid isn't among the downloaded classifications (audit finding IMPORTANTE 1)", async () => {
    getManifestMock.mockResolvedValue(
      baseManifest({
        active_vegetation_classification: {
          type: "custom",
          custom_classification_uuid: "veg-uuid-missing",
        },
      }),
    );
    // No vegetation-classes folder/file seeded at all - the referenced uuid
    // is nowhere to be found among what was downloaded.

    const result = await restore("folder-1");

    expect(result.activeClassificationWarning).toBe(true);
    expect(setActiveVegetationClassificationMock).not.toHaveBeenCalled();
  });
});

/**
 * Puts approved/point_<label>_<uuid>/point.json on the fake Drive, plus one
 * media file per relative path (nested folders are created as needed).
 */
function addPointFolder(
  uuid: string,
  entry: unknown,
  mediaPaths: string[] = [],
  modifiedTime = "2026-01-01T00:00:00.000Z",
  folderName = `point_ABCD-1_${uuid}`,
) {
  if (!childByParentAndName.has("folder-1::approved")) addFolder("folder-1", "approved-id", "approved");
  const folderId = `${folderName}-id`;
  addFolder("approved-id", folderId, folderName);
  addJsonFile(folderId, `${folderName}-json`, "point.json", entry, modifiedTime);

  for (const path of mediaPaths) {
    const segments = path.split("/");
    const fileName = segments.pop()!;
    let parentId = folderId;
    for (const segment of segments) {
      const existing = childByParentAndName.get(`${parentId}::${segment}`);
      parentId = existing ? existing.id : addFolder(parentId, `${parentId}/${segment}`, segment).id;
    }
    const file: DriveFile = { id: `drive-${uuid}-${path}`, name: fileName, mimeType: "application/octet-stream" };
    childByParentAndName.set(`${parentId}::${fileName}`, file);
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), file]);
  }
}

function importedMediaKeys(): string[] {
  return [...fsState.keys()].filter((key) => key.includes("/imported_points_media"));
}

describe("restoreOwnProjectFromDrive - points and media (always a full restore)", () => {
  it("always downloads photos and audio, saves persisted paths that still exist after the restore returned, and marks the point as already backed up", async () => {
    getManifestMock.mockResolvedValue(baseManifest());
    addPointFolder(
      P1,
      samplePointEntry({
        photos: ["media/photos/photo_1.jpg"],
        audio_notes: [{ filename: "media/audio/audio_1.m4a", duration: 5, timestamp: 1 }],
      }),
      ["media/photos/photo_1.jpg", "media/audio/audio_1.m4a"],
      "2026-03-04T05:06:07.000Z",
    );

    const result = await restore("folder-1");

    expect(downloadBinaryFileMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ imported: 1, mediaDownloaded: 2 });
    const created = createPointMock.mock.calls[0][0] as any;
    const [photo] = JSON.parse(created.photos) as Array<{ uri: string }>;
    const [audio] = JSON.parse(created.audio_notes) as Array<{ uri: string }>;
    expect(photo.uri).toContain(`/imported_points_media/${P1}/`);
    expect(photo.uri.endsWith("photo_1.jpg")).toBe(true);
    expect(new FakeFile(photo.uri).exists).toBe(true);
    expect(new FakeFile(audio.uri).exists).toBe(true);
    // Already on Drive, so it must not be offered for a new backup.
    expect(created.drive_synced_at).toBe("2026-03-04T05:06:07.000Z");
  });

  it("a failed download aborts the whole restore and undoes it: project deleted, downloaded files removed", async () => {
    getManifestMock.mockResolvedValue(baseManifest());
    const photos = ["media/photos/photo_1.jpg", "media/photos/photo_2.jpg"];
    addPointFolder(P1, samplePointEntry({ photos }), photos);
    addPointFolder(P2, samplePointEntry({ point_uuid: P2, created_at: "2026-02-01T00:00:00.000Z" }));
    downloadBinaryFileMock.mockImplementation(async (fileId: string, destinationUri: string) => {
      if (fileId === `drive-${P1}-media/photos/photo_2.jpg`) throw new Error("network error");
      fsState.set(destinationUri, { isDir: false, content: "downloaded-bytes" });
    });

    await expect(restore("folder-1")).rejects.toBeInstanceOf(MediaRestoreError);

    expect(deleteProjectMock).toHaveBeenCalledWith(1);
    expect(projects).toHaveLength(0);
    expect(importedMediaKeys()).toEqual([]); // photo_1.jpg, already downloaded, was cleaned up too
  });

  it("a download that times out undoes the whole restore and surfaces the timeout itself (not a generic media error)", async () => {
    getManifestMock.mockResolvedValue(baseManifest());
    const photos = ["media/photos/photo_1.jpg", "media/photos/photo_2.jpg"];
    addPointFolder(P1, samplePointEntry({ photos }), photos);
    downloadBinaryFileMock.mockImplementation(async (fileId: string, destinationUri: string) => {
      if (fileId === `drive-${P1}-media/photos/photo_2.jpg`) throw new DriveTimeoutError(180_000);
      fsState.set(destinationUri, { isDir: false, content: "downloaded-bytes" });
    });

    const error = await restore("folder-1").catch((e) => e);

    expect(error).toBeInstanceOf(DriveTimeoutError);
    expect(error).not.toBeInstanceOf(MediaRestoreError);
    expect(deleteProjectMock).toHaveBeenCalledWith(1);
    expect(projects).toHaveLength(0);
    expect(importedMediaKeys()).toEqual([]);
  });

  it("aborts and undoes when a point lists media but its media folder is missing in Drive", async () => {
    getManifestMock.mockResolvedValue(baseManifest());
    addPointFolder(P1, samplePointEntry({ photos: ["media/photos/photo_1.jpg"] })); // no media/ folder at all

    await expect(restore("folder-1")).rejects.toBeInstanceOf(MediaRestoreError);

    expect(deleteProjectMock).toHaveBeenCalledTimes(1);
    expect(projects).toHaveLength(0);
    expect(createPointMock).not.toHaveBeenCalled();
  });

  it("aborts and undoes when a listed file is not in the folder the path leads to", async () => {
    getManifestMock.mockResolvedValue(baseManifest());
    addPointFolder(
      P1,
      samplePointEntry({ photos: ["media/photos/photo_1.jpg", "media/photos/photo_2.jpg"] }),
      ["media/photos/photo_1.jpg"], // photo_2.jpg never made it to Drive
    );

    await expect(restore("folder-1")).rejects.toBeInstanceOf(MediaRestoreError);

    expect(projects).toHaveLength(0);
    expect(importedMediaKeys()).toEqual([]);
  });

  it("any non-media failure after the project was created also undoes the half-restored project", async () => {
    getManifestMock.mockResolvedValue(baseManifest());
    addPointFolder(P1, samplePointEntry());
    createPointMock.mockRejectedValueOnce(new Error("disk full"));

    await expect(restore("folder-1")).rejects.toThrow("disk full");

    expect(projects).toHaveLength(0);
  });

  function customManifest() {
    getManifestMock.mockResolvedValue(baseManifest({ protocol_source: "custom", protocol_id: "placeholder" }));
    addJsonFile("folder-1", "protocol-file-id", "protocol-package.json", {
      uuid: "protocol-uuid-1",
      name: "Fauna Survey",
      theme: "fauna",
      schema: { sections: [] },
    });
  }

  it("custom protocol: module photo/audio are downloaded by the paths in the markers and the saved data_json points at persisted local files", async () => {
    customManifest();
    addPointFolder(
      P1,
      samplePointEntry({
        modules: {
          section_1: JSON.stringify({
            fotos: JSON.stringify([{ uri: "package-media:media/section_Seção 1/Fotos_1.jpg", timestamp: 1 }]),
            gravacoes: JSON.stringify([
              { uri: "package-media:media/section_Seção 1/Gravações_1.m4a", duration: 3, timestamp: 2 },
            ]),
          }),
        },
      }),
      ["media/section_Seção 1/Fotos_1.jpg", "media/section_Seção 1/Gravações_1.m4a"],
    );

    const result = await restore("folder-1");

    expect(result.mediaDownloaded).toBe(2);
    const created = createPointMock.mock.calls[0][0] as any;
    const moduleJson = created.modules.section_1 as string;
    expect(moduleJson).not.toContain("package-media:");
    const data = JSON.parse(moduleJson);
    const [photo] = JSON.parse(data.fotos) as Array<{ uri: string }>;
    const [audio] = JSON.parse(data.gravacoes) as Array<{ uri: string }>;
    expect(photo.uri).toContain(`/imported_points_media/${P1}/`);
    expect(new FakeFile(photo.uri).exists).toBe(true);
    expect(new FakeFile(audio.uri).exists).toBe(true);
  });

  const GROUP_PATHS = [
    "media/group_Grupo/item_01/Foto_1.jpg",
    "media/group_Grupo/item_01/Audio_1.m4a",
    "media/group_Grupo/item_02/Foto_1.jpg",
  ];

  function groupPointEntry() {
    return samplePointEntry({
      modules: {
        section_1: JSON.stringify({
          grupo: [
            {
              foto_item: JSON.stringify([{ uri: `package-media:${GROUP_PATHS[0]}`, timestamp: 1 }]),
              audio_item: JSON.stringify([{ uri: `package-media:${GROUP_PATHS[1]}`, duration: 3, timestamp: 2 }]),
              nome: "item 0",
            },
            {
              foto_item: JSON.stringify([{ uri: `package-media:${GROUP_PATHS[2]}`, timestamp: 3 }]),
              audio_item: "[]",
              nome: "item 1",
            },
          ],
        }),
      },
    });
  }

  it("custom protocol: media inside repeatable_group items is downloaded and the saved data_json points at persisted local files", async () => {
    customManifest();
    addPointFolder(P1, groupPointEntry(), GROUP_PATHS);

    const result = await restore("folder-1");

    expect(result.mediaDownloaded).toBe(3);
    const created = createPointMock.mock.calls[0][0] as any;
    const moduleJson = created.modules.section_1 as string;
    expect(moduleJson).not.toContain("package-media:");
    const data = JSON.parse(moduleJson);
    expect(data.grupo).toHaveLength(2);
    const [photo0] = JSON.parse(data.grupo[0].foto_item) as Array<{ uri: string }>;
    const [audio0] = JSON.parse(data.grupo[0].audio_item) as Array<{ uri: string }>;
    const [photo1] = JSON.parse(data.grupo[1].foto_item) as Array<{ uri: string }>;
    for (const { uri } of [photo0, audio0, photo1]) {
      expect(uri).toContain(`/imported_points_media/${P1}/`);
      expect(new FakeFile(uri).exists).toBe(true);
    }
    // Two different files with the same Drive name (item_01/Foto_1.jpg, item_02/Foto_1.jpg) must not overwrite each other.
    expect(photo0.uri).not.toBe(photo1.uri);
  });

  it("a missing group media file in Drive aborts and undoes the whole restore", async () => {
    customManifest();
    addPointFolder(P1, groupPointEntry(), [GROUP_PATHS[0], GROUP_PATHS[2]]); // the audio never made it to Drive

    await expect(restore("folder-1")).rejects.toBeInstanceOf(MediaRestoreError);

    expect(deleteProjectMock).toHaveBeenCalledTimes(1);
    expect(projects).toHaveLength(0);
    expect(createPointMock).not.toHaveBeenCalled();
    expect(importedMediaKeys()).toEqual([]); // the group files already downloaded were removed too
  });

  it("two folders holding the same point_uuid are only imported once (audit finding CRÍTICO 1)", async () => {
    getManifestMock.mockResolvedValue(baseManifest());
    addPointFolder(P1, samplePointEntry(), [], undefined, `point_ABCD-1_${P1}`);
    addPointFolder(P1, samplePointEntry(), [], undefined, `point_COPY-1_${P1}`);

    const result = await restore("folder-1");

    expect(result.imported).toBe(1);
    expect(createPointMock).toHaveBeenCalledTimes(1);
    expect(result.duplicatesSkipped).toBe(1);
  });
});

describe("restoreOwnProjectFromDrive - owner_email non-blocking warning", () => {
  it("completes the restore normally but flags ownerEmailWarning when the manifest's owner_email differs from the connected account", async () => {
    getCurrentGoogleAccountMock.mockReturnValue({ email: "someone-else@example.com", name: "Someone" });
    getManifestMock.mockResolvedValue(baseManifest({ owner_email: "owner@example.com" }));

    const result = await restore("folder-1");

    expect(result.ownerEmailWarning).toBe(true);
    expect(result.projectId).toBeTruthy(); // never blocked
  });

  it("does not warn when the connected account matches the manifest's owner_email", async () => {
    getManifestMock.mockResolvedValue(baseManifest({ owner_email: "owner@example.com" }));

    const result = await restore("folder-1");

    expect(result.ownerEmailWarning).toBe(false);
  });
});
