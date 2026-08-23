import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { Dialog, Portal, Text, ProgressBar, Button, Icon, useTheme } from "react-native-paper";
import { useI18n } from "@/contexts/i18n-context";
import type { SpeciesSearchProgress } from "@/core/species-catalog/search-progress";
import { BUTTON_RADIUS } from "@/constants/shape";

export type SearchProgress = SpeciesSearchProgress;
export type SearchDialogPhase = "idle" | "counting" | "counted" | "searching";

interface SpeciesSearchProgressDialogProps {
  visible: boolean;
  source: "gbif" | "specieslink";
  phase: SearchDialogPhase;
  progress: SearchProgress | null;
  occurrenceCount?: number | null;
  onCancel: () => void;
  onConfirmCount: () => void;
}

export default function SpeciesSearchProgressDialog({
  visible,
  source,
  phase,
  progress,
  occurrenceCount,
  onCancel,
  onConfirmCount,
}: SpeciesSearchProgressDialogProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const pulseAnim = useRef(new Animated.Value(0.5)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  const SOURCE_CONFIG = {
    gbif: {
      label: "GBIF",
      subtitle: t("species.gbifNetwork"),
      color: theme.colors.tertiary,
      icon: "earth",
    },
    specieslink: {
      label: "SpeciesLink",
      subtitle: t("species.speciesLinkNetwork"),
      color: theme.colors.primary,
      icon: "link-variant",
    },
  };

  const config = SOURCE_CONFIG[source];

  const isProcessing = progress?.status === "processing";
  const currentPage = progress?.currentPage ?? 0;
  const totalPages = progress?.totalPages ?? 0;
  const pageProgressValue = totalPages > 0 ? Math.min(currentPage / totalPages, 1) : 0;

  const processedSpecies = progress?.processedSpecies ?? 0;
  const totalSpeciesToProcess = progress?.totalSpeciesToProcess ?? 0;
  const processingProgressValue =
    totalSpeciesToProcess > 0 ? Math.min(processedSpecies / totalSpeciesToProcess, 1) : 0;

  const progressValue = isProcessing ? processingProgressValue : pageProgressValue;
  const percent = Math.round(progressValue * 100);
  const isAnimating = phase === "counting" || (phase === "searching" && progress?.status !== "complete");

  useEffect(() => {
    if (visible && isAnimating) {
      pulseRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 900,
            useNativeDriver: true,
          }),
        ])
      );
      pulseRef.current.start();
    } else {
      pulseRef.current?.stop();
      pulseAnim.setValue(1);
    }
    return () => {
      pulseRef.current?.stop();
    };
  }, [visible, isAnimating]);

  const statusLabel = isProcessing ? t("species.processingData") : t("species.searchingData");

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={() => {}} dismissable={false}>
        <View
          style={[
            styles.header,
            { borderBottomColor: theme.colors.outlineVariant },
          ]}
        >
          <View
            style={[
              styles.sourceChip,
              { backgroundColor: config.color + "22" },
            ]}
          >
            <Icon source={config.icon} size={16} color={config.color} />
            <Text
              variant="labelLarge"
              style={[styles.sourceLabel, { color: config.color }]}
            >
              {config.label}
            </Text>
          </View>
          <Text variant="titleMedium" style={styles.title}>
            {t("species.searchingSpecies")}
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {config.subtitle}
          </Text>
        </View>

        <Dialog.Content style={styles.content}>
          {phase === "counting" && (
            <Animated.View style={[styles.statusRow, { opacity: pulseAnim }]}>
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurfaceVariant, fontStyle: "italic" }}
              >
                {t("species.countingOccurrences")}
              </Text>
            </Animated.View>
          )}

          {phase === "counted" && (
            <View style={{ gap: 8 }}>
              <Text
                variant="headlineMedium"
                style={{ color: config.color, fontWeight: "700", textAlign: "center" }}
              >
                {(occurrenceCount ?? 0).toLocaleString()}
              </Text>
              <Text variant="bodyMedium" style={{ textAlign: "center" }}>
                {t("species.occurrencesFoundTitle", { count: (occurrenceCount ?? 0).toLocaleString() })}
              </Text>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}
              >
                {t("species.occurrencesFoundSubtitle")}
              </Text>
            </View>
          )}

          {phase === "searching" && (
            <>
              {/* Progress bar */}
              <View style={styles.progressSection}>
                <View style={styles.progressHeader}>
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {isProcessing
                      ? t("species.processingSpeciesProgress", {
                          current: processedSpecies,
                          total: totalSpeciesToProcess,
                        })
                      : t("species.pageProgress", { current: currentPage, total: totalPages || currentPage })}
                  </Text>
                  <Text
                    variant="labelLarge"
                    style={{ color: config.color, fontWeight: "700" }}
                  >
                    {percent}%
                  </Text>
                </View>
                <ProgressBar
                  progress={progressValue}
                  color={config.color}
                  style={styles.progressBar}
                />
              </View>

              {/* Metrics */}
              <View style={styles.metricsRow}>
                <View
                  style={[
                    styles.metricCard,
                    { backgroundColor: theme.colors.surfaceVariant },
                  ]}
                >
                  <Text
                    variant="labelSmall"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {t("species.pageLabel")}
                  </Text>
                  <Text
                    variant="headlineSmall"
                    style={[styles.metricValue, { color: config.color }]}
                  >
                    {totalPages > 0 ? `${currentPage}/${totalPages}` : currentPage}
                  </Text>
                </View>
                <View
                  style={[
                    styles.metricCard,
                    { backgroundColor: theme.colors.surfaceVariant },
                  ]}
                >
                  <Text
                    variant="labelSmall"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {t("species.speciesFoundSoFar")}
                  </Text>
                  <Text
                    variant="headlineSmall"
                    style={[styles.metricValue, { color: config.color }]}
                  >
                    {progress?.uniqueSpecies ?? 0}
                  </Text>
                </View>
              </View>

              {/* Animated status */}
              <Animated.View style={[styles.statusRow, { opacity: pulseAnim }]}>
                <Text
                  variant="bodySmall"
                  style={{
                    color: theme.colors.onSurfaceVariant,
                    fontStyle: "italic",
                  }}
                >
                  {statusLabel}
                </Text>
              </Animated.View>
            </>
          )}
        </Dialog.Content>

        <Dialog.Actions>
          <Button onPress={onCancel}>{t("species.cancel")}</Button>
          {phase === "counted" && (
            <Button mode="contained" onPress={onConfirmCount} style={{ borderRadius: BUTTON_RADIUS }}>
              {t("species.startSpeciesCount")}
            </Button>
          )}
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  sourceChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
    marginBottom: 4,
  },
  sourceLabel: {
    fontWeight: "700",
  },
  title: {
    fontWeight: "600",
  },
  content: {
    gap: 14,
    paddingTop: 16,
    minHeight: 80,
  },
  progressSection: {
    gap: 6,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
  },
  metricCard: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 2,
  },
  metricValue: {
    fontWeight: "700",
  },
  statusRow: {
    alignItems: "center",
    paddingVertical: 2,
  },
});
