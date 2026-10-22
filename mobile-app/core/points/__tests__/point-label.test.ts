import { getPointDisplayLabel } from "../point-label";

describe("getPointDisplayLabel", () => {
  it("joins the collector code and the point number", () => {
    expect(getPointDisplayLabel({ created_by: "ABCD", point_number: 3 })).toBe("ABCD-3");
  });

  it("falls back to ? when the point has no collector", () => {
    expect(getPointDisplayLabel({ created_by: null, point_number: 7 })).toBe("?-7");
    expect(getPointDisplayLabel({ point_number: 7 })).toBe("?-7");
  });
});
