import type { ModuleSchema, ColumnPlan, ColumnDef, LanguageCode, FieldSchema } from "@/protocol-kernel/types";

const MEDIA_TYPES = new Set(["photo", "audio", "notes"]);

/**
 * Builds the column plan for a module, resolving dynamic groups in two
 * passes (max cardinality → column generation).
 */
export function buildColumns(
  schema: ModuleSchema,
  points: Array<Record<string, unknown>>,
  language: LanguageCode
): ColumnPlan {
  // ── Pass 1: max cardinality of each dynamic group ──────────────────────────
  const maxCounts = new Map<string, number>();
  for (const group of schema.dynamic ?? []) {
    let max = 0;
    for (const point of points) {
      const items = point[group.groupId];
      if (Array.isArray(items) && items.length > max) {
        max = items.length;
      }
    }
    maxCounts.set(group.groupId, max);
  }

  // ── Column plan construction ────────────────────────────────────────────
  const columns: ColumnDef[] = [];

  // Fixed fields (exportable, non-media)
  for (const field of schema.fields) {
    if (field.exportable === false) continue;
    if (MEDIA_TYPES.has(field.type)) continue;
    columns.push({
      key: field.unit ? `${field.id} (${field.unit})` : field.id,
      label: field.label[language] ?? field.label["pt"] ?? field.id,
    });
  }

  // Dynamic groups
  for (const group of schema.dynamic ?? []) {
    const max = maxCounts.get(group.groupId) ?? 0;
    for (let i = 1; i <= max; i++) {
      for (const field of group.itemFields) {
        if (field.exportable === false) continue;
        if (MEDIA_TYPES.has(field.type)) continue;
        const key = group.columnNamePattern
          .replace("{i}", String(i))
          .replace("{field}", field.id);
        const label = field.label[language] ?? field.label["pt"] ?? field.id;
        columns.push({ key, label: `${label} ${i}` });
      }
    }
  }

  // ── rowFor ────────────────────────────────────────────────────────────────
  function rowFor(
    pointModuleData: Record<string, unknown>
  ): Array<string | number | null> {
    const row: Array<string | number | null> = [];

    // Fixed fields
    for (const field of schema.fields) {
      if (field.exportable === false) continue;
      if (MEDIA_TYPES.has(field.type)) continue;
      const val = pointModuleData[field.id];
      row.push(toCell(val, field, language));
    }

    // Dynamic groups
    for (const group of schema.dynamic ?? []) {
      const max = maxCounts.get(group.groupId) ?? 0;
      const items = pointModuleData[group.groupId];
      const itemsArr = Array.isArray(items) ? items : [];

      for (let i = 0; i < max; i++) {
        const item =
          i < itemsArr.length && typeof itemsArr[i] === "object" && itemsArr[i] !== null
            ? (itemsArr[i] as Record<string, unknown>)
            : null;

        for (const field of group.itemFields) {
          if (field.exportable === false) continue;
          if (MEDIA_TYPES.has(field.type)) continue;
          row.push(item ? toCell(item[field.id], field, language) : null);
        }
      }
    }

    return row;
  }

  return { columns, rowFor };
}

function resolveOptionLabel(
  raw: string,
  field: FieldSchema,
  language: LanguageCode
): string {
  const option = field.options?.find((o) => o.value === raw);
  return option?.label[language] ?? option?.label["pt"] ?? raw;
}

function toCell(
  val: unknown,
  field: FieldSchema,
  language: LanguageCode
): string | number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return val;
  if (typeof val === "boolean") return val ? "true" : "false";
  if (Array.isArray(val)) {
    return val.map((v) => resolveOptionLabel(String(v), field, language)).join(", ");
  }
  return resolveOptionLabel(String(val), field, language);
}
