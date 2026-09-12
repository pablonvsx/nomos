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

const mockGetProjectById = jest.fn();
const mockGetProjectByUuid = jest.fn();
const mockSetProjectUuid = jest.fn();
const mockCreateProjectFromPackage = jest.fn();
jest.mock("@/db/queries/projects", () => ({
  getProjectById: (...args: unknown[]) => mockGetProjectById(...args),
  getProjectByUuid: (...args: unknown[]) => mockGetProjectByUuid(...args),
  setProjectUuid: (...args: unknown[]) => mockSetProjectUuid(...args),
  createProjectFromPackage: (...args: unknown[]) => mockCreateProjectFromPackage(...args),
}));

const mockGetCustomProtocolById = jest.fn();
jest.mock("@/db/queries/custom-protocols", () => ({
  getCustomProtocolById: (...args: unknown[]) => mockGetCustomProtocolById(...args),
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
const mockCreateVegetationClassification = jest.fn();
const mockSetVegetationClassificationUuid = jest.fn();
const mockGetActiveVegetationClassificationConfig = jest.fn();
const mockSetActiveVegetationClassification = jest.fn();
jest.mock("@/db/queries/vegetation-classifications", () => ({
  getVegetationClassificationsByProject: (...args: unknown[]) => mockGetVegetationClassificationsByProject(...args),
  createVegetationClassification: (...args: unknown[]) => mockCreateVegetationClassification(...args),
  setVegetationClassificationUuid: (...args: unknown[]) => mockSetVegetationClassificationUuid(...args),
  getActiveVegetationClassificationConfig: (...args: unknown[]) => mockGetActiveVegetationClassificationConfig(...args),
  setActiveVegetationClassification: (...args: unknown[]) => mockSetActiveVegetationClassification(...args),
}));

jest.mock("@/utils/uuid", () => ({ generateUuid: jest.fn(() => "uuid-mock") }));

import { buildProjectConfigPackage, applyProjectConfigPackage } from "../project-config-package";
import type { ProjectConfigPackage } from "../project-config-package";
import type { Project, VegetationClassification } from "@/types/database";

const pkg: ProjectConfigPackage = {
  format_version: 1,
  project_uuid: "project-uuid-1",
  project_name: "Projeto Fauna",
  protocol_id: "paisageo",
  protocol_source: "official",
  package_role_for_importer: "collaborator",
  species_catalog: [],
  vegetation_classes: [],
  active_vegetation_classification: { type: "standard" },
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

  // Fase G investigation: a vegetation classification is scoped purely by
  // project_id (no separate custom_protocol_id/module-instance namespace),
  // so importing it must land at the newly-created LOCAL project id - the
  // exact id getVegetationClassificationsByProject(projectId) will later be
  // called with by the vegetation module, for either protocol kind.
  it("recreates vegetation classes on import at the local project id the module will later query", async () => {
    mockGetProjectByUuid.mockResolvedValue(null);
    mockCreateProjectFromPackage.mockResolvedValue(42);
    mockCreateVegetationClassification.mockResolvedValue(99);

    const pkgWithVeg: ProjectConfigPackage = {
      ...pkg,
      vegetation_classes: [
        { uuid: "veg-uuid-1", name: "Minha Classificação", classes: [{ id: "class_1", name: "Cerrado" }] },
      ],
    };

    const result = await applyProjectConfigPackage(pkgWithVeg);

    expect(result.projectId).toBe(42);
    expect(mockCreateVegetationClassification).toHaveBeenCalledWith(
      42,
      "Minha Classificação",
      [{ id: "class_1", name: "Cerrado" }],
      "veg-uuid-1",
    );
  });

  it("skips a vegetation class whose uuid already exists locally (dedup)", async () => {
    mockGetProjectByUuid.mockResolvedValue(null);
    mockCreateProjectFromPackage.mockResolvedValue(42);
    mockGetVegetationClassificationsByProject.mockResolvedValue([
      { id: 5, project_id: 42, name: "Já Existe", classes: [], created_at: "x", last_updated: "x", uuid: "veg-uuid-1" },
    ] as VegetationClassification[]);

    const pkgWithVeg: ProjectConfigPackage = {
      ...pkg,
      vegetation_classes: [{ uuid: "veg-uuid-1", name: "Duplicada", classes: [] }],
    };

    await applyProjectConfigPackage(pkgWithVeg);

    expect(mockCreateVegetationClassification).not.toHaveBeenCalled();
  });

  // Critical finding from RELATORIO_AUDITORIA_COLABORACAO.md: the
  // vegetation_classes rows themselves already survived import, but without
  // resolving *which one is active* the importing project silently fell
  // back to the standard Nomos tree.
  describe("active_vegetation_classification", () => {
    it("resolves the incoming custom classification uuid to the local row id", async () => {
      mockGetProjectByUuid.mockResolvedValue(null);
      mockCreateProjectFromPackage.mockResolvedValue(42);
      // Re-fetched after insertion, so it must include rows just created too.
      mockGetVegetationClassificationsByProject.mockResolvedValue([
        { id: 99, project_id: 42, name: "Minha Classificação", classes: [], created_at: "x", last_updated: "x", uuid: "veg-uuid-1" },
      ] as VegetationClassification[]);

      const pkgWithActive: ProjectConfigPackage = {
        ...pkg,
        vegetation_classes: [{ uuid: "veg-uuid-1", name: "Minha Classificação", classes: [] }],
        active_vegetation_classification: { type: "custom", custom_classification_uuid: "veg-uuid-1" },
      };

      await applyProjectConfigPackage(pkgWithActive);

      expect(mockSetActiveVegetationClassification).toHaveBeenCalledWith(42, 99, "custom");
    });

    it("resolves to 'standard' (no active row) when the package says standard", async () => {
      mockGetProjectByUuid.mockResolvedValue(null);
      mockCreateProjectFromPackage.mockResolvedValue(42);

      await applyProjectConfigPackage(pkg); // pkg fixture defaults to { type: "standard" }

      expect(mockSetActiveVegetationClassification).toHaveBeenCalledWith(42, null, "standard");
    });

    it("falls back to 'standard' when the referenced uuid isn't found among the imported rows", async () => {
      mockGetProjectByUuid.mockResolvedValue(null);
      mockCreateProjectFromPackage.mockResolvedValue(42);
      mockGetVegetationClassificationsByProject.mockResolvedValue([]);

      const pkgWithMissingActive: ProjectConfigPackage = {
        ...pkg,
        active_vegetation_classification: { type: "custom", custom_classification_uuid: "does-not-exist" },
      };

      await applyProjectConfigPackage(pkgWithMissingActive);

      expect(mockSetActiveVegetationClassification).not.toHaveBeenCalled();
    });
  });
});

// Fase G investigation (manual test report: custom vegetation classes
// missing from the exported config package): buildCustomModuleDescriptor
// returns the exact same vegetationModule descriptor object for a custom
// protocol section with moduleRef: "vegetation" as the official Paisageo
// manifest does, and createVegetationClassification's one call site
// (VegetationClassesModal.tsx) always writes with the real project_id
// regardless of protocol_source - so both scenarios below are expected (and
// found) to behave identically. These pass against the current code,
// confirming there's no bug in this fetch/build path.
describe("buildProjectConfigPackage - vegetation classes", () => {
  const vegetationRow: VegetationClassification = {
    id: 10,
    project_id: 1,
    name: "Minha Classificação",
    classes: [{ id: "class_1", name: "Cerrado" }],
    created_at: "2026-01-01T00:00:00.000Z",
    last_updated: "2026-01-01T00:00:00.000Z",
    uuid: "veg-uuid-1",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProjectSpeciesCatalogByProject.mockResolvedValue([]);
    mockGetVegetationClassificationsByProject.mockResolvedValue([vegetationRow]);
  });

  it("includes a custom vegetation classification for a project on the official Paisageo protocol", async () => {
    const officialProject: Project = {
      id: 1,
      name: "Projeto Fauna",
      protocol_id: "paisageo",
      protocol_source: "official",
      created_at: "2026-01-01T00:00:00.000Z",
      last_updated: "2026-01-01T00:00:00.000Z",
      is_classified: 0,
      collaboration_role: null,
      project_uuid: "project-uuid-1",
    };
    mockGetProjectById.mockResolvedValue(officialProject);

    const result = await buildProjectConfigPackage(1);

    expect(result.vegetation_classes).toEqual([
      { uuid: "veg-uuid-1", name: "Minha Classificação", classes: vegetationRow.classes },
    ]);
  });

  it("includes the same custom vegetation classification for a custom protocol reusing the vegetation moduleRef", async () => {
    const customProject: Project = {
      id: 1,
      name: "Projeto Fauna",
      protocol_id: "7",
      protocol_source: "custom",
      created_at: "2026-01-01T00:00:00.000Z",
      last_updated: "2026-01-01T00:00:00.000Z",
      is_classified: 0,
      collaboration_role: null,
      project_uuid: "project-uuid-1",
    };
    mockGetProjectById.mockResolvedValue(customProject);
    mockGetCustomProtocolById.mockResolvedValue({
      id: 7,
      name: "Fauna",
      theme: "fauna",
      uuid: "protocol-uuid-1",
      schema: {
        sections: [{ id: "vegetation", title: "Vegetação", fields: [], moduleRef: "vegetation" }],
      },
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const result = await buildProjectConfigPackage(1);

    expect(result.vegetation_classes).toEqual([
      { uuid: "veg-uuid-1", name: "Minha Classificação", classes: vegetationRow.classes },
    ]);
    // Same query, same project_id argument as the official-protocol case -
    // no separate custom_protocol_id-scoped lookup.
    expect(mockGetVegetationClassificationsByProject).toHaveBeenCalledWith(1);
  });
});

describe("buildProjectConfigPackage - active_vegetation_classification", () => {
  const officialProject: Project = {
    id: 1,
    name: "Projeto Fauna",
    protocol_id: "paisageo",
    protocol_source: "official",
    created_at: "2026-01-01T00:00:00.000Z",
    last_updated: "2026-01-01T00:00:00.000Z",
    is_classified: 0,
    collaboration_role: null,
    project_uuid: "project-uuid-1",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProjectSpeciesCatalogByProject.mockResolvedValue([]);
    mockGetProjectById.mockResolvedValue(officialProject);
  });

  it("includes the active custom classification's uuid when one is set", async () => {
    mockGetVegetationClassificationsByProject.mockResolvedValue([
      { id: 10, project_id: 1, name: "Minha Classificação", classes: [], created_at: "x", last_updated: "x", uuid: "veg-uuid-1" },
    ] as VegetationClassification[]);
    mockGetActiveVegetationClassificationConfig.mockResolvedValue({ type: "custom", classificationId: 10 });

    const result = await buildProjectConfigPackage(1);

    expect(result.active_vegetation_classification).toEqual({
      type: "custom",
      custom_classification_uuid: "veg-uuid-1",
    });
  });

  it("reports 'standard' when the project has no active custom classification", async () => {
    mockGetVegetationClassificationsByProject.mockResolvedValue([]);
    mockGetActiveVegetationClassificationConfig.mockResolvedValue({ type: "standard", classificationId: null });

    const result = await buildProjectConfigPackage(1);

    expect(result.active_vegetation_classification).toEqual({ type: "standard" });
  });
});
