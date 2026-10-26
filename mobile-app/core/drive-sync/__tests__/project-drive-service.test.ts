// project-drive-service.ts talks to the real Drive REST API (via
// drive-api-client.ts), which cannot run under ts-jest/node. The client is
// mocked at the module boundary. These tests cover the manifest rules
// (getManifest / updateManifest). The activation of the backup has its own
// suite: activation-service.test.ts.

jest.mock("@/db/queries/projects", () => ({
  getAllDriveFolderIds: jest.fn(async () => []),
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

import { getManifest, updateManifest, type ProjectManifest } from "../project-drive-service";
import { UnsupportedPackageVersionError } from "@/core/project-sharing/package-errors";

beforeEach(() => {
  jest.clearAllMocks();
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
