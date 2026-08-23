import React, { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Card, Text, Divider, IconButton, useTheme as usePaperTheme } from "react-native-paper";
import { useI18n } from "@/contexts/i18n-context";
import { useProtocolTranslations } from "@/hooks/use-protocol-translations";
import { displayValue } from "@/modules/generic/read-only-display";
import type { ModuleReadOnlyRendererProps } from "@/modules/generic/module-read-only-renderer-registry";
import type { ImpactsModuleData } from "./serde";
import { IMPACTS_FIELD_CONFIG } from "./impact-types-config";

// Thin 3-segment fill bar: filled segments use the theme's primary color at
// full opacity, empty segments the same color at low opacity (matches the
// "subtle/empty" opacity convention already used elsewhere in the app, e.g.
// SpeciesLinkSettingsModal), so the level reads visually without introducing
// semantic red/yellow/green colors.
function ImpactLevelBar({ level, color }: { level: number; color: string }) {
  return (
    <View style={styles.levelBar}>
      {[1, 2, 3].map((segment) => (
        <View
          key={segment}
          style={[styles.levelSegment, { backgroundColor: color, opacity: segment <= level ? 1 : 0.15 }]}
        />
      ))}
    </View>
  );
}

// Relocated as-is from app/(survey)/survey-point-details/[id].tsx (Fase 5 of
// the plugin-architecture migration), then redesigned to be more visual:
// tapping an impact reveals its magnitude description, and a thin 3-level
// bar shows the magnitude at a glance next to the kept text label.
export function ImpactsModuleReadOnlyRenderer({ value }: ModuleReadOnlyRendererProps) {
  const paperTheme = usePaperTheme();
  const { t } = useI18n();
  const { translateField } = useProtocolTranslations();
  const impactsData = (value ?? { impacts: [] }) as ImpactsModuleData;
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());

  const toggleExpanded = (index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // Impact type/magnitude are stored as the canonical option key (see
  // ImpactList.tsx), not the pt/en label text - resolve them against
  // IMPACTS_FIELD_CONFIG's own option shape ({key,label,desc,magnitude_desc}
  // for types, {value,pt,en,es,fr} for magnitudes), matching how ImpactList
  // itself resolves the same values.
  const resolveImpact = (type: string, magnitude: string) => {
    const typeOption = IMPACTS_FIELD_CONFIG.options.find((o) => o.key === type);
    const magIndex = IMPACTS_FIELD_CONFIG.config.magnitude_options.findIndex((m) => m.value === magnitude);
    const magnitudeOption = magIndex >= 0 ? IMPACTS_FIELD_CONFIG.config.magnitude_options[magIndex] : undefined;

    return {
      typeLabel: typeOption ? translateField(typeOption.label) : type,
      magnitudeLabel: magnitudeOption ? translateField(magnitudeOption) : displayValue(magnitude),
      magnitudeDesc: typeOption?.magnitude_desc?.[magIndex] ? translateField(typeOption.magnitude_desc[magIndex]) : null,
      level: magIndex >= 0 ? magIndex + 1 : 0,
    };
  };

  return (
    <Card style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}>
      <Card.Content>
        <Text variant="titleMedium" style={{ color: paperTheme.colors.primary, marginBottom: 12 }}>{t("surveyView.impacts")}</Text>
        {impactsData.impacts.length === 0 ? (
          <Text variant="bodyMedium">-</Text>
        ) : (
          <View>
            {impactsData.impacts.map((impact, index) => {
              const { typeLabel, magnitudeLabel, magnitudeDesc, level } = resolveImpact(impact.type, impact.magnitude);
              const expanded = expandedIndices.has(index);
              const hasDescription = Boolean(magnitudeDesc);

              return (
                <View key={`impact-${index}`} style={{ marginBottom: 8 }}>
                  <Pressable onPress={() => toggleExpanded(index)} style={styles.header}>
                    <IconButton
                      icon={expanded ? "chevron-down" : "chevron-right"}
                      size={20}
                      style={styles.chevron}
                      iconColor={paperTheme.colors.primary}
                    />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium" style={{ fontWeight: "bold", color: paperTheme.colors.onSurface }}>
                        {typeLabel}
                      </Text>
                      <View style={styles.magnitudeRow}>
                        <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
                          {t("surveyView.magnitude")}: {magnitudeLabel}
                        </Text>
                        <ImpactLevelBar level={level} color={paperTheme.colors.primary} />
                      </View>
                    </View>
                  </Pressable>

                  {expanded && hasDescription && (
                    <View style={styles.descriptionBlock}>
                      <Text
                        variant="bodySmall"
                        style={[styles.descriptionText, { color: paperTheme.colors.onSurfaceVariant }]}
                      >
                        {magnitudeDesc}
                      </Text>
                    </View>
                  )}

                  {impact.details ? (
                    <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary, marginTop: 2, marginLeft: 40 }}>
                      {impact.details}
                    </Text>
                  ) : null}

                  {index < impactsData.impacts.length - 1 && <Divider style={{ marginTop: 8 }} />}
                </View>
              );
            })}
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16, elevation: 2 },
  header: { flexDirection: "row", alignItems: "center" },
  chevron: { margin: 0 },
  magnitudeRow: { flexDirection: "row", alignItems: "center", marginTop: 2, gap: 8 },
  levelBar: { flexDirection: "row", gap: 3 },
  levelSegment: { width: 16, height: 5, borderRadius: 2 },
  descriptionBlock: { marginLeft: 40, marginTop: 2 },
  descriptionText: { fontStyle: "italic", lineHeight: 18, textAlign: "justify" },
});
