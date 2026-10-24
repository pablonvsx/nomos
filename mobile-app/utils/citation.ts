// mobile-app/utils/citation.ts
//
// Pure helpers for the "How to cite" reference on the About screen. The
// reference text itself lives in the locale files (about.citeReference) and is
// filled in with these values, so wording stays translatable and the author,
// version and DOI each have a single source.

/** Year of the archived release the reference points to. */
export const CITATION_YEAR = 2026;

/** "Pablo Guilherme de Melo Neves" -> "NEVES, Pablo Guilherme de Melo" (ABNT NBR 6023). */
export function formatAuthorAbnt(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName.trim().toUpperCase();
  const surname = parts[parts.length - 1].toUpperCase();
  return `${surname}, ${parts.slice(0, -1).join(" ")}`;
}

/** "v1.0.0" -> "1.0.0". */
export function stripVersionPrefix(version: string): string {
  return version.trim().replace(/^v/i, "");
}
