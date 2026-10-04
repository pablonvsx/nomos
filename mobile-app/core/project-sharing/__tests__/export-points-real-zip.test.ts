/**
 * Section 14.7 proof test: builds a points package against a REAL filesystem
 * and a REAL zip, then opens the resulting .zip with a real zip reader and
 * checks which files are physically inside it. "points.json mentions the
 * file name" is deliberately NOT accepted as proof that media was included -
 * that kind of trust is exactly what hid this bug the first time.
 */
import {
  RealFile,
  RealDirectory,
  RealPaths,
  realZip,
  realUnzip,
  resetRealFs,
  removeRealFs,
  createDeviceMedia,
  openZip,
} from "./fixtures/real-fs-environment";
import {
  resetFakeDb,
  seedProject,
  seedPoint,
  projects,
  points,
} from "./fixtures/fake-environment";
import type JSZip from "jszip";

jest.mock("expo-file-system", () => ({
  File: RealFile,
  Directory: RealDirectory,
  Paths: RealPaths,
}));
jest.mock("react-native-zip-archive", () => ({ zip: realZip, unzip: realUnzip }));

const shareAsyncMock = jest.fn(async (..._args: unknown[]) => {});
jest.mock("expo-sharing", () => ({
  shareAsync: (...args: unknown[]) => shareAsyncMock(...args),
  isAvailableAsync: async () => true,
}));

jest.mock("@/core/local-identity/collector-code", () => ({
  getLocalCollectorCode: jest.fn(async () => "ABCD"),
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
  updatePoint: jest.fn(async (id: number, updates: any) => {
    const row = points.find((p) => p.id === id);
    if (row && updates.created_by !== undefined) row.created_by = updates.created_by;
    return true;
  }),
}));

// A custom protocol with one section that holds a photo_input and an
// audio_notes_input field - the media lives inside the module's data_json,
// not in the points.photos / points.audio_notes columns.
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
                  { key: "notas", type: "text", label: "Notas" },
                  {
                    key: "grupo",
                    type: "repeatable_group",
                    label: "Grupo",
                    itemFields: [
                      { key: "foto_item", type: "photo_input", label: "Foto do item" },
                      { key: "audio_item", type: "audio_notes_input", label: "Audio do item" },
                      { key: "nome", type: "text", label: "Nome" },
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

import { exportAllPointsPackage, type PointsPackage } from "../export-points";

const PHOTO_BYTES = Buffer.from("fake-jpeg-bytes-0123456789");
const AUDIO_BYTES = Buffer.from("fake-m4a-bytes-abcdefghijklmnop");

async function readSharedZip(): Promise<{ zip: JSZip; pkg: PointsPackage }> {
  const zipUri = shareAsyncMock.mock.calls[0][0] as string;
  const zip = await openZip(zipUri);
  const pkg = JSON.parse(await zip.file("points.json")!.async("string")) as PointsPackage;
  return { zip, pkg };
}

/** Every media path points.json claims, relative to the zip root. */
function referencedMediaPaths(pkg: PointsPackage): string[] {
  const referenced: string[] = [];
  for (const entry of pkg.points) {
    for (const photo of entry.photos) referenced.push(`media/${entry.point_uuid}/${photo}`);
    for (const note of entry.audio_notes) {
      referenced.push(`media/${entry.point_uuid}/${note.filename}`);
    }
    for (const json of Object.values(entry.modules)) {
      for (const value of collectStrings(JSON.parse(json))) {
        if (value.startsWith("package-media:")) {
          referenced.push(`media/${entry.point_uuid}/${value.slice("package-media:".length)}`);
        }
      }
    }
  }
  return referenced;
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") {
    // Field values such as photo_input are stored as JSON text inside the module JSON.
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") return collectStrings(parsed);
    } catch {
      /* plain string */
    }
    return [value];
  }
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
}

async function expectEveryReferencedFileInsideZip(zip: JSZip, pkg: PointsPackage) {
  const referenced = referencedMediaPaths(pkg);
  for (const mediaPath of referenced) {
    const entry = zip.file(mediaPath);
    expect({ mediaPath, presentInZip: entry !== null }).toEqual({ mediaPath, presentInZip: true });
    const bytes = await entry!.async("nodebuffer");
    expect({ mediaPath, size: bytes.length > 0 }).toEqual({ mediaPath, size: true });
  }
  return referenced;
}

beforeEach(() => {
  resetRealFs();
  resetFakeDb();
  shareAsyncMock.mockClear();
});

afterAll(() => {
  removeRealFs();
});

describe("exportAllPointsPackage - real zip contents", () => {
  it("official protocol: photo and audio from the point columns are physically inside the zip", async () => {
    const photoUri = createDeviceMedia("photo.jpg", PHOTO_BYTES);
    const audioUri = createDeviceMedia("note.m4a", AUDIO_BYTES);
    const project = seedProject({ protocol_id: "nomos-paisageo-v1", protocol_source: "official" });
    seedPoint(project.id, {
      photos: JSON.stringify([{ uri: photoUri, timestamp: 1 }]),
      audio_notes: JSON.stringify([{ uri: audioUri, duration: 3, timestamp: 2 }]),
    });

    await exportAllPointsPackage(project.id);

    const { zip, pkg } = await readSharedZip();
    const referenced = await expectEveryReferencedFileInsideZip(zip, pkg);
    expect(referenced).toHaveLength(2);

    const uuid = pkg.points[0].point_uuid;
    expect(await zip.file(`media/${uuid}/photo_1.jpg`)!.async("nodebuffer")).toEqual(PHOTO_BYTES);
    expect(await zip.file(`media/${uuid}/audio_note_1.m4a`)!.async("nodebuffer")).toEqual(AUDIO_BYTES);
  });

  it("custom protocol: photo_input / audio_notes_input media inside module data are physically inside the zip", async () => {
    const photoUri = createDeviceMedia("module-photo.jpg", PHOTO_BYTES);
    const audioUri = createDeviceMedia("module-note.m4a", AUDIO_BYTES);
    const project = seedProject({ protocol_id: "7", protocol_source: "custom" });
    seedPoint(project.id, {
      rawModules: [
        {
          module_id: "section_1",
          schema_version: "1.0",
          data_json: JSON.stringify({
            // photo_input / audio_notes_input values are JSON text, as the form stores them.
            fotos: JSON.stringify([{ uri: photoUri, timestamp: 1 }]),
            gravacoes: JSON.stringify([{ uri: audioUri, duration: 3, timestamp: 2 }]),
            notas: "texto livre",
          }),
        },
      ],
    });

    await exportAllPointsPackage(project.id);

    const { zip, pkg } = await readSharedZip();

    // Physical contents first: both binaries must exist inside the zip, non-empty.
    const listing = await Promise.all(
      Object.keys(zip.files)
        .filter((n) => !zip.files[n].dir)
        .sort()
        .map(async (n) => `${n} (${(await zip.file(n)!.async("nodebuffer")).length} bytes)`),
    );
    console.info(`Entries found inside the real zip:\n  ${listing.join("\n  ")}`);
    const mediaFiles = Object.keys(zip.files).filter((n) => !zip.files[n].dir && n.startsWith("media/"));
    expect(mediaFiles.sort()).toEqual([
      "media/point-uuid-1/modules/section_1_1.jpg",
      "media/point-uuid-1/modules/section_1_2.m4a",
    ]);
    const contents = await Promise.all(mediaFiles.map((n) => zip.file(n)!.async("nodebuffer")));
    expect(contents).toEqual([PHOTO_BYTES, AUDIO_BYTES]);

    // points.json must point at those entries, never at the sender's device paths.
    const referenced = await expectEveryReferencedFileInsideZip(zip, pkg);
    expect(referenced).toHaveLength(2);
    const moduleJson = pkg.points[0].modules["section_1"];
    expect(moduleJson).not.toContain("file://");
    expect(moduleJson).not.toContain(photoUri);
  });

  it("custom protocol: media inside repeatable_group items (2 items) plus a top-level photo are ALL physically inside the zip, with identical bytes and only markers in the JSON", async () => {
    const bytes = {
      top: Buffer.from("top-photo-bytes"),
      i0photo: Buffer.from("item0-photo-bytes"),
      i0audio: Buffer.from("item0-audio-bytes"),
      i1photo: Buffer.from("item1-photo-bytes"),
      i1audio: Buffer.from("item1-audio-bytes"),
    };
    const uri = {
      top: createDeviceMedia("top.jpg", bytes.top),
      i0photo: createDeviceMedia("i0.jpg", bytes.i0photo),
      i0audio: createDeviceMedia("i0.m4a", bytes.i0audio),
      i1photo: createDeviceMedia("i1.jpg", bytes.i1photo),
      i1audio: createDeviceMedia("i1.m4a", bytes.i1audio),
    };
    const project = seedProject({ protocol_id: "7", protocol_source: "custom" });
    seedPoint(project.id, {
      rawModules: [
        {
          module_id: "section_1",
          schema_version: "1.0",
          data_json: JSON.stringify({
            fotos: JSON.stringify([{ uri: uri.top, timestamp: 1 }]),
            grupo: [
              {
                foto_item: JSON.stringify([{ uri: uri.i0photo, timestamp: 2 }]),
                audio_item: JSON.stringify([{ uri: uri.i0audio, duration: 3, timestamp: 4 }]),
                nome: "item 0",
              },
              {
                foto_item: JSON.stringify([{ uri: uri.i1photo, timestamp: 5 }]),
                audio_item: JSON.stringify([{ uri: uri.i1audio, duration: 6, timestamp: 7 }]),
                nome: "item 1",
              },
            ],
          }),
        },
      ],
    });

    const report = await exportAllPointsPackage(project.id);

    expect(report).toEqual({ skippedMedia: [] });
    const { zip, pkg } = await readSharedZip();
    const mediaFiles = Object.keys(zip.files).filter((n) => !zip.files[n].dir && n.startsWith("media/"));
    expect(mediaFiles).toHaveLength(5);
    expect(new Set(mediaFiles).size).toBe(5); // unique names

    const moduleJson = pkg.points[0].modules["section_1"];
    expect(moduleJson).not.toContain("file://");
    const data = JSON.parse(moduleJson);
    const markerBytes = async (value: string) => {
      const [entry] = JSON.parse(value) as Array<{ uri: string }>;
      expect(entry.uri.startsWith("package-media:modules/")).toBe(true);
      const file = zip.file(`media/${pkg.points[0].point_uuid}/${entry.uri.slice("package-media:".length)}`);
      expect(file).not.toBeNull();
      return file!.async("nodebuffer");
    };
    expect(await markerBytes(data.fotos)).toEqual(bytes.top);
    expect(await markerBytes(data.grupo[0].foto_item)).toEqual(bytes.i0photo);
    expect(await markerBytes(data.grupo[0].audio_item)).toEqual(bytes.i0audio);
    expect(await markerBytes(data.grupo[1].foto_item)).toEqual(bytes.i1photo);
    expect(await markerBytes(data.grupo[1].audio_item)).toEqual(bytes.i1audio);
    expect(data.grupo.map((i: { nome: string }) => i.nome)).toEqual(["item 0", "item 1"]);
  });

  it("a group media file whose source is gone is reported in skippedMedia and its reference is dropped from the item", async () => {
    const goodUri = createDeviceMedia("good.jpg", PHOTO_BYTES);
    const project = seedProject({ protocol_id: "7", protocol_source: "custom" });
    seedPoint(project.id, {
      rawModules: [
        {
          module_id: "section_1",
          schema_version: "1.0",
          data_json: JSON.stringify({
            grupo: [
              {
                foto_item: JSON.stringify([
                  { uri: "file:///does/not/exist.jpg", timestamp: 1 },
                  { uri: goodUri, timestamp: 2 },
                ]),
                nome: "keeps",
              },
            ],
          }),
        },
      ],
    });

    const report = await exportAllPointsPackage(project.id);

    expect(report).toEqual({ skippedMedia: ["file:///does/not/exist.jpg"] });
    const { zip, pkg } = await readSharedZip();
    const item = JSON.parse(pkg.points[0].modules["section_1"]).grupo[0];
    expect(JSON.parse(item.foto_item)).toHaveLength(1);
    expect(item.nome).toBe("keeps");
    expect(Object.keys(zip.files).filter((n) => n.startsWith("media/") && !zip.files[n].dir)).toHaveLength(1);
  });

  it("a media file whose source is gone is left out of the zip AND out of points.json", async () => {
    const goodUri = createDeviceMedia("good.jpg", PHOTO_BYTES);
    const project = seedProject({ protocol_id: "nomos-paisageo-v1", protocol_source: "official" });
    seedPoint(project.id, {
      photos: JSON.stringify([
        { uri: "file:///does/not/exist.jpg", timestamp: 1 },
        { uri: goodUri, timestamp: 2 },
      ]),
    });

    await exportAllPointsPackage(project.id);

    const { zip, pkg } = await readSharedZip();
    const referenced = await expectEveryReferencedFileInsideZip(zip, pkg);
    expect(referenced).toHaveLength(1);
    expect(pkg.points[0].photos).toHaveLength(1);
  });

  it("reports media that could not be included instead of dropping it silently", async () => {
    const project = seedProject({ protocol_id: "nomos-paisageo-v1", protocol_source: "official" });
    seedPoint(project.id, {
      photos: JSON.stringify([{ uri: "file:///does/not/exist.jpg", timestamp: 1 }]),
    });

    const report = await exportAllPointsPackage(project.id);

    expect(report).toEqual({ skippedMedia: ["file:///does/not/exist.jpg"] });
  });
});
