// The real "Exportar mídia" zip (jszip reads back what the exporter wrote): which
// entries it holds for an official point, a custom point with section media and a
// custom point with a repeatable group. The layout itself is core/media-layout.
import * as fs from "fs";
import { RealFile, RealDirectory, RealPaths, realZip, resetRealFs, removeRealFs, createDeviceMedia, openZip } from "../../project-sharing/__tests__/fixtures/real-fs-environment";

jest.mock("expo-file-system", () => ({ File: RealFile, Directory: RealDirectory, Paths: RealPaths }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: async () => false, shareAsync: async () => undefined }));
jest.mock("react-native-zip-archive", () => ({ zip: realZip }));
jest.mock("@/db/initialize", () => ({ db: {} }));
jest.mock("expo-sqlite", () => ({}));
jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid" }));
jest.mock("@/db/queries/custom-protocols", () => ({ getCustomProtocolById: jest.fn() }));
for (const m of [
  "geoecological-constraints/GeoecologicalConstraintsModuleRenderer",
  "vegetation/VegetationModuleRenderer",
  "impacts/ImpactsModuleRenderer",
  "geoecological-constraints/GeoecologicalConstraintsModuleReadOnlyRenderer",
  "vegetation/VegetationModuleReadOnlyRenderer",
  "impacts/ImpactsModuleReadOnlyRenderer",
]) {
  jest.mock(`@/modules/paisageo/modules/${m}`, () => new Proxy({}, { get: () => () => null }));
}

import { exportMedia } from "../file-writer";
import { buildMediaLabelIndex } from "@/core/media-layout/labels";
import { customExporter } from "@/modules/custom/services/export";
import { paisageoExporter } from "@/modules/paisageo/services/export";
import { getCustomProtocolById } from "@/db/queries/custom-protocols";
import type { PointEnvelope } from "@/protocol-kernel/types";

const SCHEMA = {
  sections: [
    {
      id: "section_1",
      title: "Seção 1",
      fields: [
        { key: "fotos", type: "photo_input", label: "Fotos" },
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
};

const point = (extra: Partial<PointEnvelope>): PointEnvelope => ({
  id: "1",
  projectId: "1",
  protocolId: "x",
  pointNumber: 1,
  lat: 0,
  lon: 0,
  modules: {},
  ...extra,
});

const RECORDED_AT = 1700000000000; // 2023-11-14 22:13 UTC, the time tag in the audio names

/** Exports one point and returns what is physically inside the zip: file entries, sorted, plus its folder entries. */
async function exportOne(
  exporter: typeof customExporter,
  build: (device: (name: string) => string) => PointEnvelope,
): Promise<{ files: string[]; folders: string[]; bytesOf: (entry: string) => Promise<Buffer> }> {
  resetRealFs();
  const device = (name: string) => createDeviceMedia(name, Buffer.from(`bytes-of-${name}`));
  const labels = buildMediaLabelIndex(SCHEMA as any);
  const ok = await exportMedia(
    [build(device)],
    (p) => exporter.extractMedia(p, { id: "1", name: "Proj", protocolId: "1" }),
    "Proj",
    labels,
  );
  expect(ok).toBe(true);
  const zip = await openZip(`${RealPaths.cache.uri}Proj_media.zip`);
  const names = Object.keys(zip.files);
  return {
    files: names.filter((n) => !zip.files[n].dir).sort(),
    folders: names.filter((n) => zip.files[n].dir).sort(),
    bytesOf: (entry) => zip.file(entry)!.async("nodebuffer"),
  };
}

afterAll(() => removeRealFs());

const photo = (u: string) => JSON.stringify([{ uri: u, timestamp: 1 }]);
const audio = (u: string) => JSON.stringify([{ uri: u, duration: 2, timestamp: RECORDED_AT }]);

function expectNoEmptyFolder(result: { files: string[]; folders: string[] }) {
  for (const folder of result.folders) {
    expect(result.files.some((f) => f.startsWith(folder))).toBe(true);
  }
}

beforeEach(() => {
  (getCustomProtocolById as jest.Mock).mockResolvedValue({ id: 1, name: "P", theme: "t", schema: SCHEMA });
});

describe("Exportar mídia: zip entries", () => {
  it("official protocol: photos/ and audio/ under the point, audio keeps its extension and recording time", async () => {
    const result = await exportOne(paisageoExporter, (d) =>
      point({
        photos: [d("p1.jpg"), d("p2.jpg")],
        audioNotes: [{ uri: d("a1.m4a"), duration: 3, timestamp: RECORDED_AT }],
      }),
    );

    expect(result.files).toEqual([
      "Point_1/audio/audio_note_1_2023-11-14_22-13.m4a",
      "Point_1/photos/photo_1.jpg",
      "Point_1/photos/photo_2.jpg",
    ]);
    expectNoEmptyFolder(result);
    expect(await result.bytesOf("Point_1/photos/photo_2.jpg")).toEqual(Buffer.from("bytes-of-p2.jpg"));
  });

  it("custom protocol: the point's own media AND the section's media, each in its own folder", async () => {
    const result = await exportOne(customExporter, (d) =>
      point({
        photos: [d("p1.jpg")],
        audioNotes: [{ uri: d("a1.m4a"), duration: 3, timestamp: RECORDED_AT }],
        modules: { section_1: { fotos: photo(d("s1.jpg")) } },
      }),
    );

    expect(result.files).toEqual([
      "Point_1/audio/audio_note_1_2023-11-14_22-13.m4a",
      "Point_1/photos/photo_1.jpg",
      "Point_1/section_Seção 1/Fotos_1.jpg",
    ]);
    expectNoEmptyFolder(result);
  });

  it("custom protocol: a repeatable group of 2 items keeps one folder per item, apart from the section", async () => {
    const result = await exportOne(customExporter, (d) =>
      point({
        modules: {
          section_1: {
            fotos: photo(d("s1.jpg")),
            grupo: [
              { foto_item: photo(d("g0.jpg")), audio_item: audio(d("ga0.m4a")) },
              { foto_item: photo(d("g1.jpg")), audio_item: audio(d("ga1.m4a")) },
            ],
          },
        },
      }),
    );

    expect(result.files).toEqual([
      "Point_1/group_Grupo/item_01/Audio do item_1_2023-11-14_22-13.m4a",
      "Point_1/group_Grupo/item_01/Foto do item_1.jpg",
      "Point_1/group_Grupo/item_02/Audio do item_1_2023-11-14_22-13.m4a",
      "Point_1/group_Grupo/item_02/Foto do item_1.jpg",
      "Point_1/section_Seção 1/Fotos_1.jpg",
    ]);
    expectNoEmptyFolder(result);
    expect(await result.bytesOf("Point_1/group_Grupo/item_02/Foto do item_1.jpg")).toEqual(Buffer.from("bytes-of-g1.jpg"));
  });

  it("a point without media produces no folders for it", async () => {
    resetRealFs();
    const ok = await exportMedia(
      [point({})],
      (p) => customExporter.extractMedia(p, { id: "1", name: "Proj", protocolId: "1" }),
      "Proj",
      buildMediaLabelIndex(SCHEMA as any),
    );
    expect(ok).toBe(false);
  });
});
