import type { CustomSection } from "@/types/database";

/** An i18n key plus its interpolation params, ready for `t(key, params)`. */
export interface ProtocolValidationError {
  key: string;
  params?: Record<string, string>;
}

export interface NestedGroupViolation {
  sectionTitle: string;
  groupLabel: string;
  nestedLabel: string;
}

/**
 * Finds a `repeatable_group` placed inside another `repeatable_group`.
 * Groups are one level deep: the builder UI never offers the type for a
 * sub-field, but a hand-edited protocol file could carry one. Accepts
 * unknown input and never throws, so it is safe on data read from a file.
 */
export function findNestedRepeatableGroup(sections: unknown): NestedGroupViolation | null {
  if (!Array.isArray(sections)) return null;

  for (const section of sections) {
    const fields = (section as { fields?: unknown } | null)?.fields;
    if (!Array.isArray(fields)) continue;

    for (const field of fields) {
      const group = field as { type?: unknown; label?: unknown; itemFields?: unknown } | null;
      if (group?.type !== "repeatable_group" || !Array.isArray(group.itemFields)) continue;

      for (const subField of group.itemFields) {
        const nested = subField as { type?: unknown; label?: unknown } | null;
        if (nested?.type === "repeatable_group") {
          return {
            sectionTitle: String((section as { title?: unknown }).title ?? ""),
            groupLabel: String(group.label ?? ""),
            nestedLabel: String(nested.label ?? ""),
          };
        }
      }
    }
  }
  return null;
}

function nestedGroupError(violation: NestedGroupViolation): ProtocolValidationError {
  return {
    key: "protocol.nestedGroupNotAllowed",
    params: {
      section: violation.sectionTitle,
      group: violation.groupLabel,
      nested: violation.nestedLabel,
    },
  };
}

export function validateProtocolDraft(draft: {
  name: string;
  theme: string;
  sections: CustomSection[];
}): ProtocolValidationError | null {
  if (!draft.name.trim()) return { key: "protocol.enterProtocolName" };
  if (!draft.theme.trim()) return { key: "protocol.enterTheme" };
  if (draft.sections.length === 0) return { key: "protocol.addAtLeastOneSection" };
  if (draft.sections.some((s) => !s.title.trim())) return { key: "protocol.enterSectionTitle" };
  const hasFields = draft.sections.some((s) => s.fields.length > 0 || !!s.moduleRef);
  if (!hasFields) return { key: "protocol.addAtLeastOneField" };

  const nested = findNestedRepeatableGroup(draft.sections);
  if (nested) return nestedGroupError(nested);
  return null;
}

export function validateImportedProtocol(
  data: unknown,
): { ok: true } | { ok: false; error: ProtocolValidationError } {
  const candidate = data as { name?: unknown; schema?: { sections?: unknown } } | null;
  if (!candidate || !candidate.name || !candidate.schema || !candidate.schema.sections) {
    return { ok: false, error: { key: "protocol.invalidProtocolFile" } };
  }

  const nested = findNestedRepeatableGroup(candidate.schema.sections);
  if (nested) return { ok: false, error: nestedGroupError(nested) };
  return { ok: true };
}
