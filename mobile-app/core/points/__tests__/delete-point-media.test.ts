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
let storedModules: Array<{ module_id: string; schema_version: string; data_json: string }> = [];
jest.mock("@/db/queries/points", () => ({
  deletePoint: (...args: unknown[]) => deletePointMock(...args),
  getPoint: jest.fn(async (id: number) => ({ point: { id }, modules: storedModules })),
}));
jest.mock("@/db/queries/projects", () => ({
  getProjectById: jest.fn(async () => ({ id: 1, protocol_id: "7", protocol_source: "custom" })),
}));
jest.mock("@/db/queries/custom-protocols", () => ({
  getCustomProtocolById: jest.fn(async () => ({
    id: 7,
    name: "Custom",
    theme: "t",
    schema: {
      sections: [
        {
          id: "section_1",
          title: "S1",
          fields: [
            { key: "fotos", type: "photo_input", label: "Fotos" },
            {
              key: "grupo",
              type: "repeatable_group",
              label: "Grupo",
              itemFields: [
                { key: "foto_item", type: "photo_input", label: "Foto" },
                { key: "audio_item", type: "audio_notes_input", label: "Audio" },
              ],
            },
          ],
        },
      ],
    },
  })),
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
  storedModules = [];
});

describe("deletePointPermanently", () => {
  it("deletes the point's photo and audio files from disk, and deletes the db row", async () => {
    fsState.set("file:///document/media/photo1.jpg", { isDir: false, content: "photo-bytes" });
    fsState.set("file:///cache/audio1.m4a", { isDir: false, content: "audio-bytes" });

    const point = makePoint({
      photos: JSON.stringify([{ uri: "file:///document/media/photo1.jpg", timestamp: 1 }]),
      audio_notes: JSON.stringify([{ uri: "file:///cache/audio1.m4a", duration: 5, timestamp: 2 }]),
    });

    await deletePointPermanently(point);

    expect(new FakeFile("file:///document/media/photo1.jpg").exists).toBe(false);
    expect(new FakeFile("file:///cache/audio1.m4a").exists).toBe(false);
    expect(deletePointMock).toHaveBeenCalledWith(point.id);
  });

  it("does not throw when a referenced media file is already missing", async () => {
    const point = makePoint({
      photos: JSON.stringify([{ uri: "file:///document/media/gone.jpg", timestamp: 1 }]),
    });

    await expect(deletePointPermanently(point)).resolves.toBeUndefined();
    expect(deletePointMock).toHaveBeenCalledWith(point.id);
  });

  it("deletes the db row even when the point has no media", async () => {
    const point = makePoint();

    await deletePointPermanently(point);

    expect(deletePointMock).toHaveBeenCalledWith(point.id);
  });

  it("also deletes media referenced from module data: top-level fields AND repeatable_group items", async () => {
    const files = [
      "file:///document/imported_points_media/pt/modules/section_1_1.jpg",
      "file:///cache/ImagePicker/g0.jpg",
      "file:///cache/g0.m4a",
      "file:///cache/ImagePicker/g1.jpg",
    ];
    for (const uri of files) fsState.set(uri, { isDir: false, content: "bytes" });
    storedModules = [
      {
        module_id: "section_1",
        schema_version: "1.0",
        data_json: JSON.stringify({
          fotos: JSON.stringify([{ uri: files[0], timestamp: 1 }]),
          grupo: [
            {
              foto_item: JSON.stringify([{ uri: files[1], timestamp: 2 }]),
              audio_item: JSON.stringify([{ uri: files[2], duration: 3, timestamp: 4 }]),
            },
            { foto_item: JSON.stringify([{ uri: files[3], timestamp: 5 }]), audio_item: "[]" },
          ],
        }),
      },
    ];
    const point = makePoint();

    await deletePointPermanently(point);

    for (const uri of files) {
      expect({ uri, exists: new FakeFile(uri).exists }).toEqual({ uri, exists: false });
    }
    expect(deletePointMock).toHaveBeenCalledWith(point.id);
  });

  it("never deletes a file outside the app's own directories (gallery, content://, path traversal), but still deletes the point", async () => {
    const outside = [
      "file:///storage/emulated/0/DCIM/Camera/mine.jpg",
      "content://media/external/images/media/42",
      "file:///document/../storage/mine.jpg",
    ];
    const inside = "file:///cache/ImagePicker/ours.jpg";
    for (const uri of [...outside, inside]) fsState.set(uri, { isDir: false, content: "bytes" });
    storedModules = [
      {
        module_id: "section_1",
        schema_version: "1.0",
        data_json: JSON.stringify({
          fotos: JSON.stringify([{ uri: outside[0], timestamp: 1 }, { uri: inside, timestamp: 2 }]),
          grupo: [{ foto_item: JSON.stringify([{ uri: outside[1], timestamp: 3 }]), audio_item: "[]" }],
        }),
      },
    ];
    const point = makePoint({
      photos: JSON.stringify([{ uri: outside[2], timestamp: 4 }]),
    });

    await deletePointPermanently(point);

    for (const uri of outside) {
      expect({ uri, exists: fsState.has(uri) }).toEqual({ uri, exists: true });
    }
    expect(new FakeFile(inside).exists).toBe(false);
    expect(deletePointMock).toHaveBeenCalledWith(point.id);
  });
});
