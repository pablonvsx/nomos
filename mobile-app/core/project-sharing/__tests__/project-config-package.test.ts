// project-config-package.ts talks to expo-sqlite through db/queries/*, and to
// the file system/sharing sheet through core/export/file-writer + expo
// packages, none of which ts-jest ("node" environment, see jest.config.js)
// can run. Every db/queries/* module is replaced here by a small in-memory
// fake store that mirrors the real check-before-generate/dedupe-by-uuid
// behavior, so the tests exercise project-config-package.ts's own logic
// (ordering, validation, dedupe decisions) against a state that persists
// across calls within a test - exactly what's needed to prove uuid
// idempotency and re-import idempotency, not just the happy path once.

interface FakeProject {
  id: number;
  name: string;
  protocol_id: string;
  protocol_source: "official" | "custom";
  project_uuid: string | null;
  owner_email: string | null;
  vegetation_classification_type: "standard" | "custom";
  active_custom_vegetation_classification_id: number | null;
}

interface FakeCustomProtocol {
  id: number;
  name: string;
  theme: string;
  schema: unknown;
  uuid: string | null;
}

interface FakeSpecies {
  id: number;
  project_id: number;
  scientific_name: string;
  source: string;
  uuid: string | null;
  common_names: unknown;
}

interface FakeVegClassification {
  id: number;
  project_id: number;
  name: string;
  classes: unknown;
  uuid: string | null;
}

let uuidCounter = 0;
function nextFakeUuid(prefix: string): string {
  uuidCounter += 1;
  return `${prefix}-uuid-${uuidCounter}`;
}

let projects: FakeProject[] = [];
let nextProjectId = 1;
let customProtocols: FakeCustomProtocol[] = [];
let nextCustomProtocolId = 1;
let species: FakeSpecies[] = [];
let nextSpeciesId = 1;
let vegClassifications: FakeVegClassification[] = [];
let nextVegId = 1;

function resetFakeDb() {
  projects = [];
  nextProjectId = 1;
  customProtocols = [];
  nextCustomProtocolId = 1;
  species = [];
  nextSpeciesId = 1;
  vegClassifications = [];
  nextVegId = 1;
  uuidCounter = 0;
}

jest.mock("@/db/queries/projects", () => ({
  createProject: jest.fn(
    async (
      name: string,
      protocolId: string,
      _description: string,
      protocolSource: "official" | "custom",
      projectUuid?: string,
      ownerEmail?: string | null,
    ) => {
      const row: FakeProject = {
        id: nextProjectId++,
        name,
        protocol_id: protocolId,
        protocol_source: protocolSource ?? "official",
        project_uuid: projectUuid ?? null,
        owner_email: ownerEmail ?? null,
        vegetation_classification_type: "standard",
        active_custom_vegetation_classification_id: null,
      };
      projects.push(row);
      return row.id;
    },
  ),
  getProjectById: jest.fn(async (id: number) => projects.find((p) => p.id === id) ?? null),
  getProjectByUuid: jest.fn(
    async (uuid: string) => projects.find((p) => p.project_uuid === uuid) ?? null,
  ),
  ensureProjectUuid: jest.fn(async (id: number) => {
    const row = projects.find((p) => p.id === id);
    if (!row) throw new Error("project not found");
    if (!row.project_uuid) row.project_uuid = nextFakeUuid("project");
    return row.project_uuid;
  }),
}));

jest.mock("@/db/queries/custom-protocols", () => ({
  getCustomProtocolById: jest.fn(
    async (id: number) => customProtocols.find((c) => c.id === id) ?? null,
  ),
  getCustomProtocolByUuid: jest.fn(
    async (uuid: string) => customProtocols.find((c) => c.uuid === uuid) ?? null,
  ),
  ensureCustomProtocolUuid: jest.fn(async (id: number) => {
    const row = customProtocols.find((c) => c.id === id);
    if (!row) throw new Error("custom protocol not found");
    if (!row.uuid) row.uuid = nextFakeUuid("protocol");
    return row.uuid;
  }),
  createCustomProtocolWithUuid: jest.fn(
    async (name: string, schema: unknown, theme: string, uuid: string) => {
      const row: FakeCustomProtocol = { id: nextCustomProtocolId++, name, theme, schema, uuid };
      customProtocols.push(row);
      return row.id;
    },
  ),
}));

jest.mock("@/db/queries/project-species", () => ({
  getAllProjectSpeciesCatalogEnsuringUuids: jest.fn(async (projectId: number) => {
    const rows = species.filter((s) => s.project_id === projectId);
    return rows.map((row) => {
      if (!row.uuid) row.uuid = nextFakeUuid("species");
      return { ...row };
    });
  }),
  getProjectSpeciesByUuid: jest.fn(
    async (projectId: number, uuid: string) =>
      species.find((s) => s.project_id === projectId && s.uuid === uuid) ?? null,
  ),
  createProjectSpecies: jest.fn(async (data: any) => {
    const row: FakeSpecies = {
      id: nextSpeciesId++,
      project_id: data.project_id,
      scientific_name: data.scientific_name,
      source: data.source,
      uuid: data.uuid ?? null,
      common_names: data.common_names ?? [],
    };
    species.push(row);
    return row.id;
  }),
}));

jest.mock("@/db/queries/vegetation-classifications", () => ({
  getAllVegetationClassificationsEnsuringUuids: jest.fn(async (projectId: number) => {
    const rows = vegClassifications.filter((v) => v.project_id === projectId);
    return rows.map((row) => {
      if (!row.uuid) row.uuid = nextFakeUuid("veg");
      return { ...row };
    });
  }),
  getVegetationClassificationByUuid: jest.fn(
    async (projectId: number, uuid: string) =>
      vegClassifications.find((v) => v.project_id === projectId && v.uuid === uuid) ?? null,
  ),
  createVegetationClassification: jest.fn(
    async (projectId: number, name: string, classes: unknown) => {
      const row: FakeVegClassification = {
        id: nextVegId++,
        project_id: projectId,
        name,
        classes,
        uuid: null,
      };
      vegClassifications.push(row);
      return row.id;
    },
  ),
  setVegetationClassificationUuid: jest.fn(async (id: number, uuid: string) => {
    const row = vegClassifications.find((v) => v.id === id);
    if (row) row.uuid = uuid;
  }),
  setActiveVegetationClassification: jest.fn(
    async (projectId: number, classificationId: number | null, type: "standard" | "custom") => {
      const row = projects.find((p) => p.id === projectId);
      if (row) {
        row.vegetation_classification_type = type;
        row.active_custom_vegetation_classification_id = classificationId;
      }
    },
  ),
  getActiveVegetationClassificationConfig: jest.fn(async (projectId: number) => {
    const row = projects.find((p) => p.id === projectId);
    if (!row) return null;
    return {
      type: row.vegetation_classification_type,
      classificationId: row.active_custom_vegetation_classification_id,
    };
  }),
}));

jest.mock("@/core/export/file-writer", () => ({
  writeAndShare: jest.fn(async () => {}),
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(),
}));

import * as DocumentPicker from "expo-document-picker";
import { writeAndShare } from "@/core/export/file-writer";
import * as ProjectsQueries from "@/db/queries/projects";
import * as CustomProtocolsQueries from "@/db/queries/custom-protocols";
import * as ProjectSpeciesQueries from "@/db/queries/project-species";
import * as VegetationQueries from "@/db/queries/vegetation-classifications";
import {
  applyProjectConfigPackage,
  buildProjectConfigPackage,
  exportProjectConfigPackage,
  importProjectConfigPackage,
  InvalidPackageError,
  ProjectConfigPackage,
  UnsupportedPackageVersionError,
} from "../project-config-package";

function seedOfficialProject(overrides: Partial<FakeProject> = {}): FakeProject {
  const row: FakeProject = {
    id: nextProjectId++,
    name: "Projeto Teste",
    protocol_id: "nomos-paisageo-v1",
    protocol_source: "official",
    project_uuid: null,
    owner_email: null,
    vegetation_classification_type: "standard",
    active_custom_vegetation_classification_id: null,
    ...overrides,
  };
  projects.push(row);
  return row;
}

function seedCustomProtocol(overrides: Partial<FakeCustomProtocol> = {}): FakeCustomProtocol {
  const row: FakeCustomProtocol = {
    id: nextCustomProtocolId++,
    name: "Fauna Survey",
    theme: "fauna",
    schema: { sections: [] },
    uuid: null,
    ...overrides,
  };
  customProtocols.push(row);
  return row;
}

function seedSpecies(projectId: number, overrides: Partial<FakeSpecies> = {}): FakeSpecies {
  const row: FakeSpecies = {
    id: nextSpeciesId++,
    project_id: projectId,
    scientific_name: "Panthera onca",
    source: "manual",
    uuid: null,
    common_names: [],
    ...overrides,
  };
  species.push(row);
  return row;
}

function seedVegClassification(
  projectId: number,
  overrides: Partial<FakeVegClassification> = {},
): FakeVegClassification {
  const row: FakeVegClassification = {
    id: nextVegId++,
    project_id: projectId,
    name: "Minha Classificação",
    classes: [{ id: "class_1", name: "Cerrado" }],
    uuid: null,
    ...overrides,
  };
  vegClassifications.push(row);
  return row;
}

function allMockFunctions(): jest.Mock[] {
  return [
    ...Object.values(ProjectsQueries),
    ...Object.values(CustomProtocolsQueries),
    ...Object.values(ProjectSpeciesQueries),
    ...Object.values(VegetationQueries),
  ].filter((fn): fn is jest.Mock => jest.isMockFunction(fn));
}

beforeEach(() => {
  resetFakeDb();
  jest.clearAllMocks();
});

describe("buildProjectConfigPackage", () => {
  it("includes the custom protocol, all species, and all vegetation classes (not just the active one)", async () => {
    const project = seedOfficialProject({ protocol_source: "custom", protocol_id: "" });
    const protocol = seedCustomProtocol();
    project.protocol_id = String(protocol.id);

    seedSpecies(project.id, { scientific_name: "Panthera onca" });
    seedSpecies(project.id, { scientific_name: "Puma concolor" });

    const activeVeg = seedVegClassification(project.id, { name: "Ativa" });
    seedVegClassification(project.id, { name: "Outra, não ativa" });
    project.vegetation_classification_type = "custom";
    project.active_custom_vegetation_classification_id = activeVeg.id;

    const pkg = await buildProjectConfigPackage(project.id);

    expect(pkg.format_version).toBe(1);
    expect(pkg.owner_email).toBeNull();
    expect(pkg.protocol_source).toBe("custom");
    expect(pkg.custom_protocol?.name).toBe("Fauna Survey");
    expect(pkg.species_catalog).toHaveLength(2);
    expect(pkg.vegetation_classes).toHaveLength(2);
    expect(pkg.active_vegetation_classification).toEqual({
      type: "custom",
      custom_classification_uuid: activeVeg.uuid,
    });
  });

  it("reports owner_email when the project has one, and standard classification when active", async () => {
    const project = seedOfficialProject({ owner_email: "owner@example.com" });

    const pkg = await buildProjectConfigPackage(project.id);

    expect(pkg.owner_email).toBe("owner@example.com");
    expect(pkg.active_vegetation_classification).toEqual({ type: "standard" });
  });

  it("produces the exact same uuids when the same project is exported twice", async () => {
    const project = seedOfficialProject({ protocol_source: "custom", protocol_id: "" });
    const protocol = seedCustomProtocol();
    project.protocol_id = String(protocol.id);
    seedSpecies(project.id);
    seedVegClassification(project.id);

    const first = await buildProjectConfigPackage(project.id);
    const second = await buildProjectConfigPackage(project.id);

    expect(second.project_uuid).toBe(first.project_uuid);
    expect(second.custom_protocol?.uuid).toBe(first.custom_protocol?.uuid);
    expect(second.species_catalog[0].uuid).toBe(first.species_catalog[0].uuid);
    expect(second.vegetation_classes[0].uuid).toBe(first.vegetation_classes[0].uuid);
  });
});

describe("applyProjectConfigPackage — format_version check", () => {
  const basePkg = {
    project_uuid: "p-1",
    project_name: "Projeto",
    protocol_id: "nomos-paisageo-v1",
    protocol_source: "official" as const,
    species_catalog: [],
    vegetation_classes: [],
    active_vegetation_classification: { type: "standard" as const },
    owner_email: null,
  };

  it("rejects an unsupported format_version before reading any other field or touching the db", async () => {
    await expect(
      applyProjectConfigPackage({ ...basePkg, format_version: 2 }),
    ).rejects.toBeInstanceOf(UnsupportedPackageVersionError);

    expect(allMockFunctions().some((fn) => fn.mock.calls.length > 0)).toBe(false);
  });

  it("rejects a package with a missing format_version before touching the db", async () => {
    const { format_version: _unused, ...withoutVersion } = { ...basePkg, format_version: 1 };
    await expect(applyProjectConfigPackage(withoutVersion)).rejects.toBeInstanceOf(
      UnsupportedPackageVersionError,
    );
    expect(allMockFunctions().some((fn) => fn.mock.calls.length > 0)).toBe(false);
  });

  it("rejects a completely invalid object before touching the db", async () => {
    await expect(applyProjectConfigPackage("not an object")).rejects.toBeInstanceOf(
      InvalidPackageError,
    );
    await expect(applyProjectConfigPackage(null)).rejects.toBeInstanceOf(InvalidPackageError);
    expect(allMockFunctions().some((fn) => fn.mock.calls.length > 0)).toBe(false);
  });
});

describe("applyProjectConfigPackage — import behavior", () => {
  function samplePackage(overrides: Partial<ProjectConfigPackage> = {}): ProjectConfigPackage {
    return {
      format_version: 1,
      project_uuid: "shared-project-uuid",
      project_name: "Projeto Compartilhado",
      protocol_id: "nomos-paisageo-v1",
      protocol_source: "official",
      species_catalog: [
        {
          uuid: "species-uuid-1",
          scientific_name: "Panthera onca",
          source: "manual",
          common_names: [{ common_name: "Onça-pintada", language: "pt", source: "manual" }],
        },
      ],
      vegetation_classes: [
        {
          uuid: "veg-uuid-1",
          name: "Classificação Compartilhada",
          classes: [{ id: "class_1", name: "Cerrado" }],
        },
      ],
      active_vegetation_classification: {
        type: "custom",
        custom_classification_uuid: "veg-uuid-1",
      },
      owner_email: null,
      ...overrides,
    };
  }

  it("creates a new local project with the species catalog and active vegetation classification", async () => {
    const pkg = samplePackage();

    const result = await applyProjectConfigPackage(pkg);

    expect(result.created).toBe(true);
    const project = projects.find((p) => p.id === result.projectId)!;
    expect(project.project_uuid).toBe("shared-project-uuid");
    expect(project.name).toBe("Projeto Compartilhado");

    expect(species).toHaveLength(1);
    expect(species[0].uuid).toBe("species-uuid-1");

    expect(vegClassifications).toHaveLength(1);
    expect(vegClassifications[0].uuid).toBe("veg-uuid-1");
    expect(project.vegetation_classification_type).toBe("custom");
    expect(project.active_custom_vegetation_classification_id).toBe(vegClassifications[0].id);
  });

  it("creates a project with the standard active vegetation classification when the package says so", async () => {
    const pkg = samplePackage({
      vegetation_classes: [],
      active_vegetation_classification: { type: "standard" },
    });

    const result = await applyProjectConfigPackage(pkg);

    const project = projects.find((p) => p.id === result.projectId)!;
    expect(project.vegetation_classification_type).toBe("standard");
  });

  it("creates the referenced custom protocol with the incoming uuid, never a freshly generated one", async () => {
    const pkg = samplePackage({
      protocol_source: "custom",
      protocol_id: "irrelevant-placeholder",
      custom_protocol: {
        uuid: "protocol-uuid-1",
        name: "Fauna Survey",
        theme: "fauna",
        schema: { sections: [] },
      },
    });

    await applyProjectConfigPackage(pkg);

    expect(customProtocols).toHaveLength(1);
    expect(customProtocols[0].uuid).toBe("protocol-uuid-1");
  });

  it("re-importing the identical package is idempotent: reuses the project, doesn't duplicate rows, and never regenerates project_uuid", async () => {
    const pkg = samplePackage();

    const first = await applyProjectConfigPackage(pkg);
    expect(first.created).toBe(true);

    const second = await applyProjectConfigPackage(pkg);
    expect(second.created).toBe(false);
    expect(second.projectId).toBe(first.projectId);

    expect(projects.filter((p) => p.project_uuid === pkg.project_uuid)).toHaveLength(1);
    expect(species).toHaveLength(1);
    expect(vegClassifications).toHaveLength(1);

    const project = projects.find((p) => p.id === second.projectId)!;
    expect(project.project_uuid).toBe(pkg.project_uuid);
  });

  it("dedupes species/vegetation rows by uuid while still adding genuinely new ones from an updated package", async () => {
    const pkg = samplePackage();
    const first = await applyProjectConfigPackage(pkg);
    expect(first.created).toBe(true);

    const updatedPkg = samplePackage({
      species_catalog: [
        ...pkg.species_catalog,
        {
          uuid: "species-uuid-2",
          scientific_name: "Puma concolor",
          source: "manual",
          common_names: [],
        },
      ],
    });

    const second = await applyProjectConfigPackage(updatedPkg);
    expect(second.created).toBe(false);
    expect(species).toHaveLength(2);
    expect(species.map((s) => s.uuid).sort()).toEqual(["species-uuid-1", "species-uuid-2"]);
  });
});

describe("exportProjectConfigPackage", () => {
  it("writes and shares a JSON file built from the project's configuration package", async () => {
    const project = seedOfficialProject({ name: "Área de Estudo" });

    await exportProjectConfigPackage(project.id);

    expect(writeAndShare).toHaveBeenCalledTimes(1);
    const [fileName, content, mimeType] = (writeAndShare as jest.Mock).mock.calls[0];
    expect(fileName).toMatch(/^Nomos_Config_.*\.json$/);
    expect(mimeType).toBe("application/json");
    const parsed = JSON.parse(content);
    expect(parsed.format_version).toBe(1);
    expect(parsed.project_name).toBe("Área de Estudo");
  });
});

describe("importProjectConfigPackage", () => {
  function mockPickedFile(content: string) {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "content://fake-picker-uri/config.json" }],
    });
    (global as any).fetch = jest.fn(async () => ({ text: async () => content }));
  }

  it("reads the picked file, parses it, and applies it end to end without persisting the picker uri anywhere", async () => {
    const pkg: ProjectConfigPackage = {
      format_version: 1,
      project_uuid: "picked-project-uuid",
      project_name: "Projeto do Picker",
      protocol_id: "nomos-paisageo-v1",
      protocol_source: "official",
      species_catalog: [],
      vegetation_classes: [],
      active_vegetation_classification: { type: "standard" },
      owner_email: null,
    };
    mockPickedFile(JSON.stringify(pkg));

    const result = await importProjectConfigPackage();

    expect(result?.created).toBe(true);
    const project = projects.find((p) => p.id === result?.projectId)!;
    expect(project.project_uuid).toBe("picked-project-uuid");
    // Nothing about the picker's content:// uri is ever written into the fake db rows.
    expect(JSON.stringify(project)).not.toContain("content://");
  });

  it("throws a clear, distinguishable error for a file that isn't valid JSON", async () => {
    mockPickedFile("this is not json{{{");

    await expect(importProjectConfigPackage()).rejects.toBeInstanceOf(InvalidPackageError);
  });

  it("returns null when the user cancels the picker", async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true });

    const result = await importProjectConfigPackage();

    expect(result).toBeNull();
  });
});
