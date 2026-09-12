// Exercises the export -> import cycle for a point collected under a CUSTOM
// protocol whose module data embeds media fields (photo_input directly in a
// module, audio_notes_input nested inside a repeatable_group item) - as
// opposed to export-import-audio.test.ts, which only covers the point's own
// fixed photos/audio_notes columns.
//
// Before core/project-sharing/module-media.ts existed, export-points.ts and
// import-points.ts never looked inside envelope.modules at all, so a
// photo_input/audio_notes_input value nested in a custom protocol's module
// data kept its original device-local uri untouched through the whole
// round trip - it was never copied into the zip, and never re-materialized
// into Paths.document on import. This test fails on that old behavior (the
// uri stays identical to the original, and no bytes exist at it after
// import) and passes once module-media.ts's forEachModuleMediaField is wired
// into both sides.
import * as FakeFs from "./test-utils/fake-file-system";

jest.mock("expo-file-system", () => ({
  File: FakeFs.File,
  Directory: FakeFs.Directory,
  Paths: FakeFs.Paths,
}));
jest.mock("react-native-zip-archive", () => ({
  zip: FakeFs.zip,
  unzip: FakeFs.unzip,
}));
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  shareAsync: jest.fn(),
}));

const mockGetDocumentAsync = jest.fn();
jest.mock("expo-document-picker", () => ({
  getDocumentAsync: (...args: unknown[]) => mockGetDocumentAsync(...args),
}));

const mockGetPoint = jest.fn();
const mockCreatePoint = jest.fn();
const mockPointExists = jest.fn();
jest.mock("@/db/queries/points", () => ({
  getPoint: (...args: unknown[]) => mockGetPoint(...args),
  createPoint: (...args: unknown[]) => mockCreatePoint(...args),
  pointExists: (...args: unknown[]) => mockPointExists(...args),
}));

const mockGetProjectById = jest.fn();
jest.mock("@/db/queries/projects", () => ({
  getProjectById: (...args: unknown[]) => mockGetProjectById(...args),
}));

const mockGetCustomProtocolById = jest.fn();
jest.mock("@/db/queries/custom-protocols", () => ({
  getCustomProtocolById: (...args: unknown[]) => mockGetCustomProtocolById(...args),
  setCustomProtocolUuid: jest.fn(),
}));

jest.mock("@/core/local-identity/collector-code", () => ({
  getLocalCollectorCode: jest.fn().mockResolvedValue("PS"),
}));

jest.mock("@/utils/uuid", () => ({
  generateUuid: jest.fn(() => "uuid-mock"),
}));

// Real serializeModules() lives in core/drive-sync/project-sync-service.ts,
// which transitively imports the Drive API client and other unrelated
// db/queries modules - not relevant here. Its actual behavior for a custom
// protocol (registry.getProtocol("custom").modules is always []) is a plain
// per-module JSON.stringify fallback, so this mock reproduces exactly that
// instead of the export-import-audio.test.ts stub (which returns `{}` and
// would silently discard the module data this test needs to inspect).
jest.mock("@/core/drive-sync/project-sync-service", () => ({
  serializeModules: (modules: Record<string, unknown>) => {
    const out: Record<string, string> = {};
    for (const [moduleId, value] of Object.entries(modules)) {
      out[moduleId] = JSON.stringify(value);
    }
    return out;
  },
}));

// module-media.ts -> modules/custom/manifest.ts -> modules/registry.ts pulls
// in the Paisageo renderer bindings (pure UI) transitively - stub them out,
// same as modules/custom/__tests__/export.test.ts does for the same reason.
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

import { exportPointsPackage } from "../export-points";
import { importPointsPackage } from "../import-points";
import type { Point, Project, PointModule, CustomProtocol } from "@/types/database";
import type { ProtocolRegistry } from "@/protocol-kernel/types";

// buildPointWithModules (db/mappers/point.mapper.ts) looks up a descriptor
// via registry.getProtocol(point.protocol_id) - always undefined here, same
// as the custom protocol's own real registry entry (customManifest.modules
// is always []), so it falls back to plain JSON.parse(data_json) either way.
const registry = { getProtocol: jest.fn(() => undefined) } as unknown as ProtocolRegistry;

const project: Project = {
  id: 1,
  name: "Projeto Fauna",
  protocol_id: "7",
  protocol_source: "custom",
  created_at: "2026-01-01T00:00:00.000Z",
  last_updated: "2026-01-01T00:00:00.000Z",
  is_classified: 0,
  is_collaborative: 0,
  project_uuid: "project-uuid-1",
};

const customProtocol: CustomProtocol = {
  id: 7,
  name: "Fauna",
  theme: "fauna",
  uuid: "custom-protocol-uuid-1",
  schema: {
    sections: [
      {
        id: "sightings",
        title: "Avistamentos",
        fields: [
          { key: "foto_animal", type: "photo_input", label: "Foto do Animal" },
          {
            key: "registros",
            type: "repeatable_group",
            label: "Registros",
            itemFields: [{ key: "gravacao", type: "audio_notes_input", label: "Gravação" }],
          },
        ],
      },
    ],
  },
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const originalPhotoUri = "device://photos/animal.jpg";
const originalAudioUri = "device://audio/call.m4a";

const moduleDataJson = JSON.stringify({
  foto_animal: JSON.stringify([{ uri: originalPhotoUri, timestamp: 111 }]),
  registros: [{ gravacao: JSON.stringify([{ uri: originalAudioUri, duration: 3.5, timestamp: 222 }]) }],
});

const point: Point = {
  id: "point-1",
  project_id: 1,
  protocol_id: "7",
  point_number: 1,
  lat: -8.05,
  lon: -34.9,
  altitude: null,
  generated_name: "Ponto 1",
  landscape_class_id: null,
  photos: null,
  audio_notes: null,
  additional_notes: null,
  point_size: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  created_by: "PS",
  approval_status: "local",
  rejection_reason: null,
  drive_synced_at: null,
};

const pointModules: PointModule[] = [
  { point_id: "point-1", module_id: "sightings", schema_version: "1.0.0", data_json: moduleDataJson },
];

describe("export -> import cycle rewrites media embedded in custom-protocol module fields", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FakeFs.__resetFakeFileSystem();

    FakeFs.__setFile(originalPhotoUri, "PHOTO_BYTES");
    FakeFs.__setFile(originalAudioUri, "AUDIO_BYTES");

    mockGetPoint.mockResolvedValue({ point, modules: pointModules });
    mockGetProjectById.mockResolvedValue(project);
    mockGetCustomProtocolById.mockResolvedValue(customProtocol);
    mockPointExists.mockResolvedValue(false);
    mockCreatePoint.mockResolvedValue("point-1");
  });

  it("copies a photo_input field's file and rewrites its uri to a new local file", async () => {
    await exportPointsPackage(["point-1"], registry);

    const [zipUri] = FakeFs.__archivePaths();
    mockGetDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: zipUri }] });

    const result = await importPointsPackage(1, registry);

    expect(result.rejected).toEqual([]);
    expect(result.imported).toBe(1);

    const createPointInput = mockCreatePoint.mock.calls[0][0];
    const sightingsModule = JSON.parse(createPointInput.modules.sightings);
    const importedPhotos = JSON.parse(sightingsModule.foto_animal);

    expect(importedPhotos).toHaveLength(1);
    expect(importedPhotos[0].uri).not.toBe(originalPhotoUri);
    expect(typeof importedPhotos[0].uri).toBe("string");
    expect(FakeFs.__getFile(importedPhotos[0].uri)).toBe("PHOTO_BYTES");
  });

  it("copies an audio_notes_input field nested in a repeatable_group item and rewrites its uri", async () => {
    await exportPointsPackage(["point-1"], registry);

    const [zipUri] = FakeFs.__archivePaths();
    mockGetDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: zipUri }] });

    await importPointsPackage(1, registry);

    const createPointInput = mockCreatePoint.mock.calls[0][0];
    const sightingsModule = JSON.parse(createPointInput.modules.sightings);
    const importedAudioNotes = JSON.parse(sightingsModule.registros[0].gravacao);

    expect(importedAudioNotes).toHaveLength(1);
    const [note] = importedAudioNotes;

    expect(note.duration).toBe(3.5);
    expect(note.timestamp).toBe(222);
    expect(note.uri).not.toBe(originalAudioUri);
    expect(FakeFs.__getFile(note.uri)).toBe("AUDIO_BYTES");
  });
});
