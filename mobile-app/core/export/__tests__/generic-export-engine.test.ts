import { buildProtocolExportPlan } from "../generic-export-engine";
import { geoecologicalConstraintsModule } from "@/modules/paisageo/modules/geoecological-constraints/geoecological-constraints.module";
import { vegetationModule } from "@/modules/paisageo/modules/vegetation/vegetation.module";
import { impactsModule } from "@/modules/paisageo/modules/impacts/impacts.module";
import { EXTRA_POINT_COLUMNS } from "@/modules/paisageo/services/export-columns";
import { PAISAGEO_POINTS, CUSTOM_POINTS } from "./fixtures";
import type { ModuleDescriptor, FieldSchema, LanguageCode } from "@/protocol-kernel/types";

const PAISAGEO_MODULES = [geoecologicalConstraintsModule, vegetationModule, impactsModule];
const LANG: LanguageCode = "pt";
// 7 base columns (id, point_number, created_at, latitude, longitude, altitude,
// collector_code) + 3 PAISAGEO extras (generated_name, landscape_class_id,
// point_size).
const POINT_COLUMN_COUNT = 7 + EXTRA_POINT_COLUMNS.length;

// --- Helpers ---

function makeSimpleModule(id: string, fields: FieldSchema[]): ModuleDescriptor {
  return {
    id,
    title: { pt: id, en: id, es: id, fr: id },
    schema: { fields },
    serialize: JSON.stringify,
    deserialize: (raw) => JSON.parse(raw as string),
  };
}

// --- Engine tests ---

describe("buildProtocolExportPlan — column structure", () => {
  const plan = buildProtocolExportPlan(PAISAGEO_MODULES, PAISAGEO_POINTS, LANG, EXTRA_POINT_COLUMNS);

  it("includes the 10 point-level fields at the start (7 base + 3 PAISAGEO extras)", () => {
    const pointKeys = [
      "id", "point_number", "created_at", "latitude", "longitude", "altitude", "collector_code",
      "generated_name", "landscape_class_id", "point_size",
    ];
    const planKeys = plan.columns.slice(0, POINT_COLUMN_COUNT).map((c) => c.key);
    expect(planKeys).toEqual(pointKeys);
  });

  it("includes soil dynamic columns (soil_layer_{i}_{field})", () => {
    const soilDyn = plan.columns.filter((c) => c.key.startsWith("soil_layer_"));
    // max soil_layers = 3 (point 2), 14 fields per layer
    expect(soilDyn).toHaveLength(3 * 14);
    expect(soilDyn[0].key).toBe("soil_layer_1_depth_start");
    expect(soilDyn[13].key).toBe("soil_layer_1_has_water_table");
  });

  it("includes vegetation dynamic columns (veg_stratum_{i}_{field})", () => {
    const vegDyn = plan.columns.filter((c) => c.key.startsWith("veg_stratum_"));
    // max vegetation_strata = 4 (point 2), 5 fields per stratum
    expect(vegDyn).toHaveLength(4 * 5);
    expect(vegDyn[0].key).toBe("veg_stratum_1_height_id");
    expect(vegDyn[5].key).toBe("veg_stratum_2_height_id"); // 5 fields per stratum
  });

  it("includes impact dynamic columns (impact_{i}_{field})", () => {
    const impDyn = plan.columns.filter((c) => c.key.startsWith("impact_"));
    // max impacts = 2 (point 1), 3 fields per impact
    expect(impDyn).toHaveLength(2 * 3);
    expect(impDyn[0].key).toBe("impact_1_type");
    expect(impDyn[1].key).toBe("impact_1_magnitude");
    expect(impDyn[2].key).toBe("impact_1_details");
  });

  it("excludes fields with exportable: false (matrix, leaf_matrix)", () => {
    const keys = plan.columns.map((c) => c.key);
    expect(keys).not.toContain("matrix");
    expect(keys).not.toContain("leaf_matrix");
  });

  it("includes simple_description (D5: legacy field with real data, exportable: true)", () => {
    const keys = plan.columns.map((c) => c.key);
    expect(keys).toContain("simple_description");
  });

  it("excludes media fields (photo, audio, notes)", () => {
    // no photo/audio/notes column should leak into the column plan -
    // text notes now only go out in media export (ZIP), not as a column
    const keys = plan.columns.map((c) => c.key);
    expect(keys.some((k) => k.includes("photo"))).toBe(false);
    expect(keys.some((k) => k.includes("audio"))).toBe(false);
    expect(keys).not.toContain("additional_notes");
  });
});

describe("buildProtocolExportPlan — rowFor", () => {
  const plan = buildProtocolExportPlan(PAISAGEO_MODULES, PAISAGEO_POINTS, LANG, EXTRA_POINT_COLUMNS);

  it("point 1: correct point-level values", () => {
    const row = plan.rowFor(PAISAGEO_POINTS[0]);
    expect(row[0]).toBe("1");                       // id
    expect(row[1]).toBe(1);                         // point_number
    expect(row[2]).toBe("2026-01-10T08:00:00.000Z"); // created_at
    expect(row[3]).toBe(-8.0);                      // latitude
    expect(row[4]).toBe(-36.0);                     // longitude
    expect(row[5]).toBe(500);                       // altitude
    expect(row[6]).toBeNull();                      // collector_code (not a collaborative project)
    expect(row[7]).toBe("SE_001");                  // generated_name
    expect(row[8]).toBe(42);                        // landscape_class_id
    expect(row[9]).toBe(20);                        // point_size
  });

  it("point 3: missing fields are null", () => {
    const row = plan.rowFor(PAISAGEO_POINTS[2]);
    expect(row[5]).toBeNull();  // altitude
    expect(row[6]).toBeNull();  // collector_code
    expect(row[7]).toBeNull();  // generated_name
    expect(row[8]).toBeNull();  // landscape_class_id
    expect(row[9]).toBeNull();  // point_size
  });

  it("point 1: impacts correctly indexed (D4)", () => {
    const row = plan.rowFor(PAISAGEO_POINTS[0]);
    const imp1TypeIdx = plan.columns.findIndex((c) => c.key === "impact_1_type");
    expect(row[imp1TypeIdx]).toBe("Poluição");
    expect(row[imp1TypeIdx + 1]).toBe("Ocasional"); // magnitude
    expect(row[imp1TypeIdx + 2]).toBe("esgoto próximo"); // details
    const imp2TypeIdx = plan.columns.findIndex((c) => c.key === "impact_2_type");
    expect(row[imp2TypeIdx]).toBe("Erosão");
  });

  it("point 2: empty impacts → impact columns are null", () => {
    const row = plan.rowFor(PAISAGEO_POINTS[1]);
    const imp1Idx = plan.columns.findIndex((c) => c.key === "impact_1_type");
    expect(row[imp1Idx]).toBeNull();
    expect(row[imp1Idx + 1]).toBeNull();
  });

  it("point 1: simple soil — mode field present, translated to the requested language", () => {
    const row = plan.rowFor(PAISAGEO_POINTS[0]);
    const modeIdx = plan.columns.findIndex((c) => c.key === "mode");
    expect(row[modeIdx]).toBe("Simples");
  });

  it("point 2: detailed soil layers filled in", () => {
    const row = plan.rowFor(PAISAGEO_POINTS[1]);
    const layer1StartIdx = plan.columns.findIndex((c) => c.key === "soil_layer_1_depth_start");
    expect(row[layer1StartIdx]).toBe("0");
    const layer2StartIdx = plan.columns.findIndex((c) => c.key === "soil_layer_2_depth_start");
    expect(row[layer2StartIdx]).toBe("20");
    const layer3StartIdx = plan.columns.findIndex((c) => c.key === "soil_layer_3_depth_start");
    expect(row[layer3StartIdx]).toBe("60");
  });

  it("point 1: vegetation strata filled in", () => {
    const row = plan.rowFor(PAISAGEO_POINTS[0]);
    const str1Idx = plan.columns.findIndex((c) => c.key === "veg_stratum_1_height_id");
    expect(row[str1Idx]).toBe("A");
    expect(row[str1Idx + 1]).toBe("0-2m"); // height_range
    const str2Idx = plan.columns.findIndex((c) => c.key === "veg_stratum_2_height_id");
    expect(row[str2Idx]).toBe("B");
    // strata 3 and 4 missing → null
    const str3Idx = plan.columns.findIndex((c) => c.key === "veg_stratum_3_height_id");
    expect(row[str3Idx]).toBeNull();
    const str4Idx = plan.columns.findIndex((c) => c.key === "veg_stratum_4_height_id");
    expect(row[str4Idx]).toBeNull();
  });

  it("geomorphology_type is an array → toCell joins with ', ' (consistent with the previous exporter)", () => {
    const row = plan.rowFor(PAISAGEO_POINTS[0]);
    const gtIdx = plan.columns.findIndex((c) => c.key === "geomorphology_type");
    expect(row[gtIdx]).toBe("De encosta, Fluvial");
  });

  it("description_text with a newline is sanitized to ' | ' by the engine (D8)", () => {
    const row = plan.rowFor(PAISAGEO_POINTS[1]);
    const descIdx = plan.columns.findIndex((c) => c.key === "description_text");
    expect(row[descIdx]).toBe("Dossel denso | nota adicional");
  });
});

describe("buildProtocolExportPlan — toGeoJSONProperties", () => {
  const plan = buildProtocolExportPlan(PAISAGEO_MODULES, PAISAGEO_POINTS, LANG, EXTRA_POINT_COLUMNS);

  it("point 1: includes coordinates correctly", () => {
    const props = plan.toGeoJSONProperties(PAISAGEO_POINTS[0]);
    expect(props.latitude).toBe(-8.0);
    expect(props.longitude).toBe(-36.0);
    expect(props.altitude).toBe(500);
  });

  it("point 1: impacts indexed in the properties (D4)", () => {
    const props = plan.toGeoJSONProperties(PAISAGEO_POINTS[0]);
    expect(props.impact_1_type).toBe("Poluição");
    expect(props.impact_2_type).toBe("Erosão");
    // The old exporter used to produce: impact_Poluição_magnitude (type as property name)
    expect(props["impact_Poluição_magnitude"]).toBeUndefined();
  });
});

describe("buildProtocolExportPlan — key collisions between modules", () => {
  it("moduleId_ prefixes are applied on collision", () => {
    const modA = makeSimpleModule("mod_a", [{ id: "campo", label: { pt: "Campo A", en: "Field A", es: "A", fr: "A" }, type: "text" }]);
    const modB = makeSimpleModule("mod_b", [{ id: "campo", label: { pt: "Campo B", en: "Field B", es: "B", fr: "B" }, type: "text" }]);
    const plan = buildProtocolExportPlan([modA, modB], [], LANG);
    const keys = plan.columns.map((c) => c.key);
    // modA not prefixed (first to register), modB prefixed
    expect(keys).toContain("campo");
    expect(keys).toContain("mod_b_campo");
    expect(keys).not.toContain("mod_a_campo");
  });

  it("no collision across the 3 PAISAGEO modules", () => {
    const plan = buildProtocolExportPlan(PAISAGEO_MODULES, PAISAGEO_POINTS, LANG, EXTRA_POINT_COLUMNS);
    const moduleKeys = plan.columns.slice(POINT_COLUMN_COUNT).map((c) => c.key);
    const uniqueKeys = new Set(moduleKeys);
    expect(uniqueKeys.size).toBe(moduleKeys.length);
  });
});

describe("buildProtocolExportPlan — key collisions between Custom modules", () => {
  it("custom points: rowFor doesn't throw even without a module on the point", () => {
    const modA = makeSimpleModule("section-a", [
      { id: "nome_local", label: { pt: "Nome local", en: "Local name", es: "Nombre", fr: "Nom" }, type: "text" },
      { id: "area_ha", label: { pt: "Área (ha)", en: "Area (ha)", es: "Área", fr: "Surface" }, type: "number" },
    ]);
    const plan = buildProtocolExportPlan([modA], CUSTOM_POINTS, LANG);
    expect(() => plan.rowFor(CUSTOM_POINTS[0])).not.toThrow();
    expect(() => plan.rowFor(CUSTOM_POINTS[1])).not.toThrow();
  });
});
