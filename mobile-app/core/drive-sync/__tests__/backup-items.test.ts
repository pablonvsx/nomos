import { buildPointItems, buildProjectDataItems, pointItemKey } from "../backup-items";
import type { Point, PointModule } from "@/types/database";
import type { ProjectConfigPackage } from "@/core/project-sharing/project-config-package";

function point(overrides: Partial<Point> = {}): Point {
  return {
    id: 1,
    project_id: 1,
    point_number: 1,
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
    created_by: "ABCD",
    approval_status: "approved",
    drive_synced_at: null,
    uuid: null,
    ...overrides,
  } as unknown as Point;
}

const mod = (pointId: number, data: string, id = "vegetation"): PointModule => ({
  point_id: pointId,
  module_id: id,
  schema_version: "1.0",
  data_json: data,
});

const identity = (uri: string) => `${uri}|10|1`;

async function fingerprintOfPoint(p: Point, modules: PointModule[] = [], media: (uri: string) => string = identity) {
  const [built] = await buildPointItems({ points: [p], modules, mediaIdentity: media, moduleMediaUris: async () => [] });
  return built.fingerprint;
}

describe("buildPointItems - what makes a point pending", () => {
  it("describes a point by its number and where it is, never by a '?' placeholder (the owner's own points have no collector code)", async () => {
    const [built] = await buildPointItems({
      points: [point({ id: 5, point_number: 2, created_by: null as unknown as string, lat: -8.05, lon: -34.9 })],
      modules: [],
      mediaIdentity: identity,
      moduleMediaUris: async () => [],
    });
    expect(built).toMatchObject({ kind: "point", label: "", point: { number: 2, lat: -8.05, lon: -34.9 } });
    expect(JSON.stringify(built)).not.toContain("?");
  });

  it("keys items by point id", async () => {
    const [built] = await buildPointItems({ points: [point({ id: 7 })], modules: [], mediaIdentity: identity, moduleMediaUris: async () => [] });
    expect(built.key).toBe(pointItemKey(7));
  });

  it("changes when a collected value changes", async () => {
    const base = await fingerprintOfPoint(point());
    expect(await fingerprintOfPoint(point({ lat: -8.06 }))).not.toBe(base);
    expect(await fingerprintOfPoint(point({ additional_notes: '{"n":1}' }))).not.toBe(base);
    expect(await fingerprintOfPoint(point(), [mod(1, '{"a":1}')])).not.toBe(base);
  });

  it("changes when module data changes, regardless of module order", async () => {
    const a = await fingerprintOfPoint(point(), [mod(1, '{"a":1}', "m1"), mod(1, '{"b":1}', "m2")]);
    const reordered = await fingerprintOfPoint(point(), [mod(1, '{"b":1}', "m2"), mod(1, '{"a":1}', "m1")]);
    const edited = await fingerprintOfPoint(point(), [mod(1, '{"a":2}', "m1"), mod(1, '{"b":1}', "m2")]);
    expect(reordered).toBe(a);
    expect(edited).not.toBe(a);
  });

  it("is NOT affected by updated_at or drive_synced_at, which the backup itself rewrites", async () => {
    const base = await fingerprintOfPoint(point());
    const afterBackup = point({ updated_at: "2026-10-01T00:00:00.000Z", drive_synced_at: "2026-10-01T00:00:00.000Z" } as Partial<Point>);
    expect(await fingerprintOfPoint(afterBackup)).toBe(base);
  });

  it("notices a replaced photo through its identity, without reading the file", async () => {
    const withPhoto = point({ photos: JSON.stringify([{ uri: "file:///p1.jpg", timestamp: 1 }]) });
    const before = await fingerprintOfPoint(withPhoto, [], (uri) => `${uri}|10|1`);
    const sameFile = await fingerprintOfPoint(withPhoto, [], (uri) => `${uri}|10|1`);
    const replaced = await fingerprintOfPoint(withPhoto, [], (uri) => `${uri}|99|2`);
    expect(sameFile).toBe(before);
    expect(replaced).not.toBe(before);
  });

  it("includes media found inside module data", async () => {
    const m = mod(1, '{"photo":"x"}');
    const [a] = await buildPointItems({ points: [point()], modules: [m], mediaIdentity: (u) => `${u}|1`, moduleMediaUris: async () => ["file:///m.jpg"] });
    const [b] = await buildPointItems({ points: [point()], modules: [m], mediaIdentity: (u) => `${u}|2`, moduleMediaUris: async () => ["file:///m.jpg"] });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});

function pkg(overrides: Partial<ProjectConfigPackage> = {}): ProjectConfigPackage {
  return {
    format_version: 1,
    project_uuid: "p-uuid",
    project_name: "Campo",
    protocol_id: "nomos-paisageo-v1",
    protocol_source: "official",
    species_catalog: [{ uuid: "s1", scientific_name: "Aspidosperma", source: "manual", common_names: [] }],
    vegetation_classes: [{ uuid: "v1", name: "Classif", classes: [{ id: "c1", name: "A" }], created_at: "x", last_updated: "y" }],
    active_vegetation_classification: { type: "standard" },
    owner_email: "o@x.com",
    package_role_for_importer: "collaborator",
    ...overrides,
  } as ProjectConfigPackage;
}

const byKey = (p: ProjectConfigPackage) => new Map(buildProjectDataItems(p).items.map((i) => [i.key, i.fingerprint]));

describe("buildProjectDataItems", () => {
  it("lists protocol (custom only), classifications, species and the manifest, manifest last", () => {
    const custom = pkg({ protocol_source: "custom", custom_protocol: { uuid: "pr", name: "Proto", theme: "t", schema: {} } });
    expect(buildProjectDataItems(custom).items.map((i) => i.key)).toEqual(["protocol", "vegclass:v1", "species:s1", "manifest"]);
    expect(buildProjectDataItems(pkg()).items.map((i) => i.key)).toEqual(["vegclass:v1", "species:s1", "manifest"]);
  });

  it("flags only the item that changed", () => {
    const before = byKey(pkg());
    const addedSpecies = byKey(
      pkg({
        species_catalog: [
          { uuid: "s1", scientific_name: "Aspidosperma", source: "manual", common_names: [] },
          { uuid: "s2", scientific_name: "Handroanthus", source: "manual", common_names: [] },
        ],
      }),
    );
    expect(addedSpecies.has("species:s2")).toBe(true);
    expect(addedSpecies.get("species:s1")).toBe(before.get("species:s1"));
    expect(addedSpecies.get("vegclass:v1")).toBe(before.get("vegclass:v1"));
    expect(addedSpecies.get("manifest")).toBe(before.get("manifest"));
  });

  it("an edited classification changes that item, not the species", () => {
    const before = byKey(pkg());
    const edited = byKey(pkg({ vegetation_classes: [{ uuid: "v1", name: "Classif", classes: [{ id: "c1", name: "B" }], created_at: "x", last_updated: "z" }] }));
    expect(edited.get("vegclass:v1")).not.toBe(before.get("vegclass:v1"));
    expect(edited.get("species:s1")).toBe(before.get("species:s1"));
  });

  it("the manifest changes with the project name, the description or the active classification", () => {
    const before = byKey(pkg());
    expect(byKey(pkg({ project_name: "Outro" })).get("manifest")).not.toBe(before.get("manifest"));
    const described = byKey(pkg({ project_description: "Notas de campo" }));
    expect(described.get("manifest")).not.toBe(before.get("manifest"));
    // Only the manifest is affected by a description edit.
    expect(described.get("species:s1")).toBe(before.get("species:s1"));
    expect(described.get("vegclass:v1")).toBe(before.get("vegclass:v1"));
    expect(
      byKey(pkg({ active_vegetation_classification: { type: "custom", custom_classification_uuid: "v1" } })).get("manifest"),
    ).not.toBe(before.get("manifest"));
  });

  it("carries the payload to upload for each item", () => {
    const { payloads } = buildProjectDataItems(pkg());
    expect(payloads.get("species:s1")).toMatchObject({ uuid: "s1" });
    expect(payloads.get("manifest")).toMatchObject({ project_name: "Campo", protocol_id: "nomos-paisageo-v1" });
  });
});
