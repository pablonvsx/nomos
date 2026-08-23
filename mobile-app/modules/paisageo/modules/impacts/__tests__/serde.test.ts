import { serializeImpacts, deserializeImpacts } from "../serde";
import type { ImpactsModuleData } from "../serde";

const sample: ImpactsModuleData = {
  impacts: [
    { type: "pollution", magnitude: "critical", details: "Resíduos plásticos" },
    { type: "erosion",   magnitude: "common",   details: "" },
  ],
};

describe("serde — Impacts module", () => {
  it("round-trip preserves the list of impacts", () => {
    const result = deserializeImpacts(serializeImpacts(sample));
    expect(result).toEqual(sample);
  });

  it("round-trip with 0 impacts", () => {
    const empty: ImpactsModuleData = { impacts: [] };
    expect(deserializeImpacts(serializeImpacts(empty))).toEqual(empty);
  });

  it("round-trip with 1 impact", () => {
    const one: ImpactsModuleData = {
      impacts: [{ type: "fire", magnitude: "occasional", details: "" }],
    };
    expect(deserializeImpacts(serializeImpacts(one))).toEqual(one);
  });

  it("round-trip with all fields filled", () => {
    const full: ImpactsModuleData = {
      impacts: [
        { type: "pollution",         magnitude: "critical",   details: "Plástico e lixo" },
        { type: "invasive_species",  magnitude: "common",     details: "Braquiária" },
        { type: "overgrazing",       magnitude: "occasional", details: "Gado bovino" },
      ],
    };
    expect(deserializeImpacts(serializeImpacts(full))).toEqual(full);
  });

  it("legacy Record format with details becomes an array", () => {
    const legacy = JSON.stringify({ "pollution": { magnitude: "critical", details: "Resíduos" } });
    const result = deserializeImpacts(legacy) as ImpactsModuleData;
    expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0]).toEqual({ type: "pollution", magnitude: "critical", details: "Resíduos" });
  });

  it("legacy format with observations (historical bug in export) resolves into details", () => {
    const legacy = JSON.stringify({ "erosion": { magnitude: "common", observations: "sulcos ativos" } });
    const result = deserializeImpacts(legacy) as ImpactsModuleData;
    expect(result.impacts[0].type).toBe("erosion");
    expect(result.impacts[0].details).toBe("sulcos ativos");
  });

  it("legacy format with multiple impacts generates an array with all of them", () => {
    const legacy = JSON.stringify({
      "fire":    { magnitude: "occasional", details: "" },
      "drought": { magnitude: "critical",  details: "5 meses sem chuva" },
    });
    const result = deserializeImpacts(legacy) as ImpactsModuleData;
    expect(result.impacts).toHaveLength(2);
    const types = result.impacts.map((i) => i.type);
    expect(types).toContain("fire");
    expect(types).toContain("drought");
  });

  it("legacy format with missing magnitude uses an empty string", () => {
    const legacy = JSON.stringify({ "frost": { details: "frequente" } });
    const result = deserializeImpacts(legacy) as ImpactsModuleData;
    expect(result.impacts[0].magnitude).toBe("");
    expect(result.impacts[0].details).toBe("frequente");
  });
});
