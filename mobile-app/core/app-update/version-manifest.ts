// mobile-app/core/app-update/version-manifest.ts
//
// Validation of nomos-version.json. Pure: returns a typed result instead of
// throwing. format_version is checked before anything else (a newer layout may
// have changed the other fields), and fields this build does not use
// (min_supported_version, released_at, unknown ones) are ignored.

import { parseVersion } from "./compare-versions";
import { SUPPORTED_MANIFEST_FORMAT_VERSION } from "./constants";

export interface VersionManifest {
  latestVersion: string;
}

export type VersionManifestErrorCode =
  | "invalid_json"
  | "unsupported_format"
  | "missing_latest_version"
  | "invalid_latest_version";

export interface VersionManifestError {
  code: VersionManifestErrorCode;
  message: string;
}

export type VersionManifestResult =
  | { ok: true; manifest: VersionManifest }
  | { ok: false; error: VersionManifestError };

function fail(code: VersionManifestErrorCode, message: string): VersionManifestResult {
  return { ok: false, error: { code, message } };
}

export function validateVersionManifest(json: unknown): VersionManifestResult {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return fail("invalid_json", "The version file is not a JSON object.");
  }
  const data = json as Record<string, unknown>;

  if (data.format_version !== SUPPORTED_MANIFEST_FORMAT_VERSION) {
    return fail(
      "unsupported_format",
      `Unsupported format_version (${String(data.format_version)}); this build reads format_version ${SUPPORTED_MANIFEST_FORMAT_VERSION}.`,
    );
  }

  if (data.latest_version === undefined || data.latest_version === null) {
    return fail("missing_latest_version", "The version file has no latest_version.");
  }
  if (typeof data.latest_version !== "string" || !parseVersion(data.latest_version)) {
    return fail("invalid_latest_version", "latest_version is not a valid version.");
  }

  return { ok: true, manifest: { latestVersion: data.latest_version.trim() } };
}
