import { InvalidPackageError, UnsupportedPackageVersionError } from "@/core/project-sharing/package-errors";
import {
  MAP_FILE_LIMIT_BYTES,
  MapFileTooLargeError,
  emptyMapIndex,
  fileNameOfSlot,
  isMapItemKey,
  parseMapIndex,
  slotOfKey,
  utf8ByteLength,
  withMapSlot,
} from "../map-index";

describe("map index", () => {
  it("starts empty and sets or clears one slot without touching the other", () => {
    const withLayer = withMapSlot(emptyMapIndex(), "layer", true);
    expect(withLayer).toEqual({ format_version: 1, layer: { file: "map-layer.geojson" }, route: null });
    const both = withMapSlot(withLayer, "route", true);
    expect(both.route).toEqual({ file: "field-route.geojson" });
    expect(withMapSlot(both, "layer", false)).toEqual({ format_version: 1, layer: null, route: { file: "field-route.geojson" } });
  });

  it("knows which item keys are the map files", () => {
    expect(isMapItemKey("maplayer")).toBe(true);
    expect(isMapItemKey("fieldroute")).toBe(true);
    expect(isMapItemKey("manifest")).toBe(false);
    expect(slotOfKey("maplayer")).toBe("layer");
    expect(slotOfKey("fieldroute")).toBe("route");
    expect(fileNameOfSlot("route")).toBe("field-route.geojson");
  });
});

describe("parseMapIndex", () => {
  it("reads a valid index", () => {
    expect(parseMapIndex({ format_version: 1, layer: { file: "map-layer.geojson" }, route: null })).toEqual({
      format_version: 1,
      layer: { file: "map-layer.geojson" },
      route: null,
    });
  });

  it("checks the version before anything else: an unknown version is refused whatever else it holds", () => {
    expect(() => parseMapIndex({ format_version: 2, layer: "garbage" })).toThrow(UnsupportedPackageVersionError);
    expect(() => parseMapIndex({ layer: null, route: null })).toThrow(UnsupportedPackageVersionError);
  });

  it("refuses anything that is not an object, and any file name other than the two fixed ones", () => {
    expect(() => parseMapIndex(null)).toThrow(InvalidPackageError);
    expect(() => parseMapIndex([])).toThrow(InvalidPackageError);
    expect(() => parseMapIndex({ format_version: 1, layer: { file: "other.geojson" }, route: null })).toThrow(InvalidPackageError);
    expect(() => parseMapIndex({ format_version: 1, layer: null, route: { file: "map-layer.geojson" } })).toThrow(InvalidPackageError);
  });

  it("treats a missing slot as empty", () => {
    expect(parseMapIndex({ format_version: 1 })).toEqual({ format_version: 1, layer: null, route: null });
  });
});

describe("utf8ByteLength", () => {
  it("counts bytes, not characters", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("ç")).toBe(2);
    expect(utf8ByteLength("€")).toBe(3);
    expect(utf8ByteLength("😀")).toBe(4);
    expect(utf8ByteLength("")).toBe(0);
    expect(utf8ByteLength("Área São Paulo")).toBe(Buffer.byteLength("Área São Paulo", "utf8"));
  });
});

describe("MapFileTooLargeError", () => {
  it("carries the size in MB for the message", () => {
    const error = new MapFileTooLargeError(MAP_FILE_LIMIT_BYTES + 1024 * 1024);
    expect(error.sizeMb).toBe(6);
    expect(error.name).toBe("MapFileTooLargeError");
  });
});
