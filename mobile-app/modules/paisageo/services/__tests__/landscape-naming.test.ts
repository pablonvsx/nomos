import { generateLandscapeName } from "../landscape-naming";

describe("generateLandscapeName - geomorphology translation", () => {
  const baseData = {
    veg_physiognomy_name: "Floresta Ombrófila Densa",
    geomorphology_type: ["lacustrine"],
  };

  it("translates geomorphology_type to Portuguese, lowercased (category, not proper noun)", () => {
    expect(generateLandscapeName(baseData, "pt")).toContain("lacustre");
    expect(generateLandscapeName(baseData, "pt")).not.toContain("Lacustre");
    expect(generateLandscapeName(baseData, "pt")).not.toContain("lacustrine");
  });

  it("translates geomorphology_type to English, lowercased", () => {
    expect(generateLandscapeName(baseData, "en")).toContain("lacustrine");
    expect(generateLandscapeName(baseData, "en")).not.toContain("Lacustrine");
  });

  it("translates geomorphology_type to Spanish, lowercased", () => {
    expect(generateLandscapeName(baseData, "es")).toContain("lacustre");
    expect(generateLandscapeName(baseData, "es")).not.toContain("Lacustre");
    expect(generateLandscapeName(baseData, "es")).not.toContain("lacustrine");
  });

  it("translates geomorphology_type to French, lowercased", () => {
    expect(generateLandscapeName(baseData, "fr")).toContain("lacustre");
    expect(generateLandscapeName(baseData, "fr")).not.toContain("Lacustre");
    expect(generateLandscapeName(baseData, "fr")).not.toContain("lacustrine");
  });

  it("joins multiple translated, lowercased environments with '/'", () => {
    const result = generateLandscapeName(
      { ...baseData, geomorphology_type: ["fluvial", "lacustrine"] },
      "pt",
    );
    expect(result).toContain("fluvial/lacustre");
  });

  it("falls back to the raw value (lowercased) for an unknown geomorphology_type", () => {
    const result = generateLandscapeName(
      { ...baseData, geomorphology_type: ["unknown_value"] },
      "pt",
    );
    expect(result).toContain("unknown_value");
  });
});

describe("generateLandscapeName - impact gender agreement", () => {
  const impactData = (impactKey: string, magnitude: string) => ({
    veg_physiognomy_name: "Floresta Ombrófila Densa",
    environmental_impacts: JSON.stringify({ [impactKey]: { magnitude } }),
  });

  it("inflects 'frost' as feminine in pt ('geada severa'/'geada moderada'), not masculine", () => {
    expect(generateLandscapeName(impactData("frost", "critical"), "pt")).toContain("geada severa");
    expect(generateLandscapeName(impactData("frost", "critical"), "pt")).not.toContain("geada severo");
    expect(generateLandscapeName(impactData("frost", "common"), "pt")).toContain("geada moderada");
    expect(generateLandscapeName(impactData("frost", "common"), "pt")).not.toContain("geada moderado");
  });

  it("inflects 'frost' as feminine in es ('helada severa'), not masculine", () => {
    expect(generateLandscapeName(impactData("frost", "critical"), "es")).toContain("helada severa");
    expect(generateLandscapeName(impactData("frost", "critical"), "es")).not.toContain("helada severo");
  });

  it("keeps 'frost' masculine in fr ('gel modéré'), unlike pt/es", () => {
    const result = generateLandscapeName(impactData("frost", "common"), "fr");
    expect(result).toContain("gel modéré");
    expect(result).not.toContain("gel modérée");
  });

  it("still produces correct gender for other impact types after the refactor (regression)", () => {
    expect(generateLandscapeName(impactData("erosion", "critical"), "pt")).toContain("erosão severa");
    expect(generateLandscapeName(impactData("fire", "critical"), "pt")).toContain("fogo severo");
    expect(generateLandscapeName(impactData("invasive_species", "critical"), "pt")).toContain("espécies invasoras severas");
    expect(generateLandscapeName(impactData("overgrazing", "common"), "pt")).toContain("sobrepastoreio moderado");
  });
});

describe("generateLandscapeName - unclassified vegetation gender agreement", () => {
  const unclassifiedWithImpact = {
    geomorphology_type: ["lacustrine"],
    environmental_impacts: JSON.stringify({ overgrazing: { magnitude: "common" } }),
  };

  it("uses the feminine connector 'influenciada por' in pt when vegetation is unclassified", () => {
    const result = generateLandscapeName(unclassifiedWithImpact, "pt");
    expect(result).toContain("influenciada por");
    expect(result).not.toContain("influenciado por");
  });

  it("uses the feminine connector 'influenciada por' in es when vegetation is unclassified", () => {
    const result = generateLandscapeName(unclassifiedWithImpact, "es");
    expect(result).toContain("influenciada por");
    expect(result).not.toContain("influenciado por");
  });

  it("uses the feminine connector 'influencée par' in fr when vegetation is unclassified", () => {
    const result = generateLandscapeName(unclassifiedWithImpact, "fr");
    expect(result).toContain("influencée par");
    expect(result).not.toContain("influencé par");
  });
});
