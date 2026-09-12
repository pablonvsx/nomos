// Exercises the full exportPointsPackage -> importPointsPackage cycle for a
// point carrying an audio note, using a shared in-memory fake filesystem
// (test-utils/fake-file-system.ts) instead of touching the native one -
// same approach as the other jest.mock("expo-file-system", ...) tests in
// this codebase (modules/custom/__tests__/export.test.ts), just with a
// working fake instead of an empty stub, since here the point of the test
// is to prove bytes and metadata actually survive the round trip.
//
// PointEnvelope.audioNotes is `{ uri, duration, timestamp }[]` (unlike
// photos, which are plain `string[]` after parsePhotoUris) - export must
// rewrite `uri` to a package-relative filename while leaving `duration`/
// `timestamp` untouched, and import must do the reverse when materializing
// a new local uri. This test fails if either field gets dropped anywhere
// along the way.
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

jest.mock("@/db/queries/custom-protocols", () => ({
  getCustomProtocolById: jest.fn(),
  setCustomProtocolUuid: jest.fn(),
}));

jest.mock("@/core/local-identity/collector-code", () => ({
  getLocalCollectorCode: jest.fn().mockResolvedValue("PS"),
}));

jest.mock("@/utils/uuid", () => ({
  generateUuid: jest.fn(() => "uuid-mock"),
}));

// import-points.ts only needs serializeModules() from this module - avoid
// pulling in the real project-sync-service.ts, which transitively imports
// the Drive API client, google-auth-service, and several other db/queries
// modules that aren't relevant here.
jest.mock("@/core/drive-sync/project-sync-service", () => ({
  serializeModules: jest.fn(() => ({})),
}));

// export-points.ts/import-points.ts now also import
// core/project-sharing/module-media.ts (to rewrite media embedded in custom
// protocol module fields, see export-import-module-media.test.ts), which
// transitively pulls in modules/custom/manifest.ts -> modules/registry.ts ->
// the Paisageo renderer bindings (pure UI, not relevant to this test) - stub
// them out the same way modules/custom/__tests__/export.test.ts does.
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
import type { Point, Project } from "@/types/database";
import type { ProtocolRegistry } from "@/protocol-kernel/types";

const registry = { getProtocol: jest.fn(() => undefined) } as unknown as ProtocolRegistry;

const project: Project = {
  id: 1,
  name: "Projeto Teste",
  protocol_id: "paisageo",
  protocol_source: "official",
  created_at: "2026-01-01T00:00:00.000Z",
  last_updated: "2026-01-01T00:00:00.000Z",
  is_classified: 0,
  is_collaborative: 0,
  project_uuid: "project-uuid-1",
};

const originalPhotoUri = "device://photos/photo1.jpg";
const originalAudioUri = "device://audio/note1.m4a";

const point: Point = {
  id: "point-1",
  project_id: 1,
  protocol_id: "paisageo",
  point_number: 1,
  lat: -8.05,
  lon: -34.9,
  altitude: null,
  generated_name: "Ponto 1",
  landscape_class_id: null,
  photos: JSON.stringify([{ uri: originalPhotoUri, timestamp: 1000 }]),
  audio_notes: JSON.stringify([{ uri: originalAudioUri, duration: 12.5, timestamp: 2000 }]),
  additional_notes: null,
  point_size: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  created_by: "PS",
  approval_status: "local",
  rejection_reason: null,
  drive_synced_at: null,
};

describe("export -> import cycle preserves audio notes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FakeFs.__resetFakeFileSystem();

    FakeFs.__setFile(originalPhotoUri, "PHOTO_BYTES");
    FakeFs.__setFile(originalAudioUri, "AUDIO_BYTES");

    mockGetPoint.mockResolvedValue({ point, modules: [] });
    mockGetProjectById.mockResolvedValue(project);
    mockPointExists.mockResolvedValue(false);
    mockCreatePoint.mockResolvedValue("point-1");
  });

  it("carries duration and timestamp (not just uri) through export and import", async () => {
    await exportPointsPackage(["point-1"], registry);

    const archivePaths = FakeFs.__archivePaths();
    expect(archivePaths).toHaveLength(1);
    const [zipUri] = archivePaths;

    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: zipUri }],
    });

    const result = await importPointsPackage(1, registry);

    expect(result.rejected).toEqual([]);
    expect(result.imported).toBe(1);
    expect(mockCreatePoint).toHaveBeenCalledTimes(1);

    const createPointInput = mockCreatePoint.mock.calls[0][0];

    const importedAudioNotes = JSON.parse(createPointInput.audio_notes);
    expect(importedAudioNotes).toHaveLength(1);
    const [importedNote] = importedAudioNotes;

    // The metadata must survive untouched...
    expect(importedNote.duration).toBe(12.5);
    expect(importedNote.timestamp).toBe(2000);
    // ...while the uri is rewritten to a new local file, not the original
    // device-specific one.
    expect(importedNote.uri).not.toBe(originalAudioUri);
    expect(typeof importedNote.uri).toBe("string");

    // And the actual bytes travelled through the zip, not just the metadata.
    expect(FakeFs.__getFile(importedNote.uri)).toBe("AUDIO_BYTES");

    // Sanity check that photos (a plain string[] field) still round-trip too.
    const importedPhotos = JSON.parse(createPointInput.photos);
    expect(importedPhotos).toHaveLength(1);
    expect(importedPhotos[0].uri).not.toBe(originalPhotoUri);
    expect(FakeFs.__getFile(importedPhotos[0].uri)).toBe("PHOTO_BYTES");
  });
});
