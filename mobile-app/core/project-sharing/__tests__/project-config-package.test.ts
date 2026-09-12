// applyProjectConfigPackage is the only place a 'collaborator' local
// project ever gets created (see COLLAB_MODEL_V2_REFERENCE.md section 3.1):
// importing a project config package always produces a collaboration_role =
// 'collaborator' copy on a brand-new local project, and must never touch
// collaboration_role when re-importing over a project that already exists
// locally (found via project_uuid) - otherwise a device that somehow already
// marked that same project_uuid as 'owner' could get silently demoted.
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("@/core/export/file-writer", () => ({ writeAndShare: jest.fn() }));

const mockInsertSpeciesFromRemote = jest.fn();
jest.mock("@/core/drive-sync/reference-data-sync-service", () => ({
  insertSpeciesFromRemote: (...args: unknown[]) => mockInsertSpeciesFromRemote(...args),
}));

const mockGetProjectByUuid = jest.fn();
const mockCreateProjectFromPackage = jest.fn();
jest.mock("@/db/queries/projects", () => ({
  getProjectById: jest.fn(),
  getProjectByUuid: (...args: unknown[]) => mockGetProjectByUuid(...args),
  setProjectUuid: jest.fn(),
  createProjectFromPackage: (...args: unknown[]) => mockCreateProjectFromPackage(...args),
}));

jest.mock("@/db/queries/custom-protocols", () => ({
  getCustomProtocolById: jest.fn(),
  getCustomProtocolByUuid: jest.fn(),
  createCustomProtocolFromPackage: jest.fn(),
  setCustomProtocolUuid: jest.fn(),
}));

const mockGetProjectSpeciesCatalogByProject = jest.fn();
jest.mock("@/db/queries/project-species", () => ({
  getProjectSpeciesCatalogByProject: (...args: unknown[]) => mockGetProjectSpeciesCatalogByProject(...args),
  setProjectSpeciesUuid: jest.fn(),
}));

const mockGetVegetationClassificationsByProject = jest.fn();
jest.mock("@/db/queries/vegetation-classifications", () => ({
  getVegetationClassificationsByProject: (...args: unknown[]) => mockGetVegetationClassificationsByProject(...args),
  createVegetationClassification: jest.fn(),
  setVegetationClassificationUuid: jest.fn(),
}));

jest.mock("@/utils/uuid", () => ({ generateUuid: jest.fn(() => "uuid-mock") }));

import { applyProjectConfigPackage } from "../project-config-package";
import type { ProjectConfigPackage } from "../project-config-package";
import type { Project } from "@/types/database";

const pkg: ProjectConfigPackage = {
  format_version: 1,
  project_uuid: "project-uuid-1",
  project_name: "Projeto Fauna",
  protocol_id: "paisageo",
  protocol_source: "official",
  package_role_for_importer: "collaborator",
  species_catalog: [],
  vegetation_classes: [],
};

describe("applyProjectConfigPackage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProjectSpeciesCatalogByProject.mockResolvedValue([]);
    mockGetVegetationClassificationsByProject.mockResolvedValue([]);
  });

  it("creates a new local project with collaboration_role 'collaborator' when it doesn't exist locally yet", async () => {
    mockGetProjectByUuid.mockResolvedValue(null);
    mockCreateProjectFromPackage.mockResolvedValue(42);

    const result = await applyProjectConfigPackage(pkg);

    expect(result).toEqual({ projectId: 42, created: true });
    expect(mockCreateProjectFromPackage).toHaveBeenCalledTimes(1);
    expect(mockCreateProjectFromPackage).toHaveBeenCalledWith(
      pkg.project_uuid,
      pkg.project_name,
      pkg.protocol_id,
      pkg.protocol_source,
      "collaborator",
    );
  });

  it("does not touch collaboration_role when re-importing over an existing local project", async () => {
    const existingProject: Project = {
      id: 7,
      name: "Projeto Fauna",
      protocol_id: "paisageo",
      protocol_source: "official",
      created_at: "2026-01-01T00:00:00.000Z",
      last_updated: "2026-01-01T00:00:00.000Z",
      is_classified: 0,
      collaboration_role: "owner",
      project_uuid: "project-uuid-1",
    };
    mockGetProjectByUuid.mockResolvedValue(existingProject);

    const result = await applyProjectConfigPackage(pkg);

    expect(result).toEqual({ projectId: 7, created: false });
    expect(mockCreateProjectFromPackage).not.toHaveBeenCalled();
  });
});
