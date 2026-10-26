// Activating the Drive backup, against an in-memory Drive. The properties that
// matter once it runs inside the backup session (cancelable, repeatable):
// the project becomes an owner project ONLY when everything was sent, and a
// second attempt after a cancel or a failure reuses what is already in Drive
// instead of duplicating it.

import { FakeFile, fsState } from "../../project-sharing/__tests__/fixtures/fake-environment";
import { createInMemoryDrive, ROOT_ID } from "./fixtures/in-memory-drive";

jest.mock("expo-file-system", () => ({ File: FakeFile }));

const drive = createInMemoryDrive(fsState);
jest.mock("@/core/drive-sync/drive-api-client", () => ({
  ensureFolder: (...a: [string, string]) => drive.api.ensureFolder(...a),
  findChildByName: (...a: [string, string]) => drive.api.findChildByName(...a),
  listChildren: (...a: [string]) => drive.api.listChildren(...a),
  readJsonFile: (...a: [string]) => drive.api.readJsonFile(...a),
  uploadJsonFile: (...a: [string, string, unknown]) => drive.api.uploadJsonFile(...a),
  updateJsonFile: (...a: [string, unknown]) => drive.api.updateJsonFile(...a),
}));

interface FakeProjectRow {
  id: number;
  name: string;
  collaboration_role: "owner" | "collaborator" | null;
  drive_folder_id: string | null;
}
let projects: FakeProjectRow[] = [];
const setProjectAsOwnerMock = jest.fn(async (id: number, folderId: string, email: string) => {
  const row = projects.find((p) => p.id === id)!;
  row.collaboration_role = "owner";
  row.drive_folder_id = folderId;
  return true;
});
jest.mock("@/db/queries/projects", () => ({
  getProjectById: async (id: number) => projects.find((p) => p.id === id) ?? null,
  setProjectAsOwner: (id: number, folderId: string, email: string) => setProjectAsOwnerMock(id, folderId, email),
  getAllDriveFolderIds: jest.fn(async () => []),
}));

const seedBackupSnapshotsMock = jest.fn(async () => undefined);
jest.mock("@/core/drive-sync/backup-status-service", () => ({
  seedBackupSnapshots: (...a: unknown[]) => seedBackupSnapshotsMock(...(a as [])),
}));

const getCurrentGoogleAccountMock = jest.fn();
jest.mock("@/core/google-auth/google-auth-service", () => ({
  getCurrentGoogleAccount: () => getCurrentGoogleAccountMock(),
}));

const buildProjectConfigPackageMock = jest.fn();
jest.mock("@/core/project-sharing/project-config-package", () => ({
  buildProjectConfigPackage: (id: number) => buildProjectConfigPackageMock(id),
}));

// The route / layer files of the project (read from the device in the real collector).
let mapFilesOfProject: { layer?: string; route?: string } = {};
jest.mock("@/core/drive-sync/backup-collectors", () => ({
  collectMapFiles: jest.fn(async () => mapFilesOfProject),
}));

import { runActivation } from "../activation-service";
import { GoogleAccountRequiredError, InvalidCollaborationRoleError } from "../project-drive-service";
import type { BackupContext } from "../backup-session";

const ACCOUNT = { email: "owner@example.com", name: "Owner" };

function pkg(overrides: Record<string, unknown> = {}) {
  return {
    format_version: 1,
    project_uuid: "project-uuid-1",
    project_name: "Projeto Teste",
    project_description: "Notas",
    protocol_id: "nomos-paisageo-v1",
    protocol_source: "official" as const,
    species_catalog: [
      { uuid: "species-1", scientific_name: "Panthera onca", source: "manual", common_names: [] },
      { uuid: "species-2", scientific_name: "Puma concolor", source: "manual", common_names: [] },
    ],
    vegetation_classes: [
      { uuid: "veg-1", name: "Ativa", classes: [], created_at: "a", last_updated: "b" },
      { uuid: "veg-2", name: "Outra", classes: [], created_at: "a", last_updated: "b" },
    ],
    active_vegetation_classification: { type: "custom" as const, custom_classification_uuid: "veg-1" },
    owner_email: null,
    package_role_for_importer: "collaborator" as const,
    ...overrides,
  };
}

function context(cancelAfterReports = Infinity): BackupContext & { reports: number; stages: string[] } {
  const ctx = {
    reports: 0,
    stages: [] as string[],
    report: (stage: { key: string }) => {
      ctx.reports += 1;
      ctx.stages.push(stage.key);
    },
    activity: () => {},
    isCancelled: () => ctx.reports > cancelAfterReports,
  };
  return ctx;
}

const projectFolder = () => drive.nodeAt("Nomos/Nomos_Projeto Teste_project-uuid-1", ROOT_ID);

beforeEach(() => {
  mapFilesOfProject = {};
  drive.reset();
  projects = [{ id: 1, name: "Projeto Teste", collaboration_role: null, drive_folder_id: null }];
  jest.clearAllMocks();
  getCurrentGoogleAccountMock.mockReturnValue(ACCOUNT);
  buildProjectConfigPackageMock.mockResolvedValue(pkg());
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("runActivation - guards", () => {
  it("refuses without a connected Google account, touching nothing", async () => {
    getCurrentGoogleAccountMock.mockReturnValue(null);
    await expect(runActivation(1, context())).rejects.toBeInstanceOf(GoogleAccountRequiredError);
    expect(drive.callCount()).toBe(0);
    expect(buildProjectConfigPackageMock).not.toHaveBeenCalled();
  });

  it.each(["owner", "collaborator"] as const)("refuses a project that is already %s", async (role) => {
    projects[0].collaboration_role = role;
    await expect(runActivation(1, context())).rejects.toBeInstanceOf(InvalidCollaborationRoleError);
    expect(drive.callCount()).toBe(0);
  });
});

describe("runActivation - a complete activation", () => {
  it("builds the folder tree, sends every item with the manifest last, and only then makes the project an owner", async () => {
    const ctx = context();
    const result = await runActivation(1, ctx);

    expect(result).toMatchObject({ outcome: "completed", notSent: 0 });
    expect(drive.tree()).toEqual([
      "Nomos/",
      "Nomos/Nomos_Projeto Teste_project-uuid-1/",
      "Nomos/Nomos_Projeto Teste_project-uuid-1/approved/",
      "Nomos/Nomos_Projeto Teste_project-uuid-1/manifest.json",
      "Nomos/Nomos_Projeto Teste_project-uuid-1/species-catalog/",
      "Nomos/Nomos_Projeto Teste_project-uuid-1/species-catalog/species-1.json",
      "Nomos/Nomos_Projeto Teste_project-uuid-1/species-catalog/species-2.json",
      "Nomos/Nomos_Projeto Teste_project-uuid-1/vegetation-classes/",
      "Nomos/Nomos_Projeto Teste_project-uuid-1/vegetation-classes/veg-1.json",
      "Nomos/Nomos_Projeto Teste_project-uuid-1/vegetation-classes/veg-2.json",
    ]);
    expect(projectFolder()).toBeDefined();
    const manifest = drive.nodeAt("Nomos/Nomos_Projeto Teste_project-uuid-1/manifest.json", ROOT_ID)!.json;
    expect(manifest).toMatchObject({
      owner_email: ACCOUNT.email,
      project_uuid: "project-uuid-1",
      project_description: "Notas",
      active_vegetation_classification: { type: "custom", custom_classification_uuid: "veg-1" },
    });
    expect(setProjectAsOwnerMock).toHaveBeenCalledWith(1, expect.any(String), ACCOUNT.email);
    expect(seedBackupSnapshotsMock).toHaveBeenCalledWith(1, ["project"]);
    expect(ctx.stages[0]).toBe("driveBackup.stage.activationFolders");
  });

  it("sends the custom protocol package too", async () => {
    buildProjectConfigPackageMock.mockResolvedValue(
      pkg({ protocol_source: "custom", custom_protocol: { uuid: "proto-uuid", name: "Fauna", theme: "fauna", schema: { sections: [] } } }),
    );
    await runActivation(1, context());
    expect(drive.nodeAt("Nomos/Nomos_Projeto Teste_project-uuid-1/protocol-package.json", ROOT_ID)).toBeDefined();
  });
});

describe("runActivation - route and layer", () => {
  it("sends the project's route and layer with the rest, before the manifest, and writes the index", async () => {
    mapFilesOfProject = {
      layer: JSON.stringify({ type: "FeatureCollection", features: [] }),
      route: JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature" }] }),
    };

    const result = await runActivation(1, context());

    expect(result.outcome).toBe("completed");
    const folder = "Nomos/Nomos_Projeto Teste_project-uuid-1";
    expect(drive.nodeAt(`${folder}/map/map-layer.geojson`, ROOT_ID)?.json).toEqual({ type: "FeatureCollection", features: [] });
    expect(drive.nodeAt(`${folder}/map/field-route.geojson`, ROOT_ID)?.json).toMatchObject({ type: "FeatureCollection" });
    expect(drive.nodeAt(`${folder}/map/index.json`, ROOT_ID)?.json).toEqual({
      format_version: 1,
      layer: { file: "map-layer.geojson" },
      route: { file: "field-route.geojson" },
    });
  });

  it("a project without route or layer gets no map folder at all", async () => {

    await runActivation(1, context());

    expect(drive.tree().some((path) => path.includes("map/"))).toBe(false);
  });
});

describe("runActivation - never half-activated", () => {
  it("cancelled in the middle: the project does NOT become an owner and no snapshot is written", async () => {
    const result = await runActivation(1, context(2));

    expect(result.outcome).toBe("cancelled");
    expect(setProjectAsOwnerMock).not.toHaveBeenCalled();
    expect(seedBackupSnapshotsMock).not.toHaveBeenCalled();
    expect(projects[0].collaboration_role).toBeNull();
  });

  it("a failing item: not activated", async () => {
    drive.failWhen((op, name) => op === "uploadJsonFile" && name === "species-2.json");
    const result = await runActivation(1, context());

    expect(result.outcome).toBe("incomplete");
    expect(setProjectAsOwnerMock).not.toHaveBeenCalled();
    // The manifest was written, but the project stays local: the next attempt completes the activation.
    expect(projects[0].collaboration_role).toBeNull();
  });

  it("the connection drops mid-run: stops at the first network error and is not activated", async () => {
    const original = drive.api.ensureFolder;
    const spy = jest.spyOn(drive.api, "ensureFolder");
    // The first three folders (Nomos root, the project folder, approved/) are created; the next call fails.
    spy.mockImplementationOnce((...a) => original(...a));
    spy.mockImplementationOnce((...a) => original(...a));
    spy.mockImplementationOnce((...a) => original(...a));
    spy.mockImplementation(async () => {
      throw new Error("Network request failed");
    });

    const result = await runActivation(1, context());

    expect(result.outcome).toBe("error");
    expect(result.error?.reasonKey).toBe("driveBackup.reason.offline");
    expect(setProjectAsOwnerMock).not.toHaveBeenCalled();
  });
});

describe("runActivation - repeating after a cancel or a failure", () => {
  it("does not duplicate folders or files, and finishes the activation", async () => {
    await runActivation(1, context(2)); // cancelled midway
    const afterFirst = drive.tree();

    const result = await runActivation(1, context());

    expect(result.outcome).toBe("completed");
    expect(setProjectAsOwnerMock).toHaveBeenCalledTimes(1);
    const names = drive.tree();
    expect(new Set(names).size).toBe(names.length); // nothing appears twice
    expect(names.filter((p) => p.endsWith("manifest.json"))).toHaveLength(1);
    expect(names.length).toBeGreaterThanOrEqual(afterFirst.length);
  });

  it("replaces a manifest left by an earlier attempt instead of creating a second one", async () => {
    await runActivation(1, context());
    projects[0] = { id: 1, name: "Projeto Teste", collaboration_role: null, drive_folder_id: null }; // as if never marked
    drive.resetCalls();

    await runActivation(1, context());

    const manifests = drive.tree().filter((p) => p.endsWith("manifest.json"));
    expect(manifests).toHaveLength(1);
  });
});
