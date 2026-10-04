// The point of making restore "always complete": whatever backupPoint puts on
// Drive, restoreOwnProjectFromDrive must be able to bring back in full. This
// suite wires the REAL backup-service and restore-service to one shared
// in-memory Drive and checks the restored point's media paths exist and hold
// the original bytes - for the point-level columns AND for the module media
// of a custom protocol.

import { FakeFile, FakeDirectory, FakePaths, resetFakeFs, fsState } from "../../project-sharing/__tests__/fixtures/fake-environment";

jest.mock("expo-file-system", () => ({ File: FakeFile, Directory: FakeDirectory, Paths: FakePaths }));

// ---- One shared fake Drive ----
interface DriveNode {
  id: string;
  name: string;
  parentId: string;
  mimeType: string;
  json?: unknown;
  bytes?: string;
  modifiedTime: string;
}
let nodes = new Map<string, DriveNode>();
let nextNodeId = 1;

const childrenOf = (parentId: string) => [...nodes.values()].filter((n) => n.parentId === parentId);
const toDriveFile = (n: DriveNode) => ({ id: n.id, name: n.name, mimeType: n.mimeType, modifiedTime: n.modifiedTime });

function createNode(partial: Omit<DriveNode, "id" | "modifiedTime">): DriveNode {
  const node: DriveNode = { id: `node-${nextNodeId++}`, modifiedTime: "2026-05-06T07:08:09.000Z", ...partial };
  nodes.set(node.id, node);
  return node;
}

jest.mock("@/core/drive-sync/drive-api-client", () => ({
  ensureFolder: async (name: string, parentId: string) => {
    const existing = childrenOf(parentId).find((n) => n.name === name);
    return existing ? existing.id : createNode({ name, parentId, mimeType: "application/vnd.google-apps.folder" }).id;
  },
  findChildByName: async (parentId: string, name: string) => {
    const found = childrenOf(parentId).find((n) => n.name === name);
    return found ? toDriveFile(found) : null;
  },
  listChildren: async (parentId: string) => childrenOf(parentId).map(toDriveFile),
  uploadBinaryFile: async (name: string, parentId: string, localUri: string, mimeType: string) =>
    toDriveFile(createNode({ name, parentId, mimeType, bytes: fsState.get(localUri)?.content })),
  updateBinaryFile: async (fileId: string, localUri: string) => {
    nodes.get(fileId)!.bytes = fsState.get(localUri)?.content;
    return toDriveFile(nodes.get(fileId)!);
  },
  uploadJsonFile: async (name: string, parentId: string, content: unknown) =>
    toDriveFile(createNode({ name, parentId, mimeType: "application/json", json: JSON.parse(JSON.stringify(content)) })),
  updateJsonFile: async (fileId: string, content: unknown) => {
    nodes.get(fileId)!.json = JSON.parse(JSON.stringify(content));
    return toDriveFile(nodes.get(fileId)!);
  },
  readJsonFile: async (fileId: string) => nodes.get(fileId)!.json,
  downloadBinaryFile: async (fileId: string, destinationUri: string) => {
    fsState.set(destinationUri, { isDir: false, content: nodes.get(fileId)!.bytes });
  },
}));

jest.mock("@/core/drive-sync/project-drive-service", () => ({
  getManifest: async () => ({
    project_uuid: "project-uuid-1",
    project_name: "Projeto",
    protocol_id: "7",
    protocol_source: "custom",
    owner_email: "owner@example.com",
    active_vegetation_classification: { type: "standard" },
  }),
}));
jest.mock("@/core/google-auth/google-auth-service", () => ({
  getCurrentGoogleAccount: () => ({ email: "owner@example.com", name: "Owner" }),
}));
jest.mock("@/core/project-sharing/project-config-package", () => ({
  sanitizeSpeciesSource: (v: string) => v,
  parseImportedCommonNames: () => [],
}));
jest.mock("@/core/project-sharing/import-points", () => ({ IMPORTED_MEDIA_DIR: "imported_points_media" }));

jest.mock("@/db/queries/custom-protocols", () => {
  const protocol = {
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
  };
  return {
    getCustomProtocolById: async () => protocol,
    getCustomProtocolByUuid: async () => null,
    createCustomProtocolWithUuid: async () => 7,
  };
});

const createdPoints: any[] = [];
const pointRow: any = {
  id: 1,
  project_id: 1,
  protocol_id: "7",
  point_number: 1,
  lat: -8,
  lon: -34,
  altitude: null,
  generated_name: null,
  landscape_class_id: null,
  photos: JSON.stringify([{ uri: "file:///capture/col-photo.jpg", timestamp: 1 }]),
  audio_notes: JSON.stringify([{ uri: "file:///capture/col-note.m4a", duration: 4, timestamp: 2 }]),
  additional_notes: null,
  point_size: null,
  created_at: "2026-01-01T00:00:00.000Z",
  created_by: "ABCD",
  approval_status: "approved",
  drive_synced_at: null,
  uuid: "point-uuid-1",
};
const moduleRow = {
  module_id: "section_1",
  schema_version: "1.0",
  data_json: JSON.stringify({
    fotos: JSON.stringify([{ uri: "file:///capture/mod-photo.jpg", timestamp: 3 }]),
    gravacoes: JSON.stringify([{ uri: "file:///capture/mod-note.m4a", duration: 5, timestamp: 4 }]),
    grupo: [
      {
        foto_item: JSON.stringify([{ uri: "file:///capture/g0-photo.jpg", timestamp: 5 }]),
        audio_item: JSON.stringify([{ uri: "file:///capture/g0-note.m4a", duration: 2, timestamp: 6 }]),
        nome: "item 0",
      },
      {
        foto_item: JSON.stringify([{ uri: "file:///capture/g1-photo.jpg", timestamp: 7 }]),
        audio_item: "[]",
        nome: "item 1",
      },
    ],
  }),
};
jest.mock("@/db/queries/points", () => ({
  getPoint: async () => ({ point: pointRow, modules: [moduleRow] }),
  ensurePointUuid: async () => "point-uuid-1",
  getApprovedUnsyncedPointsByProject: async () => [],
  updatePoint: async (_id: number, updates: any) => {
    if (updates.drive_synced_at !== undefined) pointRow.drive_synced_at = updates.drive_synced_at;
    return true;
  },
  createPoint: async (input: unknown) => {
    createdPoints.push(input);
    return createdPoints.length;
  },
}));
jest.mock("@/db/queries/projects", () => ({
  getProjectById: async () => ({
    id: 1,
    collaboration_role: "owner",
    drive_folder_id: "root",
    protocol_id: "7",
    protocol_source: "custom",
  }),
  getProjectByUuid: async () => null,
  createProject: async () => 2,
  setProjectAsOwner: async () => true,
  deleteProject: async () => true,
}));
jest.mock("@/db/queries/project-species", () => ({
  createProjectSpecies: async () => 1,
  getProjectSpeciesByUuid: async () => null,
}));
jest.mock("@/db/queries/vegetation-classifications", () => ({
  createVegetationClassification: async () => 1,
  getVegetationClassificationByUuid: async () => null,
  setActiveVegetationClassification: async () => true,
  setVegetationClassificationUuid: async () => undefined,
}));

import { backupPoint } from "../backup-service";
import { restoreOwnProjectFromDrive } from "../restore-service";

const MEDIA: Record<string, string> = {
  "file:///capture/col-photo.jpg": "column-photo-bytes",
  "file:///capture/col-note.m4a": "column-audio-bytes",
  "file:///capture/mod-photo.jpg": "module-photo-bytes",
  "file:///capture/mod-note.m4a": "module-audio-bytes",
  "file:///capture/g0-photo.jpg": "group0-photo-bytes",
  "file:///capture/g0-note.m4a": "group0-audio-bytes",
  "file:///capture/g1-photo.jpg": "group1-photo-bytes",
};

beforeEach(() => {
  resetFakeFs();
  nodes = new Map();
  nextNodeId = 1;
  createdPoints.length = 0;
  pointRow.drive_synced_at = null;
  for (const [uri, content] of Object.entries(MEDIA)) fsState.set(uri, { isDir: false, content });
  // The project folder on Drive already holds protocol-package.json (written at backup activation).
  nodes.set("root", { id: "root", name: "Projeto", parentId: "", mimeType: "application/vnd.google-apps.folder", modifiedTime: "x" });
  createNode({
    name: "protocol-package.json",
    parentId: "root",
    mimeType: "application/json",
    json: { uuid: "protocol-uuid-1", name: "Custom", theme: "t", schema: { sections: [] } },
  });
});

describe("backup -> restore round trip", () => {
  it("a restored point gets back its column media AND its module media, as existing files with the original bytes", async () => {
    const backup = await backupPoint("1");
    expect(backup.success).toBe(true);

    const result = await restoreOwnProjectFromDrive("root");

    expect(result).toMatchObject({ imported: 1, mediaDownloaded: 7 });
    const restored = createdPoints[0];

    const [photo] = JSON.parse(restored.photos) as Array<{ uri: string }>;
    const [audio] = JSON.parse(restored.audio_notes) as Array<{ uri: string }>;
    expect(new FakeFile(photo.uri).exists).toBe(true);
    expect(fsState.get(photo.uri)!.content).toBe("column-photo-bytes");
    expect(fsState.get(audio.uri)!.content).toBe("column-audio-bytes");

    const moduleData = JSON.parse(restored.modules.section_1);
    const [modPhoto] = JSON.parse(moduleData.fotos) as Array<{ uri: string }>;
    const [modAudio] = JSON.parse(moduleData.gravacoes) as Array<{ uri: string }>;
    expect(JSON.stringify(restored.modules)).not.toContain("package-media:");
    expect(JSON.stringify(restored.modules)).not.toContain("file:///capture");
    expect(fsState.get(modPhoto.uri)!.content).toBe("module-photo-bytes");
    expect(fsState.get(modAudio.uri)!.content).toBe("module-audio-bytes");

    // Media inside repeatable_group items comes back too, item by item.
    expect(moduleData.grupo.map((i: { nome: string }) => i.nome)).toEqual(["item 0", "item 1"]);
    const first = (value: string) => (JSON.parse(value) as Array<{ uri: string }>)[0].uri;
    expect(fsState.get(first(moduleData.grupo[0].foto_item))!.content).toBe("group0-photo-bytes");
    expect(fsState.get(first(moduleData.grupo[0].audio_item))!.content).toBe("group0-audio-bytes");
    expect(fsState.get(first(moduleData.grupo[1].foto_item))!.content).toBe("group1-photo-bytes");

    // Already on Drive: the restored point must not be offered for backup again.
    expect(restored.drive_synced_at).toBe("2026-05-06T07:08:09.000Z");
  });
});
