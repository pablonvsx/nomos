import { isFeatureCollection, parseFeatureCollection } from "../geojson";

describe("parseFeatureCollection", () => {
  it("accepts a FeatureCollection and returns it parsed", () => {
    const text = JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature" }] });
    expect(parseFeatureCollection(text)).toEqual(JSON.parse(text));
  });

  it.each([
    ["a single Feature", JSON.stringify({ type: "Feature", geometry: null })],
    ["a bare geometry", JSON.stringify({ type: "Point", coordinates: [0, 0] })],
    ["an array", "[]"],
    ["a JSON string", '"FeatureCollection"'],
    ["text that is not JSON", "not json {"],
    ["an empty string", ""],
  ])("rejects %s", (_name, text) => {
    expect(parseFeatureCollection(text)).toBeNull();
  });

  it("rejects null and undefined without throwing", () => {
    expect(parseFeatureCollection(null)).toBeNull();
    expect(parseFeatureCollection(undefined)).toBeNull();
  });
});

describe("isFeatureCollection", () => {
  it("is true only for an object whose type is FeatureCollection", () => {
    expect(isFeatureCollection({ type: "FeatureCollection" })).toBe(true);
    expect(isFeatureCollection({ type: "Feature" })).toBe(false);
    expect(isFeatureCollection(null)).toBe(false);
    expect(isFeatureCollection([{ type: "FeatureCollection" }])).toBe(false);
  });
});
