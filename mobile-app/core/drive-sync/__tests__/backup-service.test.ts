// Backup to Drive (COLLAB_MODEL_V2_REFERENCE.md section 8). submitPointToProject
// already records drive_synced_at/approval_status internally on success (see
// point-submission-service.ts), so backupPoint is a thin wrapper resolving
// the point's project id - these tests confirm that delegation, and that
// backupAllPendingPoints only considers approved-but-unsynced points and
// doesn't let one failure stop the rest of the batch.
const mockGetPoint = jest.fn();
const mockGetApprovedUnsyncedPointsByProject = jest.fn();
jest.mock("@/db/queries/points", () => ({
  getPoint: (...args: unknown[]) => mockGetPoint(...args),
  getApprovedUnsyncedPointsByProject: (...args: unknown[]) => mockGetApprovedUnsyncedPointsByProject(...args),
}));

const mockSubmitPointToProject = jest.fn();
jest.mock("@/core/drive-sync/point-submission-service", () => ({
  submitPointToProject: (...args: unknown[]) => mockSubmitPointToProject(...args),
}));

const mockGetUnsyncedProjectSpeciesByProject = jest.fn();
jest.mock("@/db/queries/project-species", () => ({
  getUnsyncedProjectSpeciesByProject: (...args: unknown[]) => mockGetUnsyncedProjectSpeciesByProject(...args),
}));

const mockGetUnsyncedVegetationClassificationsByProject = jest.fn();
jest.mock("@/db/queries/vegetation-classifications", () => ({
  getUnsyncedVegetationClassificationsByProject: (...args: unknown[]) =>
    mockGetUnsyncedVegetationClassificationsByProject(...args),
}));

const mockPushSpeciesEntryIfCollaborative = jest.fn();
const mockPushVegetationClassificationIfCollaborative = jest.fn();
jest.mock("@/core/drive-sync/reference-data-sync-service", () => ({
  pushSpeciesEntryIfCollaborative: (...args: unknown[]) => mockPushSpeciesEntryIfCollaborative(...args),
  pushVegetationClassificationIfCollaborative: (...args: unknown[]) =>
    mockPushVegetationClassificationIfCollaborative(...args),
}));

import { backupPoint, backupAllPendingPoints } from "../backup-service";
import type { Point, ProjectSpeciesCatalog, VegetationClassification } from "@/types/database";
import type { ProtocolRegistry } from "@/protocol-kernel/types";

const registry = { getProtocol: jest.fn(() => undefined) } as unknown as ProtocolRegistry;

function makePoint(id: string, pointNumber: number): Point {
  return {
    id,
    project_id: 7,
    protocol_id: "paisageo",
    point_number: pointNumber,
    lat: -8.05,
    lon: -34.9,
    altitude: null,
    generated_name: null,
    landscape_class_id: null,
    photos: null,
    audio_notes: null,
    additional_notes: null,
    point_size: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    created_by: "PS01",
    approval_status: "approved",
    rejection_reason: null,
    drive_synced_at: null,
  };
}

describe("backupPoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolves the point's project id and delegates to submitPointToProject", async () => {
    const point = makePoint("point-1", 1);
    mockGetPoint.mockResolvedValue({ point, modules: [] });
    mockSubmitPointToProject.mockResolvedValue({ status: "approved" });

    await backupPoint("point-1", registry);

    expect(mockSubmitPointToProject).toHaveBeenCalledWith("point-1", 7, registry);
  });

  it("throws a clear error if the point doesn't exist", async () => {
    mockGetPoint.mockResolvedValue(null);

    await expect(backupPoint("missing", registry)).rejects.toThrow(/não encontrado/);
    expect(mockSubmitPointToProject).not.toHaveBeenCalled();
  });
});

describe("backupAllPendingPoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUnsyncedProjectSpeciesByProject.mockResolvedValue([]);
    mockGetUnsyncedVegetationClassificationsByProject.mockResolvedValue([]);
  });

  it("only backs up approved-and-unsynced points, and one failure doesn't stop the batch", async () => {
    const pointA = makePoint("point-a", 1);
    const pointB = makePoint("point-b", 2);
    mockGetApprovedUnsyncedPointsByProject.mockResolvedValue([pointA, pointB]);
    mockGetPoint.mockImplementation((id: string) => {
      const point = id === "point-a" ? pointA : id === "point-b" ? pointB : null;
      return Promise.resolve(point ? { point, modules: [] } : null);
    });
    mockSubmitPointToProject.mockImplementation((pointId: string) => {
      if (pointId === "point-a") return Promise.reject(new Error("Sem conexão."));
      return Promise.resolve({ status: "approved" });
    });

    const summary = await backupAllPendingPoints(7, registry);

    expect(mockGetApprovedUnsyncedPointsByProject).toHaveBeenCalledWith(7);
    expect(summary.backedUp).toBe(1);
    expect(summary.failed).toHaveLength(1);
    expect(summary.failed[0].reason).toBe("Sem conexão.");
    // Both points were attempted despite the first one failing.
    expect(mockSubmitPointToProject).toHaveBeenCalledTimes(2);
    expect(summary.speciesSynced).toBe(0);
    expect(summary.vegetationClassificationsSynced).toBe(0);
  });

  // Species/vegetation classifications are pushed fire-and-forget the moment
  // they're created (reference-data-sync-service.ts) - "Fazer Backup" is
  // also the retry path for whichever push never actually landed on Drive.
  it("retries unsynced species and vegetation classifications, counting only the ones that actually synced", async () => {
    mockGetApprovedUnsyncedPointsByProject.mockResolvedValue([]);
    const speciesA = { id: 1, uuid: "species-uuid-1" } as ProjectSpeciesCatalog;
    const speciesB = { id: 2, uuid: "species-uuid-2" } as ProjectSpeciesCatalog;
    const vegRow = { id: 10, uuid: "veg-uuid-1" } as VegetationClassification;
    mockGetUnsyncedProjectSpeciesByProject.mockResolvedValue([speciesA, speciesB]);
    mockGetUnsyncedVegetationClassificationsByProject.mockResolvedValue([vegRow]);
    mockPushSpeciesEntryIfCollaborative.mockImplementation((_projectId: number, entry: ProjectSpeciesCatalog) =>
      Promise.resolve(entry.id === 1),
    );
    mockPushVegetationClassificationIfCollaborative.mockResolvedValue(true);

    const summary = await backupAllPendingPoints(7, registry);

    expect(mockGetUnsyncedProjectSpeciesByProject).toHaveBeenCalledWith(7);
    expect(mockGetUnsyncedVegetationClassificationsByProject).toHaveBeenCalledWith(7);
    expect(mockPushSpeciesEntryIfCollaborative).toHaveBeenCalledTimes(2);
    expect(summary.speciesSynced).toBe(1);
    expect(summary.vegetationClassificationsSynced).toBe(1);
  });
});
