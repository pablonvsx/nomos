// End to end through the REAL Drive client: a media upload whose connection
// stalls must time out, fail the point (all-or-nothing) without writing the
// point's JSON to Drive or marking it as backed up, and flag the failure as a
// timeout so the UI can show the friendly message. Fake timers + a fetch
// that never answers the media upload.

import { FakeFile, resetFakeFs, fsState } from "../../project-sharing/__tests__/fixtures/fake-environment";

jest.mock("expo-file-system", () => {
  class File extends FakeFile {
    async base64() {
      return "ZmFrZQ==";
    }
  }
  return { File };
});

jest.mock("@/core/google-auth/google-auth-service", () => ({
  getDriveAccessToken: jest.fn(async () => "token"),
}));

interface FakePoint {
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
  approval_status: "approved";
  drive_synced_at: string | null;
  uuid: string;
}

const project = {
  id: 1,
  collaboration_role: "owner" as const,
  drive_folder_id: "drive-folder-1",
  protocol_id: "nomos-paisageo-v1",
  protocol_source: "official" as const,
};
let point: FakePoint;

jest.mock("@/db/queries/points", () => ({
  getPoint: jest.fn(async () => ({ point, modules: [] })),
  getApprovedUnsyncedPointsByProject: jest.fn(async () => (point.drive_synced_at ? [] : [point])),
  ensurePointUuid: jest.fn(async () => point.uuid),
  updatePoint: jest.fn(async (_id: number, updates: { drive_synced_at?: string }) => {
    if (updates.drive_synced_at !== undefined) point.drive_synced_at = updates.drive_synced_at;
    return true;
  }),
}));
jest.mock("@/db/queries/projects", () => ({
  getProjectById: jest.fn(async () => project),
}));
jest.mock("@/db/queries/custom-protocols", () => ({
  getCustomProtocolById: jest.fn(async () => null),
}));

import { backupAllPendingPoints, backupPoint } from "../backup-service";
import { DRIVE_METADATA_TIMEOUT_MS, DRIVE_TRANSFER_TIMEOUT_MS } from "../drive-api-client";

const fetchMock = jest.fn();
const originalFetch = global.fetch;

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

/** Folders resolve instantly; the media upload (its multipart body carries the base64) never answers. */
function installStalledMediaUpload() {
  fetchMock.mockImplementation((url: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }) => {
    const isMediaUpload = typeof init?.body === "string" && init.body.includes("ZmFrZQ==");
    if (isMediaUpload) {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("The operation was aborted")));
      });
    }
    if (url.includes("/files?q=")) return Promise.resolve(jsonResponse({ files: [] })); // nothing exists yet
    return Promise.resolve(jsonResponse({ id: "new-id", name: "x", mimeType: "x", modifiedTime: "2026-01-01T00:00:00.000Z" }));
  });
}

function uploadedJsonBodies(): string[] {
  return fetchMock.mock.calls
    .map(([, init]) => init?.body)
    .filter((body): body is string => typeof body === "string" && body.includes('"point_uuid"'));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetFakeFs();
  fsState.set("file:///photos/p1.jpg", { isDir: false, content: "bytes" });
  point = {
    id: 1,
    project_id: 1,
    point_number: 1,
    lat: -8.05,
    lon: -34.9,
    altitude: null,
    generated_name: null,
    landscape_class_id: null,
    photos: JSON.stringify([{ uri: "file:///photos/p1.jpg", timestamp: 1 }]),
    audio_notes: null,
    additional_notes: null,
    point_size: null,
    created_at: "2026-01-01T00:00:00.000Z",
    created_by: "ABCD",
    approval_status: "approved",
    drive_synced_at: null,
    uuid: "point-uuid-1",
  };
  global.fetch = fetchMock as unknown as typeof fetch;
  installStalledMediaUpload();
});

afterEach(() => {
  jest.useRealTimers();
  global.fetch = originalFetch;
});

describe("backupPoint - a stalled media upload", () => {
  it("fails at the transfer limit without writing the point's JSON or marking it as backed up", async () => {
    const outcome = backupPoint("1");

    await jest.advanceTimersByTimeAsync(DRIVE_METADATA_TIMEOUT_MS + 1);
    // Still waiting: media uploads have the longer limit.
    expect(point.drive_synced_at).toBeNull();

    await jest.advanceTimersByTimeAsync(DRIVE_TRANSFER_TIMEOUT_MS);
    const result = await outcome;

    expect(result.success).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(uploadedJsonBodies()).toEqual([]);
    expect(point.drive_synced_at).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("backupAllPendingPoints reports the point as failed with timedOut set, and finishes", async () => {
    const outcome = backupAllPendingPoints(1);

    await jest.advanceTimersByTimeAsync(DRIVE_TRANSFER_TIMEOUT_MS + DRIVE_METADATA_TIMEOUT_MS);
    const summary = await outcome;

    expect(summary.backedUp).toBe(0);
    expect(summary.failed).toEqual([expect.objectContaining({ pointId: 1, timedOut: true })]);
    expect(point.drive_synced_at).toBeNull();
  });
});
