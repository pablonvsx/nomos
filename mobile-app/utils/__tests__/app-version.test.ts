import { formatAppVersion } from "../app-version";

describe("formatAppVersion", () => {
  it("prefixes the version with v", () => {
    expect(formatAppVersion("1.1.0")).toBe("v1.1.0");
  });

  it("does not double the prefix", () => {
    expect(formatAppVersion("v1.1.0")).toBe("v1.1.0");
  });

  it("returns an empty string when the version is unavailable", () => {
    expect(formatAppVersion(undefined)).toBe("");
    expect(formatAppVersion(null)).toBe("");
    expect(formatAppVersion("  ")).toBe("");
  });
});
