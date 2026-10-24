import { ZENODO_DOI, ZENODO_DOI_URL } from "@/constants/links";
import { formatAuthorAbnt, stripVersionPrefix } from "../citation";

describe("formatAuthorAbnt", () => {
  it("puts the upper-case surname first", () => {
    expect(formatAuthorAbnt("Pablo Guilherme de Melo Neves")).toBe("NEVES, Pablo Guilherme de Melo");
  });

  it("handles a single name", () => {
    expect(formatAuthorAbnt("Neves")).toBe("NEVES");
  });
});

describe("stripVersionPrefix", () => {
  it("removes a leading v", () => {
    expect(stripVersionPrefix("v1.0.0")).toBe("1.0.0");
  });

  it("leaves a bare version untouched", () => {
    expect(stripVersionPrefix("1.0.0")).toBe("1.0.0");
  });
});

describe("DOI constants", () => {
  it("builds the resolvable URL from the single DOI constant", () => {
    expect(ZENODO_DOI).toBe("10.5281/zenodo.22069700");
    expect(ZENODO_DOI_URL).toBe("https://doi.org/10.5281/zenodo.22069700");
  });
});
