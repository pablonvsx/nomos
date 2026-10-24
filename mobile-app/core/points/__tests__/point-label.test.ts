import { formatCoordinates, formatPointName, getPointDisplayLabel } from "../point-label";

describe("getPointDisplayLabel", () => {
  it("joins the collector code and the point number", () => {
    expect(getPointDisplayLabel({ created_by: "ABCD", point_number: 3 })).toBe("ABCD-3");
  });

  it("is just the number when the point has no collector, never a placeholder", () => {
    expect(getPointDisplayLabel({ created_by: null, point_number: 7 })).toBe("7");
    expect(getPointDisplayLabel({ point_number: 7 })).toBe("7");
    expect(getPointDisplayLabel({ created_by: "  ", point_number: 7 })).toBe("7");
    expect(getPointDisplayLabel({ created_by: null, point_number: 7 })).not.toContain("?");
  });
});

describe("formatPointName", () => {
  it("is exactly what the point list shows: the word 'point' and the number", () => {
    expect(formatPointName("Ponto", { point_number: 2 })).toBe("Ponto 2");
    expect(formatPointName("Point", { point_number: 12 })).toBe("Point 12");
  });

  it("is empty when there is no usable number, so the caller shows its unnamed fallback", () => {
    expect(formatPointName("Ponto", {})).toBe("");
    expect(formatPointName("Ponto", { point_number: null })).toBe("");
    expect(formatPointName("Ponto", { point_number: Number.NaN })).toBe("");
  });
});

describe("formatCoordinates", () => {
  it("rounds to four decimals", () => {
    expect(formatCoordinates(-8.0512345, -34.9)).toBe("-8.0512, -34.9000");
  });
});
