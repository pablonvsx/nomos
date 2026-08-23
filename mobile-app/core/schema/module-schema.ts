import type { ModuleSchema, SchemaValidationResult } from "@/protocol-kernel/types";

export function validateModuleSchema(schema: ModuleSchema): SchemaValidationResult {
  const errs: string[] = [];
  const allIds = new Set<string>();

  for (const field of schema.fields) {
    if (allIds.has(field.id)) {
      errs.push(`duplicate field id: "${field.id}"`);
    } else {
      allIds.add(field.id);
    }

    if ((field.type === "select" || field.type === "multiselect") && (!field.options || field.options.length === 0)) {
      errs.push(`field "${field.id}" (${field.type}) must have non-empty options`);
    }
  }

  for (const group of schema.dynamic ?? []) {
    if (!group.columnNamePattern.includes("{i}")) {
      errs.push(`group "${group.groupId}": columnNamePattern must contain {i}`);
    }

    const groupIds = new Set<string>();
    for (const field of group.itemFields) {
      const scopedId = `${group.groupId}.${field.id}`;
      if (groupIds.has(field.id)) {
        errs.push(`duplicate id within group "${group.groupId}": "${field.id}"`);
      } else {
        groupIds.add(field.id);
      }

      if (allIds.has(scopedId)) {
        errs.push(`duplicate field id (conflicts with a fixed field): "${field.id}" in group "${group.groupId}"`);
      }

      if ((field.type === "select" || field.type === "multiselect") && (!field.options || field.options.length === 0)) {
        errs.push(`field "${field.id}" in group "${group.groupId}" (${field.type}) must have non-empty options`);
      }
    }
  }

  return { ok: errs.length === 0, errors: errs };
}
