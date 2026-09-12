// resolvePointDuplicate is how the owner acts on a PendingDuplicate returned
// by importPointsPackage (see import-duplicates.test.ts):
// 'replace' overwrites the existing local point with the incoming data and
// resets approval_status to 'pending'; 'discard' must clean up the media
// files already materialized at import time (orphaned storage otherwise),
// without touching the database at all.
import * as FakeFs from "./test-utils/fake-file-system";

jest.mock("expo-file-system", () => ({
  File: FakeFs.File,
  Directory: FakeFs.Directory,
  Paths: FakeFs.Paths,
}));

const mockUpdatePoint = jest.fn();
jest.mock("@/db/queries/points", () => ({
  updatePoint: (...args: unknown[]) => mockUpdatePoint(...args),
}));

jest.mock("@/core/drive-sync/project-sync-service", () => ({
  serializeModules: jest.fn(() => ({})),
}));

// deletePointEnvelopeMediaFiles (now shared with project-rejected/[id].tsx's
// permanent-delete action, see RELATORIO_AUDITORIA_COLABORACAO.md Importante
// 3) is exercised for real here, not re-mocked - only its own heavy
// transitive dependencies (the custom-protocol DB query and the Paisageo
// module-descriptor chain, neither reachable for this test's official-
// protocol project) are stubbed out.
jest.mock("@/db/queries/custom-protocols", () => ({
  getCustomProtocolById: jest.fn(),
}));
jest.mock("@/modules/custom/manifest", () => ({
  buildCustomModuleDescriptor: jest.fn(),
}));

import { resolvePointDuplicate } from "../resolve-duplicates";
import type { PendingDuplicate } from "../import-points";
import type { Project } from "@/types/database";
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
  collaboration_role: "owner",
  project_uuid: "project-uuid-1",
};

const persistedPhotoUri = "mock-document/import_point-1_0_photo.jpg";

const duplicate: PendingDuplicate = {
  pointId: "point-1",
  pointLabel: "PS-1",
  incomingEnvelope: {
    id: "point-1",
    projectId: "1",
    protocolId: "paisageo",
    pointNumber: 1,
    lat: -8.05,
    lon: -34.9,
    generatedName: "Ponto Corrigido",
    modules: {},
    photos: [persistedPhotoUri],
    audioNotes: [],
    additionalNotes: ["nota"],
  },
};

describe("resolvePointDuplicate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FakeFs.__resetFakeFileSystem();
    FakeFs.__setFile(persistedPhotoUri, "PHOTO_BYTES");
    mockUpdatePoint.mockResolvedValue(true);
  });

  it("'replace' overwrites the existing point with the incoming data and resets approval_status to pending", async () => {
    await resolvePointDuplicate(duplicate, "replace", project, registry);

    expect(mockUpdatePoint).toHaveBeenCalledTimes(1);
    const [pointId, updates] = mockUpdatePoint.mock.calls[0];
    expect(pointId).toBe("point-1");
    expect(updates.lat).toBe(-8.05);
    expect(updates.lon).toBe(-34.9);
    expect(updates.generated_name).toBe("Ponto Corrigido");
    expect(updates.approval_status).toBe("pending");
    expect(JSON.parse(updates.photos)[0].uri).toBe(persistedPhotoUri);
    expect(JSON.parse(updates.additional_notes)).toEqual(["nota"]);

    // The photo file stays in place - it's now the point's own data.
    expect(FakeFs.__getFile(persistedPhotoUri)).toBe("PHOTO_BYTES");
  });

  it("'discard' deletes the orphaned media files and never touches the database", async () => {
    await resolvePointDuplicate(duplicate, "discard", project, registry);

    expect(mockUpdatePoint).not.toHaveBeenCalled();
    expect(FakeFs.__getFile(persistedPhotoUri)).toBeUndefined();
  });
});
