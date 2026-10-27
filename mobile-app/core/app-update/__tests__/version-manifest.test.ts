import { validateVersionManifest } from "../version-manifest";

// Exact content published at https://pablonvsx.github.io/nomos/nomos-version.json
// (read from origin/gh-pages:nomos-version.json).
const PUBLISHED = {
  format_version: 1,
  latest_version: "1.0.0",
  min_supported_version: "1.0.0",
  released_at: "2026-10-26",
};

describe("validateVersionManifest", () => {
  it("accepts the published file", () => {
    expect(validateVersionManifest(PUBLISHED)).toEqual({ ok: true, manifest: { latestVersion: "1.0.0" } });
  });

  it("accepts a prerelease latest_version", () => {
    expect(validateVersionManifest({ format_version: 1, latest_version: "1.2.0-rc.1" })).toEqual({
      ok: true,
      manifest: { latestVersion: "1.2.0-rc.1" },
    });
  });

  it("ignores unknown fields, and min_supported_version / released_at (absent or odd)", () => {
    expect(validateVersionManifest({ format_version: 1, latest_version: "2.0.0" }).ok).toBe(true);
    expect(
      validateVersionManifest({
        format_version: 1,
        latest_version: "2.0.0",
        min_supported_version: "not a version",
        released_at: 42,
        something_new: { nested: true },
      }),
    ).toEqual({ ok: true, manifest: { latestVersion: "2.0.0" } });
  });

  it("rejects an unknown format_version before reading anything else", () => {
    // Newer format: latest_version here has a shape this build would misread.
    const result = validateVersionManifest({ format_version: 2, latest_version: { semver: "2.0.0" } });
    expect(result).toMatchObject({ ok: false, error: { code: "unsupported_format" } });
  });

  it.each([undefined, null, "1", 0, 1.5])("rejects format_version %p", (format) => {
    const result = validateVersionManifest({ ...PUBLISHED, format_version: format });
    expect(result).toMatchObject({ ok: false, error: { code: "unsupported_format" } });
  });

  it("rejects a missing latest_version", () => {
    const { latest_version: _omitted, ...rest } = PUBLISHED;
    expect(validateVersionManifest(rest)).toMatchObject({ ok: false, error: { code: "missing_latest_version" } });
  });

  it.each([1, true, {}, ["1.0.0"], "abc", "1.2", ""])("rejects latest_version %p", (value) => {
    const result = validateVersionManifest({ ...PUBLISHED, latest_version: value });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(["missing_latest_version", "invalid_latest_version"]).toContain(result.error.code);
  });

  it.each([null, undefined, "text", 12, [], [PUBLISHED]])("rejects a non-object payload %p", (input) => {
    expect(validateVersionManifest(input)).toMatchObject({ ok: false, error: { code: "invalid_json" } });
  });

  it("gives a specific message for the unsupported format", () => {
    const result = validateVersionManifest({ ...PUBLISHED, format_version: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/format_version/);
  });
});
