import type { CustomSection } from "@/types/database";

// Turns a question's label into a readable, stable field key (e.g. "Qual a
// altura da árvore?" -> "qual_a_altura_da_arvore") instead of the opaque
// field_<timestamp> id previously used, so CSV/GeoJSON exports for custom
// protocols get meaningful column/property names. Only called once, when a
// field is created - editing the label later must not change the key,
// otherwise old and new exports would disagree on the column name for the
// same data.
export function slugifyFieldKey(
  label: string,
  existingKeys: Set<string> = new Set(),
): string {
  const base = label
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "") // strip accents: á -> a, ç -> c
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30)
    .replace(/_+$/, ""); // trim any "_" left dangling by the slice cut
  const key = base || `field_${Date.now()}`; // fallback: label with no alphanumeric chars (emoji/symbols only)

  if (!existingKeys.has(key)) return key;
  let i = 2;
  while (existingKeys.has(`${key}_${i}`)) i++;
  return `${key}_${i}`;
}

export function collectFieldKeys(sections: CustomSection[]): Set<string> {
  return new Set(sections.flatMap((s) => s.fields.map((f) => f.key)));
}
