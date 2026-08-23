import { impactsSchema, impactsItemFields } from "../schema";

describe("schema — Impacts module", () => {
  it("has no fixed fields", () => {
    expect(impactsSchema.fields).toHaveLength(0);
  });

  it("has exactly 1 dynamic group", () => {
    expect(impactsSchema.dynamic).toHaveLength(1);
  });

  it("dynamic group has groupId 'impacts'", () => {
    expect(impactsSchema.dynamic![0].groupId).toBe("impacts");
  });

  it("columnNamePattern contains {i} and {field}", () => {
    const pattern = impactsSchema.dynamic![0].columnNamePattern;
    expect(pattern).toContain("{i}");
    expect(pattern).toContain("{field}");
  });

  it("columnNamePattern is 'impact_{i}_{field}'", () => {
    expect(impactsSchema.dynamic![0].columnNamePattern).toBe("impact_{i}_{field}");
  });

  it("itemFields have exactly 3 fields: type, magnitude, details", () => {
    expect(impactsItemFields).toHaveLength(3);
    expect(impactsItemFields[0].id).toBe("type");
    expect(impactsItemFields[1].id).toBe("magnitude");
    expect(impactsItemFields[2].id).toBe("details");
  });

  it("itemField ids are unique", () => {
    const ids = impactsItemFields.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("magnitude has 3 options: occasional, common, critical", () => {
    const mag = impactsItemFields.find((f) => f.id === "magnitude");
    expect(mag!.options).toHaveLength(3);
    const values = mag!.options!.map((o) => o.value);
    expect(values).toContain("occasional");
    expect(values).toContain("common");
    expect(values).toContain("critical");
  });

  it("all itemFields have a label in pt and en", () => {
    for (const field of impactsItemFields) {
      expect(field.label["pt"]).toBeDefined();
      expect(field.label["en"]).toBeDefined();
    }
  });
});
