// collectMapFiles: the route / layer files as text, only when they are there and valid.

import { FakeFile, resetFakeFs, fsState } from "../../project-sharing/__tests__/fixtures/fake-environment";

jest.mock("expo-file-system", () => ({ File: FakeFile }));
jest.mock("@/core/project-sharing/module-media", () => ({ getModuleMediaFields: jest.fn(), mapModuleMediaUris: jest.fn() }));
jest.mock("@/core/project-sharing/project-config-package", () => ({ buildProjectConfigPackage: jest.fn() }));
jest.mock("@/db/queries/points", () => ({ getBackupCandidatePointsByProject: jest.fn(), getPointModulesByProject: jest.fn() }));

let project: { geojson_layer?: string; geojson_field_route?: string } | null = null;
jest.mock("@/db/queries/projects", () => ({ getProjectById: async () => project }));

import { collectMapFiles } from "../backup-collectors";

const VALID = JSON.stringify({ type: "FeatureCollection", features: [] });

beforeEach(() => {
  resetFakeFs();
  project = {};
});

describe("collectMapFiles", () => {
  it("returns the text of a layer and a route that exist and are FeatureCollections", async () => {
    fsState.set("file:///document/layer_1.geojson", { isDir: false, content: VALID });
    fsState.set("file:///document/route_1.geojson", { isDir: false, content: VALID });
    project = { geojson_layer: "file:///document/layer_1.geojson", geojson_field_route: "file:///document/route_1.geojson" };

    expect(await collectMapFiles(1)).toEqual({ layer: VALID, route: VALID });
  });

  it("has nothing for an empty column (the person removed it) or a missing project", async () => {
    project = { geojson_layer: "", geojson_field_route: undefined };
    expect(await collectMapFiles(1)).toEqual({ layer: undefined, route: undefined });
    project = null;
    expect(await collectMapFiles(1)).toEqual({ layer: undefined, route: undefined });
  });

  it("has nothing for a file that is gone from the device or is not a FeatureCollection any more", async () => {
    fsState.set("file:///document/route_1.geojson", { isDir: false, content: '{"type":"Feature"}' });
    project = { geojson_layer: "file:///document/gone.geojson", geojson_field_route: "file:///document/route_1.geojson" };

    expect(await collectMapFiles(1)).toEqual({ layer: undefined, route: undefined });
  });
});
