import React from "react";
import { View, StyleSheet } from "react-native";
import { Card, Text, useTheme as usePaperTheme } from "react-native-paper";
import { useI18n } from "@/contexts/i18n-context";
import { useProtocolTranslations } from "@/hooks/use-protocol-translations";
import { displayValue, optionLabel } from "@/modules/generic/read-only-display";
import type { ModuleReadOnlyRendererProps } from "@/modules/generic/module-read-only-renderer-registry";
import type { GeoecologicalConstraintsModuleData } from "./serde";
import {
  geoecologicalConstraintsSchema,
  colorPatternOptions,
  colorTermOptions,
  textureOptions,
  structureOptions,
  crackOptions,
  coverClassOptions,
} from "./schema";

// Merge of the old GeomorphologyModuleReadOnlyRenderer and
// SoilModuleReadOnlyRenderer into a single card, aligned with the
// dissertation's theoretical chapter that treats geomorphology/relief and
// cover/surface/soil as a single geoecological constraint.
export function GeoecologicalConstraintsModuleReadOnlyRenderer({ value }: ModuleReadOnlyRendererProps) {
  const paperTheme = usePaperTheme();
  const { t } = useI18n();
  const { translateField } = useProtocolTranslations();
  const data = (value ?? { mode: "simple" }) as GeoecologicalConstraintsModuleData;

  const geomOptionLabel = (fieldId: string, val: unknown): string => {
    const field = geoecologicalConstraintsSchema.fields.find((f) => f.id === fieldId);
    return optionLabel(field?.options, val, translateField);
  };

  const soilOptionLabel = (options: typeof coverClassOptions, val: unknown): string =>
    optionLabel(options, val, translateField);

  return (
    <Card style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}>
      <Card.Content>
        <Text variant="titleMedium" style={{ color: paperTheme.colors.primary, marginBottom: 12 }}>
          {t("surveyView.geoecologicalConstraints")}
        </Text>

        {/* Order: Cover and Surface (direct observation) → Geomorphology
            and Relief (more analytical reading) → Soil Description (the
            most operational, done last when the profile pit is opened) -
            ordering decision confirmed during design review. */}

        {/* COVER AND SURFACE */}
        <Text variant="titleMedium" style={{ color: paperTheme.colors.primary, marginBottom: 12 }}>
          {t("surveyView.surfaceCover")}
        </Text>
        <View style={styles.twoColumnRow}>
          <View style={{ flex: 1 }}>
            <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.litter")}</Text>
            <Text variant="bodyMedium">{soilOptionLabel(coverClassOptions, data.litter_layer)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.stoniness")}</Text>
            <Text variant="bodyMedium">{soilOptionLabel(coverClassOptions, data.stoniness)}</Text>
          </View>
        </View>
        <View style={styles.twoColumnRow}>
          <View style={{ flex: 1 }}>
            <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.rockiness")}</Text>
            <Text variant="bodyMedium">{soilOptionLabel(coverClassOptions, data.rockiness)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.bareSoil")}</Text>
            <Text variant="bodyMedium">{soilOptionLabel(coverClassOptions, data.bare_soil)}</Text>
          </View>
        </View>

        {/* GEOMORPHOLOGY AND RELIEF */}
        <Text variant="titleMedium" style={{ color: paperTheme.colors.primary, marginTop: 16, marginBottom: 12 }}>
          {t("surveyView.geomorphology")}
        </Text>
        <View style={styles.twoColumnRow}>
          <View style={{ flex: 1 }}>
            <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.exposure")}</Text>
            <Text variant="bodyMedium">{geomOptionLabel("exposure", data.exposure)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.slope")}</Text>
            <Text variant="bodyMedium">{geomOptionLabel("slope", data.slope)}</Text>
          </View>
        </View>
        <View style={styles.twoColumnRow}>
          <View style={{ flex: 1 }}>
            <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.topoPosition")}</Text>
            <Text variant="bodyMedium">{geomOptionLabel("topographic_position", data.topographic_position)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.slopeShape")}</Text>
            <Text variant="bodyMedium">{geomOptionLabel("slope_shape", data.slope_shape)}</Text>
          </View>
        </View>
        <View style={{ marginTop: 8 }}>
          <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.geomorphType")}</Text>
          <Text variant="bodyMedium">{geomOptionLabel("geomorphology_type", data.geomorphology_type)}</Text>
        </View>

        {/* SOIL DESCRIPTION */}
        <Text variant="titleMedium" style={{ color: paperTheme.colors.primary, marginTop: 16, marginBottom: 12 }}>{t("surveyView.soilProfile")}</Text>
        {(() => {
          const soil = data as any;
          if (!soil || soil.mode === undefined) return <Text variant="bodyMedium">-</Text>;

          const characteristicsLabel = (obj: any): string => [
            obj.has_gravel      && t("soil.other_characteristics.gravel"),
            obj.has_roots       && t("soil.other_characteristics.roots"),
            obj.has_nodules     && t("soil.other_characteristics.nodules"),
            obj.has_dispersive  && t("soil.other_characteristics.dispersive"),
            obj.has_hardened    && t("soil.other_characteristics.hardened"),
            obj.has_water_table && t("soil.other_characteristics.water_table"),
          ].filter(Boolean).join(", ");

          if (soil.mode === "simple") {
            if (!soil.simple_color_pattern && !soil.simple_texture && soil.simple_description) {
              return <Text variant="bodyMedium">{displayValue(soil.simple_description)}</Text>;
            }
            const colorDisplay = soil.simple_color_pattern === "variegated"
              ? `${t("surveyView.variegated")}: ${soilOptionLabel(colorTermOptions, soil.simple_color_primary)} / ${soilOptionLabel(colorTermOptions, soil.simple_color_secondary)}`
              : soilOptionLabel(colorTermOptions, soil.simple_color_primary);

            const activeCharacteristics = characteristicsLabel({
              has_gravel: soil.simple_has_gravel,
              has_roots: soil.simple_has_roots,
              has_nodules: soil.simple_has_nodules,
              has_dispersive: soil.simple_has_dispersive,
              has_hardened: soil.simple_has_hardened,
              has_water_table: soil.simple_has_water_table,
            });

            return (
              <View>
                <View style={{ marginBottom: 8 }}>
                  <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.colorPattern")}</Text>
                  <Text variant="bodyMedium">{soilOptionLabel(colorPatternOptions, soil.simple_color_pattern)}</Text>
                </View>
                <View style={styles.twoColumnRow}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.color")}</Text>
                    <Text variant="bodyMedium">{colorDisplay}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.structure")}</Text>
                    <Text variant="bodyMedium">{soilOptionLabel(structureOptions, soil.simple_structure)}</Text>
                  </View>
                </View>
                <View style={[styles.twoColumnRow, { marginTop: 8 }]}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.texture")}</Text>
                    <Text variant="bodyMedium">{soilOptionLabel(textureOptions, soil.simple_texture)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.cracks")}</Text>
                    <Text variant="bodyMedium">{soil.simple_cracks ? soilOptionLabel(crackOptions, soil.simple_cracks) : "-"}</Text>
                  </View>
                </View>
                <View style={{ marginTop: 8 }}>
                  <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.otherCharacteristics")}</Text>
                  <Text variant="bodyMedium">{activeCharacteristics || t("surveyView.notRecorded")}</Text>
                </View>
              </View>
            );
          } else if (soil.mode === "detailed" && soil.soil_layers && soil.soil_layers.length > 0) {
            return (soil.soil_layers as any[]).map((layer: any, index: number) => {
              const layerColorDisplay = layer.color_pattern === "variegated"
                ? `${t("surveyView.variegated")}: ${soilOptionLabel(colorTermOptions, layer.color_primary)} / ${soilOptionLabel(colorTermOptions, layer.color_secondary)}`
                : soilOptionLabel(colorTermOptions, layer.color_primary);
              const layerCharacteristics = characteristicsLabel(layer);

              return (
                <View
                  key={`soil-layer-${index}`}
                  style={{
                    marginBottom: index < soil.soil_layers.length - 1 ? 12 : 0,
                    backgroundColor: paperTheme.colors.elevation.level2,
                    padding: 12,
                    borderRadius: 8,
                  }}
                >
                  <Text variant="titleSmall" style={{ color: paperTheme.colors.primary, marginBottom: 8 }}>
                    {t("surveyView.layer")} {index + 1} ({layer.depth_start && layer.depth_end ? `${layer.depth_start}-${layer.depth_end} cm` : "-"})
                  </Text>
                  <View style={{ marginBottom: 8 }}>
                    <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.colorPattern")}</Text>
                    <Text variant="bodyMedium">{soilOptionLabel(colorPatternOptions, layer.color_pattern)}</Text>
                  </View>
                  <View style={styles.twoColumnRow}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.color")}</Text>
                      <Text variant="bodyMedium">{layerColorDisplay}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.structure")}</Text>
                      <Text variant="bodyMedium">{soilOptionLabel(structureOptions, layer.structure)}</Text>
                    </View>
                  </View>
                  <View style={[styles.twoColumnRow, { marginTop: 8 }]}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.texture")}</Text>
                      <Text variant="bodyMedium">{soilOptionLabel(textureOptions, layer.texture)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.cracks")}</Text>
                      <Text variant="bodyMedium">{layer.cracks ? soilOptionLabel(crackOptions, layer.cracks) : "-"}</Text>
                    </View>
                  </View>
                  <View style={{ marginTop: 8 }}>
                    <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("surveyView.otherCharacteristics")}</Text>
                    <Text variant="bodyMedium">{layerCharacteristics || t("surveyView.notRecorded")}</Text>
                  </View>
                </View>
              );
            });
          }
          return <Text variant="bodyMedium">-</Text>;
        })()}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16, elevation: 2 },
  twoColumnRow: { flexDirection: "row", gap: 16, marginBottom: 8 },
});
