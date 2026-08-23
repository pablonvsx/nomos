import React, { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Card, IconButton, Text, useTheme } from "react-native-paper";
import KuchlerMatrix from "@/modules/paisageo/components/KuchlerMatrix";
import { GenericFieldRow } from "@/modules/generic/GenericFieldRow";
import type { ModuleRendererProps } from "@/protocol-kernel/types";
import type { VegetationClass } from "@/types/database";
import type { VegetationModuleData, VegetationStratum } from "./serde";
import type {
  KuchlerResult,
  StrataDescription,
} from "@/modules/paisageo/services/kuchler-formula";
import { KUCHLER_CONFIG } from "./kuchler-config";
import { VEGETATION_STRUCTURE_SECTION_TITLE } from "./section-titles";
import { vegetationSchema } from "./schema";
import type { ContextFlag } from "@/modules/paisageo/services/vegetation_classifier";

// The other vegetation fields (homogeneity confirmation, conservation
// status/land use) are not part of this renderer - they're plain generic
// fields with no specialized widget, rendered directly by the survey form
// alongside the point-level fields, so their card order can be controlled
// independently (see form.tsx). context_flags used to follow the same
// pattern (a standalone card in form.tsx) but is rendered here instead,
// as a collapsible section right below KuchlerMatrix: it only exists to
// complement the matrix's own classification, so it reads better living
// inside the same card than as a disconnected sibling.
const contextFlagsField = vegetationSchema.fields.find((f) => f.id === "context_flags")!;

// Stable reference for the "no flags set" case - `data.context_flags ??
// EMPTY_CONTEXT_FLAGS` must not create a new array literal every render,
// or KuchlerMatrix's contextFlags-changed effect would fire on every render.
const EMPTY_CONTEXT_FLAGS: ContextFlag[] = [];

/** Converts StrataDescription[] from KuchlerResult → VegetationStratum[] (joined fields). */
function toVegetationStrata(strata: StrataDescription[]): VegetationStratum[] {
  return strata.map((s) => ({
    height_id: s.height_id,
    height_range: s.height_range,
    life_form: s.life_forms.map((lf) => lf.name).join("; "),
    cover_class: s.life_forms.map((lf) => lf.cover_range).join("; "),
    leaf_adaptation: s.life_forms
      .map((lf) => lf.leaf_adaptation)
      .filter(Boolean)
      .join("; "),
  }));
}

/**
 * Builds the JSON string KuchlerMatrix expects from VegetationModuleData.
 * KuchlerMatrix uses matrix, leaf_matrix, physiognomy_name and classification_group
 * to hydrate its internal state when the component mounts.
 */
function toKuchlerValue(data: VegetationModuleData): string {
  return JSON.stringify({
    raw_formula: data.raw_formula ?? "",
    kuchler_formula: data.kuchler_formula ?? "",
    total_strata: data.total_strata ?? 0,
    physiognomy_name: data.physiognomy_name ?? "",
    classification_group: data.classification_group ?? "",
    classification_type: data.classification_type ?? "",
    description_text: data.description_text ?? "",
    strata_descriptions: [],
    matrix: data.matrix ?? {},
    leaf_matrix: data.leaf_matrix ?? {},
  });
}

interface VegetationModuleRendererProps extends ModuleRendererProps {
  // Vegetation classification (standard Nomos or custom): project-level
  // config, not point-level - it doesn't belong in VegetationModuleData.
  // It comes from outside (the screen that knows the active project), not from the kernel.
  classificationType?: "standard" | "custom";
  customClasses?: VegetationClass[];
}

// Custom comparator: this renderer never reads conservation_status/land_use/
// homogeneity_check (those are loose fields rendered directly by form.tsx's
// own ConservationCard/HomogeneityCard, sharing the same moduleValues.vegetation
// blob). The default shallow React.memo compares the whole `value` object by
// reference, so editing any of those loose fields - which does a shallow
// spread that changes the blob's identity - would still bust this memo and
// force KuchlerMatrix (the heaviest widget in the form) to fully re-render
// for a change it doesn't even use. Comparing only the fields actually read
// below keeps this renderer (and KuchlerMatrix under it) stable across those
// edits. Safe against staleness: handleVegFieldChange's shallow spread in
// form.tsx preserves the matrix/leaf_matrix object references untouched.
function sameVegetationValue(prevValue: unknown, nextValue: unknown): boolean {
  const a = (prevValue != null && typeof prevValue === "object" ? prevValue : {}) as VegetationModuleData;
  const b = (nextValue != null && typeof nextValue === "object" ? nextValue : {}) as VegetationModuleData;
  return (
    a.raw_formula === b.raw_formula &&
    a.kuchler_formula === b.kuchler_formula &&
    a.total_strata === b.total_strata &&
    a.physiognomy_name === b.physiognomy_name &&
    a.classification_group === b.classification_group &&
    a.classification_type === b.classification_type &&
    a.description_text === b.description_text &&
    a.matrix === b.matrix &&
    a.leaf_matrix === b.leaf_matrix &&
    a.custom_class_id === b.custom_class_id &&
    a.physiognomy_complement === b.physiognomy_complement &&
    a.context_flags === b.context_flags
  );
}

// Memoized: see the same note in GeoecologicalConstraintsModuleRenderer.tsx - without
// this, KuchlerMatrix (the heaviest widget in the form) would re-render on
// every keystroke/tap anywhere else in the form, not just its own changes.
export const VegetationModuleRenderer = React.memo(function VegetationModuleRenderer({
  value,
  onChange,
  language,
  onInfoPress,
  classificationType,
  customClasses,
}: VegetationModuleRendererProps) {
  const theme = useTheme();
  const data: VegetationModuleData =
    value != null && typeof value === "object" ? (value as VegetationModuleData) : {};

  // Collapsed by default, except when reopening a survey that already has
  // flags set - otherwise the active state would be hidden until the user
  // happens to expand the section. Only read on mount: subsequent edits
  // shouldn't fight the user's own expand/collapse choice.
  const [flagsExpanded, setFlagsExpanded] = useState(() => (data.context_flags?.length ?? 0) > 0);

  // Stable callbacks (always read the latest `data`/`onChange` via refs, kept
  // up to date every render) for the same reason as
  // GeoecologicalConstraintsModuleRenderer's getFieldOnChange - the closures themselves
  // never change identity across renders.
  const dataRef = useRef(data);
  dataRef.current = data;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleKuchlerChange = useRef((raw: string) => {
    try {
      const result: KuchlerResult = JSON.parse(raw);
      const next: VegetationModuleData = {
        ...dataRef.current,
        raw_formula: result.raw_formula,
        kuchler_formula: result.kuchler_formula,
        total_strata: result.total_strata,
        physiognomy_name: result.physiognomy_name,
        classification_group: result.classification_group,
        classification_type: result.classification_type,
        description_text: result.description_text,
        matrix: result.matrix,
        leaf_matrix: result.leaf_matrix,
        vegetation_strata: toVegetationStrata(result.strata_descriptions ?? []),
      };
      onChangeRef.current(next);
    } catch {
      // malformed JSON — ignore
    }
  }).current;

  const handleClassIdChange = useRef((classId: string) =>
    onChangeRef.current({ ...dataRef.current, custom_class_id: classId }),
  ).current;

  const handlePhysiognomyComplementChange = useRef((complement: string) =>
    onChangeRef.current({ ...dataRef.current, physiognomy_complement: complement }),
  ).current;

  const handleContextFlagsChange = useRef((flags: unknown) =>
    onChangeRef.current({ ...dataRef.current, context_flags: flags as ContextFlag[] }),
  ).current;

  const kuchlerValue = toKuchlerValue(data);
  const contextFlagsLabel = contextFlagsField.label[language] ?? contextFlagsField.label["pt"];
  const contextFlagsDesc = contextFlagsField.description
    ? contextFlagsField.description[language] ?? contextFlagsField.description["pt"]
    : undefined;
  const activeFlagsCount = data.context_flags?.length ?? 0;

  return (
    <Card mode="elevated" style={{ marginBottom: 24, borderRadius: 12 }}>
      <Card.Title
        title={VEGETATION_STRUCTURE_SECTION_TITLE[language] ?? VEGETATION_STRUCTURE_SECTION_TITLE["pt"]}
        titleVariant="titleMedium"
        style={{ backgroundColor: theme.colors.surfaceVariant, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
      />
      <Card.Content style={{ paddingTop: 16 }}>
        <KuchlerMatrix
          config={KUCHLER_CONFIG}
          value={kuchlerValue}
          onChange={handleKuchlerChange}
          onInfoPress={onInfoPress}
          classificationType={classificationType}
          customClasses={customClasses}
          selectedClassId={data.custom_class_id}
          onClassIdChange={handleClassIdChange}
          physiognomyComplement={data.physiognomy_complement ?? ""}
          onPhysiognomyComplementChange={handlePhysiognomyComplementChange}
          contextFlags={data.context_flags ?? EMPTY_CONTEXT_FLAGS}
        />

        {classificationType === "standard" && (
          <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: theme.colors.outlineVariant, paddingTop: 8 }}>
            <Pressable
              onPress={() => setFlagsExpanded((e) => !e)}
              style={{ flexDirection: "row", alignItems: "center" }}
            >
              <IconButton
                icon={flagsExpanded ? "chevron-down" : "chevron-right"}
                size={20}
                iconColor={theme.colors.primary}
                style={{ margin: 0 }}
              />
              <Text variant="titleSmall" style={{ flex: 1, color: theme.colors.primary }}>
                {contextFlagsLabel}
              </Text>
              {!flagsExpanded && activeFlagsCount > 0 && (
                <Text variant="labelSmall" style={{ color: theme.colors.secondary, marginRight: 4 }}>
                  {activeFlagsCount}
                </Text>
              )}
              {contextFlagsDesc && onInfoPress && (
                <IconButton
                  icon="information-outline"
                  size={18}
                  iconColor={theme.colors.secondary}
                  style={{ margin: 0 }}
                  onPress={() => onInfoPress(contextFlagsDesc)}
                />
              )}
            </Pressable>
            {flagsExpanded && (
              <GenericFieldRow
                field={{ ...contextFlagsField, hideLabel: true }}
                value={data.context_flags ?? EMPTY_CONTEXT_FLAGS}
                onChange={handleContextFlagsChange}
                language={language}
                onInfoPress={onInfoPress}
              />
            )}
          </View>
        )}
      </Card.Content>
    </Card>
  );
},
(prevProps, nextProps) =>
  sameVegetationValue(prevProps.value, nextProps.value) &&
  prevProps.onChange === nextProps.onChange &&
  prevProps.language === nextProps.language &&
  prevProps.onInfoPress === nextProps.onInfoPress &&
  prevProps.classificationType === nextProps.classificationType &&
  prevProps.customClasses === nextProps.customClasses,
);
