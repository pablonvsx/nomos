import {
  FakeFile,
  FakeDirectory,
  FakePaths,
  resetFakeFs,
  fsState,
} from "../../project-sharing/__tests__/fixtures/fake-environment";

jest.mock("expo-file-system", () => ({
  File: FakeFile,
  Directory: FakeDirectory,
  Paths: FakePaths,
}));

const deletePointMock = jest.fn(async (...args: unknown[]) => true);
jest.mock("@/db/queries/points", () => ({
  deletePoint: (...args: unknown[]) => deletePointMock(...args),
}));

import { deletePointPermanently } from "../delete-point-media";
import type { Point } from "@/types/database";

function makePoint(overrides: Partial<Point> = {}): Point {
  return {
    id: 1,
    project_id: 1,
    protocol_id: "nomos-paisageo-v1",
    point_number: 1,
    lat: -8.05,
    lon: -34.9,
    is_classified: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    photos: null,
    audio_notes: null,
    ...overrides,
  } as Point;
}

beforeEach(() => {
  resetFakeFs();
  jest.clearAllMocks();
});

describe("deletePointPermanently", () => {
  it("deletes the point's photo and audio files from disk, and deletes the db row", async () => {
    fsState.set("file:///media/photo1.jpg", { isDir: false, content: "photo-bytes" });
    fsState.set("file:///media/audio1.m4a", { isDir: false, content: "audio-bytes" });

    const point = makePoint({
      photos: JSON.stringify([{ uri: "file:///media/photo1.jpg", timestamp: 1 }]),
      audio_notes: JSON.stringify([{ uri: "file:///media/audio1.m4a", duration: 5, timestamp: 2 }]),
    });

    await deletePointPermanently(point);

    expect(new FakeFile("file:///media/photo1.jpg").exists).toBe(false);
    expect(new FakeFile("file:///media/audio1.m4a").exists).toBe(false);
    expect(deletePointMock).toHaveBeenCalledWith(point.id);
  });

  it("does not throw when a referenced media file is already missing", async () => {
    const point = makePoint({
      photos: JSON.stringify([{ uri: "file:///media/gone.jpg", timestamp: 1 }]),
    });

    await expect(deletePointPermanently(point)).resolves.toBeUndefined();
    expect(deletePointMock).toHaveBeenCalledWith(point.id);
  });

  it("deletes the db row even when the point has no media", async () => {
    const point = makePoint();

    await deletePointPermanently(point);

    expect(deletePointMock).toHaveBeenCalledWith(point.id);
  });
});
