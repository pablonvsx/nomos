/**
 * Comparison key for scientific names: two names with the same key are the
 * same species in a project catalog. Trims, collapses repeated whitespace,
 * lower-cases and drops accents. The WHOLE name is compared - authorship
 * ("(Willd.) Poir.") and variety ("var. reptans") are never removed here, so
 * "Mimosa tenuiflora" and "Mimosa tenuiflora (Willd.) Poir." are different
 * keys. Pure: runs under the node jest setup.
 */
export function speciesNameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
