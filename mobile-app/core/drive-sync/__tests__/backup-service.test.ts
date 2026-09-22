// backup-service.ts talks to the real Drive REST API (via
// drive-api-client.ts, mocked here) and to local files (via
// expo-file-system, faked here with the same fixture used since Fase 2/3).
// This suite exists specifically to prove the media rule this phase
// pivoted to mid-planning: a failed/missing photo or audio note must NEVER
// block the point's scientific data from being backed up - only a failure
// uploading the point's own JSON still fails the whole point. Every
// critical behavior below has its failure scenario simulated explicitly,
// not just the happy path (section 14.7) - there is no real-device
// validation available for this phase until October, so these tests are
// the only line of defense.

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
  if (row && updates.drive_synced_at !== undefined) row.drive_synced_at = updates.drive_synced_at;
  return true;
});

jest.mock("@/db/queries/points", () => ({
  getPoint: (id: number) => getPointMock(id),
  getApprovedUnsyncedPointsByProject: (projectId: number) =>
    getApprovedUnsyncedPointsByProjectMock(projectId),
  ensurePointUuid: (id: number) => ensurePointUuidMock(id),
  updatePoint: (id: number, updates: unknown) => updatePointMock(id, updates),
}));

const getProjectByIdMock = jest.fn(async (id: number) => projects.find((p) => p.id === id) ?? null);
jest.mock("@/db/queries/projects", () => ({
  getProjectById: (id: number) => getProjectByIdMock(id),
}));

import { backupPoint, backupAllPendingPoints } from "../backup-service";

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

describe("backupPoint - media failures never block the point's data", () => {
  it("a photo upload failure is recorded in mediaFailures, but the JSON still uploads and drive_synced_at is still set", async () => {
    fsState.set("file:///capture/photo1.jpg", { isDir: false, content: "bytes" });
    const project = seedProject();
    const point = seedPoint(project.id, {
      photos: JSON.stringify([{ uri: "file:///capture/photo1.jpg", timestamp: 1 }]),
    });
    uploadBinaryFileMock.mockRejectedValueOnce(new Error("network error"));

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(true);
    expect(result.mediaFailures).toHaveLength(1);
    expect(uploadJsonFileMock).toHaveBeenCalledTimes(1);
    const uploadedContent = uploadJsonFileMock.mock.calls[0][2] as { photos: string[] };
    expect(uploadedContent.photos).toEqual([]);
    expect(point.drive_synced_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("a photo that no longer exists locally is treated the same as an upload failure - non-fatal", async () => {
    // Deliberately not seeded in fsState, so File(uri).exists is false.
    const project = seedProject();
    const point = seedPoint(project.id, {
      photos: JSON.stringify([{ uri: "file:///capture/gone.jpg", timestamp: 1 }]),
    });

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(true);
    expect(result.mediaFailures).toHaveLength(1);
    expect(uploadBinaryFileMock).not.toHaveBeenCalled(); // never even attempted
    expect(uploadJsonFileMock).toHaveBeenCalledTimes(1);
    expect(point.drive_synced_at).toBeTruthy();
  });

  it("every media item failing (photo and audio) still results in a successful, data-only backup", async () => {
    const project = seedProject();
    const point = seedPoint(project.id, {
      photos: JSON.stringify([{ uri: "file:///capture/gone.jpg", timestamp: 1 }]),
      audio_notes: JSON.stringify([{ uri: "file:///capture/gone.m4a", duration: 5, timestamp: 2 }]),
    });

    const result = await backupPoint(point.id.toString());

    expect(result.success).toBe(true);
    expect(result.mediaFailures).toHaveLength(2);
    const uploadedContent = uploadJsonFileMock.mock.calls[0][2] as {
      photos: string[];
      audio_notes: unknown[];
    };
    expect(uploadedContent.photos).toEqual([]);
    expect(uploadedContent.audio_notes).toEqual([]);
    expect(point.drive_synced_at).toBeTruthy();
  });

  it("the media folder itself failing to be created does not block the point's data either", async () => {
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

    expect(result.success).toBe(true);
    // One message about the folder itself, one about the photo that
    // couldn't be uploaded as a result - both informative, neither fatal.
    expect(result.mediaFailures).toHaveLength(2);
    expect(uploadBinaryFileMock).not.toHaveBeenCalled();
    expect(uploadJsonFileMock).toHaveBeenCalledTimes(1);
    expect(point.drive_synced_at).toBeTruthy();
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
    expect(result.mediaFailures).toBeUndefined();
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
