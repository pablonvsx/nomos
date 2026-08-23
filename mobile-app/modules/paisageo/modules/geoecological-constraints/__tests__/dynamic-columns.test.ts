import { buildColumns } from "@/core/schema/dynamic-columns";
import { geoecologicalConstraintsSchema, soilLayerItemFields } from "../schema";

/** Creates a layer with minimally filled values. */
function makeLayer(i: number) {
  return {
    id: `layer-${i}`,
    depth_start: String((i - 1) * 20),
    depth_end: String(i * 20),
    texture: "clay",
    structure: "granular",
    color_pattern: "homogeneous",
    color_primary: "red",
    color_secondary: null,
    has_gravel: false,
    has_roots: false,
    has_nodules: false,
    has_dispersive: false,
    has_hardened: false,
    has_water_table: false,
    cracks: "absent",
  };
}

const point1 = { mode: "detailed", soil_layers: [makeLayer(1)],                             litter_layer: "absent",  stoniness: "absent",  rockiness: "absent",  bare_soil: "absent" };
const point2 = { mode: "detailed", soil_layers: [makeLayer(1), makeLayer(2)],               litter_layer: "1-5%",   stoniness: "absent",  rockiness: "absent",  bare_soil: "absent" };
const point4 = { mode: "detailed", soil_layers: [makeLayer(1), makeLayer(2), makeLayer(3), makeLayer(4)], litter_layer: ">75%", stoniness: "5-25%", rockiness: "absent",  bare_soil: "1-5%" };

const ITEM_FIELD_COUNT = soilLayerItemFields.length; // 14

describe("buildColumns — Geoecological Constraints module", () => {
  const { columns, rowFor } = buildColumns(geoecologicalConstraintsSchema, [point1, point2, point4], "pt");

  const exportableFixedCount = geoecologicalConstraintsSchema.fields.filter(
    (f) => f.exportable !== false
  ).length;

  it("detects a maximum cardinality of 4 layers", () => {
    const dynamicCols = columns.filter((c) => c.key.startsWith("soil_layer_"));
    expect(dynamicCols).toHaveLength(4 * ITEM_FIELD_COUNT);
  });

  it("exportable fixed columns come before the dynamic ones", () => {
    const firstDynIdx = columns.findIndex((c) => c.key.startsWith("soil_layer_"));
    expect(firstDynIdx).toBe(exportableFixedCount);
  });

  it("total columns = exportable fixed + 4 × 14 layer fields", () => {
    expect(columns).toHaveLength(exportableFixedCount + 4 * ITEM_FIELD_COUNT);
  });

  it("dynamic columns follow the 'soil_layer_{i}_{field}' pattern", () => {
    const dynCols = columns.filter((c) => c.key.startsWith("soil_layer_"));
    expect(dynCols[0].key).toBe(`soil_layer_1_${soilLayerItemFields[0].id}`);
    expect(dynCols[dynCols.length - 1].key).toBe(`soil_layer_4_${soilLayerItemFields[ITEM_FIELD_COUNT - 1].id}`);
  });

  it("rowFor fills null for layers absent in the point with 1 layer", () => {
    const row = rowFor(point1 as Record<string, unknown>);
    const dynPart = row.slice(exportableFixedCount);

    expect(dynPart[0]).toBe("0");
    const remaining = dynPart.slice(ITEM_FIELD_COUNT);
    expect(remaining.every((v) => v === null)).toBe(true);
  });

  it("rowFor fills null for layers absent in the point with 2 layers", () => {
    const row = rowFor(point2 as Record<string, unknown>);
    const dynPart = row.slice(exportableFixedCount);

    expect(dynPart[0]).toBe("0");
    expect(dynPart[ITEM_FIELD_COUNT]).toBe("20");
    const layers34 = dynPart.slice(2 * ITEM_FIELD_COUNT);
    expect(layers34.every((v) => v === null)).toBe(true);
  });

  it("surface cover fields appear as fixed columns", () => {
    const coverIds = ["litter_layer", "stoniness", "rockiness", "bare_soil"];
    const coverCols = columns.filter((c) => coverIds.includes(c.key));
    expect(coverCols).toHaveLength(coverIds.length);
    for (const col of coverCols) {
      const idx = columns.indexOf(col);
      expect(idx).toBeLessThan(exportableFixedCount);
    }
  });

  it("geomorphology fields appear as fixed columns", () => {
    const geomIds = ["exposure", "slope", "topographic_position", "slope_shape", "geomorphology_type"];
    const geomCols = columns.filter((c) => geomIds.includes(c.key));
    expect(geomCols).toHaveLength(geomIds.length);
    for (const col of geomCols) {
      const idx = columns.indexOf(col);
      expect(idx).toBeLessThan(exportableFixedCount);
    }
  });

  it("rowFor correctly extracts surface cover values", () => {
    const row = rowFor(point4 as Record<string, unknown>);
    const litterIdx = columns.findIndex((c) => c.key === "litter_layer");
    expect(row[litterIdx]).toBe(">75%");
  });

  it("rowFor translates the value of a layer select field (texture) to the requested language", () => {
    const { columns: colsPt, rowFor: rowForPt } = buildColumns(geoecologicalConstraintsSchema, [point1], "pt");
    const rowPt = rowForPt(point1 as Record<string, unknown>);
    const textureIdxPt = colsPt.findIndex((c) => c.key === "soil_layer_1_texture");
    expect(rowPt[textureIdxPt]).toBe("Argila");

    const { columns: colsEn, rowFor: rowForEn } = buildColumns(geoecologicalConstraintsSchema, [point1], "en");
    const rowEn = rowForEn(point1 as Record<string, unknown>);
    const textureIdxEn = colsEn.findIndex((c) => c.key === "soil_layer_1_texture");
    expect(rowEn[textureIdxEn]).toBe("Clay");
  });

  it("rowFor translates the value of the fixed field 'mode' (collection mode)", () => {
    const { columns: colsPt, rowFor: rowForPt } = buildColumns(geoecologicalConstraintsSchema, [point1], "pt");
    const rowPt = rowForPt(point1 as Record<string, unknown>);
    const modeIdxPt = colsPt.findIndex((c) => c.key === "mode");
    expect(rowPt[modeIdxPt]).toBe("Detalhado");

    const { columns: colsEn, rowFor: rowForEn } = buildColumns(geoecologicalConstraintsSchema, [point1], "en");
    const rowEn = rowForEn(point1 as Record<string, unknown>);
    const modeIdxEn = colsEn.findIndex((c) => c.key === "mode");
    expect(rowEn[modeIdxEn]).toBe("Detailed");
  });
});
