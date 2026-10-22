import { speciesNameKey } from "../name-key";

describe("speciesNameKey", () => {
  it("ignores case", () => {
    expect(speciesNameKey("Mimosa Tenuiflora")).toBe(speciesNameKey("mimosa tenuiflora"));
  });

  it("trims and collapses repeated whitespace, tabs and line breaks", () => {
    expect(speciesNameKey("  Mimosa   tenuiflora \t")).toBe("mimosa tenuiflora");
    expect(speciesNameKey("Mimosa\n tenuiflora")).toBe("mimosa tenuiflora");
  });

  it("ignores accents", () => {
    expect(speciesNameKey("Caesalpínia pyramidális")).toBe(speciesNameKey("caesalpinia pyramidalis"));
    expect(speciesNameKey("Açaí")).toBe("acai");
  });

  it("compares the whole name: authorship and variety are NOT removed", () => {
    expect(speciesNameKey("Mimosa tenuiflora (Willd.) Poir.")).toBe("mimosa tenuiflora (willd.) poir.");
    expect(speciesNameKey("Mimosa tenuiflora (Willd.) Poir.")).not.toBe(speciesNameKey("Mimosa tenuiflora"));
    expect(speciesNameKey("Poa annua var. reptans")).not.toBe(speciesNameKey("Poa annua"));
  });

  it("keeps different names apart", () => {
    expect(speciesNameKey("Mimosa tenuiflora")).not.toBe(speciesNameKey("Mimosa hostilis"));
  });

  it("gives an empty key for blank input", () => {
    expect(speciesNameKey("   ")).toBe("");
  });
});
