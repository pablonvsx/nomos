// project-drive-service.ts talks to the real Drive REST API (via
// drive-api-client.ts) and to Google Sign-In (via google-auth-service.ts),
// neither of which can run under ts-jest/node. Every dependency is mocked
// at the module boundary, same convention used since Fase 0 - including
// buildProjectConfigPackage itself (Fase 0), so these tests exercise only
// activateDriveBackup's own orchestration logic (ordering, guards, what
// gets uploaded), not Fase 0's uuid-persistence behavior, which already
// has its own test coverage in project-config-package.test.ts.

interface FakeProjectRow {
  id: number;
  name: string;
  collaboration_role: "owner" | "collaborator" | null;
}

let projects: FakeProjectRow[] = [];

function resetFakeProjects() {
  projects = [];
}

function seedProject(overrides: Partial<FakeProjectRow> = {}): FakeProjectRow {
  const row: FakeProjectRow = {
    id: projects.length + 1,
    name: "Projeto Teste",
    collaboration_role: null,
    ...overrides,
  };
  projects.push(row);
  return row;
}

const getProjectByIdMock = jest.fn(async (id: number) => projects.find((p) => p.id === id) ?? null);
const setProjectAsOwnerMock = jest.fn(async (...args: unknown[]) => true);

jest.mock("@/db/queries/projects", () => ({
  getProjectById: (id: number) => getProjectByIdMock(id),
  setProjectAsOwner: (...args: unknown[]) => setProjectAsOwnerMock(...args),
}));

const getCurrentGoogleAccountMock = jest.fn();
jest.mock("@/core/google-auth/google-auth-service", () => ({
  getCurrentGoogleAccount: () => getCurrentGoogleAccountMock(),
}));

const buildProjectConfigPackageMock = jest.fn();
jest.mock("@/core/project-sharing/project-config-package", () => ({
  buildProjectConfigPackage: (projectId: number) => buildProjectConfigPackageMock(projectId),
}));

const ensureFolderMock = jest.fn(async (name: string, parentId: string) => `${parentId}/${name}`);
const findChildByNameMock = jest.fn();
const readJsonFileMock = jest.fn();
const updateJsonFileMock = jest.fn();
const uploadJsonFileMock = jest.fn(async (...args: unknown[]) => ({
  id: "file-id",
  name: "x",
  mimeType: "application/json",
}));

jest.mock("@/core/drive-sync/drive-api-client", () => ({
  ensureFolder: (name: string, parentId: string) => ensureFolderMock(name, parentId),
  findChildByName: (parentId: string, name: string) => findChildByNameMock(parentId, name),
  readJsonFile: (fileId: string) => readJsonFileMock(fileId),
  updateJsonFile: (fileId: string, content: unknown) => updateJsonFileMock(fileId, content),
  uploadJsonFile: (name: string, parentId: string, content: unknown) =>
    uploadJsonFileMock(name, parentId, content),
}));

import {
  activateDriveBackup,
  getManifest,
  updateManifest,
  GoogleAccountRequiredError,
  InvalidCollaborationRoleError,
  type ProjectManifest,
} from "../project-drive-service";
import { UnsupportedPackageVersionError } from "@/core/project-sharing/package-errors";

const CONNECTED_ACCOUNT = { email: "owner@example.com", name: "Owner" };

function samplePkg(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    format_version: 1,
    project_uuid: "project-uuid-1",
    project_name: "Projeto Teste",
    protocol_id: "nomos-paisageo-v1",
    protocol_source: "official" as const,
    species_catalog: [] as Array<{ uuid: string; scientific_name: string }>,
    vegetation_classes: [] as Array<{ uuid: string; name: string }>,
    active_vegetation_classification: { type: "standard" as const },
    owner_email: null,
    package_role_for_importer: "collaborator" as const,
    ...overrides,
  };
}

function allDriveMockFunctions(): jest.Mock[] {
  return [ensureFolderMock, findChildByNameMock, readJsonFileMock, updateJsonFileMock, uploadJsonFileMock];
}

beforeEach(() => {
  resetFakeProjects();
  jest.clearAllMocks();
  getCurrentGoogleAccountMock.mockReturnValue(CONNECTED_ACCOUNT);
  ensureFolderMock.mockImplementation(async (name: string, parentId: string) => `${parentId}/${name}`);
  uploadJsonFileMock.mockResolvedValue({ id: "file-id", name: "x", mimeType: "application/json" });
});

describe("activateDriveBackup - guards", () => {
  it("refuses without a connected Google account, touching no Drive function", async () => {
    getCurrentGoogleAccountMock.mockReturnValue(null);
    const project = seedProject();

    await expect(activateDriveBackup(project.id)).rejects.toBeInstanceOf(GoogleAccountRequiredError);
    expect(allDriveMockFunctions().some((fn) => fn.mock.calls.length > 0)).toBe(false);
    expect(buildProjectConfigPackageMock).not.toHaveBeenCalled();
  });

  it.each(["owner", "collaborator"] as const)(
    "refuses a project whose collaboration_role is already %s, touching no Drive function",
    async (role) => {
      const project = seedProject({ collaboration_role: role });

      await expect(activateDriveBackup(project.id)).rejects.toBeInstanceOf(
        InvalidCollaborationRoleError,
      );
      expect(allDriveMockFunctions().some((fn) => fn.mock.calls.length > 0)).toBe(false);
      expect(buildProjectConfigPackageMock).not.toHaveBeenCalled();
    },
  );
});

describe("activateDriveBackup - happy path", () => {
  it("uses the project_uuid already resolved by buildProjectConfigPackage for the project folder name, without generating a separate one", async () => {
    const project = seedProject();
    buildProjectConfigPackageMock.mockResolvedValue(samplePkg({ project_uuid: "existing-uuid-123" }));

    await activateDriveBackup(project.id);

    const projectFolderCall = ensureFolderMock.mock.calls.find(([name]) =>
      String(name).includes("existing-uuid-123"),
    );
    expect(projectFolderCall).toBeTruthy();
  });

  it("uploads the custom protocol package when protocol_source is custom", async () => {
    const project = seedProject();
    buildProjectConfigPackageMock.mockResolvedValue(
      samplePkg({
        protocol_source: "custom",
        custom_protocol: { uuid: "proto-uuid", name: "Fauna", theme: "fauna", schema: { sections: [] } },
      }),
    );

    await activateDriveBackup(project.id);

    expect(uploadJsonFileMock).toHaveBeenCalledWith(
      "protocol-package.json",
      expect.any(String),
      expect.objectContaining({ uuid: "proto-uuid" }),
    );
  });

  it("uploads every species and every vegetation class (not just the active one)", async () => {
    const project = seedProject();
    buildProjectConfigPackageMock.mockResolvedValue(
      samplePkg({
        species_catalog: [
          { uuid: "species-1", scientific_name: "Panthera onca" },
          { uuid: "species-2", scientific_name: "Puma concolor" },
        ],
        vegetation_classes: [
          { uuid: "veg-1", name: "Ativa" },
          { uuid: "veg-2", name: "Outra" },
        ],
        active_vegetation_classification: { type: "custom", custom_classification_uuid: "veg-1" },
      }),
    );

    await activateDriveBackup(project.id);

    expect(uploadJsonFileMock).toHaveBeenCalledWith(
      "species-1.json",
      expect.any(String),
      expect.objectContaining({ uuid: "species-1" }),
    );
    expect(uploadJsonFileMock).toHaveBeenCalledWith(
      "species-2.json",
      expect.any(String),
      expect.objectContaining({ uuid: "species-2" }),
    );
    expect(uploadJsonFileMock).toHaveBeenCalledWith(
      "veg-1.json",
      expect.any(String),
      expect.objectContaining({ uuid: "veg-1" }),
    );
    expect(uploadJsonFileMock).toHaveBeenCalledWith(
      "veg-2.json",
      expect.any(String),
      expect.objectContaining({ uuid: "veg-2" }),
    );
  });

  it("uploads manifest.json with the connected account's email as owner_email, and marks the project as owner", async () => {
    const project = seedProject();
    buildProjectConfigPackageMock.mockResolvedValue(samplePkg({ owner_email: null }));

    await activateDriveBackup(project.id);

    expect(uploadJsonFileMock).toHaveBeenCalledWith(
      "manifest.json",
      expect.any(String),
      expect.objectContaining({ owner_email: CONNECTED_ACCOUNT.email }),
    );
    expect(setProjectAsOwnerMock).toHaveBeenCalledWith(
      project.id,
      expect.any(String),
      CONNECTED_ACCOUNT.email,
    );
  });
});

describe("getManifest", () => {
  beforeEach(() => {
    findChildByNameMock.mockResolvedValue({
      id: "manifest-file-id",
      name: "manifest.json",
      mimeType: "application/json",
    });
  });

  it("rejects a manifest without format_version (e.g. one written before this check existed), before trusting any other field", async () => {
    readJsonFileMock.mockResolvedValue({
      project_uuid: "manifest-uuid",
      project_name: "Projeto",
      protocol_id: "nomos-paisageo-v1",
      protocol_source: "official",
      owner_email: "owner@example.com",
      active_vegetation_classification: { type: "standard" },
      // format_version intentionally absent.
    });

    await expect(getManifest("folder-1")).rejects.toBeInstanceOf(UnsupportedPackageVersionError);
  });

  it("accepts a manifest with the current format_version", async () => {
    readJsonFileMock.mockResolvedValue({
      format_version: 1,
      project_uuid: "manifest-uuid",
      project_name: "Projeto",
      protocol_id: "nomos-paisageo-v1",
      protocol_source: "official",
      owner_email: "owner@example.com",
      active_vegetation_classification: { type: "standard" },
    });

    await expect(getManifest("folder-1")).resolves.toMatchObject({ project_uuid: "manifest-uuid" });
  });
});

describe("updateManifest", () => {
  const currentManifest: ProjectManifest = {
    format_version: 1,
    project_uuid: "manifest-uuid",
    project_name: "Projeto",
    protocol_id: "nomos-paisageo-v1",
    protocol_source: "official",
    owner_email: "owner@example.com",
    active_vegetation_classification: { type: "standard" },
  };

  beforeEach(() => {
    findChildByNameMock.mockResolvedValue({ id: "manifest-file-id", name: "manifest.json", mimeType: "application/json" });
    readJsonFileMock.mockResolvedValue(currentManifest);
  });

  it("refuses an updater that would change project_uuid, without writing", async () => {
    await expect(
      updateManifest("folder-1", (current) => ({ ...current, project_uuid: "different-uuid" })),
    ).rejects.toThrow();
    expect(updateJsonFileMock).not.toHaveBeenCalled();
  });

  it("refuses a naive updater that reconstructs the manifest from scratch and drops owner_email, without writing", async () => {
    // Simulates exactly the class of bug section 14.1/14.3 warns about: a
    // caller that rebuilds the object from local state instead of
    // spreading `current`, silently losing owner_email.
    const naiveUpdater = (): ProjectManifest => ({
      format_version: currentManifest.format_version,
      project_uuid: currentManifest.project_uuid,
      project_name: "Novo Nome",
      protocol_id: currentManifest.protocol_id,
      protocol_source: currentManifest.protocol_source,
      owner_email: "" as unknown as string, // reconstructed from scratch, forgot owner_email
      active_vegetation_classification: currentManifest.active_vegetation_classification,
    });

    await expect(updateManifest("folder-1", naiveUpdater)).rejects.toThrow();
    expect(updateJsonFileMock).not.toHaveBeenCalled();
  });

  it("refuses an updater that would change format_version, without writing", async () => {
    await expect(
      updateManifest("folder-1", (current) => ({
        ...current,
        format_version: 2 as unknown as 1,
      })),
    ).rejects.toThrow();
    expect(updateJsonFileMock).not.toHaveBeenCalled();
  });

  it("allows an updater that preserves project_uuid and owner_email while changing another field", async () => {
    await updateManifest("folder-1", (current) => ({ ...current, project_name: "Novo Nome" }));

    expect(updateJsonFileMock).toHaveBeenCalledWith(
      "manifest-file-id",
      expect.objectContaining({ project_name: "Novo Nome", owner_email: "owner@example.com" }),
    );
  });
});
