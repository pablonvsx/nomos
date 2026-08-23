import {
  serializeGeoecologicalConstraints,
  deserializeGeoecologicalConstraints,
  moduleDataToProfile,
  profileToModuleData,
} from "../serde";
import type { GeoecologicalConstraintsModuleData } from "../serde";

const simpleSample: GeoecologicalConstraintsModuleData = {
  exposure: "windward",
  slope: "gentle",
  topographic_position: "top",
  slope_shape: "concave",
  geomorphology_type: ["fluvial", "lacustrine"],
  mode: "simple",
  simple_color_pattern: "homogeneous",
  simple_color_primary: "yellowish_brown",
  simple_color_secondary: null,
  simple_texture: "clay_loam",
  simple_structure: "granular",
  simple_cracks: "absent",
  simple_has_gravel: false,
  simple_has_roots: true,
  simple_has_nodules: false,
  simple_has_dispersive: false,
  simple_has_hardened: false,
  simple_has_water_table: false,
  litter_layer: "5-25%",
  stoniness: "absent",
  rockiness: "absent",
  bare_soil: "1-5%",
};

const detailedSample: GeoecologicalConstraintsModuleData = {
  exposure: "leeward",
  slope: "steep",
  topographic_position: "lower",
  slope_shape: "convex",
  geomorphology_type: ["hillslope", "karst"],
  mode: "detailed",
  soil_layers: [
    {
      id: "layer-1",
      depth_start: "0",
      depth_end: "20",
      texture: "clay",
      structure: "granular",
      color_pattern: "homogeneous",
      color_primary: "red",
      color_secondary: null,
      has_gravel: false,
      has_roots: true,
      has_nodules: false,
      has_dispersive: false,
      has_hardened: false,
      has_water_table: false,
      cracks: "absent",
    },
    {
      id: "layer-2",
      depth_start: "20",
      depth_end: "50",
      texture: "sandy_clay",
      structure: "angular_blocky",
      color_pattern: "variegated",
      color_primary: "yellowish_red",
      color_secondary: "yellowish_brown",
      has_gravel: true,
      has_roots: false,
      has_nodules: true,
      has_dispersive: false,
      has_hardened: false,
      has_water_table: false,
      cracks: "narrow",
    },
    {
      id: "layer-3",
      depth_start: "50",
      depth_end: "80",
      texture: "clay",
      structure: "prismatic",
      color_pattern: "homogeneous",
      color_primary: "dark_gray",
      color_secondary: null,
      has_gravel: false,
      has_roots: false,
      has_nodules: false,
      has_dispersive: false,
      has_hardened: true,
      has_water_table: true,
      cracks: "wide",
    },
  ],
  litter_layer: ">75%",
  stoniness: "1-5%",
  rockiness: "absent",
  bare_soil: "absent",
};

describe("serializeGeoecologicalConstraints / deserializeGeoecologicalConstraints — round-trip", () => {
  it("round-trip simple mode preserves all fields", () => {
    const raw = serializeGeoecologicalConstraints(simpleSample);
    expect(typeof raw).toBe("string");
    const restored = deserializeGeoecologicalConstraints(raw);
    expect(restored).toEqual(simpleSample);
  });

  it("round-trip detailed mode (3 layers) preserves all layers and fields", () => {
    const raw = serializeGeoecologicalConstraints(detailedSample);
    expect(typeof raw).toBe("string");
    const restored = deserializeGeoecologicalConstraints(raw) as GeoecologicalConstraintsModuleData;
    expect(restored).toEqual(detailedSample);
    expect(restored.soil_layers).toHaveLength(3);
  });

  it("serialized simple mode does not contain the 'soil_layers' key", () => {
    const raw = serializeGeoecologicalConstraints(simpleSample);
    const obj = JSON.parse(raw);
    expect(obj).not.toHaveProperty("soil_layers");
  });

  it("serialized detailed mode uses the 'soil_layers' key (not 'layers')", () => {
    const raw = serializeGeoecologicalConstraints(detailedSample);
    const obj = JSON.parse(raw);
    expect(obj).toHaveProperty("soil_layers");
    expect(obj).not.toHaveProperty("layers");
  });

  it("surface cover fields persist through the round-trip", () => {
    const raw = serializeGeoecologicalConstraints(detailedSample);
    const restored = deserializeGeoecologicalConstraints(raw) as GeoecologicalConstraintsModuleData;
    expect(restored.litter_layer).toBe(">75%");
    expect(restored.stoniness).toBe("1-5%");
    expect(restored.rockiness).toBe("absent");
    expect(restored.bare_soil).toBe("absent");
  });

  it("geomorphology_type as an array is preserved", () => {
    const data: GeoecologicalConstraintsModuleData = { geomorphology_type: ["hillslope", "fluvial", "karst"] };
    const result = deserializeGeoecologicalConstraints(serializeGeoecologicalConstraints(data)) as GeoecologicalConstraintsModuleData;
    expect(result.geomorphology_type).toEqual(["hillslope", "fluvial", "karst"]);
  });

  it("legacy compatibility: geomorphology_type as a JSON string becomes an array", () => {
    const legacy = JSON.stringify({ geomorphology_type: '["fluvial","lacustrine"]' });
    const result = deserializeGeoecologicalConstraints(legacy) as GeoecologicalConstraintsModuleData;
    expect(result.geomorphology_type).toEqual(["fluvial", "lacustrine"]);
  });

  it("legacy compatibility: geomorphology_type as a plain string becomes a single-element array", () => {
    const legacy = JSON.stringify({ geomorphology_type: "hillslope" });
    const result = deserializeGeoecologicalConstraints(legacy) as GeoecologicalConstraintsModuleData;
    expect(result.geomorphology_type).toEqual(["hillslope"]);
  });

  it("partial object (only exposure) survives the round-trip", () => {
    const partial: GeoecologicalConstraintsModuleData = { exposure: "leeward" };
    const result = deserializeGeoecologicalConstraints(serializeGeoecologicalConstraints(partial));
    expect(result).toEqual(partial);
  });

  it("empty object survives the round-trip", () => {
    const empty: GeoecologicalConstraintsModuleData = {};
    expect(deserializeGeoecologicalConstraints(serializeGeoecologicalConstraints(empty))).toEqual(empty);
  });
});

describe("moduleDataToProfile / profileToModuleData — round-trip", () => {
  it("detailed mode: soil_layers becomes layers and back to soil_layers without losing layers", () => {
    const profile = moduleDataToProfile(detailedSample);
    expect(profile.layers).toHaveLength(3);
    expect((profile as any).soil_layers).toBeUndefined();

    const roundTripped = profileToModuleData(profile, { mode: "simple" });
    expect(roundTripped.soil_layers).toHaveLength(3);
    expect(roundTripped.soil_layers).toEqual(detailedSample.soil_layers);
    expect((roundTripped as any).layers).toBeUndefined();
  });

  it("simple mode: simple_* fields survive the round-trip conversion", () => {
    const profile = moduleDataToProfile(simpleSample);
    const roundTripped = profileToModuleData(profile, { mode: "simple" });
    expect(roundTripped.simple_color_pattern).toBe("homogeneous");
    expect(roundTripped.simple_texture).toBe("clay_loam");
    expect(roundTripped.simple_has_roots).toBe(true);
  });

  it("simulates the real flow: form.tsx saves via profileToModuleData and the result is serializable with the correct key", () => {
    const profile = moduleDataToProfile(detailedSample);
    const savedObj = profileToModuleData(profile, { mode: "simple" });
    savedObj.litter_layer = detailedSample.litter_layer;
    savedObj.stoniness = detailedSample.stoniness;
    savedObj.rockiness = detailedSample.rockiness;
    savedObj.bare_soil = detailedSample.bare_soil;

    const raw = serializeGeoecologicalConstraints(savedObj);
    const obj = JSON.parse(raw);
    expect(obj).toHaveProperty("soil_layers");
    expect(obj).not.toHaveProperty("layers");
    expect(obj.soil_layers).toHaveLength(3);
  });
});
