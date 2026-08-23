import React, { useMemo, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import {
  TextInput,
  Text,
  IconButton,
  useTheme as usePaperTheme,
  Surface,
} from "react-native-paper";
import { useI18n } from "@/contexts/i18n-context";
import { VegetationClass } from "@/types/database";
import SurveySelect from "@/components/survey/SurveySelect";
import { PHYSIOGNOMY_COMPLEMENT_DESC } from "@/modules/paisageo/modules/vegetation/section-titles";

interface VegetationPhysiognomyCardProps {
  // For Standard mode: physiognomyName/classificationGroup are computed and
  // owned by KuchlerMatrix itself (this component only displays them).
  physiognomyName?: string;
  classificationGroup?: string;
  physiognomyComplement?: string;
  onPhysiognomyComplementChange?: (complement: string) => void;
  onInfoPress?: (text: string) => void;

  // For Custom mode
  classificationType?: "standard" | "custom";
  customClasses?: VegetationClass[];
  selectedClassId?: string;
  onClassIdChange?: (classId: string) => void;
}

export default function VegetationPhysiognomyCard({
  physiognomyName = "",
  classificationGroup = "",
  physiognomyComplement = "",
  onPhysiognomyComplementChange,
  onInfoPress,
  classificationType = "standard",
  customClasses = [],
  selectedClassId,
  onClassIdChange,
}: VegetationPhysiognomyCardProps) {
  const theme = usePaperTheme();
  const { t, currentLanguage } = useI18n();

  // Same collapsible pattern as the context_flags section below the matrix
  // (VegetationModuleRenderer): expanded by default when the point being
  // edited already has a complement saved (this component hydrates from
  // `data` on mount, same as the rest of the Kuchler form), collapsed
  // otherwise so the free-text field doesn't compete with the matrix for
  // attention on the common case where it's left empty.
  const [complementExpanded, setComplementExpanded] = useState(!!physiognomyComplement);
  const complementDesc = PHYSIOGNOMY_COMPLEMENT_DESC[currentLanguage] ?? PHYSIOGNOMY_COMPLEMENT_DESC["pt"];

  const handleComplementChange = (text: string) => {
    onPhysiognomyComplementChange?.(text);
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          marginTop: 16,
        },
        heading: {
          color: theme.colors.primary,
          marginBottom: 8,
        },
        textInput: {
          marginTop: 8,
          backgroundColor: theme.colors.surface,
        },
        physiognomySurface: {
          marginTop: 8,
          padding: 12,
          backgroundColor: theme.colors.surfaceVariant,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: theme.colors.outline,
        },
        physiognomyText: {
          color: theme.colors.onSurface,
          fontWeight: "600",
          fontSize: 14,
          lineHeight: 20,
        },
        groupText: {
          color: theme.colors.secondary,
          marginTop: 4,
        },
        complementHeader: {
          marginTop: 16,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: theme.colors.outlineVariant,
          flexDirection: "row",
          alignItems: "center",
        },
        complementHeaderLabel: {
          flex: 1,
          color: theme.colors.primary,
        },
      }),
    [theme],
  );

  // STANDARD MODE
  if (classificationType === "standard") {
    return (
      <View style={styles.container}>
        <Text variant="titleSmall" style={styles.heading}>
          {t("survey.physiognomy") || "Vegetation physiognomy"}
        </Text>

        {classificationGroup && physiognomyName ? (
          <Text variant="bodySmall" style={styles.groupText}>
            {t("survey.group") || "Grupo"}: {classificationGroup}
          </Text>
        ) : null}

        {physiognomyName ? (
          <Surface style={styles.physiognomySurface}>
            <Text style={styles.physiognomyText}>{physiognomyName}</Text>
          </Surface>
        ) : (
          <Surface style={[styles.physiognomySurface, { opacity: 0.6 }]}>
            <Text style={[styles.physiognomyText, { color: theme.colors.onSurfaceVariant }]}>
              {t("survey.physiognomyPlaceholder") || "Tap Classify to generate"}
            </Text>
          </Surface>
        )}

        <View style={styles.complementHeader}>
          <Pressable
            onPress={() => setComplementExpanded((e) => !e)}
            style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
          >
            <IconButton
              icon={complementExpanded ? "chevron-down" : "chevron-right"}
              size={20}
              iconColor={theme.colors.primary}
              style={{ margin: 0 }}
            />
            <Text variant="titleSmall" style={styles.complementHeaderLabel}>
              {t("survey.physiognomyComplement")}
            </Text>
            {!complementExpanded && !!physiognomyComplement && (
              <Text variant="labelSmall" style={{ color: theme.colors.secondary, marginRight: 4 }}>
                ✓
              </Text>
            )}
          </Pressable>
          {onInfoPress && (
            <IconButton
              icon="information-outline"
              size={18}
              iconColor={theme.colors.secondary}
              style={{ margin: 0 }}
              onPress={() => onInfoPress(complementDesc)}
            />
          )}
        </View>
        {complementExpanded && (
          <TextInput
            mode="outlined"
            value={physiognomyComplement}
            onChangeText={handleComplementChange}
            placeholder={t("survey.physiognomyComplementPlaceholder") || "E.g.: an unusual stratum, an imprecise boundary between physiognomies..."}
            multiline
            style={styles.textInput}
          />
        )}
      </View>
    );
  }

  // CUSTOM MODE
  return (
    <View style={styles.container}>
      <Text variant="titleSmall" style={styles.heading}>
        {t("vegetationClassification.selectClass")}
      </Text>
      {customClasses.length > 0 ? (
        <SurveySelect
          label={t("vegetationClassification.selectClass")}
          options={customClasses.map((cls) => ({
            label: cls.name,
            value: cls.id,
          }))}
          value={selectedClassId}
          onChange={(val) => onClassIdChange?.(val as string)}
          hideLabel={true}
        />
      ) : (
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {t("vegetationClassification.noCustomClassifications")}
        </Text>
      )}
    </View>
  );
}
