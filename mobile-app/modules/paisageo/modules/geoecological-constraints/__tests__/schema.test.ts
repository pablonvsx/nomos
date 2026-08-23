import { validateModuleSchema } from "@/core/schema/module-schema";
import { geoecologicalConstraintsSchema, soilLayerItemFields } from "../schema";

describe("schema — Geoecological Constraints module", () => {
  it("validateModuleSchema returns ok: true", () => {
    const result = validateModuleSchema(geoecologicalConstraintsSchema);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("has 5 geomorphology fields + 19 soil fields (fixed)", () => {
    expect(geoecologicalConstraintsSchema.fields).toHaveLength(24);
  });

  it("fixed field ids are unique", () => {
    const ids = geoecologicalConstraintsSchema.fields.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all itemField ids are unique within the dynamic group", () => {
    const group = geoecologicalConstraintsSchema.dynamic?.[0];
    expect(group).toBeDefined();
    const ids = group!.itemFields.map((f) => f.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("fixed field ids and itemFields do not overlap", () => {
    const fixedIds = new Set(geoecologicalConstraintsSchema.fields.map((f) => f.id));
    const dynamicIds = geoecologicalConstraintsSchema.dynamic?.[0]?.itemFields.map((f) => f.id) ?? [];
    for (const id of dynamicIds) {
      expect(fixedIds.has(id)).toBe(false);
    }
  });

  it("dynamic group has groupId 'soil_layers' and a pattern containing {i}", () => {
    const group = geoecologicalConstraintsSchema.dynamic?.[0];
    expect(group?.groupId).toBe("soil_layers");
    expect(group?.columnNamePattern).toContain("{i}");
    expect(group?.columnNamePattern).toContain("{field}");
  });

  it("all 14 layer fields are present in soilLayerItemFields", () => {
    const expectedIds = [
      "depth_start", "depth_end",
      "texture", "structure",
      "color_pattern", "color_primary", "color_secondary",
      "cracks",
      "has_gravel", "has_roots", "has_nodules",
      "has_dispersive", "has_hardened", "has_water_table",
    ];
    const actualIds = soilLayerItemFields.map((f) => f.id);
    expect(actualIds).toEqual(expectedIds);
  });

  it("select fields have non-empty options", () => {
    for (const field of geoecologicalConstraintsSchema.fields) {
      if (field.type === "select") {
        expect(field.options?.length).toBeGreaterThan(0);
      }
    }
    const group = geoecologicalConstraintsSchema.dynamic?.[0];
    for (const field of group?.itemFields ?? []) {
      if (field.type === "select") {
        expect(field.options?.length).toBeGreaterThan(0);
      }
    }
  });

  it("all fields have a label in pt and en", () => {
    for (const field of geoecologicalConstraintsSchema.fields) {
      expect(field.label["pt"]).toBeDefined();
      expect(field.label["en"]).toBeDefined();
    }
  });

  it("geomorphology_type is a multiselect with 9 options", () => {
    const field = geoecologicalConstraintsSchema.fields.find((f) => f.id === "geomorphology_type");
    expect(field).toBeDefined();
    expect(field!.type).toBe("multiselect");
    expect(field!.options).toHaveLength(9);
  });

  it("exposure is a select with 3 options", () => {
    const field = geoecologicalConstraintsSchema.fields.find((f) => f.id === "exposure");
    expect(field).toBeDefined();
    expect(field!.type).toBe("select");
    expect(field!.options).toHaveLength(3);
  });

  it("slope is a select with 5 options", () => {
    const field = geoecologicalConstraintsSchema.fields.find((f) => f.id === "slope");
    expect(field).toBeDefined();
    expect(field!.type).toBe("select");
    expect(field!.options).toHaveLength(5);
  });

  it("topographic_position is a select with 3 options", () => {
    const field = geoecologicalConstraintsSchema.fields.find((f) => f.id === "topographic_position");
    expect(field).toBeDefined();
    expect(field!.type).toBe("select");
    expect(field!.options).toHaveLength(3);
  });

  it("slope_shape is a select with 3 options", () => {
    const field = geoecologicalConstraintsSchema.fields.find((f) => f.id === "slope_shape");
    expect(field).toBeDefined();
    expect(field!.type).toBe("select");
    expect(field!.options).toHaveLength(3);
  });
});
