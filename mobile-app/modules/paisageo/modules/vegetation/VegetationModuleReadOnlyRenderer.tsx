import React from "react";
import { View, StyleSheet } from "react-native";
import { Card, Text, useTheme as usePaperTheme } from "react-native-paper";
import { useI18n } from "@/contexts/i18n-context";
import type { ModuleReadOnlyRendererProps } from "@/modules/generic/module-read-only-renderer-registry";
import type { VegetationModuleData } from "./serde";

const SUBSTITUTED_STATUS = "substituida";

// Relocated as-is from app/(survey)/survey-point-details/[id].tsx (Fase 5 of
// the plugin-architecture migration) - content unchanged, only the host
// (a registry-dispatched component instead of inline JSX) and the data
// source (props instead of a useMemo over pointModules) changed.
export function VegetationModuleReadOnlyRenderer({ value }: ModuleReadOnlyRendererProps) {
  const paperTheme = usePaperTheme();
  const { t } = useI18n();
  const vegData = (value ?? {}) as VegetationModuleData;
  const conservationStatus = (vegData as any).conservation_status as string | undefined;
  const isSubstituted = conservationStatus === SUBSTITUTED_STATUS;

  return (
    <Card style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}>
      <Card.Content>
        <Text variant="titleMedium" style={{ color: paperTheme.colors.primary, marginBottom: 12 }}>
          {t("surveyView.vegetation")}
        </Text>

        {/* Estado de conservação */}
        {(() => {
          const conservationLabels: Record<string, string> = {
            conservada:                 t("surveyView.conservationStatus.conservada"),
            em_regeneracao_nativas:     t("surveyView.conservationStatus.em_regeneracao_nativas"),
            em_regeneracao_consorciada: t("surveyView.conservationStatus.em_regeneracao_consorciada"),
            substituida:                t("surveyView.conservationStatus.substituida"),
          };
          const landUseLabels: Record<string, string> = {
            cultivo_temporario: t("surveyView.landUse.cultivo_temporario"),
            cultivo_permanente: t("surveyView.landUse.cultivo_permanente"),
            pasto_plantado:     t("surveyView.landUse.pasto_plantado"),
            agrofloresta:       t("surveyView.landUse.agrofloresta"),
            silvicultura:       t("surveyView.landUse.silvicultura"),
            construcoes:        t("surveyView.landUse.construcoes"),
            solo_exposto:       t("surveyView.landUse.solo_exposto"),
          };
          if (!conservationStatus) return null;
          const landUse = (vegData as any).land_use as string | undefined;
          return (
            <View style={{ marginBottom: 12 }}>
              <View style={styles.twoColumnRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
                    {t("surveyView.vegConservationStatus")}
                  </Text>
                  <Text variant="bodyMedium" style={{ fontWeight: "600", textAlign: "justify" }}>
                    {conservationLabels[conservationStatus] ?? conservationStatus}
                  </Text>
                </View>
                {landUse && (
                  <View style={{ flex: 1 }}>
                    <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
                      {t("surveyView.vegLandUse")}
                    </Text>
                    <Text variant="bodyMedium">
                      {landUseLabels[landUse] ?? landUse}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })()}

        {(() => {
          if (isSubstituted) return null;

          const usedCustomClassification = !!(vegData as any).veg_custom_class_id;
          const classificationGroup = vegData.classification_group ?? null;
          const classificationType = vegData.classification_type ?? null;
          const physiognomyComplement = (vegData as any).physiognomy_complement ?? null;
          const userPhysiognomyName = vegData.physiognomy_name || t("surveyView.notDefined");

          return (
            <>
              <View style={{ marginBottom: 12 }}>
                <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
                  {t("surveyView.physiognomyName")}
                </Text>
                <Text variant="titleMedium" style={{ color: paperTheme.colors.onSurface, fontWeight: "bold", textAlign: "justify" }}>
                  {userPhysiognomyName}
                </Text>
              </View>

              {physiognomyComplement && (
                <View style={{ marginBottom: 12 }}>
                  <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
                    {t("surveyView.physiognomyComplement")}
                  </Text>
                  <Text variant="bodyMedium" style={{ color: paperTheme.colors.onSurface }}>
                    {physiognomyComplement}
                  </Text>
                </View>
              )}

              {usedCustomClassification ? (
                <View style={[styles.twoColumnRow, { marginBottom: 12, backgroundColor: paperTheme.colors.elevation.level2, padding: 8, borderRadius: 8 }]}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
                      {t("vegetationClassification.classificationMode")}
                    </Text>
                    <Text variant="bodyMedium" style={{ fontWeight: "400", color: paperTheme.colors.primary }}>
                      {t("vegetationClassification.customClassification")}
                    </Text>
                  </View>
                </View>
              ) : (
                (classificationGroup || classificationType) && (
                  <View style={{ marginBottom: 12, backgroundColor: paperTheme.colors.elevation.level2, padding: 8, borderRadius: 8, gap: 8 }}>
                    {classificationGroup && (
                      <View>
                        <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
                          {t("surveyView.vegGroup")}
                        </Text>
                        <Text variant="bodyMedium" style={{ fontWeight: "400" }}>
                          {classificationGroup}
                        </Text>
                      </View>
                    )}
                    {classificationType && (
                      <View>
                        <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
                          {t("surveyView.classificationType")}
                        </Text>
                        <Text variant="bodyMedium" style={{ fontWeight: "400" }}>
                          {classificationType}
                        </Text>
                      </View>
                    )}
                  </View>
                )
              )}

              <View style={styles.twoColumnRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
                    {t("surveyView.kuchlerFormula")}
                  </Text>
                  <Text variant="bodyMedium">{vegData.kuchler_formula || "-"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
                    {t("surveyView.numberOfStrata")}
                  </Text>
                  <Text variant="bodyMedium">{vegData.total_strata ?? 0}</Text>
                </View>
              </View>
            </>
          );
        })()}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16, elevation: 2 },
  twoColumnRow: { flexDirection: "row", gap: 16, marginBottom: 8 },
});
