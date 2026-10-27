// mobile-app/core/app-update/compare-versions.ts
//
// Pure semver comparison (MAJOR.MINOR.PATCH[-prerelease][+build]) with no
// dependency on react-native, so it runs under plain Node. Never throws:
// anything that is not a valid version parses to null.

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  /** Dot-separated prerelease identifiers; empty for a final release. */
  prerelease: string[];
}

const VERSION_PATTERN =
  /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** "1.2.3", "v1.2.3" and "1.2.3-beta.2+build.7" parse; anything else returns null. Build metadata is dropped. */
export function parseVersion(input: unknown): ParsedVersion | null {
  if (typeof input !== "string") return null;
  const match = VERSION_PATTERN.exec(input.trim());
  if (!match) return null;
  const [major, minor, patch] = [match[1], match[2], match[3]].map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger)) return null;
  return { major, minor, patch, prerelease: match[4] ? match[4].split(".") : [] };
}

function compareNumbers(a: number, b: number): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

const isNumeric = (identifier: string) => /^\d+$/.test(identifier);

function comparePrerelease(a: string[], b: string[]): -1 | 0 | 1 {
  // A final release ranks above any prerelease of the same number.
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const [x, y] = [a[i], b[i]];
    if (x === y) continue;
    const [xNumeric, yNumeric] = [isNumeric(x), isNumeric(y)];
    if (xNumeric && yNumeric) return compareNumbers(Number(x), Number(y));
    // Numeric identifiers rank below alphanumeric ones.
    if (xNumeric) return -1;
    if (yNumeric) return 1;
    return x < y ? -1 : 1;
  }
  // Same leading identifiers: the shorter set ranks lower.
  return compareNumbers(a.length, b.length);
}

/** -1 when a < b, 0 when equal, 1 when a > b; null when either side is not a valid version. */
export function compareVersions(a: unknown, b: unknown): -1 | 0 | 1 | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  return (
    compareNumbers(left.major, right.major) ||
    compareNumbers(left.minor, right.minor) ||
    compareNumbers(left.patch, right.patch) ||
    comparePrerelease(left.prerelease, right.prerelease)
  );
}
