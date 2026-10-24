// Sends only the pending project-data items to an in-memory Drive. Each item
// is reported as it succeeds (the snapshot is written per item), a failure or
// cancel leaves the rest pending, and the manifest never points at a
// classification whose file did not reach Drive.

import { FakeFile, fsState } from "../../project-sharing/__tests__/fixtures/fake-environment";
import { createInMemoryDrive, ROOT_ID } from "./fixtures/in-memory-drive";

jest.mock("expo-file-system", () => ({ File: FakeFile }));

const drive = createInMemoryDrive(fsState);
jest.mock("@/core/drive-sync/drive-api-client", () => ({
  ensureFolder: (...a: [string, string]) => drive.api.ensureFolder(...a),
  findChildByName: (...a: [string, string]) => drive.api.findChildByName(...a),
  listChildren: (...a: [string]) => drive.api.listChildren(...a),
  uploadJsonFile: (...a: [string, string, unknown]) => drive.api.uploadJsonFile(...a),
  updateJsonFile: (...a: [string, unknown]) => drive.api.updateJsonFile(...a),
}));

const manifestState = { current: { format_version: 1, project_uuid: "p", project_name: "Old", protocol_id: "x", protocol_source: "official", owner_email: "o@x.com", active_vegetation_classification: { type: "standard" } } };
const updateManifestMock = jest.fn(async (_folder: string, updater: (m: typeof manifestState.current) => typeof manifestState.current) => {
  manifestState.current = updater(manifestState.current);
});
jest.mock("@/core/drive-sync/project-drive-service", () => ({
  updateManifest: (folder: string, updater: never) => updateManifestMock(folder, updater),
}));

import { backupProjectData } from "../project-data-backup";
import { buildProjectDataItems } from "../backup-items";
import type { BackupContext } from "../backup-session";
import type { BackupItem } from "../change-detection";
import type { ProjectConfigPackage } from "@/core/project-sharing/project-config-package";

function pkg(overrides: Partial<ProjectConfigPackage> = {}): ProjectConfigPackage {
  return {
    format_version: 1,
    project_uuid: "p",
    project_name: "Campo",
    project_description: "Notas de campo",
    protocol_id: "nomos-paisageo-v1",
    protocol_source: "official",
    species_catalog: [
      { uuid: "s1", scientific_name: "Aspidosperma", source: "manual", common_names: [] },
      { uuid: "s2", scientific_name: "Handroanthus", source: "manual", common_names: [] },
    ],
    vegetation_classes: [{ uuid: "v1", name: "Classif", classes: [], created_at: "x", last_updated: "y" }],
    active_vegetation_classification: { type: "custom", custom_classification_uuid: "v1" },
    owner_email: "o@x.com",
    package_role_for_importer: "collaborator",
    ...overrides,
  } as ProjectConfigPackage;
}

function context(cancelAfterReports = Infinity): BackupContext & { reports: number } {
  const ctx = {
    reports: 0,
    report: () => {
      ctx.reports += 1;
    },
    isCancelled: () => ctx.reports > cancelAfterReports,
  };
  return ctx;
}

beforeEach(() => {
  drive.reset();
  updateManifestMock.mockClear();
  manifestState.current = { ...manifestState.current, project_name: "Old", active_vegetation_classification: { type: "standard" } };
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const run = (pending: BackupItem[], payloads: Map<string, unknown>, ctx: BackupContext, done: (i: BackupItem) => Promise<void> = async () => {}) =>
  backupProjectData({ driveFolderId: ROOT_ID, pending, payloads, context: ctx, onItemDone: done });

describe("backupProjectData", () => {
  it("sends every pending item, reports each as done, and updates the manifest last", async () => {
    const { items, payloads } = buildProjectDataItems(pkg());
    const done: string[] = [];

    const outcome = await run(items, payloads, context(), async (i) => void done.push(i.key));

    expect(outcome).toMatchObject({ sent: 4, failures: [], cancelled: false, notAttempted: 0 });
    expect(done).toEqual(["vegclass:v1", "species:s1", "species:s2", "manifest"]);
    expect(drive.tree()).toEqual(["species-catalog/", "species-catalog/s1.json", "species-catalog/s2.json", "vegetation-classes/", "vegetation-classes/v1.json"]);
    expect(manifestState.current).toMatchObject({ project_name: "Campo", project_description: "Notas de campo", active_vegetation_classification: { type: "custom", custom_classification_uuid: "v1" } });
  });

  it("sends only what is pending: nothing pending means no Drive call at all", async () => {
    const { payloads } = buildProjectDataItems(pkg());
    const outcome = await run([], payloads, context());
    expect(outcome).toMatchObject({ sent: 0, failures: [], notAttempted: 0 });
    expect(drive.callCount()).toBe(0);
  });

  it("updates an existing file instead of creating a duplicate when an item was edited", async () => {
    const first = buildProjectDataItems(pkg());
    await run(first.items, first.payloads, context());
    drive.resetCalls();

    const edited = buildProjectDataItems(
      pkg({ species_catalog: [{ uuid: "s1", scientific_name: "Aspidosperma EDITED", source: "manual", common_names: [] }] }),
    );
    const only = edited.items.filter((i) => i.key === "species:s1");
    await run(only, edited.payloads, context());

    expect(drive.callCount("uploadJsonFile")).toBe(0);
    expect(drive.callCount("updateJsonFile")).toBe(1);
    expect((drive.nodeAt("species-catalog/s1.json")!.json as { scientific_name: string }).scientific_name).toBe("Aspidosperma EDITED");
    expect(drive.tree().filter((p) => p.endsWith("s1.json"))).toHaveLength(1);
  });

  it("a failing item stays pending (not reported) and the rest still go", async () => {
    const { items, payloads } = buildProjectDataItems(pkg());
    drive.failWhen((op, name) => op === "uploadJsonFile" && name === "s1.json");
    const done: string[] = [];

    const outcome = await run(items, payloads, context(), async (i) => void done.push(i.key));

    expect(outcome.sent).toBe(3);
    expect(outcome.failures).toHaveLength(1);
    expect(outcome.failures[0]).toMatchObject({ label: "Aspidosperma", reasonKey: "driveBackup.reason.unknown" });
    expect(done).not.toContain("species:s1");
    expect(done).toContain("species:s2");
  });

  it("holds the manifest back when a classification did not reach Drive", async () => {
    const { items, payloads } = buildProjectDataItems(pkg());
    drive.failWhen((op, name) => op === "uploadJsonFile" && name === "v1.json");

    const outcome = await run(items, payloads, context());

    expect(updateManifestMock).not.toHaveBeenCalled();
    expect(outcome.failures).toHaveLength(1);
    expect(outcome.notAttempted).toBe(1); // the manifest, never attempted
  });

  it("cancels between items: what was sent stays sent, the rest is not attempted", async () => {
    const { items, payloads } = buildProjectDataItems(pkg());
    const done: string[] = [];

    const outcome = await run(items, payloads, context(1), async (i) => void done.push(i.key));

    expect(outcome.cancelled).toBe(true);
    expect(outcome.sent).toBe(2);
    expect(outcome.notAttempted).toBe(2);
    expect(done).toEqual(["vegclass:v1", "species:s1"]);
    expect(updateManifestMock).not.toHaveBeenCalled();
  });

  it("a failure recording the snapshot does not lose the upload or abort the run", async () => {
    const { items, payloads } = buildProjectDataItems(pkg());
    const outcome = await run(items, payloads, context(), async () => {
      throw new Error("sqlite busy");
    });
    expect(outcome.sent).toBe(4);
    expect(outcome.failures).toEqual([]);
  });
});
