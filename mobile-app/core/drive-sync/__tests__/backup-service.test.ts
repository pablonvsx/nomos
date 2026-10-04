// backup-service.ts talks to the real Drive REST API (via
// drive-api-client.ts, mocked here) and to local files (via
// expo-file-system, faked here with the same fixture used since Fase 2/3).
// Media is part of the collection: this suite proves a point only counts as
// backed up when ALL of its photos, audio notes and module media reached
// Drive (section 8) - any failure leaves the point un-synced and, above all,
// never rewrites the Drive JSON with fewer media than the point really has.
// Every critical behavior below has its failure scenario simulated
// explicitly, not just the happy path (section 14.7) - there is no
// real-device validation available for this phase, so these tests are the
// only line of defense.

import { FakeFile, resetFakeFs, fsState } from "../../project-sharing/__tests__/fixtures/fake-environment";

jest.mock("expo-file-system", () => ({ File: FakeFile }));

const ensureFolderMock = jest.fn(async (name: string, parentId: string) => `${parentId}/${name}`);

// Fake Drive tree, keyed by "<parentId>::<name>" - lets findChildByName see
// files created by uploadJsonFile/uploadBinaryFile in this same test, the
// same way the real Drive folder would for a re-backup.
let driveFilesByParentAndName = new Map<string, { id: string; name: string; mimeType: string }>();

const uploadBinaryFileMock = jest.fn(
  async (name: string, parentId: string, localUri: string, mimeType: string) => {
    const file = { id: `media-${name}`, name, mimeType };
    driveFilesByParentAndName.set(`${parentId}::${name}`, file);
    return file;
  },
);
const uploadJsonFileMock = jest.fn(async (name: string, parentId: string, content: unknown) => {
  const file = { id: `json-${name}`, name, mimeType: "application/json" };
  driveFilesByParentAndName.set(`${parentId}::${name}`, file);
  return { ...file, modifiedTime: "2026-01-01T00:00:00.000Z" };
});
const findChildByNameMock = jest.fn(async (parentId: string, name: string) =>
  driveFilesByParentAndName.get(`${parentId}::${name}`) ?? null,
);
const updateJsonFileMock = jest.fn(async (fileId: string, content: unknown) => ({
  id: fileId,
  name: "updated.json",
  mimeType: "application/json",
  modifiedTime: "2026-01-02T00:00:00.000Z",
}));
const updateBinaryFileMock = jest.fn(async (fileId: string, localUri: string, mimeType: string) => ({
  id: fileId,
  name: "updated",
  mimeType,
}));

jest.mock("@/core/drive-sync/drive-api-client", () => ({
  ensureFolder: (name: string, parentId: string) => ensureFolderMock(name, parentId),
  findChildByName: (parentId: string, name: string) => findChildByNameMock(parentId, name),
  uploadBinaryFile: (name: string, parentId: string, localUri: string, mimeType: string) =>
    uploadBinaryFileMock(name, parentId, localUri, mimeType),
  uploadJsonFile: (name: string, parentId: string, content: unknown) =>
    uploadJsonFileMock(name, parentId, content),
  updateJsonFile: (fileId: string, content: unknown) => updateJsonFileMock(fileId, content),
  updateBinaryFile: (fileId: string, localUri: string, mimeType: string) =>
    updateBinaryFileMock(fileId, localUri, mimeType),
}));

interface FakePointRow {
  id: number;
  project_id: number;
  point_number: number;
  lat: number;
  lon: number;
  altitude: number | null;
  generated_name: string | null;
  landscape_class_id: number | null;
  photos: string | null;
  audio_notes: string | null;
  additional_notes: string | null;
  point_size: number | null;
  created_at: string;
  created_by: string | null;
  approval_status: "pending" | "approved" | "rejected" | null;
  drive_synced_at: string | null;
  uuid: string | null;
  rawModules: Array<{ module_id: string; schema_version: string; data_json: string }>;
}

interface FakeProjectRow {
  id: number;
  collaboration_role: "owner" | "collaborator" | null;
  drive_folder_id: string | null;
  protocol_id: string;
  protocol_source: "official" | "custom";
}

let points: FakePointRow[] = [];
let projects: FakeProjectRow[] = [];

function resetFakeState() {
  points = [];
  projects = [];
  driveFilesByParentAndName = new Map();
}

function seedProject(overrides: Partial<FakeProjectRow> = {}): FakeProjectRow {
  const row: FakeProjectRow = {
    id: projects.length + 1,
    collaboration_role: "owner",
    drive_folder_id: "drive-folder-1",
    protocol_id: "nomos-paisageo-v1",
    protocol_source: "official",
    ...overrides,
  };
  projects.push(row);
  return row;
}

function seedPoint(projectId: number, overrides: Partial<FakePointRow> = {}): FakePointRow {
  const row: FakePointRow = {
    id: points.length + 1,
    project_id: projectId,
    point_number: points.length + 1,
    lat: -8.05,
    lon: -34.9,
    altitude: null,
    generated_name: null,
    landscape_class_id: null,
    photos: null,
    audio_notes: null,
    additional_notes: null,
    point_size: null,
    created_at: "2026-01-01T00:00:00.000Z",
    created_by: "ABCD",
    approval_status: "approved",
    drive_synced_at: null,
    uuid: null,
    rawModules: [{ module_id: "vegetation", schema_version: "1.0", data_json: '{"field":"value"}' }],
    ...overrides,
  };
  points.push(row);
  return row;
}

const getPointMock = jest.fn(async (id: number) => {
  const row = points.find((p) => p.id === id);
  if (!row) return null;
  return { point: row, modules: row.rawModules };
});
const getApprovedUnsyncedPointsByProjectMock = jest.fn(async (projectId: number) =>
  points.filter((p) => p.project_id === projectId && p.approval_status === "approved" && !p.drive_synced_at),
);
const ensurePointUuidMock = jest.fn(async (id: number) => {
  const row = points.find((p) => p.id === id);
  if (!row) throw new Error("point not found");
  if (!row.uuid) row.uuid = `point-uuid-${id}`;
  return row.uuid;
});
const updatePointMock = jest.fn(async (id: number, updates: any) => {
  const row = points.find((p) => p.id === id);
  if (!row) return true;
  if (updates.drive_synced_at !== undefined) row.drive_synced_at = updates.drive_synced_at;
  if (updates.photos !== undefined) row.photos = updates.photos;
  if (updates.audio_notes !== undefined) row.audio_notes = updates.audio_notes;
  if (updates.modules !== undefined) {
    for (const [module_id, data_json] of Object.entries(updates.modules as Record<string, string>)) {
      const mod = row.rawModules.find((m) => m.module_id === module_id);
      if (mod) mod.data_json = data_json;
    }
  }
  return true;
});

jest.mock("@/db/queries/points", () => ({
  getPoint: (id: number) => getPointMock(id),
  getApprovedUnsyncedPointsByProject: (projectId: number) =>
    getApprovedUnsyncedPointsByProjectMock(projectId),
  ensurePointUuid: (id: number) => ensurePointUuidMock(id),
  updatePoint: (id: number, updates: unknown) => updatePointMock(id, updates),
}));

// A custom protocol whose section holds a photo_input and an
// audio_notes_input field (media that lives in module data, not in the
// points.photos / points.audio_notes columns).
jest.mock("@/db/queries/custom-protocols", () => ({
  getCustomProtocolById: jest.fn(async (id: number) =>
    id === 7
      ? {
          id: 7,
          name: "Custom",
          theme: "t",
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
  ),
}));

const getProjectByIdMock = jest.fn(async (id: number) => projects.find((p) => p.id === id) ?? null);
jest.mock("@/db/queries/projects", () => ({
  getProjectById: (id: number) => getProjectByIdMock(id),
}));

import { backupPoint, backupAllPendingPoints } from "../backup-service";
import { discardMissingMedia } from "@/core/points/discard-missing-media";
import { DriveTimeoutError } from "../drive-errors";
import { ProjectRoleNotAllowedError } from "@/core/project-sharing/action-visibility";

beforeEach(() => {
  resetFakeState();
  resetFakeFs();
  jest.clearAllMocks();
  ensureFolderMock.mockImplementation(async (name: string, parentId: string) => `${parentId}/${name}`);
  uploadBinaryFileMock.mockImplementation(
    async (name: string, parentId: string, localUri: string, mimeType: string) => {
      const file = { id: `media-${name}`, name, mimeType };
      driveFilesByParentAndName.set(`${parentId}::${name}`, file);
      return file;
    },
  );
  uploadJsonFileMock.mockImplementation(async (name: string, parentId: string, content: unknown) => {
    const file = { id: `json-${name}`, name, mimeType: "application/json" };
    driveFilesByParentAndName.set(`${parentId}::${name}`, file);
    return { ...file, modifiedTime: "2026-01-01T00:00:00.000Z" };
  });
  findChildByNameMock.mockImplementation(async (parentId: string, name: string) =>
    driveFilesByParentAndName.get(`${parentId}::${name}`) ?? null,
  );
  updateJsonFileMock.mockImplementation(async (fileId: string, content: unknown) => ({
    id: fileId,
    name: "updated.json",
    mimeType: "application/json",
    modifiedTime: "2026-01-02T00:00:00.000Z",
  }));
  updateBinaryFileMock.mockImplementation(async (fileId: string, localUri: string, mimeType: string) => ({
    id: fileId,
    name: "updated",
    mimeType,
  }));
});

describe("backupPoint - media is part of the point: any media failure fails the backup", () => {
  it("a photo upload failure fails the point: JSON not uploaded, drive_synced_at not set", async () => {
    fsState.set("file:///capture/photo1.jpg", { isDir: false, content: "bytes" });
    const project = seedProject();
    const point = seedPoint(project.id, {
      photos: JSON.stringify([{ uri: "file:///capture/photo1.jpg", timestamp: 1 }]),
    });
    uploadBinaryFileMock.mockRejectedValueOnce(new Error("network error"));

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(false);
    expect(result.error).toContain("Foto 1");
    expect(uploadJsonFileMock).not.toHaveBeenCalled();
    expect(updatePointMock).not.toHaveBeenCalled();
    expect(point.drive_synced_at).toBeNull();
  });

  it("a photo that no longer exists locally fails the point too, without even attempting the upload", async () => {
    // Deliberately not seeded in fsState, so File(uri).exists is false.
    const project = seedProject();
    const point = seedPoint(project.id, {
      photos: JSON.stringify([{ uri: "file:///capture/gone.jpg", timestamp: 1 }]),
    });

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(false);
    expect(result.error).toContain("Foto 1");
    expect(uploadBinaryFileMock).not.toHaveBeenCalled();
    expect(uploadJsonFileMock).not.toHaveBeenCalled();
    expect(point.drive_synced_at).toBeNull();
  });

  it("reports every failing media item (photo and audio), not just the first", async () => {
    const project = seedProject();
    const point = seedPoint(project.id, {
      photos: JSON.stringify([{ uri: "file:///capture/gone.jpg", timestamp: 1 }]),
      audio_notes: JSON.stringify([{ uri: "file:///capture/gone.m4a", duration: 5, timestamp: 2 }]),
    });

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(false);
    expect(result.error).toContain("Foto 1");
    expect(result.error).toContain("Áudio 1");
    expect(uploadJsonFileMock).not.toHaveBeenCalled();
  });

  it("the media folder failing to be created fails the point", async () => {
    fsState.set("file:///capture/photo1.jpg", { isDir: false, content: "bytes" });
    const project = seedProject();
    const point = seedPoint(project.id, {
      photos: JSON.stringify([{ uri: "file:///capture/photo1.jpg", timestamp: 1 }]),
    });
    ensureFolderMock.mockImplementation(async (name: string, parentId: string) => {
      if (name === "media") throw new Error("could not create media folder");
      return `${parentId}/${name}`;
    });

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(false);
    expect(uploadBinaryFileMock).not.toHaveBeenCalled();
    expect(uploadJsonFileMock).not.toHaveBeenCalled();
    expect(point.drive_synced_at).toBeNull();
  });

  it("a media failure on a RE-backup never rewrites the JSON already on Drive with fewer media", async () => {
    // The point was fully backed up before; its Drive JSON lists the photo.
    driveFilesByParentAndName.set("drive-folder-1/approved::point-uuid-1.json", {
      id: "existing-json",
      name: "point-uuid-1.json",
      mimeType: "application/json",
    });
    const project = seedProject();
    const point = seedPoint(project.id, {
      uuid: "point-uuid-1",
      photos: JSON.stringify([{ uri: "file:///capture/gone.jpg", timestamp: 1 }]), // file vanished locally
    });

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(false);
    expect(updateJsonFileMock).not.toHaveBeenCalled();
    expect(uploadJsonFileMock).not.toHaveBeenCalled();
  });
});

describe("backupPoint - media inside module data (custom protocols)", () => {
  function seedCustomPoint(photoUri: string, audioUri: string) {
    const project = seedProject({ protocol_id: "7", protocol_source: "custom" });
    return seedPoint(project.id, {
      rawModules: [
        {
          module_id: "section_1",
          schema_version: "1.0",
          data_json: JSON.stringify({
            fotos: JSON.stringify([{ uri: photoUri, timestamp: 1 }]),
            gravacoes: JSON.stringify([{ uri: audioUri, duration: 3, timestamp: 2 }]),
          }),
        },
      ],
    });
  }

  it("uploads module photo/audio to Drive and writes package markers, never device paths, into the uploaded JSON", async () => {
    fsState.set("file:///capture/m-photo.jpg", { isDir: false, content: "bytes" });
    fsState.set("file:///capture/m-note.m4a", { isDir: false, content: "bytes" });
    const point = seedCustomPoint("file:///capture/m-photo.jpg", "file:///capture/m-note.m4a");

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(true);
    const uploadedNames = uploadBinaryFileMock.mock.calls.map((call) => call[0]).sort();
    expect(uploadedNames).toEqual(["modules__section_1_1.jpg", "modules__section_1_2.m4a"]);
    const uploaded = uploadJsonFileMock.mock.calls[0][2] as { modules: Record<string, string> };
    const moduleJson = uploaded.modules["section_1"];
    expect(moduleJson).not.toContain("file://");
    expect(moduleJson).toContain("package-media:modules/section_1_1.jpg");
    expect(moduleJson).toContain("package-media:modules/section_1_2.m4a");
    expect(point.drive_synced_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("a module photo missing locally fails the point and uploads no JSON", async () => {
    fsState.set("file:///capture/m-note.m4a", { isDir: false, content: "bytes" });
    const point = seedCustomPoint("file:///capture/gone.jpg", "file:///capture/m-note.m4a");

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(false);
    expect(result.error).toContain("section_1");
    expect(uploadJsonFileMock).not.toHaveBeenCalled();
    expect(point.drive_synced_at).toBeNull();
  });
});

describe("backupPoint - the point's own data upload is still all-or-nothing", () => {
  it("a JSON upload failure fails the whole point, even though its media already uploaded successfully", async () => {
    fsState.set("file:///capture/photo1.jpg", { isDir: false, content: "bytes" });
    const project = seedProject();
    const point = seedPoint(project.id, {
      photos: JSON.stringify([{ uri: "file:///capture/photo1.jpg", timestamp: 1 }]),
    });
    uploadJsonFileMock.mockRejectedValueOnce(new Error("network error"));

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(uploadBinaryFileMock).toHaveBeenCalledTimes(1); // media did upload
    expect(updatePointMock).not.toHaveBeenCalled();
    expect(point.drive_synced_at).toBeNull();
  });
});

describe("backupPoint - full success", () => {
  it("uploads photo and audio filenames (not local paths) and sets drive_synced_at from the returned modifiedTime", async () => {
    fsState.set("file:///capture/photo1.jpg", { isDir: false, content: "bytes" });
    fsState.set("file:///capture/audio1.m4a", { isDir: false, content: "bytes" });
    const project = seedProject();
    const point = seedPoint(project.id, {
      photos: JSON.stringify([{ uri: "file:///capture/photo1.jpg", timestamp: 1 }]),
      audio_notes: JSON.stringify([{ uri: "file:///capture/audio1.m4a", duration: 5, timestamp: 2 }]),
    });

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(true);
    const uploadedContent = uploadJsonFileMock.mock.calls[0][2] as {
      photos: string[];
      audio_notes: Array<{ filename: string }>;
    };
    expect(uploadedContent.photos).toEqual(["photo_1.jpg"]);
    expect(uploadedContent.audio_notes.map((a) => a.filename)).toEqual(["audio_note_1.m4a"]);
    // Never the raw local paths.
    expect(JSON.stringify(uploadedContent)).not.toContain("file:///capture");
    expect(point.drive_synced_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("refuses when the project isn't Drive-backup enabled", async () => {
    const project = seedProject({ collaboration_role: null, drive_folder_id: null });
    const point = seedPoint(project.id);

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(false);
    expect(uploadJsonFileMock).not.toHaveBeenCalled();
  });
});

describe("backupAllPendingPoints", () => {
  it("continues processing the rest of the batch after one point fails", async () => {
    const project = seedProject();
    const point1 = seedPoint(project.id);
    const point2 = seedPoint(project.id);
    const point3 = seedPoint(project.id);

    uploadJsonFileMock.mockImplementation(async (name: string) => {
      if (name === `point-uuid-${point2.id}.json`) throw new Error("network error");
      return { id: `json-${name}`, name, mimeType: "application/json", modifiedTime: "2026-01-01T00:00:00.000Z" };
    });

    const summary = await backupAllPendingPoints(project.id);

    expect(summary.backedUp).toBe(2);
    expect(summary.failed).toHaveLength(1);
    expect(point1.drive_synced_at).toBeTruthy();
    expect(point2.drive_synced_at).toBeNull();
    expect(point3.drive_synced_at).toBeTruthy();
  });

  it("relies on getApprovedUnsyncedPointsByProject for which points to process (not re-filtering itself)", async () => {
    const project = seedProject();
    seedPoint(project.id);
    seedPoint(project.id);

    await backupAllPendingPoints(project.id);

    expect(getApprovedUnsyncedPointsByProjectMock).toHaveBeenCalledWith(project.id);
    expect(uploadJsonFileMock).toHaveBeenCalledTimes(2);
  });
});

describe("backupAllPendingPoints - progress callback", () => {
  it("reports (current, total) once per point, in order, with a fixed total", async () => {
    const project = seedProject();
    seedPoint(project.id);
    seedPoint(project.id);
    seedPoint(project.id);
    const onProgress = jest.fn();

    await backupAllPendingPoints(project.id, onProgress);

    expect(onProgress.mock.calls.map(([p]) => p)).toEqual([
      { current: 1, total: 3 },
      { current: 2, total: 3 },
      { current: 3, total: 3 },
    ]);
  });

  it("reports progress before each point is uploaded", async () => {
    const project = seedProject();
    const point1 = seedPoint(project.id);
    seedPoint(project.id);
    const seenSyncedAtAtCall: Array<string | null> = [];

    await backupAllPendingPoints(project.id, ({ current }) => {
      if (current === 1) seenSyncedAtAtCall.push(point1.drive_synced_at);
    });

    // At the moment of "point 1 of N" the point hadn't been backed up yet.
    expect(seenSyncedAtAtCall).toEqual([null]);
    expect(point1.drive_synced_at).toBeTruthy();
  });

  it("keeps reporting the remaining points when one fails in the middle", async () => {
    const project = seedProject();
    const point1 = seedPoint(project.id);
    const point2 = seedPoint(project.id);
    const point3 = seedPoint(project.id);
    uploadJsonFileMock.mockImplementation(async (name: string) => {
      if (name === `point-uuid-${point2.id}.json`) throw new Error("network error");
      return { id: `json-${name}`, name, mimeType: "application/json", modifiedTime: "2026-01-01T00:00:00.000Z" };
    });
    const onProgress = jest.fn();

    const summary = await backupAllPendingPoints(project.id, onProgress);

    expect(onProgress.mock.calls.map(([p]) => p.current)).toEqual([1, 2, 3]);
    expect(summary.backedUp).toBe(2);
    expect(summary.failed).toHaveLength(1);
    expect(point1.drive_synced_at).toBeTruthy();
    expect(point3.drive_synced_at).toBeTruthy();
  });

  it("turns an unexpected exception from one point into a failure and continues the batch", async () => {
    const project = seedProject();
    const point1 = seedPoint(project.id);
    const point2 = seedPoint(project.id);
    const point3 = seedPoint(project.id);
    const realImpl = getPointMock.getMockImplementation()!;
    getPointMock.mockImplementation(async (id: number) => {
      if (id === point2.id) throw new Error("db exploded");
      return realImpl(id);
    });
    const onProgress = jest.fn();

    let summary;
    try {
      summary = await backupAllPendingPoints(project.id, onProgress);
    } finally {
      // clearAllMocks() in beforeEach doesn't reset implementations.
      getPointMock.mockImplementation(realImpl);
    }

    expect(onProgress.mock.calls.map(([p]) => p.current)).toEqual([1, 2, 3]);
    expect(summary.backedUp).toBe(2);
    expect(summary.failed).toEqual([
      expect.objectContaining({ pointId: point2.id, reason: "db exploded" }),
    ]);
    expect(point1.drive_synced_at).toBeTruthy();
    expect(point3.drive_synced_at).toBeTruthy();
  });

  it("works without a callback and does not call it for an empty batch", async () => {
    const project = seedProject();
    const onProgress = jest.fn();

    await expect(backupAllPendingPoints(project.id)).resolves.toEqual({ backedUp: 0, failed: [] });
    await backupAllPendingPoints(project.id, onProgress);

    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe("backupPoint - network timeouts", () => {
  it("a media upload that times out fails the point, writes no JSON, leaves drive_synced_at null and flags timedOut", async () => {
    const project = seedProject();
    const point = seedPoint(project.id, { photos: JSON.stringify([{ uri: "file:///p1.jpg", timestamp: 1 }]) });
    fsState.set("file:///p1.jpg", { isDir: false, content: "bytes" });
    uploadBinaryFileMock.mockRejectedValue(new DriveTimeoutError(180_000));

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(uploadJsonFileMock).not.toHaveBeenCalled();
    expect(updateJsonFileMock).not.toHaveBeenCalled();
    expect(point.drive_synced_at).toBeNull();
  });

  it("a timeout while writing the point's JSON also fails the point and flags timedOut", async () => {
    const project = seedProject();
    const point = seedPoint(project.id);
    uploadJsonFileMock.mockRejectedValue(new DriveTimeoutError(30_000));

    const result = await backupPoint(point.id.toString());

    expect(result).toEqual(expect.objectContaining({ success: false, timedOut: true }));
    expect(point.drive_synced_at).toBeNull();
  });

  it("a timeout creating the approved folder is flagged too", async () => {
    const project = seedProject();
    const point = seedPoint(project.id);
    ensureFolderMock.mockRejectedValue(new DriveTimeoutError(30_000));

    const result = await backupPoint(point.id.toString());

    expect(result).toEqual(expect.objectContaining({ success: false, timedOut: true }));
  });

  it("an ordinary upload failure is not flagged as a timeout", async () => {
    const project = seedProject();
    const point = seedPoint(project.id);
    uploadJsonFileMock.mockRejectedValue(new Error("Drive API error (500): boom"));

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(false);
    expect(result.timedOut).toBeFalsy();
  });

  it("backupAllPendingPoints carries timedOut into each failed entry and keeps going", async () => {
    const project = seedProject();
    const point1 = seedPoint(project.id);
    const point2 = seedPoint(project.id);
    uploadJsonFileMock.mockImplementation(async (name: string) => {
      if (name === `point-uuid-${point1.id}.json`) throw new DriveTimeoutError(30_000);
      return { id: `json-${name}`, name, mimeType: "application/json", modifiedTime: "2026-01-01T00:00:00.000Z" };
    });

    const summary = await backupAllPendingPoints(project.id);

    expect(summary.backedUp).toBe(1);
    expect(summary.failed).toEqual([expect.objectContaining({ pointId: point1.id, timedOut: true })]);
    expect(point2.drive_synced_at).toBeTruthy();
  });
});

describe("backupPoint - idempotent re-backup (audit finding CRÍTICO 1)", () => {
  it("backing up the same point twice updates the existing Drive file instead of creating a duplicate", async () => {
    const project = seedProject();
    const point = seedPoint(project.id);

    await backupPoint(point.id.toString());
    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(true);
    expect(uploadJsonFileMock).toHaveBeenCalledTimes(1); // only the first call created the file
    expect(updateJsonFileMock).toHaveBeenCalledTimes(1); // the second call updated it in place
    expect(updateJsonFileMock).toHaveBeenCalledWith(
      `json-point-uuid-${point.id}.json`,
      expect.anything(),
    );
    // Still exactly one file under that name in the simulated Drive folder.
    const matchingEntries = [...driveFilesByParentAndName.keys()].filter((key) =>
      key.endsWith(`::point-uuid-${point.id}.json`),
    );
    expect(matchingEntries).toHaveLength(1);
  });

  it("backing up the same photo twice updates the existing Drive file instead of creating a duplicate", async () => {
    fsState.set("file:///capture/photo1.jpg", { isDir: false, content: "bytes" });
    const project = seedProject();
    const point = seedPoint(project.id, {
      photos: JSON.stringify([{ uri: "file:///capture/photo1.jpg", timestamp: 1 }]),
    });

    await backupPoint(point.id.toString());
    // Second backup (e.g. a retry, or the point's data changed and it was
    // re-approved) with the same photo still attached.
    point.drive_synced_at = null;
    await backupPoint(point.id.toString());

    expect(uploadBinaryFileMock).toHaveBeenCalledTimes(1);
    expect(updateBinaryFileMock).toHaveBeenCalledTimes(1);
    expect(updateBinaryFileMock).toHaveBeenCalledWith(
      "media-photo_1.jpg",
      "file:///capture/photo1.jpg",
      "image/jpeg",
    );
  });
});

describe("backupPoint - media missing from the device is reported separately from upload failures", () => {
  it("counts photo, audio and module media that no longer exist locally in missingMediaCount", async () => {
    fsState.set("file:///capture/here.jpg", { isDir: false, content: "bytes" });
    const project = seedProject({ protocol_id: "7", protocol_source: "custom" });
    const point = seedPoint(project.id, {
      photos: JSON.stringify([
        { uri: "file:///capture/gone.jpg", timestamp: 1 },
        { uri: "file:///capture/here.jpg", timestamp: 2 },
      ]),
      audio_notes: JSON.stringify([{ uri: "file:///capture/gone.m4a", duration: 5, timestamp: 3 }]),
      rawModules: [
        {
          module_id: "section_1",
          schema_version: "1.0",
          data_json: JSON.stringify({
            fotos: JSON.stringify([{ uri: "file:///capture/gone-module.jpg", timestamp: 4 }]),
            gravacoes: "[]",
          }),
        },
      ],
    });

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(false);
    expect(result.missingMediaCount).toBe(3);
  });

  it("a plain upload failure (file exists) is not counted as missing media", async () => {
    fsState.set("file:///capture/photo1.jpg", { isDir: false, content: "bytes" });
    const project = seedProject();
    const point = seedPoint(project.id, {
      photos: JSON.stringify([{ uri: "file:///capture/photo1.jpg", timestamp: 1 }]),
    });
    uploadBinaryFileMock.mockRejectedValueOnce(new Error("network error"));

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(false);
    expect(result.missingMediaCount ?? 0).toBe(0);
  });

  it("backupAllPendingPoints tells which failed points have missing media", async () => {
    const project = seedProject();
    const withMissing = seedPoint(project.id, {
      photos: JSON.stringify([{ uri: "file:///capture/gone.jpg", timestamp: 1 }]),
    });
    seedPoint(project.id); // no media, backs up fine

    const summary = await backupAllPendingPoints(project.id);

    expect(summary.backedUp).toBe(1);
    expect(summary.failed).toEqual([
      expect.objectContaining({ pointId: withMissing.id, missingMediaCount: 1 }),
    ]);
  });
});

describe("discardMissingMedia - role check", () => {
  it.each([null, "collaborator"] as const)(
    "refuses a project whose role is %s (it belongs to the owner's backup flow) without writing anything",
    async (role) => {
      const project = seedProject({ collaboration_role: role, drive_folder_id: null });
      const point = seedPoint(project.id, {
        photos: JSON.stringify([{ uri: "file:///capture/gone.jpg", timestamp: 1 }]),
      });

      await expect(discardMissingMedia(point.id)).rejects.toBeInstanceOf(ProjectRoleNotAllowedError);
      expect(updatePointMock).not.toHaveBeenCalled();
      expect(JSON.parse(point.photos!)).toHaveLength(1);
    },
  );
});

describe("discardMissingMedia", () => {
  it("removes only the references whose file is gone, keeps the rest, never touches the files that exist, and does not mark the point as backed up", async () => {
    fsState.set("file:///capture/here.jpg", { isDir: false, content: "bytes" });
    fsState.set("file:///capture/here.m4a", { isDir: false, content: "bytes" });
    const project = seedProject();
    const point = seedPoint(project.id, {
      photos: JSON.stringify([
        { uri: "file:///capture/gone.jpg", timestamp: 1 },
        { uri: "file:///capture/here.jpg", timestamp: 2 },
      ]),
      audio_notes: JSON.stringify([
        { uri: "file:///capture/here.m4a", duration: 5, timestamp: 3 },
        { uri: "file:///capture/gone.m4a", duration: 6, timestamp: 4 },
      ]),
    });

    const removed = await discardMissingMedia(point.id);

    expect(removed).toBe(2);
    expect(JSON.parse(point.photos!)).toEqual([{ uri: "file:///capture/here.jpg", timestamp: 2 }]);
    expect(JSON.parse(point.audio_notes!)).toEqual([
      { uri: "file:///capture/here.m4a", duration: 5, timestamp: 3 },
    ]);
    expect(fsState.has("file:///capture/here.jpg")).toBe(true);
    expect(fsState.has("file:///capture/here.m4a")).toBe(true);
    expect(point.drive_synced_at).toBeNull();
  });

  it("also cleans media stored inside module data (custom protocols), keeping the module's schema version", async () => {
    fsState.set("file:///capture/here.jpg", { isDir: false, content: "bytes" });
    const project = seedProject({ protocol_id: "7", protocol_source: "custom" });
    const point = seedPoint(project.id, {
      rawModules: [
        {
          module_id: "section_1",
          schema_version: "2.3",
          data_json: JSON.stringify({
            fotos: JSON.stringify([
              { uri: "file:///capture/gone.jpg", timestamp: 1 },
              { uri: "file:///capture/here.jpg", timestamp: 2 },
            ]),
            gravacoes: JSON.stringify([{ uri: "file:///capture/gone.m4a", duration: 3, timestamp: 4 }]),
          }),
        },
      ],
    });

    const removed = await discardMissingMedia(point.id);

    expect(removed).toBe(2);
    const data = JSON.parse(point.rawModules[0].data_json);
    expect(JSON.parse(data.fotos)).toEqual([{ uri: "file:///capture/here.jpg", timestamp: 2 }]);
    expect(JSON.parse(data.gravacoes)).toEqual([]);
    expect(updatePointMock).toHaveBeenCalledWith(
      point.id,
      expect.objectContaining({ schema_version: "2.3" }),
    );
  });

  it("does nothing (and reports 0) when every referenced file still exists", async () => {
    fsState.set("file:///capture/here.jpg", { isDir: false, content: "bytes" });
    const project = seedProject();
    const point = seedPoint(project.id, {
      photos: JSON.stringify([{ uri: "file:///capture/here.jpg", timestamp: 1 }]),
    });

    const removed = await discardMissingMedia(point.id);

    expect(removed).toBe(0);
    expect(updatePointMock).not.toHaveBeenCalled();
  });

  it("after discarding, the backup that was blocked by the missing media goes through with only the media that exists", async () => {
    fsState.set("file:///capture/here.jpg", { isDir: false, content: "bytes" });
    const project = seedProject();
    const point = seedPoint(project.id, {
      photos: JSON.stringify([
        { uri: "file:///capture/gone.jpg", timestamp: 1 },
        { uri: "file:///capture/here.jpg", timestamp: 2 },
      ]),
    });
    expect((await backupPoint(point.id.toString())).success).toBe(false);

    await discardMissingMedia(point.id);
    const retry = await backupPoint(point.id.toString());

    expect(retry.success).toBe(true);
    const uploaded = uploadJsonFileMock.mock.calls[0][2] as { photos: string[] };
    expect(uploaded.photos).toEqual(["photo_1.jpg"]);
    expect(point.drive_synced_at).toBeTruthy();
  });
});

describe("backup and discard - media inside repeatable_group items (custom protocols)", () => {
  function seedGroupPoint(items: Array<{ photo: string; audio?: string }>) {
    const project = seedProject({ protocol_id: "7", protocol_source: "custom" });
    return seedPoint(project.id, {
      rawModules: [
        {
          module_id: "section_1",
          schema_version: "2.3",
          data_json: JSON.stringify({
            grupo: items.map((item, index) => ({
              foto_item: JSON.stringify([{ uri: item.photo, timestamp: index }]),
              audio_item: JSON.stringify(
                item.audio ? [{ uri: item.audio, duration: 3, timestamp: index }] : [],
              ),
              nome: `item ${index}`,
            })),
          }),
        },
      ],
    });
  }

  it("uploads every group item's photo and audio under unique modules__ names and writes only markers into the JSON", async () => {
    for (const uri of ["i0.jpg", "i0.m4a", "i1.jpg", "i1.m4a"]) {
      fsState.set(`file:///capture/${uri}`, { isDir: false, content: `bytes-${uri}` });
    }
    const point = seedGroupPoint([
      { photo: "file:///capture/i0.jpg", audio: "file:///capture/i0.m4a" },
      { photo: "file:///capture/i1.jpg", audio: "file:///capture/i1.m4a" },
    ]);

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(true);
    const names = uploadBinaryFileMock.mock.calls.map((call) => call[0]);
    expect(names).toHaveLength(4);
    expect(new Set(names).size).toBe(4);
    expect(names.every((n) => n.startsWith("modules__section_1_grupo_"))).toBe(true);
    const uploaded = uploadJsonFileMock.mock.calls[0][2] as { modules: Record<string, string> };
    const moduleJson = uploaded.modules["section_1"];
    expect(moduleJson).not.toContain("file://");
    expect(moduleJson.match(/package-media:modules\//g)).toHaveLength(4);
    expect(JSON.parse(moduleJson).grupo.map((i: { nome: string }) => i.nome)).toEqual(["item 0", "item 1"]);
    expect(point.drive_synced_at).toBeTruthy();
  });

  it("a group media upload failure fails the whole point: JSON not written, drive_synced_at not set", async () => {
    fsState.set("file:///capture/i0.jpg", { isDir: false, content: "bytes" });
    fsState.set("file:///capture/i1.jpg", { isDir: false, content: "bytes" });
    const point = seedGroupPoint([{ photo: "file:///capture/i0.jpg" }, { photo: "file:///capture/i1.jpg" }]);
    uploadBinaryFileMock.mockImplementation(async (name: string, parentId: string, _uri: string, mimeType: string) => {
      if (name.includes("_1_foto_item_")) throw new Error("network error");
      return { id: `media-${name}`, name, mimeType };
    });

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(false);
    expect(uploadJsonFileMock).not.toHaveBeenCalled();
    expect(point.drive_synced_at).toBeNull();
  });

  it("a group media file missing from the device fails the point and is counted in missingMediaCount", async () => {
    fsState.set("file:///capture/i0.jpg", { isDir: false, content: "bytes" });
    const point = seedGroupPoint([
      { photo: "file:///capture/i0.jpg" },
      { photo: "file:///capture/gone.jpg", audio: "file:///capture/gone.m4a" },
    ]);

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(false);
    expect(result.missingMediaCount).toBe(2);
    expect(uploadJsonFileMock).not.toHaveBeenCalled();
  });

  it("discardMissingMedia removes only the references to missing group files: the item stays, other media and schema_version are kept", async () => {
    fsState.set("file:///capture/i0.jpg", { isDir: false, content: "bytes" });
    const point = seedGroupPoint([
      { photo: "file:///capture/i0.jpg" },
      { photo: "file:///capture/gone.jpg", audio: "file:///capture/gone.m4a" },
    ]);

    const removed = await discardMissingMedia(point.id);

    expect(removed).toBe(2);
    const data = JSON.parse(point.rawModules[0].data_json);
    expect(data.grupo).toHaveLength(2);
    expect(JSON.parse(data.grupo[0].foto_item)).toHaveLength(1);
    expect(JSON.parse(data.grupo[1].foto_item)).toEqual([]);
    expect(JSON.parse(data.grupo[1].audio_item)).toEqual([]);
    expect(data.grupo[1].nome).toBe("item 1");
    expect(updatePointMock).toHaveBeenCalledWith(point.id, expect.objectContaining({ schema_version: "2.3" }));

    // The backup that was blocked now goes through, carrying only what exists.
    const retry = await backupPoint(point.id.toString());
    expect(retry.success).toBe(true);
    expect(uploadBinaryFileMock).toHaveBeenCalledTimes(1);
  });
});
