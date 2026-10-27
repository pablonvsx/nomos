import { compareVersions, parseVersion } from "../compare-versions";

describe("parseVersion", () => {
  it("parses a plain version", () => {
    expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] });
  });

  it("accepts a leading v and surrounding whitespace", () => {
    expect(parseVersion(" v1.2.3 ")).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] });
  });

  it("parses prerelease identifiers and ignores build metadata", () => {
    expect(parseVersion("1.2.3-beta.2+build.7")).toEqual({ major: 1, minor: 2, patch: 3, prerelease: ["beta", "2"] });
  });

  it.each([null, undefined, "", "abc", "1.2", "1.2.3.4", "1.2.x", "-1.0.0", "1.0.0-", 12, {}])(
    "returns null for %p without throwing",
    (input) => {
      expect(parseVersion(input as unknown as string)).toBeNull();
    },
  );
});

describe("compareVersions", () => {
  it("orders by minor", () => {
    expect(compareVersions("1.0.0", "1.1.0")).toBe(-1);
    expect(compareVersions("1.1.0", "1.0.0")).toBe(1);
  });

  it("compares numbers, not text: 1.10.0 is greater than 1.9.0", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
    expect(compareVersions("1.9.0", "1.10.0")).toBe(-1);
  });

  it("orders by major and patch too", () => {
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
    expect(compareVersions("1.0.2", "1.0.10")).toBe(-1);
  });

  it("returns 0 for equal versions, with or without a v prefix", () => {
    expect(compareVersions("1.1.0", "1.1.0")).toBe(0);
    expect(compareVersions("v1.1.0", "1.1.0")).toBe(0);
  });

  it("ignores build metadata", () => {
    expect(compareVersions("1.0.0+a", "1.0.0+b")).toBe(0);
  });

  it("puts a prerelease below its final version", () => {
    expect(compareVersions("1.1.0-beta.1", "1.1.0")).toBe(-1);
    expect(compareVersions("1.1.0", "1.1.0-beta.1")).toBe(1);
  });

  it("orders prereleases semver-style (numeric identifiers numerically, shorter set lower)", () => {
    expect(compareVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
    expect(compareVersions("1.0.0-alpha.2", "1.0.0-alpha.10")).toBe(-1);
    expect(compareVersions("1.0.0-alpha.1", "1.0.0-beta")).toBe(-1);
    expect(compareVersions("1.0.0-1", "1.0.0-alpha")).toBe(-1);
  });

  it("returns null when either side is invalid, without throwing", () => {
    expect(compareVersions("abc", "1.0.0")).toBeNull();
    expect(compareVersions("1.0.0", "")).toBeNull();
    expect(compareVersions(null as unknown as string, undefined as unknown as string)).toBeNull();
  });
});
