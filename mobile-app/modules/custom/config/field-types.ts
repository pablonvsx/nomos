// mobile-app/modules/custom/config/field-types.ts
import { CustomFieldType } from "@/types/database";

export interface FieldTypeOption {
  value: CustomFieldType;
  label: string;
  icon: string;
}

// Field type options (labels are translated on demand via getFieldTypeOptions)
export const FIELD_TYPES_CONFIG: { value: CustomFieldType; icon: string }[] = [
  { value: "text", icon: "text-short" },
  { value: "textarea", icon: "text-long" },
  { value: "number", icon: "numeric" },
  { value: "percentage", icon: "percent" },
  { value: "azimuth", icon: "compass-outline" },
  { value: "date", icon: "calendar" },
  { value: "time", icon: "clock-outline" },
  { value: "radio", icon: "radiobox-marked" },
  { value: "checkbox", icon: "checkbox-marked" },
  { value: "yes_no", icon: "help-circle" },
  { value: "rating", icon: "star" },
  { value: "photo_input", icon: "camera" },
  { value: "notes_list", icon: "note-text-outline" },
  { value: "audio_notes_input", icon: "microphone" },
  { value: "species_list", icon: "leaf" },
  { value: "tags_input", icon: "tag-multiple" },
  { value: "repeatable_group", icon: "format-list-group" },
];

// Sub-fields inside a "repeatable_group" cannot themselves be another
// repeatable_group (no nesting, mirrors the kernel's DynamicGroupRule.itemFields,
// which never contains another dynamic group).
export function getItemFieldTypeOptions(t: (key: string) => string): FieldTypeOption[] {
  return getFieldTypeOptions(t).filter((ft) => ft.value !== "repeatable_group");
}

// Curated units for the Number field (environmental inventory domain).
// "Outra" (free text) is offered separately in the UI, not part of this list.
export const CURATED_UNITS = ["cm", "m", "km", "m²", "ha", "kg", "g", "°C", "%"];

export function getFieldTypeOptions(t: (key: string) => string): FieldTypeOption[] {
  return FIELD_TYPES_CONFIG.map((ft) => ({
    ...ft,
    label: t(`protocol.fieldTypes.${ft.value}`),
  }));
}
