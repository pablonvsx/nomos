/**
 * Section 14.2 / 14.7 proof test: export -> real .zip -> import, on a REAL
 * filesystem. After importPointsPackage() has returned (and its temporary
 * extraction directory has been deleted), every media path saved on the new
 * point must still exist and hold the original bytes.
 */
import * as fs from "fs";
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
  seedCollaboratorProject,
  seedOwnerProject,
  seedPoint,
  projects,
  points,
  type FakePointRow,
} from "./fixtures/fake-environment";

jest.mock("expo-file-system", () => ({
  File: RealFile,
  Directory: RealDirectory,
  Paths: RealPaths,
}));
jest.mock("react-native-zip-archive", () => ({ zip: realZip, unzip: realUnzip }));

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
          },
        }
      : null,
  ),
}));

const shareAsyncMock = jest.fn(async (..._args: unknown[]) => {});
jest.mock("expo-sharing", () => ({
  shareAsync: (...args: unknown[]) => shareAsyncMock(...args),
  isAvailableAsync: async () => true,
}));

const getDocumentAsyncMock = jest.fn();
jest.mock("expo-document-picker", () => ({
  getDocumentAsync: (...args: unknown[]) => getDocumentAsyncMock(...args),
}));

jest.mock("@/core/local-identity/collector-code", () => ({
  getLocalCollectorCode: jest.fn(async () => "ABCD"),
}));
jest.mock("@/core/local-identity/connected-account", () => ({
  getConnectedGoogleAccountEmail: jest.fn(async () => null),
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
    id: Math.max(0, ...points.map((p) => p.id)) + 1,
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
  updatePoint: jest.fn(async (id: number, updates: any) => {
    const row = points.find((p) => p.id === id);
    if (!row) return false;
    if (updates.photos !== undefined) row.photos = updates.photos;
    if (updates.audio_notes !== undefined) row.audio_notes = updates.audio_notes;
    if (updates.approval_status !== undefined) row.approval_status = updates.approval_status;
    if (updates.created_by !== undefined) row.created_by = updates.created_by;
    if (updates.modules !== undefined) {
      row.rawModules = Object.entries(updates.modules).map(([module_id, data_json]) => ({
        module_id,
        schema_version: updates.schema_version ?? "1.0",
        data_json: data_json as string,
      }));
    }
    return true;
  }),
  getPointByProjectAndUuid: jest.fn(
    async (projectId: number, uuid: string) =>
      points.find((p) => p.project_id === projectId && p.uuid === uuid) ?? null,
  ),
}));

import { exportAllPointsPackage } from "../export-points";
import { importPointsPackage, resolvePointDuplicate } from "../import-points";

const PHOTO_BYTES = Buffer.from("fake-jpeg-bytes-0123456789");
const AUDIO_BYTES = Buffer.from("fake-m4a-bytes-abcdefghijklmnop");

function localPath(uri: string): string {
  return uri.startsWith("file://") ? uri.slice("file://".length) : uri;
}

function expectFileWithBytes(uri: string, bytes: Buffer) {
  expect({ uri, exists: fs.existsSync(localPath(uri)) }).toEqual({ uri, exists: true });
  expect(fs.readFileSync(localPath(uri))).toEqual(bytes);
}

/** Pulls every uri out of a module field that stores a JSON list as text. */
function uriList(moduleJson: string, fieldKey: string): string[] {
  const data = JSON.parse(moduleJson);
  return (JSON.parse(data[fieldKey]) as Array<{ uri: string }>).map((item) => item.uri);
}

function pickZip(zipUri: string) {
  getDocumentAsyncMock.mockResolvedValue({ canceled: false, assets: [{ uri: zipUri }] });
}

async function exportCustomPoint() {
  const photoUri = createDeviceMedia("module-photo.jpg", PHOTO_BYTES);
  const audioUri = createDeviceMedia("module-note.m4a", AUDIO_BYTES);
  const sender = seedCollaboratorProject({ protocol_id: "7", protocol_source: "custom", project_uuid: "shared-project" });
  seedPoint(sender.id, {
    uuid: "pt-1",
    rawModules: [
      {
        module_id: "section_1",
        schema_version: "1.0",
        data_json: JSON.stringify({
          fotos: JSON.stringify([{ uri: photoUri, timestamp: 1 }]),
          gravacoes: JSON.stringify([{ uri: audioUri, duration: 3, timestamp: 2 }]),
        }),
      },
    ],
  });
  await exportAllPointsPackage(sender.id);
  const zipUri = shareAsyncMock.mock.calls[0][0] as string;
  const receiver = seedOwnerProject({ protocol_id: "7", protocol_source: "custom", project_uuid: "shared-project" });
  return { zipUri, receiver };
}


async function exportCustomPointWithGroups() {
  const uri = {
    top: createDeviceMedia("g-top.jpg", Buffer.from("top-bytes")),
    i0photo: createDeviceMedia("g-i0.jpg", Buffer.from("i0-photo-bytes")),
    i0audio: createDeviceMedia("g-i0.m4a", Buffer.from("i0-audio-bytes")),
    i1photo: createDeviceMedia("g-i1.jpg", Buffer.from("i1-photo-bytes")),
    i1audio: createDeviceMedia("g-i1.m4a", Buffer.from("i1-audio-bytes")),
  };
  const sender = seedCollaboratorProject({ protocol_id: "7", protocol_source: "custom", project_uuid: "shared-project" });
  seedPoint(sender.id, {
    uuid: "pt-1",
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
  await exportAllPointsPackage(sender.id);
  const zipUri = shareAsyncMock.mock.calls[0][0] as string;
  const receiver = seedOwnerProject({ protocol_id: "7", protocol_source: "custom", project_uuid: "shared-project" });
  return { zipUri, receiver };
}

/** Every media uri found in a point's imported module data (top level and group items). */
function importedMediaUris(moduleJson: string): { top: string; groups: string[] } {
  const data = JSON.parse(moduleJson);
  const first = (value: string) => (JSON.parse(value) as Array<{ uri: string }>)[0].uri;
  return {
    top: first(data.fotos),
    groups: data.grupo.flatMap((item: Record<string, string>) => [first(item.foto_item), first(item.audio_item)]),
  };
}

beforeEach(() => {
  resetRealFs();
  resetFakeDb();
  shareAsyncMock.mockClear();
  getDocumentAsyncMock.mockReset();
  createPointMock.mockClear();
});

afterAll(() => {
  removeRealFs();
});

describe("points package round trip on a real filesystem", () => {
  it("custom protocol: module photo/audio exist at their saved paths AFTER import returned", async () => {
    const { zipUri, receiver } = await exportCustomPoint();
    pickZip(zipUri);

    const result = await importPointsPackage(receiver.id);

    expect(result).toMatchObject({ imported: 1, missingMedia: 0 });
    const imported = points.find((p) => p.project_id === receiver.id)!;
    const moduleJson = imported.rawModules[0].data_json;
    expect(moduleJson).not.toContain("package-media:");

    const [photoUri] = uriList(moduleJson, "fotos");
    const [audioUri] = uriList(moduleJson, "gravacoes");
    // Persisted under the app's document directory, not the (deleted) extraction dir.
    expect(photoUri).toContain("/document/imported_points_media/pt-1/modules/");
    expect(audioUri).toContain("/document/imported_points_media/pt-1/modules/");
    expectFileWithBytes(photoUri, PHOTO_BYTES);
    expectFileWithBytes(audioUri, AUDIO_BYTES);
  });

  it("official protocol: point photo/audio exist at their saved paths AFTER import returned", async () => {
    const photoUri = createDeviceMedia("photo.jpg", PHOTO_BYTES);
    const audioUri = createDeviceMedia("note.m4a", AUDIO_BYTES);
    const sender = seedCollaboratorProject({ project_uuid: "shared-project" });
    seedPoint(sender.id, {
      uuid: "pt-1",
      photos: JSON.stringify([{ uri: photoUri, timestamp: 1 }]),
      audio_notes: JSON.stringify([{ uri: audioUri, duration: 3, timestamp: 2 }]),
    });
    await exportAllPointsPackage(sender.id);
    const receiver = seedOwnerProject({ project_uuid: "shared-project" });
    pickZip(shareAsyncMock.mock.calls[0][0] as string);

    const result = await importPointsPackage(receiver.id);

    expect(result).toMatchObject({ imported: 1, missingMedia: 0 });
    const imported = points.find((p) => p.project_id === receiver.id)!;
    const [photo] = JSON.parse(imported.photos!) as Array<{ uri: string }>;
    const [audio] = JSON.parse(imported.audio_notes!) as Array<{ uri: string }>;
    expectFileWithBytes(photo.uri, PHOTO_BYTES);
    expectFileWithBytes(audio.uri, AUDIO_BYTES);
  });

  it("replacing a duplicate restores module media at a persisted path too", async () => {
    const { zipUri, receiver } = await exportCustomPoint();
    pickZip(zipUri);
    await importPointsPackage(receiver.id); // first import creates the point
    pickZip(zipUri);

    const second = await importPointsPackage(receiver.id); // same uuid -> duplicate
    expect(second).toMatchObject({ imported: 0 });
    expect(second!.duplicates).toHaveLength(1);

    await resolvePointDuplicate(second!.duplicates[0], "replace");

    const replaced = points.find((p) => p.project_id === receiver.id)!;
    const moduleJson = replaced.rawModules[0].data_json;
    expect(moduleJson).not.toContain("package-media:");
    expectFileWithBytes(uriList(moduleJson, "fotos")[0], PHOTO_BYTES);
    expectFileWithBytes(uriList(moduleJson, "gravacoes")[0], AUDIO_BYTES);
  });

  it("custom protocol: every media of repeatable_group items exists at its saved path AFTER import returned", async () => {
    const { zipUri, receiver } = await exportCustomPointWithGroups();
    pickZip(zipUri);

    const result = await importPointsPackage(receiver.id);

    expect(result).toMatchObject({ imported: 1, missingMedia: 0 });
    const moduleJson = points.find((p) => p.project_id === receiver.id)!.rawModules[0].data_json;
    expect(moduleJson).not.toContain("package-media:");
    const media = importedMediaUris(moduleJson);
    expectFileWithBytes(media.top, Buffer.from("top-bytes"));
    expect(media.groups).toHaveLength(4);
    expect(new Set(media.groups).size).toBe(4);
    // Persisted under the app's document directory, not the sender's device path.
    for (const uri of [media.top, ...media.groups]) {
      expect(uri).toContain("/document/imported_points_media/pt-1/modules/");
    }
    expectFileWithBytes(media.groups[0], Buffer.from("i0-photo-bytes"));
    expectFileWithBytes(media.groups[1], Buffer.from("i0-audio-bytes"));
    expectFileWithBytes(media.groups[2], Buffer.from("i1-photo-bytes"));
    expectFileWithBytes(media.groups[3], Buffer.from("i1-audio-bytes"));
    expect(JSON.parse(moduleJson).grupo.map((i: { nome: string }) => i.nome)).toEqual(["item 0", "item 1"]);
  });

  it("replacing a duplicate restores repeatable_group media at persisted paths too", async () => {
    const { zipUri, receiver } = await exportCustomPointWithGroups();
    pickZip(zipUri);
    await importPointsPackage(receiver.id);
    pickZip(zipUri);
    const second = await importPointsPackage(receiver.id);
    expect(second!.duplicates).toHaveLength(1);

    await resolvePointDuplicate(second!.duplicates[0], "replace");

    const moduleJson = points.find((p) => p.project_id === receiver.id)!.rawModules[0].data_json;
    expect(moduleJson).not.toContain("package-media:");
    const media = importedMediaUris(moduleJson);
    for (const uri of media.groups) {
      expect(uri).toContain("/document/imported_points_media/pt-1/modules/");
    }
    expectFileWithBytes(media.groups[0], Buffer.from("i0-photo-bytes"));
    expectFileWithBytes(media.groups[3], Buffer.from("i1-audio-bytes"));
  });

  it("a group media file that points.json claims but the zip lacks is counted in missingMedia, never saved as a dead path", async () => {
    const { zipUri, receiver } = await exportCustomPointWithGroups();
    const zip = await openZip(zipUri);
    const target = Object.keys(zip.files).find((n) => n.endsWith(".m4a"))!;
    zip.remove(target);
    const brokenZipPath = localPath(zipUri).replace(/\.zip$/, "-broken-group.zip");
    fs.writeFileSync(brokenZipPath, await zip.generateAsync({ type: "nodebuffer" }));
    pickZip(`file://${brokenZipPath}`);

    const result = await importPointsPackage(receiver.id);

    expect(result!.missingMedia).toBe(1);
    const data = JSON.parse(points.find((p) => p.project_id === receiver.id)!.rawModules[0].data_json);
    const counts = data.grupo.map(
      (item: Record<string, string>) => JSON.parse(item.audio_item).length as number,
    );
    expect(counts.sort()).toEqual([0, 1]);
  });

  it("compatibility: an older package whose group items hold plain uris (no markers) imports exactly as before", async () => {
    const sender = seedCollaboratorProject({ protocol_id: "7", protocol_source: "custom", project_uuid: "shared-project" });
    const legacyData = JSON.stringify({
      grupo: [{ foto_item: JSON.stringify([{ uri: "file:///old-device/photo.jpg", timestamp: 1 }]), nome: "legacy" }],
    });
    seedPoint(sender.id, {
      uuid: "pt-legacy",
      rawModules: [{ module_id: "section_1", schema_version: "1.0", data_json: legacyData }],
    });
    await exportAllPointsPackage(sender.id);
    // Simulate a package built before group media existed: rewrite the exported JSON back to plain uris.
    const zipUri = shareAsyncMock.mock.calls[0][0] as string;
    const zip = await openZip(zipUri);
    const pkg = JSON.parse(await zip.file("points.json")!.async("string"));
    pkg.points[0].modules["section_1"] = legacyData;
    zip.file("points.json", JSON.stringify(pkg));
    const legacyZipPath = localPath(zipUri).replace(/\.zip$/, "-legacy.zip");
    fs.writeFileSync(legacyZipPath, await zip.generateAsync({ type: "nodebuffer" }));
    const receiver = seedOwnerProject({ protocol_id: "7", protocol_source: "custom", project_uuid: "shared-project" });
    pickZip(`file://${legacyZipPath}`);

    const result = await importPointsPackage(receiver.id);

    expect(result).toMatchObject({ imported: 1, missingMedia: 0 });
    const saved = points.find((p) => p.project_id === receiver.id)!.rawModules[0].data_json;
    expect(JSON.parse(saved)).toEqual(JSON.parse(legacyData));
  });

  it("a media file that points.json claims but the zip lacks is counted and never saved as a dead path", async () => {
    const { zipUri, receiver } = await exportCustomPoint();
    // Remove the photo binary from the real zip, leaving its reference in points.json.
    const zip = await openZip(zipUri);
    const photoEntry = Object.keys(zip.files).find((n) => n.startsWith("media/") && n.endsWith(".jpg"))!;
    zip.remove(photoEntry);
    const brokenZipPath = localPath(zipUri).replace(/\.zip$/, "-broken.zip");
    fs.writeFileSync(brokenZipPath, await zip.generateAsync({ type: "nodebuffer" }));
    pickZip(`file://${brokenZipPath}`);

    const result = await importPointsPackage(receiver.id);

    expect(result!.missingMedia).toBe(1);
    const imported = points.find((p) => p.project_id === receiver.id)!;
    const moduleJson = imported.rawModules[0].data_json;
    expect(uriList(moduleJson, "fotos")).toEqual([]);
    expectFileWithBytes(uriList(moduleJson, "gravacoes")[0], AUDIO_BYTES);
  });
});
