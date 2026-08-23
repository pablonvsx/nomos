import type {
  ProtocolManifest,
  ModuleDescriptor,
  FieldSchema,
  FieldType,
  SelectOption,
  DynamicGroupRule,
} from "@/protocol-kernel/types";
import type { CustomSection, CustomFieldConfig, CustomFieldType } from "@/types/database";
import { getSharedModule } from "@/modules/registry";

// Maps CustomFieldType (builder) to FieldType (kernel).
// "repeatable_group" is not here: it never goes through fieldToSchema, it's
// diverted in buildCustomModuleDescriptor into a DynamicGroupRule (schema.dynamic).
const FIELD_TYPE_MAP: Record<Exclude<CustomFieldType, "repeatable_group">, FieldType> = {
  text: "text",
  textarea: "text",
  number: "number",
  percentage: "percentage",
  azimuth: "azimuth",
  date: "date",
  time: "time",
  radio: "select",
  checkbox: "multiselect",
  yes_no: "boolean",
  rating: "number",
  photo_input: "photo",
  notes_list: "notes",
  audio_notes_input: "audio",
  species_list: "species",
  tags_input: "text",
};

function fieldToSchema(f: CustomFieldConfig): FieldSchema {
  const type = FIELD_TYPE_MAP[f.type as Exclude<CustomFieldType, "repeatable_group">];
  const options: SelectOption[] | undefined =
    f.options && f.options.length > 0
      ? f.options.map((o) => ({
          value: o.value,
          label: { pt: o.value, en: o.value, es: o.value, fr: o.value },
          // Custom protocol options are authored in a single language by the
          // user, not translated - mirrored into all 4 slots like `label`
          // above, so resolveOptions() (modules/generic/GenericFieldRow.tsx) can
          // resolve it the same way for every field type.
          desc: o.description
            ? { pt: o.description, en: o.description, es: o.description, fr: o.description }
            : undefined,
        }))
      : undefined;

  return {
    id: f.key,
    label: { pt: f.label, en: f.label, es: f.label, fr: f.label },
    type,
    required: f.required ?? false,
    exportable: true,
    renderAs: f.type, // preserves the original CustomFieldType for the UI layer
    // Custom protocol always shows the option description inline (text below
    // the option) in a single-column list, unlike PAISAGEO (icon + modal,
    // often a two-column grid), which leaves these hints unset.
    optionDescMode: "inline",
    layout: "single_column",
    ...(options ? { options } : {}),
    ...(f.min !== undefined ? { min: f.min } : {}),
    ...(f.max !== undefined ? { max: f.max } : {}),
    ...(f.unit ? { unit: f.unit } : {}),
    // Same single-language-mirrored-into-4-slots approach as options[].desc above.
    ...(f.description
      ? { description: { pt: f.description, en: f.description, es: f.description, fr: f.description } }
      : {}),
  };
}

/**
 * Translates a "repeatable_group" field into a kernel DynamicGroupRule,
 * reusing fieldToSchema recursively for the item's sub-fields.
 */
function fieldToDynamicGroupRule(f: CustomFieldConfig): DynamicGroupRule {
  return {
    groupId: f.key,
    itemFields: (f.itemFields ?? []).map(fieldToSchema),
    columnNamePattern: `${f.key}_{i}_{field}`,
    label: { pt: f.label, en: f.label, es: f.label, fr: f.label },
  };
}

/**
 * Translates a builder section (CustomSection) into a kernel ModuleDescriptor.
 * Used at runtime when loading a project with the "custom" protocol.
 */
export function buildCustomModuleDescriptor(section: CustomSection): ModuleDescriptor {
  if (section.moduleRef) {
    const shared = getSharedModule(section.moduleRef);
    if (!shared) {
      throw new Error(`[custom manifest] unknown shared module ref "${section.moduleRef}"`);
    }
    return shared.descriptor;
  }

  const plainFields = section.fields.filter((f) => f.type !== "repeatable_group");
  const groupFields = section.fields.filter((f) => f.type === "repeatable_group");

  return {
    id: section.id,
    title: {
      pt: section.title,
      en: section.title,
      es: section.title,
      fr: section.title,
    },
    schema: {
      fields: plainFields.map(fieldToSchema),
      ...(groupFields.length > 0
        ? { dynamic: groupFields.map(fieldToDynamicGroupRule) }
        : {}),
    },
    serialize: (data: unknown) => JSON.stringify(data),
    deserialize: (raw: string) => {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    },
  };
}

export const customManifest: ProtocolManifest = {
  id: "custom",
  name: { pt: "Personalizado", en: "Custom", es: "Personalizado", fr: "Personnalisé" },
  version: "1.0.0",
  authors: [],
  description: {
    pt: "Formulário personalizado pelo usuário.",
    en: "User-defined form.",
    es: "Formulario personalizado.",
    fr: "Formulaire personnalisé.",
  },
  kind: "custom",
  modules: [], // generated at runtime by buildCustomModuleDescriptor, per project
  provides: [],
  requires: [],
  exporter: (_deps) => ({
    async exportGeoJSON(points, project, language) {
      const { customExporter } = await import("./services/export");
      return customExporter.exportGeoJSON(points, project, language);
    },
    async exportCSV(points, project, language) {
      const { customExporter } = await import("./services/export");
      return customExporter.exportCSV(points, project, language);
    },
    async extractMedia(point, project) {
      const { customExporter } = await import("./services/export");
      return customExporter.extractMedia(point, project);
    },
  }),
  localesRef: "",
};
