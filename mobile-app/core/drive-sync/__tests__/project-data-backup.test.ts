// Sends only the pending project-data items to an in-memory Drive. Each item
// is reported as it succeeds (the snapshot is written per item), a failure or
// cancel leaves the rest pending, and the manifest never points at a
// classification whose file did not reach Drive.

import { FakeFile, fsState } from "../../project-sharing/__tests__/fixtures/fake-environment";
import { createInMemoryDrive, ROOT_ID } from "./fixtures/in-memory-drive";

jest.mock("expo-file-system", () => ({ File: FakeFile }));

const drive = createInMemoryDrive(fsState);
// The timeout each JSON write was asked for, to check that a large map file gets the long one.
const timeoutsUsed: number[] = [];
jest.mock("@/core/drive-sync/drive-api-client", () => ({
  DRIVE_METADATA_TIMEOUT_MS: 30_000,
  DRIVE_TRANSFER_TIMEOUT_MS: 180_000,
  ensureFolder: (...a: [string, string]) => drive.api.ensureFolder(...a),
  findChildByName: (...a: [string, string]) => drive.api.findChildByName(...a),
  listChildren: (...a: [string]) => drive.api.listChildren(...a),
  readJsonFile: (...a: [string]) => drive.api.readJsonFile(...a),
  uploadJsonFile: (name: string, parent: string, content: unknown, timeout?: number) => {
    if (timeout !== undefined) timeoutsUsed.push(timeout);
    return drive.api.uploadJsonFile(name, parent, content);
  },
  updateJsonFile: (id: string, content: unknown, timeout?: number) => {
    if (timeout !== undefined) timeoutsUsed.push(timeout);
    return drive.api.updateJsonFile(id, content);
  },
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
    activity: () => {},
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

/** A context that records every report and every activity event, in order. */
function recordingContext(): BackupContext & { reported: Array<[number, number]>; events: string[] } {
  const ctx = {
    reported: [] as Array<[number, number]>,
    events: [] as string[],
    report: (_stage: unknown, current: number, total: number) => void ctx.reported.push([current, total]),
    activity: (event: { type: string; item: { kind: string; label: string } }) =>
      void ctx.events.push(`${event.type}:${event.item.kind}:${event.item.label}`),
    isCancelled: () => false,
  };
  return ctx;
}

describe("backupProjectData: progress by the item in progress, and the activity log", () => {
  it("reports the position of the item going up (1 of N, then 2 of N ...), never the count already done", async () => {
    const { items, payloads } = buildProjectDataItems(pkg());
    const ctx = recordingContext();

    await run(items, payloads, ctx);

    expect(ctx.reported).toEqual([[1, 4], [2, 4], [3, 4], [4, 4]]);
  });

  it("logs start then done for each item, in sending order, naming each by its own label", async () => {
    const { items, payloads } = buildProjectDataItems(pkg());
    const ctx = recordingContext();

    await run(items, payloads, ctx);

    expect(ctx.events.map((e) => e.split(":").slice(0, 2).join(":"))).toEqual([
      "item-start:classification", "item-done:classification",
      "item-start:species", "item-done:species",
      "item-start:species", "item-done:species",
      "item-start:manifest", "item-done:manifest",
    ]);
    expect(ctx.events).toContain("item-start:species:Aspidosperma");
  });

  it("logs item-failed (and no item-done) for the item that failed, then keeps going with the next", async () => {
    const { items, payloads } = buildProjectDataItems(pkg());
    drive.failWhen((op, name) => op === "uploadJsonFile" && name === "s1.json");
    const ctx = recordingContext();

    await run(items, payloads, ctx);

    expect(ctx.events).toContain("item-failed:species:Aspidosperma");
    expect(ctx.events).not.toContain("item-done:species:Aspidosperma");
    expect(ctx.events.filter((e) => e.startsWith("item-start:species"))).toHaveLength(2);
    // The failure did not move the bar: the next item is simply the next position.
    expect(ctx.reported.map(([current]) => current)).toEqual([1, 2, 3, 4]);
  });
});

describe("backupProjectData: field route and map layer", () => {
  const layerText = JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { n: 1 }, geometry: null }] });
  const routeText = JSON.stringify({ type: "FeatureCollection", features: [] });
  const withMap = (map: { layer?: string; route?: string }) => buildProjectDataItems(pkg(), map);
  const mapNode = (name: string) => drive.nodeAt(`map/${name}`, ROOT_ID);

  beforeEach(() => {
    timeoutsUsed.length = 0;
  });

  it("writes the files raw under map/ with an index, before the manifest", async () => {
    const { items, payloads } = withMap({ layer: layerText, route: routeText });
    const done: string[] = [];

    const outcome = await run(items, payloads, context(), async (i) => void done.push(i.key));

    expect(outcome).toMatchObject({ sent: 6, failures: [] });
    expect(done.slice(-3)).toEqual(["maplayer", "fieldroute", "manifest"]);
    expect(mapNode("map-layer.geojson")!.json).toEqual(JSON.parse(layerText));
    expect(mapNode("field-route.geojson")!.json).toEqual(JSON.parse(routeText));
    expect(mapNode("index.json")!.json).toEqual({
      format_version: 1,
      layer: { file: "map-layer.geojson" },
      route: { file: "field-route.geojson" },
    });
  });

  it("backing up again updates the files and the index instead of adding copies", async () => {
    const first = withMap({ layer: layerText });
    await run(first.items, first.payloads, context());
    const edited = JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { n: 2 }, geometry: null }] });
    const second = withMap({ layer: edited });
    drive.resetCalls();

    await run(second.items.filter((i) => i.key === "maplayer"), second.payloads, context());

    expect(drive.tree().filter((p) => p.startsWith("map/"))).toEqual(["map/", "map/index.json", "map/map-layer.geojson"]);
    expect(drive.callCount("uploadJsonFile")).toBe(0);
    expect(mapNode("map-layer.geojson")!.json).toEqual(JSON.parse(edited));
  });

  it("the fingerprint is the content: same file same fingerprint, a changed file a different one", () => {
    const a = withMap({ layer: layerText }).items.find((i) => i.key === "maplayer")!;
    const same = withMap({ layer: layerText }).items.find((i) => i.key === "maplayer")!;
    const other = withMap({ layer: layerText.replace('"n":1', '"n":2') }).items.find((i) => i.key === "maplayer")!;
    expect(same.fingerprint).toBe(a.fingerprint);
    expect(other.fingerprint).not.toBe(a.fingerprint);
  });

  it("a project without route or layer has no map item at all", () => {
    expect(withMap({}).items.map((i) => i.key)).not.toEqual(expect.arrayContaining(["maplayer"]));
    expect(withMap({}).items.some((i) => i.group === "map")).toBe(false);
  });

  it("removing one clears its slot in the index and leaves the file on Drive", async () => {
    const both = withMap({ layer: layerText, route: routeText });
    await run(both.items, both.payloads, context());
    const removal: BackupItem = { key: "fieldroute", kind: "fieldRoute", label: "", group: "map", fingerprint: "removed" };

    const outcome = await run([removal], new Map([["fieldroute", null]]), context());

    expect(outcome).toMatchObject({ sent: 1, failures: [] });
    expect(mapNode("index.json")!.json).toEqual({ format_version: 1, layer: { file: "map-layer.geojson" }, route: null });
    expect(mapNode("field-route.geojson")).toBeDefined(); // nothing is ever deleted on Drive
  });

  it("removing something that was never backed up touches nothing on Drive", async () => {
    const removal: BackupItem = { key: "maplayer", kind: "mapLayer", label: "", group: "map", fingerprint: "removed" };
    drive.resetCalls();

    const outcome = await run([removal], new Map([["maplayer", null]]), context());

    expect(outcome).toMatchObject({ sent: 1, failures: [] });
    expect(drive.callCount("uploadJsonFile")).toBe(0);
    expect(drive.tree()).toEqual([]);
  });

  it("an index with a format_version this build does not know is never overwritten: the item fails", async () => {
    const folder = await drive.api.ensureFolder("map", ROOT_ID);
    await drive.api.uploadJsonFile("index.json", folder, { format_version: 9, layer: null, route: null });
    const { items, payloads } = withMap({ layer: layerText });

    const outcome = await run(items.filter((i) => i.key === "maplayer"), payloads, context());

    expect(outcome.sent).toBe(0);
    expect(outcome.failures).toHaveLength(1);
    expect(mapNode("index.json")!.json).toEqual({ format_version: 9, layer: null, route: null });
  });

  it("a file over the limit fails with its own reason instead of going up", async () => {
    const huge = JSON.stringify({ type: "FeatureCollection", features: [], pad: "x".repeat(5 * 1024 * 1024 + 10) });
    const { items, payloads } = withMap({ layer: huge });

    const outcome = await run(items.filter((i) => i.key === "maplayer"), payloads, context());

    expect(outcome.sent).toBe(0);
    expect(outcome.failures[0]).toMatchObject({ kind: "mapLayer", reasonKey: "driveBackup.reason.mapTooLarge" });
    expect(mapNode("map-layer.geojson")).toBeUndefined();
  });

  it("a small file uses the short timeout, one over 1 MB the long (transfer) one", async () => {
    const small = withMap({ layer: layerText });
    await run(small.items.filter((i) => i.key === "maplayer"), small.payloads, context());
    expect(timeoutsUsed).toEqual([30_000]);

    timeoutsUsed.length = 0;
    const big = JSON.stringify({ type: "FeatureCollection", features: [], pad: "x".repeat(1024 * 1024 + 10) });
    const large = withMap({ route: big });
    await run(large.items.filter((i) => i.key === "fieldroute"), large.payloads, context());
    expect(timeoutsUsed[0]).toBe(180_000);
  });

  it("the manifest keeps its project_uuid, owner_email and format_version when a map item is sent with it", async () => {
    const { items, payloads } = withMap({ layer: layerText });

    await run(items, payloads, context());

    expect(manifestState.current).toMatchObject({ format_version: 1, project_uuid: "p", owner_email: "o@x.com" });
  });
});

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

  it("a network error stops the run at the first item and counts the rest as not attempted", async () => {
    const { items, payloads } = buildProjectDataItems(pkg());
    const ensureSpy = jest.spyOn(drive.api, "ensureFolder").mockImplementation(async () => {
      throw new Error("Network request failed");
    });

    const outcome = await run(items, payloads, context());

    ensureSpy.mockRestore();
    expect(outcome.connectionLost).toBe(true);
    expect(outcome.sent).toBe(0);
    expect(outcome.failures).toHaveLength(1);
    expect(outcome.notAttempted).toBe(items.length - 1);
  });

  it("createManifest (activation) creates the manifest instead of requiring one, and replaces a leftover one on a retry", async () => {
    const { items, payloads } = buildProjectDataItems(pkg());
    const manifest = {
      format_version: 1 as const,
      project_uuid: "p",
      project_name: "Campo",
      project_description: "Notas de campo",
      protocol_id: "nomos-paisageo-v1",
      protocol_source: "official" as const,
      owner_email: "o@x.com",
      active_vegetation_classification: { type: "standard" as const },
    };
    const send = () =>
      backupProjectData({ driveFolderId: ROOT_ID, pending: items, payloads, context: context(), onItemDone: async () => {}, createManifest: manifest });

    await send();
    expect(updateManifestMock).not.toHaveBeenCalled(); // no existing manifest was needed
    expect(drive.nodeAt("manifest.json")!.json).toMatchObject({ owner_email: "o@x.com", project_description: "Notas de campo" });

    await send(); // a retry
    expect(drive.tree().filter((p) => p.endsWith("manifest.json"))).toHaveLength(1);
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
