import { buildColumns } from "@/core/schema/dynamic-columns";
import { impactsSchema, impactsItemFields } from "../schema";

const ITEM_FIELD_COUNT = impactsItemFields.length; // 3

function makeImpact(type: string, magnitude = "common") {
  return { type, magnitude, details: "" };
}

const pointEmpty = { impacts: [] };
const point1 = { impacts: [makeImpact("pollution", "critical")] };
const point2 = { impacts: [makeImpact("pollution"), makeImpact("erosion")] };
const point3 = { impacts: [makeImpact("pollution"), makeImpact("erosion"), makeImpact("fire", "occasional")] };

describe("buildColumns — Impacts module", () => {
  const { columns, rowFor } = buildColumns(impactsSchema, [pointEmpty, point1, point3], "pt");

  it("has no fixed columns (fields is empty)", () => {
    const nonDynamic = columns.filter((c) => !c.key.startsWith("impact_"));
    expect(nonDynamic).toHaveLength(0);
  });

  it("detects a maximum cardinality of 3 impacts", () => {
    const dynCols = columns.filter((c) => c.key.startsWith("impact_"));
    expect(dynCols).toHaveLength(3 * ITEM_FIELD_COUNT);
  });

  it("total columns = 3 × 3 item fields", () => {
    expect(columns).toHaveLength(3 * ITEM_FIELD_COUNT);
  });

  it("dynamic columns follow the 'impact_{i}_{field}' pattern", () => {
    const dynCols = columns.filter((c) => c.key.startsWith("impact_"));
    expect(dynCols[0].key).toBe(`impact_1_${impactsItemFields[0].id}`);
    expect(dynCols[dynCols.length - 1].key).toBe(`impact_3_${impactsItemFields[ITEM_FIELD_COUNT - 1].id}`);
  });

  it("first column is 'impact_1_type'", () => {
    expect(columns[0].key).toBe("impact_1_type");
  });

  it("rowFor fills null for all fields on an empty point", () => {
    const row = rowFor(pointEmpty as Record<string, unknown>);
    expect(row).toHaveLength(3 * ITEM_FIELD_COUNT);
    expect(row.every((v) => v === null)).toBe(true);
  });

  it("rowFor extracts type from impact 1 and fills null for absent ones (point with 1 impact)", () => {
    const row = rowFor(point1 as Record<string, unknown>);
    // Impact 1: type = "Poluição"
    expect(row[0]).toBe("Poluição");
    // Impact 1: magnitude = "Crítico"
    expect(row[1]).toBe("Crítico");
    // Impacts 2 and 3 (absent): all null
    const remaining = row.slice(ITEM_FIELD_COUNT);
    expect(remaining.every((v) => v === null)).toBe(true);
  });

  it("rowFor correctly extracts all 3 impacts", () => {
    const row = rowFor(point3 as Record<string, unknown>);
    expect(row[0]).toBe("Poluição");
    expect(row[ITEM_FIELD_COUNT]).toBe("Erosão");
    expect(row[2 * ITEM_FIELD_COUNT]).toBe("Fogo");
    expect(row[2 * ITEM_FIELD_COUNT + 1]).toBe("Ocasional");
  });

  it("buildColumns with cardinality 2 generates 2 × 3 columns", () => {
    const { columns: cols2 } = buildColumns(impactsSchema, [point2], "pt");
    expect(cols2).toHaveLength(2 * ITEM_FIELD_COUNT);
  });

  it("rowFor for a point with 2 impacts in a plan of 3 fills null in the 3rd", () => {
    const { columns: cols3, rowFor: rowFor3 } = buildColumns(
      impactsSchema,
      [point2, point3],
      "pt",
    );
    const row = rowFor3(point2 as Record<string, unknown>);
    expect(cols3).toHaveLength(3 * ITEM_FIELD_COUNT);
    // Impact 3 (absent in point2): null
    const third = row.slice(2 * ITEM_FIELD_COUNT);
    expect(third.every((v) => v === null)).toBe(true);
  });
});
