import { validateModuleSchema } from "@/core/schema/module-schema";
import { vegetationSchema, vegetationStrataItemFields } from "../schema";

describe("vegetationSchema — structural validation", () => {
  it("validateModuleSchema returns ok: true", () => {
    const result = validateModuleSchema(vegetationSchema);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("all fixed field ids are unique", () => {
    const ids = vegetationSchema.fields.map((f) => f.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("all itemField ids are unique within the dynamic group", () => {
    const group = vegetationSchema.dynamic?.[0];
    expect(group).toBeDefined();
    const ids = group!.itemFields.map((f) => f.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("dynamic group has groupId 'vegetation_strata' and a pattern with {i} and {field}", () => {
    const group = vegetationSchema.dynamic?.[0];
    expect(group?.groupId).toBe("vegetation_strata");
    expect(group?.columnNamePattern).toContain("{i}");
    expect(group?.columnNamePattern).toContain("{field}");
  });

  it("the 5 stratum fields are present in vegetationStrataItemFields in the correct order", () => {
    const expectedIds = ["height_id", "height_range", "life_form", "cover_class", "leaf_adaptation"];
    const actualIds = vegetationStrataItemFields.map((f) => f.id);
    expect(actualIds).toEqual(expectedIds);
  });

  it("select fields have non-empty options", () => {
    for (const field of vegetationSchema.fields) {
      if (field.type === "select") {
        expect(field.options?.length).toBeGreaterThan(0);
      }
    }
  });

  it("fixed field ids and itemFields do not overlap", () => {
    const fixedIds = new Set(vegetationSchema.fields.map((f) => f.id));
    const dynamicIds = vegetationSchema.dynamic?.[0]?.itemFields.map((f) => f.id) ?? [];
    for (const id of dynamicIds) {
      expect(fixedIds.has(id)).toBe(false);
    }
  });

  it("the 'matrix' and 'leaf_matrix' fields are non-exportable", () => {
    const matrix = vegetationSchema.fields.find((f) => f.id === "matrix");
    const leafMatrix = vegetationSchema.fields.find((f) => f.id === "leaf_matrix");
    expect(matrix?.exportable).toBe(false);
    expect(leafMatrix?.exportable).toBe(false);
  });
});
