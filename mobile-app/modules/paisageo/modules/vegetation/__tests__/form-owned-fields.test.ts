import { applyVegetationRendererUpdate, FORM_OWNED_VEGETATION_KEYS } from "../form-owned-fields";

// What the renderer sends after a matrix cell was used: its own fields, plus the
// loose ones as they were in its (stale) copy of the blob.
const staleUpdate = (overrides: Record<string, unknown> = {}) => ({
  raw_formula: "A1",
  matrix: { cells: [1] },
  homogeneity_check: false, // stale: the renderer did not re-render when the box was ticked
  conservation_status: "preservada",
  ...overrides,
});

describe("applyVegetationRendererUpdate", () => {
  it("keeps the homogeneity checkbox ticked when the renderer reports a matrix change with a stale 'false'", () => {
    const prev = { raw_formula: "old", homogeneity_check: true, conservation_status: "preservada" };

    const result = applyVegetationRendererUpdate(prev, staleUpdate());

    expect(result.homogeneity_check).toBe(true);
  });

  it("keeps conservation_status and land_use from the latest state, not from the renderer's stale copy", () => {
    const prev = { conservation_status: "substituida", land_use: "pasto", homogeneity_check: true };

    const result = applyVegetationRendererUpdate(prev, staleUpdate({ land_use: "agricultura" }));

    expect(result).toMatchObject({ conservation_status: "substituida", land_use: "pasto" });
  });

  it("leaves a form-owned key absent when the latest state does not have it (e.g. land_use the screen cleared)", () => {
    const prev = { conservation_status: "preservada" };

    const result = applyVegetationRendererUpdate(prev, staleUpdate({ land_use: "pasto" }));

    expect("land_use" in result).toBe(false);
    expect("homogeneity_check" in result).toBe(false);
  });

  it("applies everything else the renderer reports", () => {
    const result = applyVegetationRendererUpdate({ homogeneity_check: true }, staleUpdate());

    expect(result).toMatchObject({ raw_formula: "A1", matrix: { cells: [1] } });
  });

  it("works with no previous state or a null update, and modifies neither argument", () => {
    expect(applyVegetationRendererUpdate(undefined, staleUpdate()).homogeneity_check).toBeUndefined();
    expect(applyVegetationRendererUpdate({ homogeneity_check: true }, null)).toEqual({ homogeneity_check: true });

    const prev = Object.freeze({ homogeneity_check: true });
    const next = Object.freeze(staleUpdate());
    expect(() => applyVegetationRendererUpdate(prev, next)).not.toThrow();
    expect(next.homogeneity_check).toBe(false);
  });

  it("covers the three loose fields of the screen", () => {
    expect([...FORM_OWNED_VEGETATION_KEYS]).toEqual(["homogeneity_check", "conservation_status", "land_use"]);
  });
});
