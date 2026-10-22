// The owner's Drive backup is organised one folder per point:
//   approved/point_<label>_<uuid>/{point.json, media/{photos,audio,section_*,group_*/item_NN}}
// This suite runs the REAL backup-service against an in-memory Drive and
// checks the exact tree, the references written into point.json, the
// all-or-nothing rule, idempotent re-backups, pagination and the number of
// Drive calls each point costs.

import { FakeFile, resetFakeFs, fsState } from "../../project-sharing/__tests__/fixtures/fake-environment";
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

jest.mock("expo-file-system", () => ({ File: FakeFile }));

const mockDrive = createInMemoryDrive(fsState);
jest.mock("@/core/drive-sync/drive-api-client", () => mockDrive.api);

let points: ScenarioPointRow[] = [];
let modulesByPoint = new Map<number, ScenarioModuleRow[]>();
let project: ScenarioProject;

jest.mock("@/db/queries/points", () => ({
  getPoint: async (id: number) => {
    const point = points.find((p) => p.id === id);
    return point ? { point, modules: modulesByPoint.get(id) ?? [] } : null;
  },
  ensurePointUuid: async (id: number) => points.find((p) => p.id === id)!.uuid,
  getBackupEligiblePointsByProject: async () => points.filter((p) => !p.drive_synced_at),
  updatePoint: async (id: number, updates: { drive_synced_at?: string }) => {
    if (updates.drive_synced_at !== undefined) points.find((p) => p.id === id)!.drive_synced_at = updates.drive_synced_at;
    return true;
  },
}));
jest.mock("@/db/queries/projects", () => ({ getProjectById: async () => project }));
jest.mock("@/db/queries/custom-protocols", () => ({ getCustomProtocolById: async () => customProtocol }));

import { backupAllPendingPoints, backupPoint } from "../backup-service";

function load(scenario: Scenario) {
  project = scenario.project;
  points = [scenario.point];
  modulesByPoint = new Map([[scenario.point.id, scenario.modules]]);
  for (const [uri, content] of Object.entries(scenario.media)) fsState.set(uri, { isDir: false, content });
}

const FOLDER = `point_ABCD-3_${POINT_UUID}`;
const under = (paths: string[], prefix = `approved/${FOLDER}/`) => paths.map((p) => `${prefix}${p}`);
const sorted = (paths: string[]) => [...paths].sort();

function pointJson(folder = FOLDER): any {
  return mockDrive.nodeAt(`approved/${folder}/point.json`)?.json;
}

beforeEach(() => {
  resetFakeFs();
  mockDrive.reset();
  // Activation leaves an empty approved/ behind.
  mockDrive.createNode({ name: "approved", parentId: ROOT_ID, mimeType: FOLDER_MIME_TYPE });
});

describe("the tree backupPoint builds", () => {
  it("(a) official protocol: the point's own photos and audio, nothing else", async () => {
    load(officialScenario());

    expect(await backupPoint("1")).toEqual({ success: true });

    expect(mockDrive.tree("root")).toEqual(
      sorted([
        "approved/",
        `approved/${FOLDER}/`,
        ...under(["point.json", "media/", "media/photos/", "media/photos/photo_1.jpg", "media/photos/photo_2.jpg", "media/audio/", "media/audio/audio_1.m4a"]),
      ]),
    );
    const json = pointJson();
    expect(json.photos).toEqual(["media/photos/photo_1.jpg", "media/photos/photo_2.jpg"]);
    expect(json.audio_notes).toEqual([{ filename: "media/audio/audio_1.m4a", duration: 3, timestamp: 1 }]);
    expect(json.modules.vegetation).toBe('{"physiognomy":"x"}');
  });

  it("(b) custom protocol: point photo and audio plus a photo in a section field", async () => {
    load(sectionScenario());

    expect(await backupPoint("1")).toEqual({ success: true });

    expect(mockDrive.tree("root")).toEqual(
      sorted([
        "approved/",
        `approved/${FOLDER}/`,
        ...under([
          "point.json",
          "media/",
          "media/photos/",
          "media/photos/photo_1.jpg",
          "media/audio/",
          "media/audio/audio_1.m4a",
          "media/section_Seção 1/",
          "media/section_Seção 1/Fotos_1.jpg",
        ]),
      ]),
    );
    const json = pointJson();
    expect(json.photos).toEqual(["media/photos/photo_1.jpg"]);
    const data = JSON.parse(json.modules.section_1);
    expect(JSON.parse(data.fotos)).toEqual([{ uri: "package-media:media/section_Seção 1/Fotos_1.jpg", timestamp: 1 }]);
  });

  it("(c) custom protocol: a repeatable group of 2 items, each with a photo and an audio note", async () => {
    load(groupScenario());

    expect(await backupPoint("1")).toEqual({ success: true });

    expect(mockDrive.tree("root")).toEqual(
      sorted([
        "approved/",
        `approved/${FOLDER}/`,
        ...under([
          "point.json",
          "media/",
          "media/group_Amostras/",
          "media/group_Amostras/item_01/",
          "media/group_Amostras/item_01/Foto_1.jpg",
          "media/group_Amostras/item_01/Áudio_1.m4a",
          "media/group_Amostras/item_02/",
          "media/group_Amostras/item_02/Foto_1.jpg",
          "media/group_Amostras/item_02/Áudio_1.m4a",
        ]),
      ]),
    );
    const data = JSON.parse(pointJson().modules.section_1);
    expect(data.grupo.map((i: { nome: string }) => i.nome)).toEqual(["item 0", "item 1"]);
    const marker = (value: string) => (JSON.parse(value) as Array<{ uri: string }>)[0].uri;
    expect(marker(data.grupo[0].foto_item)).toBe("package-media:media/group_Amostras/item_01/Foto_1.jpg");
    expect(marker(data.grupo[1].audio_item)).toBe("package-media:media/group_Amostras/item_02/Áudio_1.m4a");
  });

  it("never writes a device path or file:// into point.json", async () => {
    load(groupScenario());
    await backupPoint("1");
    expect(JSON.stringify(pointJson())).not.toContain("file://");
  });

  it("uploads the real bytes under the planned names", async () => {
    load(sectionScenario());
    await backupPoint("1");
    expect(mockDrive.nodeAt(`approved/${FOLDER}/media/section_Seção 1/Fotos_1.jpg`)?.bytes).toBe("section-photo");
    expect(mockDrive.nodeAt(`approved/${FOLDER}/media/audio/audio_1.m4a`)?.bytes).toBe("audio-1");
  });

  it("creates no subfolder for a point without media", async () => {
    load({ ...officialScenario(), point: makePointRow({ photos: null, audio_notes: null }), media: {} });
    await backupPoint("1");
    expect(mockDrive.tree("root")).toEqual(sorted(["approved/", `approved/${FOLDER}/`, `approved/${FOLDER}/point.json`]));
  });

  it("only creates the subfolders that hold a file", async () => {
    load({ ...officialScenario(), point: makePointRow({ photos: officialScenario().point.photos, audio_notes: null }) });
    await backupPoint("1");
    expect(mockDrive.tree("root")).not.toContain(`approved/${FOLDER}/media/audio/`);
    expect(mockDrive.tree("root")).toContain(`approved/${FOLDER}/media/photos/`);
  });
});

describe("the point folder name", () => {
  it("uses the collector code and the number", async () => {
    load(officialScenario());
    await backupPoint("1");
    expect(mockDrive.nodeAt(`approved/point_ABCD-3_${POINT_UUID}`)).toBeDefined();
  });

  it("uses just the number when the point has no collector code - never a question mark", async () => {
    const scenario = officialScenario();
    scenario.point.created_by = null;
    load(scenario);

    await backupPoint("1");

    const folders = mockDrive.childrenOf(mockDrive.nodeAt("approved")!.id).map((n) => n.name);
    expect(folders).toEqual([`point_3_${POINT_UUID}`]);
    expect(mockDrive.tree("root").join("\n")).not.toContain("?");
  });
});

describe("backing up twice", () => {
  it("backupPoint twice does not create a second point folder, and rewrites the same files", async () => {
    load(groupScenario());
    await backupPoint("1");
    const treeAfterFirst = mockDrive.tree("root");
    points[0].drive_synced_at = null;
    mockDrive.resetCalls();

    expect(await backupPoint("1")).toEqual({ success: true });

    expect(mockDrive.tree("root")).toEqual(treeAfterFirst);
    expect(mockDrive.callCount("createFolder")).toBe(0);
    expect(mockDrive.callCount("uploadBinaryFile")).toBe(0);
    expect(mockDrive.callCount("uploadJsonFile")).toBe(0);
    expect(mockDrive.callCount("updateBinaryFile")).toBe(4);
    expect(mockDrive.callCount("updateJsonFile")).toBe(1);
  });

  it("keeps the folder name frozen at the first backup when the label changes", async () => {
    load(officialScenario());
    await backupPoint("1");
    points[0].point_number = 9;
    points[0].created_by = "WXYZ";
    points[0].drive_synced_at = null;

    await backupPoint("1");

    const folders = mockDrive.childrenOf(mockDrive.nodeAt("approved")!.id).map((n) => n.name);
    expect(folders).toEqual([FOLDER]);
  });

  it("finds a folder whose label was edited by hand, through the uuid suffix", async () => {
    load(officialScenario());
    await backupPoint("1");
    mockDrive.renameNode(mockDrive.nodeAt(`approved/${FOLDER}`)!.id, `point_my own label_${POINT_UUID}`);
    points[0].drive_synced_at = null;

    await backupPoint("1");

    expect(mockDrive.childrenOf(mockDrive.nodeAt("approved")!.id)).toHaveLength(1);
  });
});

describe("all or nothing", () => {
  it("a failed media upload leaves the point without point.json and without drive_synced_at", async () => {
    load(groupScenario());
    mockDrive.failWhen((operation, name) => operation === "uploadBinaryFile" && name === "Foto_1.jpg");

    const result = await backupPoint("1");

    expect(result.success).toBe(false);
    expect(points[0].drive_synced_at).toBeNull();
    expect(mockDrive.tree("root").some((p) => p.endsWith("point.json"))).toBe(false);
  });

  it("a failed folder creation also fails the point without writing the JSON", async () => {
    load(sectionScenario());
    mockDrive.failWhen((operation, name) => operation === "createFolder" && name === "audio");

    const result = await backupPoint("1");

    expect(result.success).toBe(false);
    expect(points[0].drive_synced_at).toBeNull();
    expect(mockDrive.tree("root").some((p) => p.endsWith("point.json"))).toBe(false);
  });

  it("a retry reuses the folders already created instead of making new ones", async () => {
    load(groupScenario());
    mockDrive.failWhen((operation, name) => operation === "uploadBinaryFile" && name === "Áudio_1.m4a");
    await backupPoint("1");
    const foldersAfterFailure = mockDrive.tree("root").filter((p) => p.endsWith("/"));
    mockDrive.failWhen(null);
    mockDrive.resetCalls();

    expect(await backupPoint("1")).toEqual({ success: true });

    const folders = mockDrive.tree("root").filter((p) => p.endsWith("/"));
    expect(new Set(folders).size).toBe(folders.length);
    for (const folder of foldersAfterFailure) expect(folders).toContain(folder);
    expect(mockDrive.childrenOf(mockDrive.nodeAt("approved")!.id)).toHaveLength(1);
    // Only the folders the failed attempt never reached are created now.
    expect(mockDrive.callCount("createFolder")).toBe(folders.length - foldersAfterFailure.length);
    expect(points[0].drive_synced_at).toBeTruthy();
    expect(mockDrive.nodeAt(`approved/${FOLDER}/point.json`)).toBeDefined();
  });
});

describe("batches and pagination", () => {
  function loadFivePoints() {
    project = officialScenario().project;
    points = [1, 2, 3, 4, 5].map((n) => makePointRow({ id: n, point_number: n, uuid: uuidFor(n), photos: null, audio_notes: null }));
    modulesByPoint = new Map(points.map((p) => [p.id, []]));
  }
  const pointFolders = () =>
    mockDrive.childrenOf(mockDrive.nodeAt("approved")!.id).map((n) => n.name).sort();

  it("with a page size of 2, five points all get a folder and a second run duplicates nothing", async () => {
    loadFivePoints();
    mockDrive.setPageSize(2);

    expect((await backupAllPendingPoints(1)).backedUp).toBe(5);
    const first = pointFolders();
    expect(first).toHaveLength(5);
    expect(first).toEqual([1, 2, 3, 4, 5].map((n) => `point_ABCD-${n}_${uuidFor(n)}`));

    for (const p of points) p.drive_synced_at = null;
    mockDrive.resetCalls();
    expect((await backupAllPendingPoints(1)).backedUp).toBe(5);

    expect(pointFolders()).toEqual(first);
    expect(mockDrive.callCount("createFolder")).toBe(0);
    // approved/ is listed once for the whole batch: 5 folders at 2 per page = 3 pages.
    expect(mockDrive.callCount("listChildren")).toBe(3);
  });

  it("lists approved/ once per batch, not once per point", async () => {
    loadFivePoints();
    await backupAllPendingPoints(1);
    expect(mockDrive.callCount("listChildren")).toBe(1);
  });
});

describe("Drive calls per point (first backup, approved/ already there)", () => {
  // Before this layout the same points cost 13 / 13 / 15 calls (measured with
  // the old code: ensureFolder for approved, media and the uuid folder, then a
  // lookup plus an upload for every file and for the JSON).
  const cases: Array<[string, () => Scenario, Record<string, number>]> = [
    ["(a) official, 2 photos + 1 audio", officialScenario, { findChildByName: 1, listChildren: 1, createFolder: 4, uploadBinaryFile: 3, uploadJsonFile: 1 }],
    ["(b) custom, point media + section photo", sectionScenario, { findChildByName: 1, listChildren: 1, createFolder: 5, uploadBinaryFile: 3, uploadJsonFile: 1 }],
    ["(c) custom, group of 2 items", groupScenario, { findChildByName: 1, listChildren: 1, createFolder: 5, uploadBinaryFile: 4, uploadJsonFile: 1 }],
  ];

  it.each(cases)("%s", async (_name, scenario, expected) => {
    load(scenario());
    mockDrive.resetCalls();

    await backupPoint("1");

    expect(mockDrive.callBreakdown()).toEqual(expected);
  });
});
