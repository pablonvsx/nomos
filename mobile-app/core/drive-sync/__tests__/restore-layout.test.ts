// Restoring from the one-folder-per-point layout. The REAL backup-service and
// restore-service run against one in-memory Drive: whatever backupPoint puts
// there, restoreOwnProjectFromDrive must bring back in full by following the
// paths written in point.json - never by recomputing names.

import { FakeFile, FakeDirectory, FakePaths, resetFakeFs, fsState } from "../../project-sharing/__tests__/fixtures/fake-environment";
import { createInMemoryDrive, FOLDER_MIME_TYPE, ROOT_ID } from "./fixtures/in-memory-drive";
import {
  POINT_UUID,
  customProtocol,
  groupScenario,
  makePointRow,
  officialScenario,
  sectionScenario,
  uuidFor,
  type Scenario,
  type ScenarioModuleRow,
  type ScenarioPointRow,
  type ScenarioProject,
} from "./fixtures/layout-scenarios";

jest.mock("expo-file-system", () => ({ File: FakeFile, Directory: FakeDirectory, Paths: FakePaths }));

const mockDrive = createInMemoryDrive(fsState);
jest.mock("@/core/drive-sync/drive-api-client", () => mockDrive.api);

let manifestSource: "official" | "custom" = "official";
jest.mock("@/core/drive-sync/project-drive-service", () => ({
  getManifest: async () => ({
    project_uuid: "project-uuid-1",
    project_name: "Projeto",
    protocol_id: manifestSource === "custom" ? "7" : "nomos-paisageo-v1",
    protocol_source: manifestSource,
    owner_email: "owner@example.com",
    active_vegetation_classification: { type: "standard" },
  }),
}));
jest.mock("@/core/google-auth/google-auth-service", () => ({
  getCurrentGoogleAccount: () => ({ email: "owner@example.com", name: "Owner" }),
}));
jest.mock("@/core/project-sharing/project-config-package", () => ({
  sanitizeSpeciesSource: (v: string) => v,
  parseImportedCommonNames: () => [],
}));
jest.mock("@/core/project-sharing/import-points", () => ({ IMPORTED_MEDIA_DIR: "imported_points_media" }));
jest.mock("@/db/queries/custom-protocols", () => ({
  getCustomProtocolById: async () => customProtocol,
  getCustomProtocolByUuid: async () => null,
  createCustomProtocolWithUuid: async () => 7,
}));

let points: ScenarioPointRow[] = [];
let modulesByPoint = new Map<number, ScenarioModuleRow[]>();
let project: ScenarioProject;
const createdPoints: any[] = [];
const deleteProjectMock = jest.fn(async () => true);

jest.mock("@/db/queries/points", () => ({
  getPoint: async (id: number) => {
    const point = points.find((p) => p.id === id);
    return point ? { point, modules: modulesByPoint.get(id) ?? [] } : null;
  },
  ensurePointUuid: async (id: number) => points.find((p) => p.id === id)!.uuid,
  getBackupEligiblePointsByProject: async () => [],
  updatePoint: async (id: number, updates: { drive_synced_at?: string }) => {
    if (updates.drive_synced_at !== undefined) points.find((p) => p.id === id)!.drive_synced_at = updates.drive_synced_at;
    return true;
  },
  createPoint: async (input: unknown) => {
    createdPoints.push(input);
    return createdPoints.length;
  },
}));
jest.mock("@/db/queries/projects", () => ({
  getProjectById: async () => project,
  getProjectByUuid: async () => null,
  createProject: async () => 2,
  setProjectAsOwner: async () => true,
  deleteProject: (...args: unknown[]) => (deleteProjectMock as any)(...args),
}));
jest.mock("@/db/queries/project-species", () => ({
  createProjectSpecies: async () => 1,
  getProjectSpeciesByUuid: async () => null,
}));
jest.mock("@/db/queries/vegetation-classifications", () => ({
  createVegetationClassification: async () => 1,
  getVegetationClassificationByUuid: async () => null,
  setActiveVegetationClassification: async () => true,
  setVegetationClassificationUuid: async () => undefined,
}));

import { backupPoint } from "../backup-service";
import { MediaRestoreError, restoreOwnProjectFromDrive } from "../restore-service";

function load(scenario: Scenario) {
  project = scenario.project;
  manifestSource = scenario.project.protocol_source;
  points = [scenario.point];
  modulesByPoint = new Map([[scenario.point.id, scenario.modules]]);
  for (const [uri, content] of Object.entries(scenario.media)) fsState.set(uri, { isDir: false, content });
}

const FOLDER = `point_ABCD-3_${POINT_UUID}`;
const approvedId = () => mockDrive.nodeAt("approved")!.id;
const bytesAt = (uri: string) => fsState.get(uri)?.content;
const firstUri = (value: string) => (JSON.parse(value) as Array<{ uri: string }>)[0].uri;

beforeEach(() => {
  resetFakeFs();
  mockDrive.reset();
  createdPoints.length = 0;
  deleteProjectMock.mockClear();
  mockDrive.createNode({ name: "approved", parentId: ROOT_ID, mimeType: FOLDER_MIME_TYPE });
  mockDrive.createNode({
    name: "protocol-package.json",
    parentId: ROOT_ID,
    mimeType: "application/json",
    json: { uuid: "protocol-uuid-1", name: "Custom", theme: "t", schema: { sections: [] } },
  });
});

describe("round trip: backup then restore", () => {
  it("(a) official protocol brings back the point's photos and audio with the original bytes", async () => {
    load(officialScenario());
    await backupPoint("1");

    const result = await restoreOwnProjectFromDrive("root");

    expect(result).toMatchObject({ imported: 1, mediaDownloaded: 3 });
    const restored = createdPoints[0];
    expect(restored.uuid).toBe(POINT_UUID);
    const photos = JSON.parse(restored.photos) as Array<{ uri: string }>;
    expect(photos.map((p) => bytesAt(p.uri))).toEqual(["photo-1", "photo-2"]);
    const [note] = JSON.parse(restored.audio_notes) as Array<{ uri: string; duration: number }>;
    expect(bytesAt(note.uri)).toBe("audio-1");
    expect(note.duration).toBe(3);
    expect(restored.drive_synced_at).toBe("2026-05-06T07:08:09.000Z");
  });

  it("(b) custom protocol brings back point media and a section field's photo", async () => {
    load(sectionScenario());
    await backupPoint("1");

    const result = await restoreOwnProjectFromDrive("root");

    expect(result).toMatchObject({ imported: 1, mediaDownloaded: 3 });
    const restored = createdPoints[0];
    expect(bytesAt(firstUri(restored.photos))).toBe("photo-1");
    const data = JSON.parse(restored.modules.section_1);
    expect(bytesAt(firstUri(data.fotos))).toBe("section-photo");
    expect(JSON.stringify(restored.modules)).not.toContain("package-media:");
  });

  it("(c) custom protocol brings back every group item's photo and audio", async () => {
    load(groupScenario());
    await backupPoint("1");

    const result = await restoreOwnProjectFromDrive("root");

    expect(result).toMatchObject({ imported: 1, mediaDownloaded: 4 });
    const data = JSON.parse(createdPoints[0].modules.section_1);
    expect(data.grupo.map((i: { nome: string }) => i.nome)).toEqual(["item 0", "item 1"]);
    expect(bytesAt(firstUri(data.grupo[0].foto_item))).toBe("g0-photo");
    expect(bytesAt(firstUri(data.grupo[0].audio_item))).toBe("g0-audio");
    expect(bytesAt(firstUri(data.grupo[1].foto_item))).toBe("g1-photo");
    expect(bytesAt(firstUri(data.grupo[1].audio_item))).toBe("g1-audio");
  });

  it("restores a point backed up without a collector code (folder point_<number>_<uuid>)", async () => {
    const scenario = officialScenario();
    scenario.point.created_by = null;
    load(scenario);
    await backupPoint("1");
    expect(mockDrive.nodeAt(`approved/point_3_${POINT_UUID}`)).toBeDefined();

    expect(await restoreOwnProjectFromDrive("root")).toMatchObject({ imported: 1 });
  });
});

describe("the folder name is only a label", () => {
  it("renaming just the label part of the point folder does not stop the restore", async () => {
    load(groupScenario());
    await backupPoint("1");
    mockDrive.renameNode(mockDrive.nodeAt(`approved/${FOLDER}`)!.id, `point_my renamed label_${POINT_UUID}`);

    expect(await restoreOwnProjectFromDrive("root")).toMatchObject({ imported: 1, mediaDownloaded: 4 });
  });
});

describe("the paths in point.json are followed literally", () => {
  it("a subfolder renamed inside media/ fails the restore with MediaRestoreError and undoes everything", async () => {
    load(groupScenario());
    await backupPoint("1");
    mockDrive.renameNode(mockDrive.nodeAt(`approved/${FOLDER}/media/group_Amostras`)!.id, "group_Renamed");

    await expect(restoreOwnProjectFromDrive("root")).rejects.toBeInstanceOf(MediaRestoreError);

    expect(deleteProjectMock).toHaveBeenCalledTimes(1);
    expect([...fsState.keys()].filter((key) => key.includes("imported_points_media"))).toEqual([]);
  });

  it("a renamed media file fails the restore the same way", async () => {
    load(sectionScenario());
    await backupPoint("1");
    mockDrive.renameNode(mockDrive.nodeAt(`approved/${FOLDER}/media/photos/photo_1.jpg`)!.id, "holiday.jpg");

    await expect(restoreOwnProjectFromDrive("root")).rejects.toBeInstanceOf(MediaRestoreError);
    expect(deleteProjectMock).toHaveBeenCalledTimes(1);
  });

  it("a failure on a later point undoes the media of the earlier ones too", async () => {
    load(officialScenario());
    await backupPoint("1");
    // A second point whose JSON points at a file that is not there.
    const folder = mockDrive.createNode({ name: `point_ABCD-4_${uuidFor(2)}`, parentId: approvedId(), mimeType: FOLDER_MIME_TYPE });
    mockDrive.createNode({
      name: "point.json",
      parentId: folder.id,
      mimeType: "application/json",
      json: { point_uuid: uuidFor(2), point_number: 4, lat: 0, lon: 0, created_at: "2026-02-01T00:00:00.000Z", created_by: "ABCD", schema_version: "1.0", modules: {}, photos: ["media/photos/photo_1.jpg"], audio_notes: [] },
    });

    await expect(restoreOwnProjectFromDrive("root")).rejects.toBeInstanceOf(MediaRestoreError);

    expect([...fsState.keys()].filter((key) => key.includes("imported_points_media"))).toEqual([]);
  });
});

describe("what in approved/ is not a point", () => {
  it("ignores stray folders, loose files and folders without point.json", async () => {
    load(officialScenario());
    await backupPoint("1");
    const approved = approvedId();
    mockDrive.createNode({ name: "notes", parentId: approved, mimeType: FOLDER_MIME_TYPE });
    mockDrive.createNode({ name: "point_foo_not-a-uuid", parentId: approved, mimeType: FOLDER_MIME_TYPE });
    mockDrive.createNode({ name: `point_4_${uuidFor(9)}`, parentId: approved, mimeType: FOLDER_MIME_TYPE }); // never finished: no point.json
    mockDrive.createNode({ name: "readme.json", parentId: approved, mimeType: "application/json", json: { hello: "world" } });
    mockDrive.createNode({ name: `${uuidFor(8)}.json`, parentId: approved, mimeType: "application/json", json: { point_uuid: uuidFor(8) } });

    const result = await restoreOwnProjectFromDrive("root");

    expect(result.imported).toBe(1);
    expect(createdPoints.map((p) => p.uuid)).toEqual([POINT_UUID]);
  });

  it("skips a second folder claiming a uuid that was already restored", async () => {
    load(officialScenario());
    await backupPoint("1");
    const original = mockDrive.nodeAt(`approved/${FOLDER}/point.json`)!;
    const copy = mockDrive.createNode({ name: `point_COPY-3_${POINT_UUID}`, parentId: approvedId(), mimeType: FOLDER_MIME_TYPE });
    mockDrive.createNode({ name: "point.json", parentId: copy.id, mimeType: "application/json", json: { ...(original.json as object), photos: [], audio_notes: [] } });

    const result = await restoreOwnProjectFromDrive("root");

    expect(result).toMatchObject({ imported: 1, duplicatesSkipped: 1 });
  });
});

describe("restore order is deterministic", () => {
  function addPoint(uuid: string, folderLabel: string, createdAt: string) {
    const folder = mockDrive.createNode({ name: `point_${folderLabel}_${uuid}`, parentId: approvedId(), mimeType: FOLDER_MIME_TYPE });
    mockDrive.createNode({
      name: "point.json",
      parentId: folder.id,
      mimeType: "application/json",
      json: { point_uuid: uuid, point_number: 1, lat: 0, lon: 0, created_at: createdAt, created_by: "ABCD", schema_version: "1.0", modules: {}, photos: [], audio_notes: [] },
    });
  }

  it("restores by created_at no matter what order Drive lists the folders in", async () => {
    manifestSource = "official";
    addPoint(uuidFor(3), "ABCD-3", "2026-03-01T00:00:00.000Z");
    addPoint(uuidFor(1), "ABCD-1", "2026-01-01T00:00:00.000Z");
    addPoint(uuidFor(2), "ABCD-2", "2026-02-01T00:00:00.000Z");

    await restoreOwnProjectFromDrive("root");

    expect(createdPoints.map((p) => p.uuid)).toEqual([uuidFor(1), uuidFor(2), uuidFor(3)]);
  });

  it("breaks a created_at tie by folder name", async () => {
    manifestSource = "official";
    addPoint(uuidFor(2), "B", "2026-01-01T00:00:00.000Z");
    addPoint(uuidFor(1), "C", "2026-01-01T00:00:00.000Z");
    addPoint(uuidFor(3), "A", "2026-01-01T00:00:00.000Z");

    await restoreOwnProjectFromDrive("root");

    expect(createdPoints.map((p) => p.uuid)).toEqual([uuidFor(3), uuidFor(2), uuidFor(1)]);
  });
});

describe("Drive calls to restore a point", () => {
  it("(c) group of 2 items: one listing of approved/, then folders and files of that point only", async () => {
    load(groupScenario());
    await backupPoint("1");
    mockDrive.resetCalls();

    await restoreOwnProjectFromDrive("root");

    const breakdown = mockDrive.callBreakdown();
    expect(breakdown.downloadBinaryFile).toBe(4);
    expect(breakdown.readJsonFile).toBe(2); // protocol-package.json + point.json
    // approved/, the point folder, media/, group_Amostras/, item_01/, item_02/
    expect(breakdown.listChildren).toBe(6);
  });
});
