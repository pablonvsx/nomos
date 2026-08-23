import { serializeVegetation, deserializeVegetation } from "../serde";
import type { VegetationModuleData } from "../serde";

const emptySample: VegetationModuleData = {};

const fullSample: VegetationModuleData = {
  raw_formula: "B7c,D7i",
  kuchler_formula: "B7cD7i",
  total_strata: 2,
  physiognomy_name: "Floresta densa latifoliada",
  classification_group: "Floresta densa",
  classification_type: "Floresta densa latifoliada",
  description_text: "Estrato 7 (20 - 35m): Árvore Latifoliada com cobertura Contínuo; Árvore Decídua com cobertura Intermitente.",
  conservation_status: "conservada",
  land_use: undefined,
  matrix: { "7": { B: "c", D: "i" } },
  leaf_matrix: {},
  vegetation_strata: [
    {
      height_id: "7",
      height_range: "20 - 35m",
      life_form: "Árvore Latifoliada; Árvore Decídua",
      cover_class: "Contínuo; Intermitente",
      leaf_adaptation: "",
    },
  ],
};

const withLandUseSample: VegetationModuleData = {
  conservation_status: "substituida",
  land_use: "Pastagem",
  vegetation_strata: [],
};

describe("serializeVegetation / deserializeVegetation — round-trip", () => {
  it("round-trip with empty data preserves the object", () => {
    const raw = serializeVegetation(emptySample);
    expect(typeof raw).toBe("string");
    const restored = deserializeVegetation(raw);
    expect(restored).toEqual(emptySample);
  });

  it("round-trip with complete data preserves all fields", () => {
    const raw = serializeVegetation(fullSample);
    expect(typeof raw).toBe("string");
    const restored = deserializeVegetation(raw) as VegetationModuleData;
    expect(restored).toEqual(fullSample);
    expect(restored.vegetation_strata).toHaveLength(1);
  });

  it("the 'vegetation_strata' field uses the correct key (not 'strata_descriptions')", () => {
    const raw = serializeVegetation(fullSample);
    const obj = JSON.parse(raw);
    expect(obj).toHaveProperty("vegetation_strata");
    expect(obj).not.toHaveProperty("strata_descriptions");
  });

  it("height_id persists through the round-trip when present", () => {
    const raw = serializeVegetation(fullSample);
    const restored = deserializeVegetation(raw) as VegetationModuleData;
    expect(restored.vegetation_strata?.[0].height_id).toBe("7");
  });

  it("missing height_id does not break the round-trip (compatibility with old points)", () => {
    const sample: VegetationModuleData = {
      vegetation_strata: [
        { height_range: "20 - 35m", life_form: "Árvore", cover_class: "Contínuo", leaf_adaptation: "" },
      ],
    };
    const raw = serializeVegetation(sample);
    const restored = deserializeVegetation(raw) as VegetationModuleData;
    expect(restored.vegetation_strata?.[0].height_id).toBeUndefined();
    expect(restored.vegetation_strata?.[0].height_range).toBe("20 - 35m");
  });

  it("conservation_status and land_use fields persist through the round-trip", () => {
    const raw = serializeVegetation(withLandUseSample);
    const restored = deserializeVegetation(raw) as VegetationModuleData;
    expect(restored.conservation_status).toBe("substituida");
    expect(restored.land_use).toBe("Pastagem");
  });

  it("matrix and leaf_matrix persist through the round-trip", () => {
    const raw = serializeVegetation(fullSample);
    const restored = deserializeVegetation(raw) as VegetationModuleData;
    expect(restored.matrix).toEqual({ "7": { B: "c", D: "i" } });
    expect(restored.leaf_matrix).toEqual({});
  });
});
