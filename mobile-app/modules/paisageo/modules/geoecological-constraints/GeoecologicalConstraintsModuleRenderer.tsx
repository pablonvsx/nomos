import React, { useRef } from "react";
import { Card, Text, useTheme } from "react-native-paper";
import { GenericFieldRow } from "@/modules/generic/GenericFieldRow";
import SoilProfileInput from "@/modules/paisageo/components/SoilProfileInput";
import SurfaceCoverInput from "@/modules/paisageo/components/SurfaceCoverInput";
import type { ModuleRendererProps, LocalizedString, SelectOption } from "@/protocol-kernel/types";
import type { SoilProfileData } from "@/modules/paisageo/types/soil";
import type { GeoecologicalConstraintsModuleData } from "./serde";
import { moduleDataToProfile, profileToModuleData } from "./serde";
import {
  geoecologicalConstraintsSchema,
  soilLayerItemFields,
  coverClassOptions,
  colorPatternOptions,
  colorTermOptions,
  textureOptions,
  structureOptions,
  crackOptions,
} from "./schema";

// SoilProfileInput (a legacy component predating the kernel) expects its
// option lists flattened - {value, pt, en, es, fr, desc} - instead of the
// kernel's {value, label: LocalizedString, desc?} shape, since it feeds them
// straight into translateField(opt) for the label.
function toFlatOptions(options: SelectOption[]) {
  return options.map((o) => ({ value: o.value, ...o.label, desc: o.desc }));
}

// The 6 boolean "has_*" characteristics (gravel, roots, nodules, dispersive,
// hardened, water table) - SoilProfileInput keys them by SoilLayer property
// name (char.key) and reads the label straight off the option via
// translateField(char), so it needs the same flattened shape plus `key`.
const HAS_FIELD_IDS = ["has_gravel", "has_roots", "has_nodules", "has_dispersive", "has_hardened", "has_water_table"] as const;
const characteristicsOptions = HAS_FIELD_IDS.map((id) => {
  const field = soilLayerItemFields.find((f) => f.id === id)!;
  return { key: id, value: id.replace("has_", ""), ...field.label, desc: field.description };
});

const SOIL_PROFILE_FIELD_CONFIG = {
  config: {
    color_pattern_options: toFlatOptions(colorPatternOptions),
    color_term_options: toFlatOptions(colorTermOptions),
    texture_options: toFlatOptions(textureOptions),
    structure_options: toFlatOptions(structureOptions),
    crack_options: toFlatOptions(crackOptions),
    characteristics_options: characteristicsOptions,
  },
};

// Card title, aligned with the dissertation's theoretical chapter that
// treats geomorphology/relief and cover/surface/soil as a single constraint.
const SECTION_TITLE: LocalizedString = {
  pt: "Condicionantes Geoecológicos",
  en: "Geoecological Constraints",
  es: "Condicionantes Geoecológicos",
  fr: "Contraintes Géoécologiques",
};

// Subtitles of the three internal subsections - same texts used in the
// original modules (Geomorphology, Cover and Surface, Soil Description)
// before the merge into a single card.
const GEOMORPHOLOGY_SUBTITLE: LocalizedString = {
  pt: "Geomorfologia e Relevo",
  en: "Geomorphology and Relief",
  es: "Geomorfología y Relieve",
  fr: "Géomorphologie et Relief",
};
const SURFACE_COVER_SUBTITLE: LocalizedString = {
  pt: "Cobertura e Superfície",
  en: "Cover and Surface",
  es: "Cobertura y Superficie",
  fr: "Couverture et Surface",
};
const SOIL_PROFILE_SUBTITLE: LocalizedString = {
  pt: "Descrição do Solo",
  en: "Soil Description",
  es: "Descripción del Suelo",
  fr: "Description du Sol",
};

const GEOMORPHOLOGY_FIELD_IDS = ["exposure", "slope", "topographic_position", "slope_shape", "geomorphology_type"] as const;
const geomorphologyFields = GEOMORPHOLOGY_FIELD_IDS.map(
  (id) => geoecologicalConstraintsSchema.fields.find((f) => f.id === id)!,
);

const SURFACE_COVER_FIELD_IDS = ["litter_layer", "stoniness", "rockiness", "bare_soil"] as const;
const SURFACE_COVER_FIELD = {
  items: SURFACE_COVER_FIELD_IDS.map((id) => {
    const field = geoecologicalConstraintsSchema.fields.find((f) => f.id === id)!;
    return { key: field.id, label: field.label, desc: field.description };
  }),
  classes: coverClassOptions.map((o) => ({ value: o.value, label: o.label })),
};

// Memoized: SurveyFormScreen keeps every module's data in one shared state
// object, so any field change re-renders the whole form - without this, all
// 3 PAISAGEO module cards (including the much heavier KuchlerMatrix) would
// re-render on every keystroke/tap anywhere in the form, not just their own.
export const GeoecologicalConstraintsModuleRenderer = React.memo(function GeoecologicalConstraintsModuleRenderer({
  value,
  onChange,
  language,
  onInfoPress,
}: ModuleRendererProps) {
  const theme = useTheme();
  // Guard on `mode` actually being set, not just "value is some object" - a
  // brand new point starts with value === {} (no `mode` key yet), which
  // would otherwise slip through without the "simple" default.
  const data: GeoecologicalConstraintsModuleData =
    value != null && typeof value === "object" && (value as GeoecologicalConstraintsModuleData).mode
      ? (value as GeoecologicalConstraintsModuleData)
      : { ...(value as GeoecologicalConstraintsModuleData), mode: "simple" };

  // Stable per-field onChange (never changes identity, always reads the
  // latest `data` via a ref) - a fresh inline arrow per field on every
  // render would defeat SurveySelect's React.memo and re-render every field
  // (and its checkbox lists) on every single keystroke/tap.
  const dataRef = useRef(data);
  dataRef.current = data;
  const fieldOnChangeCache = useRef<Record<string, (val: unknown) => void>>({});
  const getFieldOnChange = (fieldId: string) => {
    if (!fieldOnChangeCache.current[fieldId]) {
      fieldOnChangeCache.current[fieldId] = (val: unknown) =>
        onChange({ ...dataRef.current, [fieldId]: val });
    }
    return fieldOnChangeCache.current[fieldId];
  };

  const coverJson = JSON.stringify({
    litter_layer: data.litter_layer,
    stoniness:    data.stoniness,
    rockiness:    data.rockiness,
    bare_soil:    data.bare_soil,
  });

  const profileJson = JSON.stringify(moduleDataToProfile(data));

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleProfileChange = useRef((raw: string) => {
    try {
      const profile = JSON.parse(raw) as SoilProfileData;
      onChangeRef.current(profileToModuleData(profile, dataRef.current));
    } catch {
      // malformed JSON — ignore
    }
  }).current;

  const handleCoverChange = useRef((raw: string) => {
    try {
      const cover = JSON.parse(raw) as Record<string, unknown>;
      onChangeRef.current({ ...dataRef.current, ...cover });
    } catch {
      // malformed JSON — ignore
    }
  }).current;

  return (
    <Card mode="elevated" style={{ marginBottom: 24, borderRadius: 12 }}>
      <Card.Title
        title={SECTION_TITLE[language] ?? SECTION_TITLE["pt"]}
        titleVariant="titleMedium"
        style={{ backgroundColor: theme.colors.surfaceVariant, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
      />
      <Card.Content style={{ paddingTop: 16 }}>
        {/* Order: Cover and Surface (direct observation) → Geomorphology
            and Relief (more analytical reading) → Soil Description (the
            most operational, done last when the profile pit is opened) -
            ordering decision confirmed during design review. */}
        <Text variant="titleSmall" style={{ marginBottom: 12, color: theme.colors.primary }}>
          {SURFACE_COVER_SUBTITLE[language] ?? SURFACE_COVER_SUBTITLE["pt"]}
        </Text>
        <SurfaceCoverInput
          field={SURFACE_COVER_FIELD}
          value={coverJson}
          onChange={handleCoverChange}
        />

        <Text variant="titleSmall" style={{ marginTop: 8, marginBottom: 12, color: theme.colors.primary }}>
          {GEOMORPHOLOGY_SUBTITLE[language] ?? GEOMORPHOLOGY_SUBTITLE["pt"]}
        </Text>
        {geomorphologyFields.map((field) => (
          <GenericFieldRow
            key={field.id}
            field={field}
            value={data[field.id as keyof GeoecologicalConstraintsModuleData]}
            onChange={getFieldOnChange(field.id)}
            language={language}
            onInfoPress={onInfoPress}
          />
        ))}

        <Text variant="titleSmall" style={{ marginTop: 8, marginBottom: 12, color: theme.colors.primary }}>
          {SOIL_PROFILE_SUBTITLE[language] ?? SOIL_PROFILE_SUBTITLE["pt"]}
        </Text>
        <SoilProfileInput
          field={SOIL_PROFILE_FIELD_CONFIG}
          value={profileJson}
          onChange={handleProfileChange}
        />
      </Card.Content>
    </Card>
  );
});
