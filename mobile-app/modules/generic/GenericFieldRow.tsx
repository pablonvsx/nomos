import React, { useMemo } from "react";
import { View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import type { FieldSchema, LanguageCode } from "@/protocol-kernel/types";
import FieldRenderer from "./FieldRenderer";

// FieldRenderer doesn't render its own label for these types (they were
// originally built for PAISAGEO, which assembles its own section layout).
const TYPES_NEEDING_EXTERNAL_LABEL = new Set([
  "species_list",
  "photo_input",
  "notes_list",
  "audio_notes_input",
  "tags_input",
]);

interface Props {
  field: FieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  language: LanguageCode;
  projectId?: number;
  surveyPointId?: string;
  /** Shows a help-text bubble - forwarded to FieldRenderer, which uses it for
   *  types that already draw their own "i" icon (select/checkbox/radio/
   *  confirm_checkbox). PAISAGEO fields rely on this; custom-protocol fields
   *  show `description` as an always-visible caption instead (see below),
   *  so they don't need this wired in. */
  onInfoPress?: (text: string) => void;
  /** Option values that should render disabled (checked-but-inert stays
   *  possible; this only blocks *checking* it) - e.g. vegetation's
   *  context_flags, disabled per option when the Küchler matrix isn't in a
   *  state where that flag would have any effect (see
   *  VegetationModuleRenderer.tsx). Purely external/dynamic, so it isn't
   *  part of FieldSchema/SelectOption in protocol-kernel/types.ts. */
  disabledOptionValues?: Set<string>;
}

/** Converts the kernel's options (SelectOption[]) to the format FieldRenderer/SurveySelect
 *  expect: {value, label, desc, disabled}. Used equally by radio, select and checkbox. */
export function resolveOptions(
  field: FieldSchema,
  language: LanguageCode,
  disabledOptionValues?: Set<string>,
): any[] | undefined {
  if (!field.options || field.options.length === 0) return undefined;

  return field.options.map((o) => ({
    value: o.value,
    label: o.label[language] ?? o.label["pt"] ?? o.value,
    desc: o.desc ? (o.desc[language] ?? o.desc["pt"]) : undefined,
    disabled: disabledOptionValues?.has(o.value) ?? false,
  }));
}

/**
 * Renders a single schema-driven field (label + FieldRenderer + description),
 * shared by GenericModuleRenderer (fixed fields) and RepeatableGroupField
 * (sub-fields of a dynamic group item) so both stay visually consistent.
 */
// Memoized: GenericFieldRow is called in a .map() over every field of a
// module on every render of the parent (e.g. on every keystroke elsewhere in
// the form) - without this, and without stabilizing the `field` object below,
// every select/checkbox/radio/confirm_checkbox row would re-render and defeat
// FieldRenderer's/SurveySelect's own memoization on every unrelated change.
export const GenericFieldRow = React.memo(function GenericFieldRow({ field, value, onChange, language, projectId, surveyPointId, onInfoPress, disabledOptionValues }: Props) {
  const theme = useTheme();
  const renderAs = field.renderAs ?? field.type;
  const label = field.label[language] ?? field.label["pt"] ?? field.id;
  const description = field.description ? (field.description[language] ?? field.description["pt"]) : undefined;
  // Custom-protocol fields (optionDescMode: "inline", set in
  // modules/custom/manifest.ts) show `description` as an always-visible
  // caption below the field. PAISAGEO fields leave optionDescMode unset:
  // types that already draw their own "i" icon internally (select, checkbox,
  // radio, confirm_checkbox - see FieldRenderer.tsx) get it via onInfoPress
  // above; lone fields in their own card (photos, notes, species...) get a
  // card-title icon from the caller instead - no caption either way.
  const showsCaption = field.optionDescMode === "inline";

  // Stable identity across renders where field/language haven't changed -
  // a fresh object literal here (as before) defeats FieldRenderer's/
  // SurveySelect's React.memo for EVERY field type that draws through it
  // (including confirm_checkbox, not just select), causing a visible tap
  // delay even though the underlying field data didn't change.
  const rendererField = useMemo(
    () => ({
      key: field.id,
      // renderAs preserves the builder's original type (e.g. "checkbox", "yes_no", "species_list")
      type: renderAs,
      label,
      required: field.required,
      options: resolveOptions(field, language, disabledOptionValues),
      min: field.min,
      max: field.max,
      unit: field.unit,
      hideRangeHint: field.hideRangeHint,
      // Both are UI hints carried on the schema itself (see FieldSchema
      // in protocol-kernel/types.ts) - custom-protocol fields always set
      // them to "inline"/"single_column" (modules/custom/manifest.ts),
      // PAISAGEO fields leave them unset to keep the icon+modal /
      // two-column grid look.
      optionDescMode: field.optionDescMode,
      layout: field.layout,
      hideLabel: field.hideLabel,
      desc: description,
    }),
    [field, language, renderAs, label, description, disabledOptionValues],
  );

  return (
    <View style={{ marginBottom: 16 }}>
      {TYPES_NEEDING_EXTERNAL_LABEL.has(renderAs) && (
        <Text variant="bodyMedium" style={{ marginBottom: 8, color: theme.colors.primary }}>
          {label}
          {field.required && <Text style={{ color: theme.colors.error }}> *</Text>}
        </Text>
      )}
      <FieldRenderer
        field={rendererField}
        value={value}
        onChange={onChange}
        onInfoPress={onInfoPress}
        projectId={projectId}
        surveyPointId={surveyPointId}
      />
      {showsCaption && description && (
        <Text variant="bodySmall" style={{ marginTop: 4, fontStyle: "italic", color: theme.colors.outline }}>
          {description}
        </Text>
      )}
    </View>
  );
});
