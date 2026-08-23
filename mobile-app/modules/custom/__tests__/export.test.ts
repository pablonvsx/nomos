// extractMedia doesn't do I/O directly, but the export module imports
// core/export/file-writer.ts, which in turn imports native Expo packages
// whose ESM source jest (ts-jest, "node" environment) cannot transform.
// Since jest.config.js still has no test infra for native modules (see the
// comment in that file), we locally stub these dependencies just to allow
// importing the module under test.
jest.mock("expo-file-system", () => ({}));
jest.mock("expo-sharing", () => ({}));
jest.mock("react-native-zip-archive", () => ({}));
jest.mock("@/db/queries/custom-protocols", () => ({ getCustomProtocolById: jest.fn() }));

// Mocks for the renderers: services/export.ts imports manifest.ts, which now
// imports modules/registry.ts (for the moduleRef branch), pulling in the
// Paisageo renderers transitively - pure UI, not tested here.
jest.mock("@/modules/paisageo/modules/geoecological-constraints/GeoecologicalConstraintsModuleRenderer", () => ({
  GeoecologicalConstraintsModuleRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/vegetation/VegetationModuleRenderer", () => ({
  VegetationModuleRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/impacts/ImpactsModuleRenderer", () => ({
  ImpactsModuleRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/geoecological-constraints/GeoecologicalConstraintsModuleReadOnlyRenderer", () => ({
  GeoecologicalConstraintsModuleReadOnlyRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/vegetation/VegetationModuleReadOnlyRenderer", () => ({
  VegetationModuleReadOnlyRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/impacts/ImpactsModuleReadOnlyRenderer", () => ({
  ImpactsModuleReadOnlyRenderer: () => null,
}));

import { customExporter } from "../services/export";
import { getCustomProtocolById } from "@/db/queries/custom-protocols";
import type { PointEnvelope, ProjectRef } from "@/protocol-kernel/types";
import type { CustomProtocol } from "@/types/database";

// extractMedia needs the schema to distinguish "notes_list" from "tags_input"
// (both store the same string[] JSON) - this test protocol has the two side
// by side in the same section, just like the real builder scenario.
const TEST_PROTOCOL: CustomProtocol = {
  id: 1,
  name: "Protocolo de teste",
  theme: "teste",
  schema: {
    sections: [
      {
        id: "section_1",
        title: "Seção 1",
        fields: [
          { key: "notas", type: "notes_list", label: "Notas de campo" },
          { key: "tags", type: "tags_input", label: "Tags" },
          { key: "fotos", type: "photo_input", label: "Fotos" },
          { key: "gravacoes", type: "audio_notes_input", label: "Gravações" },
        ],
      },
    ],
  },
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
};

const PROJECT: ProjectRef = { id: "1", name: "Projeto Teste", protocolId: "1" };

beforeEach(() => {
  (getCustomProtocolById as jest.Mock).mockResolvedValue(TEST_PROTOCOL);
});

function makePoint(modules: Record<string, unknown>): PointEnvelope {
  return {
    id: "1",
    projectId: "1",
    protocolId: "custom",
    pointNumber: 1,
    lat: 0,
    lon: 0,
    modules,
  };
}

describe("customExporter.extractMedia", () => {
  it("aggregates audio notes (JSON of AudioNote[]) found in the modules", async () => {
    const audioJson = JSON.stringify([
      { uri: "file:///audio1.m4a", duration: 12, timestamp: 1000 },
      { uri: "file:///audio2.m4a", duration: 8, timestamp: 2000 },
    ]);
    const point = makePoint({
      section_1: { gravacoes: audioJson, notas: "não é áudio" },
    });

    const media = await customExporter.extractMedia(point, PROJECT);

    expect(media.audioNotes).toHaveLength(2);
    expect(media.audioNotes[0]!.uri).toBe("file:///audio1.m4a");
    expect(media.audioNotes[1]!.uri).toBe("file:///audio2.m4a");
  });

  it("aggregates text notes (notes_list) via schema, without becoming a column", async () => {
    const point = makePoint({
      section_1: {
        notas: JSON.stringify(["primeira nota", "segunda nota"]),
        tags: JSON.stringify(["a", "b"]),
      },
    });

    const media = await customExporter.extractMedia(point, PROJECT);

    expect(media.notes).toEqual(["primeira nota", "segunda nota"]);
  });

  it("does not confuse tags_input (same JSON format) with text or audio notes", async () => {
    const point = makePoint({
      section_1: { tags: JSON.stringify(["a", "b"]) },
    });

    const media = await customExporter.extractMedia(point, PROJECT);

    expect(media.notes).toEqual([]);
    expect(media.audioNotes).toEqual([]);
  });

  it("recognizes photos in PhotoInput's current format (JSON of {uri,timestamp}[])", async () => {
    const fotosJson = JSON.stringify([
      { uri: "file:///photo1.jpg", timestamp: 1000 },
      { uri: "file:///photo2.jpg", timestamp: 2000 },
    ]);
    const point = makePoint({
      section_1: { fotos: fotosJson },
    });

    const media = await customExporter.extractMedia(point, PROJECT);

    expect(media.photos).toEqual(["file:///photo1.jpg", "file:///photo2.jpg"]);
  });

  it("still recognizes photos in the legacy format (raw array of file:// strings)", async () => {
    const point = makePoint({
      section_1: { fotos: ["file:///photo1.jpg", "file:///photo2.jpg"] },
    });

    const media = await customExporter.extractMedia(point, PROJECT);

    expect(media.photos).toEqual(["file:///photo1.jpg", "file:///photo2.jpg"]);
  });

  it("returns empty arrays when there is no media", async () => {
    const point = makePoint({ section_1: { tags: JSON.stringify([]) } });

    const media = await customExporter.extractMedia(point, PROJECT);

    expect(media.photos).toEqual([]);
    expect(media.audioNotes).toEqual([]);
    expect(media.notes).toEqual([]);
  });
});
