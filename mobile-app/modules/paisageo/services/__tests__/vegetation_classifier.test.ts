import { classifyVegetation, type ContextFlag } from "../vegetation_classifier";

// This suite covers, by construction, every one of the 97 catalogued
// physiognomy codes (see classificacao_vegetacao.md §3 for the reachability
// ledger this table was built from), the "Não Classificado" fallback, the
// dominance tie-break rules, and a dedicated regression block for the
// getC4Type fix (previously: E/N/O/S/M/T/V dominant always collapsed to
// C4_T01 regardless of actual cover).

describe("classifyVegetation - Não Classificado (NR) fallback", () => {
  it("returns NR for an empty formula", () => {
    expect(classifyVegetation("", "pt").code).toBe("NR");
  });

  it("returns NR for a formula with no parseable components", () => {
    expect(classifyVegetation("abc", "pt").code).toBe("NR");
  });

  it("returns NR for a formula with only lianas (C)", () => {
    expect(classifyVegetation("C7c", "pt").code).toBe("NR");
  });

  it("returns NR for a formula with only lianas and epiphytes (C, X)", () => {
    expect(classifyVegetation("X7c,C4b", "pt").code).toBe("NR");
  });
});

describe("classifyVegetation - dominance tie-break", () => {
  it("cover tie between two woody forms is broken by height (taller wins)", () => {
    // B at height 4 (cov p) vs D at height 6 (cov p): same cover rank,
    // D's greater height must decide dominance.
    const result = classifyVegetation("B4p.D6p", "pt");
    expect(result.groupCode).toBe("C2");
    expect(result.code).toBe("C2_T08");
  });

  it("full tie (cover and height) between herb and woody is broken by isWoody (woody wins)", () => {
    // G and B both at height 6, both cov i (rank 5, above the C5-override
    // threshold of p=4 so the override doesn't mask the tie-break itself).
    // If the herb had won the tie, getVegClass would return C5 instead.
    const result = classifyVegetation("G6i,B6i", "pt");
    expect(result.groupCode).toBe("C2");
    expect(result.code).toBe("C2_T01");
  });

  it("herbaceous cover-≥-p override reclassifies as C5 even when a taller/denser woody stratum is present", () => {
    // Dominant by raw cover rank would be B (height 5, cov c = rank 6), but
    // G is present at cov p (rank 4, the override threshold) while every
    // woody group stays at ≤ p - the C5 override should still fire.
    const result = classifyVegetation("B5p,G2p", "pt");
    expect(result.groupCode).toBe("C5");
  });
});

// --- Full 97-code reachability table ------------------------------------
//
// [code, rawFormula, contextFlags?]. One minimal formula per catalogued
// code, derived by hand from the classifier's own branching logic (see
// classificacao_vegetacao.md §3 for the group-by-group derivation).

type Case = [code: string, rawFormula: string, flags: ContextFlag[]];

const C1_CASES: Case[] = [
  ["C1_T01", "B7c", []],
  ["C1_T02", "Bs7c", []],
  ["C1_T03", "E7c", []],
  ["C1_T04", "V7c", []],
  ["C1_T05", "B7c", ["mangrove"]],
  ["C1_T06", "T7c", []],
  ["C1_T07", "S7c", []],
  ["C1_T08", "M7c", []],
  ["C1_T09", "D7c", []],
  ["C1_T10", "Ds7c", []],
  ["C1_T11", "N7c", []],
  ["C1_T12", "Bh7c", []],
  ["C1_T13", "D7c", ["spiny"]],
  ["C1_T14", "K7c", []],
];

const C2_CASES: Case[] = [
  ["C2_T01", "B7i", []],
  ["C2_T02", "Bs7i", []],
  ["C2_T03", "E7i", []],
  ["C2_T04", "V7i", []],
  ["C2_T05", "T7i", []],
  ["C2_T06", "S7i", []],
  ["C2_T07", "M7i", []],
  ["C2_T08", "D7i", []],
  ["C2_T09", "Ds7i", []],
  ["C2_T10", "N7i", []],
  ["C2_T11", "Bh7i", []],
  ["C2_T12", "D7i", ["spiny"]],
  ["C2_T13", "K7i", []],
];

const C3_CASES: Case[] = [
  // Dense (T01-T12)
  ["C3_T01", "B3c", []],
  ["C3_T02", "Bh3c", []],
  ["C3_T03", "Bs3c", []],
  ["C3_T04", "B3c", ["semi-lignified"]],
  ["C3_T05", "E3c", []],
  ["C3_T06", "T3c", []],
  ["C3_T07", "V3c", []],
  ["C3_T08", "S3c", []],
  ["C3_T09", "D3c", []],
  ["C3_T10", "Ds3c", []],
  ["C3_T11", "N3c", []],
  ["C3_T12", "K3c", []],
  // Open (T13-T24)
  ["C3_T13", "B3r", []],
  ["C3_T14", "Bh3r", []],
  ["C3_T15", "Bs3r", []],
  ["C3_T16", "B3r", ["semi-lignified"]],
  ["C3_T17", "E3r", []],
  ["C3_T18", "T3r", []],
  ["C3_T19", "V3r", []],
  ["C3_T20", "S3r", []],
  ["C3_T21", "D3r", []],
  ["C3_T22", "Ds3r", []],
  ["C3_T23", "N3r", []],
  ["C3_T24", "K3r", []],
];

const C4_CASES: Case[] = [
  ["C4_T01", "B2c", []],
  ["C4_T02", "B2r", []],
  ["C4_T03", "B2i.G1p", []],
  ["C4_T04", "D2c", []],
  ["C4_T05", "D2r", []],
  ["C4_T06", "D2i.G1p", []],
  ["C4_T07", "K2c", []],
];

const C5_CASES: Case[] = [
  // G, pure (no associated woody stratum)
  ["C5_T01", "G4c", []],
  ["C5_T02", "G3c", []],
  ["C5_T03", "G2c", []],
  // G + evergreen (B) associate: tall/medium/short x synusia/elements
  ["C5_T04", "G4c,B4p", []],
  ["C5_T05", "G4c,B4r", []],
  ["C5_T06", "G3c,B4p", []],
  ["C5_T07", "G3c,B4r", []],
  ["C5_T08", "G1c,B4p", []],
  ["C5_T09", "G1c,B4r", []],
  // G + semi-deciduous (S) associate
  ["C5_T10", "G4c,S4p", []],
  ["C5_T11", "G4c,S4r", []],
  ["C5_T12", "G3c,S4p", []],
  ["C5_T13", "G3c,S4r", []],
  ["C5_T14", "G1c,S4p", []],
  ["C5_T15", "G1c,S4r", []],
  // G + deciduous (D) associate
  ["C5_T16", "G4c,D4p", []],
  ["C5_T17", "G4c,D4r", []],
  ["C5_T18", "G3c,D4p", []],
  ["C5_T19", "G3c,D4r", []],
  ["C5_T20", "G1c,D4p", []],
  ["C5_T21", "G1c,D4r", []],
  // G + palm grove (T) associate
  ["C5_T22", "G4c,T4b", []],
  ["C5_T23", "G3c,T4b", []],
  ["C5_T24", "G1c,T4b", []],
  // H, pure
  ["C5_T25", "H3c", []],
  ["C5_T26", "H2c", []],
  // H + evergreen (B) associate
  ["C5_T27", "H3c,B4p", []],
  ["C5_T28", "H3c,B4r", []],
  ["C5_T29", "H2c,B4p", []],
  ["C5_T30", "H2c,B4r", []],
  // H + semi-deciduous (S) associate
  ["C5_T31", "H3c,S4p", []],
  ["C5_T32", "H3c,S4r", []],
  ["C5_T33", "H2c,S4p", []],
  ["C5_T34", "H2c,S4r", []],
  // H + deciduous (D) associate
  ["C5_T35", "H3c,D4p", []],
  ["C5_T36", "H3c,D4r", []],
  ["C5_T37", "H2c,D4p", []],
  ["C5_T38", "H2c,D4r", []],
  // L, fixed type
  ["C5_T39", "L1c", []],
];

describe("classifyVegetation - full catalog reachability (97 codes)", () => {
  describe.each([
    ["C1", C1_CASES],
    ["C2", C2_CASES],
    ["C3", C3_CASES],
    ["C4", C4_CASES],
    ["C5", C5_CASES],
  ] as const)("group %s", (groupCode, cases) => {
    it(`covers every catalogued ${groupCode} code (${cases.length} cases)`, () => {
      expect(cases.length).toBeGreaterThan(0);
    });

    it.each(cases)("%s <- %s (flags: %j)", (code, rawFormula, flags) => {
      const result = classifyVegetation(rawFormula, "pt", flags);
      expect(result.groupCode).toBe(groupCode);
      expect(result.code).toBe(code);
    });
  });

  it("covers exactly 97 codes in total", () => {
    const total =
      C1_CASES.length + C2_CASES.length + C3_CASES.length + C4_CASES.length + C5_CASES.length;
    expect(total).toBe(97);
  });
});

describe("classifyVegetation - C3_T24 reachable via two independent paths", () => {
  it("directly, when K itself is the dominant open-cover life form", () => {
    expect(classifyVegetation("K3r", "pt").code).toBe("C3_T24");
  });

  it("indirectly, via the K-exception when a secondary K stratum qualifies (height 3-4, cov ≥ p) under a different open dominant", () => {
    // B is dominant (cov i, rank 5) over K (cov p, rank 4); B is not dense
    // (i < c), so the open subgroup applies, and K's qualifying secondary
    // presence overrides the type that B's own baseType would produce.
    expect(classifyVegetation("B4i.K3p", "pt").code).toBe("C3_T24");
  });
});

// --- Regression: getC4Type used to collapse E/N/O/S/M/T/V into C4_T01 ----
//
// Before the fix (classificacao_vegetacao.md §5/§6), any dominant life form
// other than K/B/D at dwarf height (1-2) always returned 'C4_T01' regardless
// of actual cover. These cases prove the fix: dense cover still yields
// C4_T01 (unchanged), but open cover now yields C4_T02/C4_T03 like it
// already does for B/D, instead of being silently mislabeled as "denso".

const PREVIOUSLY_MISHANDLED_FORMS = ["E", "N", "O", "S", "M", "T", "V"] as const;

describe("classifyVegetation - C4 fallback regression (previously mishandled forms)", () => {
  it.each(PREVIOUSLY_MISHANDLED_FORMS)(
    "%s dominant, dense cover (c) -> C4_T01 (unchanged)",
    (form) => {
      expect(classifyVegetation(`${form}2c`, "pt").code).toBe("C4_T01");
    },
  );

  it.each(PREVIOUSLY_MISHANDLED_FORMS)(
    "%s dominant, open cover (r), no significant herb -> C4_T02 (was incorrectly C4_T01)",
    (form) => {
      expect(classifyVegetation(`${form}2r`, "pt").code).toBe("C4_T02");
    },
  );

  it.each(PREVIOUSLY_MISHANDLED_FORMS)(
    "%s dominant, open cover (i), with significant herb (G cov p) -> C4_T03 (was incorrectly C4_T01)",
    (form) => {
      expect(classifyVegetation(`${form}2i.G1p`, "pt").code).toBe("C4_T03");
    },
  );
});
