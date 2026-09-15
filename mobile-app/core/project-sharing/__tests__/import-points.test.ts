import {
  FakeFile,
  FakeDirectory,
  FakePaths,
  zipMock,
  unzipMock,
  resetFakeFs,
  resetFakeDb,
  seedProject,
  seedPoint,
  fsState,
  projects,
  points,
  type FakePointRow,
} from "./fixtures/fake-environment";

jest.mock("expo-file-system", () => ({
  File: FakeFile,
  Directory: FakeDirectory,
  Paths: FakePaths,
}));
jest.mock("react-native-zip-archive", () => ({ zip: zipMock, unzip: unzipMock }));

const shareAsyncMock = jest.fn(async (...args: unknown[]) => {});
jest.mock("expo-sharing", () => ({
  shareAsync: (...args: unknown[]) => shareAsyncMock(...args),
  isAvailableAsync: async () => true,
}));

const getDocumentAsyncMock = jest.fn();
jest.mock("expo-document-picker", () => ({
  getDocumentAsync: (...args: unknown[]) => getDocumentAsyncMock(...args),
}));

let localCollectorCode: string | null = "ABCD";
jest.mock("@/core/local-identity/collector-code", () => ({
  getLocalCollectorCode: jest.fn(async () => localCollectorCode),
}));

let connectedAccountEmail: string | null = null;
jest.mock("@/core/local-identity/connected-account", () => ({
  getConnectedGoogleAccountEmail: jest.fn(async () => connectedAccountEmail),
}));

jest.mock("@/db/queries/projects", () => ({
  getProjectById: jest.fn(async (id: number) => projects.find((p) => p.id === id) ?? null),
  ensureProjectUuid: jest.fn(async (id: number) => {
    const row = projects.find((p) => p.id === id);
    if (!row) throw new Error("project not found");
    if (!row.project_uuid) row.project_uuid = `project-uuid-${id}`;
    return row.project_uuid;
  }),
}));

const createPointMock = jest.fn(async (input: any) => {
  const row: FakePointRow = {
    id: points.length ? Math.max(...points.map((p) => p.id)) + 1 : 1,
    project_id: input.project_id,
    protocol_id: input.protocol_id,
    point_number: points.filter((p) => p.project_id === input.project_id).length + 1,
    lat: input.lat,
    lon: input.lon,
    altitude: input.altitude ?? null,
    generated_name: input.generated_name ?? null,
    landscape_class_id: null,
    photos: input.photos ?? null,
    audio_notes: input.audio_notes ?? null,
    additional_notes: input.additional_notes ?? null,
    point_size: input.point_size ?? null,
    created_at: new Date().toISOString(),
    uuid: input.uuid ?? null,
    approval_status: input.approval_status ?? null,
    created_by: input.created_by ?? null,
    rawModules: Object.entries(input.modules ?? {}).map(([module_id, data_json]) => ({
      module_id,
      schema_version: input.schema_version,
      data_json: data_json as string,
    })),
  };
  points.push(row);
  return row.id;
});

const updatePointMock = jest.fn(async (id: number, updates: any) => {
  const row = points.find((p) => p.id === id);
  if (!row) return false;
  if (updates.lat !== undefined) row.lat = updates.lat;
  if (updates.lon !== undefined) row.lon = updates.lon;
  if (updates.photos !== undefined) row.photos = updates.photos;
  if (updates.audio_notes !== undefined) row.audio_notes = updates.audio_notes;
  if (updates.approval_status !== undefined) row.approval_status = updates.approval_status;
  if (updates.created_by !== undefined) row.created_by = updates.created_by;
  return true;
});

jest.mock("@/db/queries/points", () => ({
  ensurePointUuid: jest.fn(async (id: number) => {
    const row = points.find((p) => p.id === id);
    if (!row) throw new Error("point not found");
    if (!row.uuid) row.uuid = `point-uuid-${id}`;
    return row.uuid;
  }),
  getPoint: jest.fn(async (id: number) => {
    const row = points.find((p) => p.id === id);
    return row ? { point: row, modules: [] } : null;
  }),
  getPointsWithRawModulesByProject: jest.fn(async (projectId: number) =>
    points.filter((p) => p.project_id === projectId),
  ),
  createPoint: (input: unknown) => createPointMock(input),
  updatePoint: (id: number, updates: unknown) => updatePointMock(id, updates),
  getPointByProjectAndUuid: jest.fn(async (projectId: number, uuid: string) => {
    const row = points.find((p) => p.project_id === projectId && p.uuid === uuid);
    return row ?? null;
  }),
}));

import { exportAllPointsPackage } from "../export-points";
import {
  importPointsPackage,
  resolvePointDuplicate,
  ProjectMismatchError,
  type PendingDuplicate,
} from "../import-points";
import { UnsupportedPackageVersionError, InvalidPackageError } from "../package-errors";

function pickZip(zipUri: string) {
  getDocumentAsyncMock.mockResolvedValue({
    canceled: false,
    assets: [{ uri: zipUri }],
  });
}

async function exportAndCaptureZipUri(projectId: number): Promise<string> {
  await exportAllPointsPackage(projectId);
  return shareAsyncMock.mock.calls[shareAsyncMock.mock.calls.length - 1][0] as string;
}

beforeEach(() => {
  resetFakeFs();
  resetFakeDb();
  localCollectorCode = "ABCD";
  connectedAccountEmail = null;
  jest.clearAllMocks();
});

describe("importPointsPackage — round trip with media", () => {
  it("persists a point's photo AND audio note to a path that still exists after import returns", async () => {
    const project = seedProject();
    // Seed real media source files in the fake fs.
    fsState.set("file:///capture/photo1.jpg", { isDir: false, content: "photo-bytes" });
    fsState.set("file:///capture/audio1.m4a", { isDir: false, content: "audio-bytes" });

    seedPoint(project.id, {
      photos: JSON.stringify([{ uri: "file:///capture/photo1.jpg", timestamp: 1 }]),
      audio_notes: JSON.stringify([{ uri: "file:///capture/audio1.m4a", duration: 5, timestamp: 2 }]),
    });

    const zipUri = await exportAndCaptureZipUri(project.id);
    // Simulate the receiving side not having this point yet (e.g. the owner
    // importing points collected by a collaborator) - drop the local point
    // that was just exported, keeping the project itself (and its uuid).
    points.length = 0;
    pickZip(zipUri);

    const result = await importPointsPackage(project.id);
    expect(result?.imported).toBe(1);

    const importedPoint = points.find((p) => p.project_id === project.id);
    expect(importedPoint).toBeTruthy();

    const photos = JSON.parse(importedPoint!.photos!) as Array<{ uri: string }>;
    const audioNotes = JSON.parse(importedPoint!.audio_notes!) as Array<{ uri: string }>;
    expect(photos).toHaveLength(1);
    expect(audioNotes).toHaveLength(1);

    // Load-bearing check per 14.2: the file must actually exist at the saved
    // path, not just be a populated string field, and it must live under the
    // persistent directory, never the (already-deleted) extraction dir.
    expect(photos[0].uri).toContain("imported_points_media");
    expect(audioNotes[0].uri).toContain("imported_points_media");
    expect(new FakeFile(photos[0].uri).exists).toBe(true);
    expect(new FakeFile(audioNotes[0].uri).exists).toBe(true);
  });
});

describe("importPointsPackage — identity checks", () => {
  it("rejects the whole package when project_uuid doesn't match the target project, inserting nothing", async () => {
    const sourceProject = seedProject({ name: "Origem" });
    const targetProject = seedProject({ name: "Destino" });
    seedPoint(sourceProject.id);

    const zipUri = await exportAndCaptureZipUri(sourceProject.id);
    pickZip(zipUri);

    await expect(importPointsPackage(targetProject.id)).rejects.toBeInstanceOf(
      ProjectMismatchError,
    );
    expect(createPointMock).not.toHaveBeenCalled();
  });

  it("rejects the whole package when protocol_id/protocol_source differ from the target project", async () => {
    const project = seedProject({ protocol_id: "nomos-paisageo-v1", protocol_source: "official" });
    seedPoint(project.id);
    const zipUri = await exportAndCaptureZipUri(project.id);

    // Simulate importing into a different local project that happens to
    // share the same project_uuid but a different protocol (shouldn't
    // normally happen, but the check must still hold independently).
    project.protocol_id = "some-other-protocol";
    pickZip(zipUri);

    await expect(importPointsPackage(project.id)).rejects.toBeInstanceOf(ProjectMismatchError);
    expect(createPointMock).not.toHaveBeenCalled();
  });

  it("rejects an unsupported format_version before reading any other field", async () => {
    const project = seedProject();
    seedPoint(project.id);
    const zipUri = await exportAndCaptureZipUri(project.id);

    // Tamper with the packaged points.json to carry an unsupported version.
    const zipEntry = fsState.get(zipUri)!;
    const parsedZip = JSON.parse(zipEntry.content!);
    const pointsJsonKey = Object.keys(parsedZip.entries).find((k) => k.endsWith("/points.json"))!;
    const pkg = JSON.parse(parsedZip.entries[pointsJsonKey].content);
    pkg.format_version = 2;
    parsedZip.entries[pointsJsonKey].content = JSON.stringify(pkg);
    zipEntry.content = JSON.stringify(parsedZip);

    pickZip(zipUri);

    await expect(importPointsPackage(project.id)).rejects.toBeInstanceOf(
      UnsupportedPackageVersionError,
    );
    expect(createPointMock).not.toHaveBeenCalled();
  });

  it("warns (non-blocking) when owner_email differs from the connected account, but still imports", async () => {
    const project = seedProject({ owner_email: "owner@example.com" });
    seedPoint(project.id);
    const zipUri = await exportAndCaptureZipUri(project.id);
    points.length = 0;

    connectedAccountEmail = "someone-else@example.com";
    pickZip(zipUri);

    const result = await importPointsPackage(project.id);
    expect(result?.ownerEmailWarning).toBe(true);
    expect(result?.imported).toBe(1);
  });

  it("does not warn when there is no connected account (owner_email check is a no-op stub for now)", async () => {
    const project = seedProject({ owner_email: "owner@example.com" });
    seedPoint(project.id);
    const zipUri = await exportAndCaptureZipUri(project.id);
    pickZip(zipUri);

    const result = await importPointsPackage(project.id);
    expect(result?.ownerEmailWarning).toBe(false);
  });
});

describe("importPointsPackage — duplicate detection", () => {
  it.each(["pending", "approved", "rejected"] as const)(
    "treats a point with an existing point_uuid (approval_status=%s) as a duplicate instead of auto-inserting",
    async (approvalStatus) => {
      const project = seedProject();
      const point = seedPoint(project.id);
      const zipUri = await exportAndCaptureZipUri(project.id);
      point.approval_status = approvalStatus;

      pickZip(zipUri);
      const result = await importPointsPackage(project.id);

      expect(result?.imported).toBe(0);
      expect(result?.duplicates).toHaveLength(1);
      expect(createPointMock).not.toHaveBeenCalled();
    },
  );

  it("resolvePointDuplicate('discard') deletes the staged media and leaves the existing point untouched", async () => {
    const project = seedProject();
    const point = seedPoint(project.id, {
      photos: JSON.stringify([{ uri: "file:///capture/photo1.jpg", timestamp: 1 }]),
    });
    fsState.set("file:///capture/photo1.jpg", { isDir: false, content: "photo-bytes" });
    const zipUri = await exportAndCaptureZipUri(project.id);
    point.approval_status = "approved";

    pickZip(zipUri);
    const result = await importPointsPackage(project.id);
    const duplicate = result!.duplicates[0];

    expect(new FakeDirectory(duplicate.stagedMediaDir).exists).toBe(true);
    updatePointMock.mockClear(); // export's created_by stamping already called this, clear before the real assertion

    await resolvePointDuplicate(duplicate, "discard");

    expect(new FakeDirectory(duplicate.stagedMediaDir).exists).toBe(false);
    expect(updatePointMock).not.toHaveBeenCalled();
    expect(point.photos).toContain("photo1.jpg"); // unchanged
  });

  it("resolvePointDuplicate('replace') updates the point and sets approval_status back to pending", async () => {
    const project = seedProject();
    const point = seedPoint(project.id, { approval_status: "approved" });
    const zipUri = await exportAndCaptureZipUri(project.id);

    pickZip(zipUri);
    const result = await importPointsPackage(project.id);
    const duplicate: PendingDuplicate = result!.duplicates[0];

    await resolvePointDuplicate(duplicate, "replace");

    expect(updatePointMock).toHaveBeenCalledWith(
      point.id,
      expect.objectContaining({ approval_status: "pending" }),
    );
    expect(point.approval_status).toBe("pending");
  });
});

describe("importPointsPackage — unzip safety", () => {
  it("fails with a clear JS error before ever calling unzip when the copied file is empty", async () => {
    const project = seedProject();
    getDocumentAsyncMock.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///picked/empty.zip" }],
    });
    fsState.set("file:///picked/empty.zip", { isDir: false, content: "" });

    await expect(importPointsPackage(project.id)).rejects.toThrow();
    expect(unzipMock).not.toHaveBeenCalled();
  });

  it("returns null when the picker is canceled", async () => {
    const project = seedProject();
    getDocumentAsyncMock.mockResolvedValue({ canceled: true });

    const result = await importPointsPackage(project.id);
    expect(result).toBeNull();
  });
});
