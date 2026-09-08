// Reproduces the audit's critical finding: after an admin rejects a
// submission, approval-service.ts archives the original file into
// submissions/<email>/_reviewed/ (a performance optimization so the
// approval queue stops re-reading decided items). The rejection
// reconciliation below used to look for the file only in its old, direct
// location - once archived, it never found it again, so a rejected point's
// author never learned about the rejection through a normal sync.
jest.mock("expo-file-system", () => ({
  File: jest.fn(),
  Paths: { document: "" },
}));
jest.mock("../drive-api-client", () => ({
  findChildByName: jest.fn(),
  listChildren: jest.fn(),
  readJsonFile: jest.fn(),
  downloadBinaryFile: jest.fn(),
}));
jest.mock("../project-drive-service", () => ({
  getManifest: jest.fn(),
  resolveProjectDriveIds: jest.fn(),
}));
jest.mock("../reference-data-sync-service", () => ({
  syncReferenceData: jest.fn(),
}));
jest.mock("@/db/queries/projects", () => ({ getProjectById: jest.fn() }));
jest.mock("@/db/queries/project-members", () => ({ upsertProjectMember: jest.fn() }));
jest.mock("@/db/queries/points", () => ({
  createPoint: jest.fn(),
  updatePoint: jest.fn(),
  getPointById: jest.fn(),
  getPendingPointsByProject: jest.fn(),
  updatePointApprovalStatus: jest.fn(),
}));

import { syncProjectFromDrive } from "../project-sync-service";
import { findChildByName, listChildren, readJsonFile } from "../drive-api-client";
import { getManifest, resolveProjectDriveIds } from "../project-drive-service";
import { syncReferenceData } from "../reference-data-sync-service";
import { getProjectById } from "@/db/queries/projects";
import { upsertProjectMember } from "@/db/queries/project-members";
import { getPendingPointsByProject, updatePointApprovalStatus } from "@/db/queries/points";
import type { Project, Point } from "@/types/database";
import type { ProtocolRegistry } from "@/protocol-kernel/types";
import type { DriveFile } from "../drive-api-client";

const mockFindChildByName = findChildByName as jest.Mock;
const mockListChildren = listChildren as jest.Mock;
const mockReadJsonFile = readJsonFile as jest.Mock;
const mockGetManifest = getManifest as jest.Mock;
const mockResolveProjectDriveIds = resolveProjectDriveIds as jest.Mock;
const mockSyncReferenceData = syncReferenceData as jest.Mock;
const mockGetProjectById = getProjectById as jest.Mock;
const mockUpsertProjectMember = upsertProjectMember as jest.Mock;
const mockGetPendingPointsByProject = getPendingPointsByProject as jest.Mock;
const mockUpdatePointApprovalStatus = updatePointApprovalStatus as jest.Mock;

const registry = { getProtocol: jest.fn() } as unknown as ProtocolRegistry;

const project: Project = {
  id: 1,
  name: "Projeto Teste",
  protocol_id: "paisageo",
  protocol_source: "official",
  created_at: "2026-01-01T00:00:00.000Z",
  last_updated: "2026-01-01T00:00:00.000Z",
  is_classified: 0,
  is_collaborative: 1,
  drive_folder_id: "drive-root",
  auto_approve_default: 0,
};

const pendingPoint: Point = {
  id: "point-1",
  project_id: 1,
  protocol_id: "paisageo",
  point_number: 3,
  lat: -8.05,
  lon: -34.9,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  created_by: "colega@example.com",
  approval_status: "pending",
};

function driveFile(id: string, name: string, mimeType = "application/json"): DriveFile {
  return { id, name, mimeType };
}

describe("syncProjectFromDrive — rejection reconciliation after _reviewed/ archiving", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetProjectById.mockResolvedValue(project);
    mockGetManifest.mockResolvedValue({
      project_uuid: "uuid-1",
      project_name: "Projeto Teste",
      protocol_id: "paisageo",
      protocol_source: "official",
      auto_approve_default: false,
      members: [{ email: "colega@example.com", role: "collaborator", auto_approve: "herda_projeto", collector_code: "CG" }],
    });
    mockResolveProjectDriveIds.mockResolvedValue({
      submissions_folder_id: "subs-id",
      approved_folder_id: "approved-id",
    });
    mockSyncReferenceData.mockResolvedValue({
      speciesPushed: 0, speciesPulled: 0, vegetationClassesPushed: 0, vegetationClassesPulled: 0,
    });
    mockUpsertProjectMember.mockResolvedValue(true);
    mockGetPendingPointsByProject.mockResolvedValue([pendingPoint]);
    mockListChildren.mockImplementation(async (parentId: string) => {
      // approved/ is empty - this test only exercises the rejection pass.
      if (parentId === "approved-id") return [];
      return [];
    });
  });

  it("finds the rejection reason even though the submission file was archived into _reviewed/", async () => {
    const emailFolder = driveFile("email-folder-id", "colega@example.com", "application/vnd.google-apps.folder");
    const reviewedFolder = driveFile("reviewed-folder-id", "_reviewed", "application/vnd.google-apps.folder");
    const archivedFile = driveFile("archived-file-id", "point-1.json");

    mockFindChildByName.mockImplementation(async (parentId: string, name: string) => {
      if (parentId === "subs-id" && name === "colega@example.com") return emailFolder;
      // The file no longer lives directly under the email folder - it was
      // moved into _reviewed/ by rejectSubmission.
      if (parentId === "email-folder-id" && name === "point-1.json") return null;
      if (parentId === "email-folder-id" && name === "_reviewed") return reviewedFolder;
      if (parentId === "reviewed-folder-id" && name === "point-1.json") return archivedFile;
      return null;
    });

    mockReadJsonFile.mockImplementation(async (fileId: string) => {
      if (fileId === "archived-file-id") {
        return { approval_status: "rejected", rejection_reason: "Coordenadas fora da área do projeto" };
      }
      throw new Error(`Unexpected readJsonFile call for ${fileId}`);
    });

    const result = await syncProjectFromDrive(1, { includeMedia: false }, registry);

    expect(result.rejected).toBe(1);
    expect(mockUpdatePointApprovalStatus).toHaveBeenCalledWith(
      "point-1",
      "rejected",
      "Coordenadas fora da área do projeto",
    );
  });
});
