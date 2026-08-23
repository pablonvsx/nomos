import { buildColumns } from "@/core/schema/dynamic-columns";
import { vegetationSchema, vegetationStrataItemFields } from "../schema";

function makeStratum(i: number) {
  return {
    height_id: `HeightId${i}`,
    height_range: `Estrato ${i}`,
    life_form: `Forma${i}`,
    cover_class: `Cobertura${i}`,
    leaf_adaptation: "",
  };
}

const point0 = {
  raw_formula: "",
  kuchler_formula: "",
  total_strata: 0,
  // vegetation_strata absent = point with no strata
};

const point2 = {
  raw_formula: "B7c,D7i",
  kuchler_formula: "B7cD7i",
  total_strata: 2,
  conservation_status: "conservada",
  vegetation_strata: [makeStratum(1), makeStratum(2)],
};

const point3 = {
  raw_formula: "B7c,D7i.G2c",
  kuchler_formula: "B7cD7iG2c",
  total_strata: 3,
  conservation_status: "em_regeneracao_nativas",
  vegetation_strata: [makeStratum(1), makeStratum(2), makeStratum(3)],
};

const ITEM_FIELD_COUNT = vegetationStrataItemFields.length; // 4

describe("buildColumns — Vegetation module", () => {
  const { columns, rowFor } = buildColumns(
    vegetationSchema,
    [point0, point2, point3],
    "pt",
  );

  const exportableFixedCount = vegetationSchema.fields.filter(
    (f) => f.exportable !== false,
  ).length;

  it("detects a maximum cardinality of 3 strata", () => {
    const dynCols = columns.filter((c) => c.key.startsWith("veg_stratum_"));
    expect(dynCols).toHaveLength(3 * ITEM_FIELD_COUNT);
  });

  it("exportable fixed columns come before the dynamic ones", () => {
    const firstDynIdx = columns.findIndex((c) => c.key.startsWith("veg_stratum_"));
    expect(firstDynIdx).toBe(exportableFixedCount);
  });

  it("total columns = exportable fixed + 3 × 5 stratum fields", () => {
    expect(columns).toHaveLength(exportableFixedCount + 3 * ITEM_FIELD_COUNT);
  });

  it("dynamic columns follow the 'veg_stratum_{i}_{field}' pattern", () => {
    const dynCols = columns.filter((c) => c.key.startsWith("veg_stratum_"));
    expect(dynCols[0].key).toBe(`veg_stratum_1_${vegetationStrataItemFields[0].id}`);
    expect(dynCols[dynCols.length - 1].key).toBe(
      `veg_stratum_3_${vegetationStrataItemFields[ITEM_FIELD_COUNT - 1].id}`,
    );
  });

  it("rowFor fills null for strata absent in the point with no strata", () => {
    const row = rowFor(point0 as Record<string, unknown>);
    const dynPart = row.slice(exportableFixedCount);
    expect(dynPart.every((v) => v === null)).toBe(true);
  });

  it("rowFor fills null for strata absent in the point with 2 strata", () => {
    const row = rowFor(point2 as Record<string, unknown>);
    const dynPart = row.slice(exportableFixedCount);

    // Stratum 1: height_id (first field) must be non-null
    expect(dynPart[0]).toBe("HeightId1");
    // Stratum 2: height_id (first field) must be non-null
    expect(dynPart[ITEM_FIELD_COUNT]).toBe("HeightId2");
    // Stratum 3 (absent): all fields must be null
    const stratum3 = dynPart.slice(2 * ITEM_FIELD_COUNT);
    expect(stratum3.every((v) => v === null)).toBe(true);
  });

  it("rowFor extracts conservation_status as a fixed column, translated to the requested language", () => {
    const row = rowFor(point2 as Record<string, unknown>);
    const csIdx = columns.findIndex((c) => c.key === "conservation_status");
    expect(row[csIdx]).toBe("Conservada");
  });
});
