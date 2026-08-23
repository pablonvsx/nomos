import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  FlatList,
} from "react-native";
import {
  Dialog,
  Button,
  RadioButton,
  Text,
  useTheme as usePaperTheme,
  Card,
  ActivityIndicator,
} from "react-native-paper";
import {
  getVegetationClassificationsByProject,
  setActiveVegetationClassification,
  getActiveVegetationClassificationConfig,
} from "@/db/queries/vegetation-classifications";
import { VegetationClassification } from "@/types/database";
import { useI18n } from "@/contexts/i18n-context";

interface VegetationClassificationPickerProps {
  projectId: number;
  visible: boolean;
  onClose: () => void;
  onConfigChange?: () => void;
}

export default function VegetationClassificationPicker({
  projectId,
  visible,
  onClose,
  onConfigChange,
}: VegetationClassificationPickerProps) {
  const theme = usePaperTheme();
  const { t } = useI18n();

  const [selectedClassificationId, setSelectedClassificationId] = useState<number | null>(null);
  const [customClassifications, setCustomClassifications] = useState<VegetationClassification[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load current selection and classifications when modal opens
  useEffect(() => {
    if (!visible) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // Get current selection
        const config = await getActiveVegetationClassificationConfig(projectId);
        if (config && config.type === "custom") {
          setSelectedClassificationId(config.classificationId);
        }

        // Get all classifications
        const classifications = await getVegetationClassificationsByProject(projectId);
        setCustomClassifications(classifications);
      } catch (error) {
        console.error("Error loading vegetation classifications:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [visible, projectId]);

  const handleSave = useCallback(async () => {
    if (!selectedClassificationId) return;

    setSaving(true);
    try {
      await setActiveVegetationClassification(projectId, selectedClassificationId, "custom");
      
      if (onConfigChange) {
        onConfigChange();
      }

      onClose();
    } catch (error) {
      console.error("Error saving vegetation classification:", error);
    } finally {
      setSaving(false);
    }
  }, [projectId, selectedClassificationId, onClose, onConfigChange]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        dialog: {
          backgroundColor: theme.colors.surface,
        },
        content: {
          paddingHorizontal: 24,
          paddingVertical: 16,
        },
        loadingContainer: {
          justifyContent: "center",
          alignItems: "center",
          paddingVertical: 20,
        },
        classificationCard: {
          marginVertical: 8,
          backgroundColor: theme.colors.surfaceVariant,
        },
        classificationCardSelected: {
          borderColor: theme.colors.primary,
          borderWidth: 2,
        },
        emptyText: {
          textAlign: "center",
          marginVertical: 16,
          color: theme.colors.onSurfaceVariant,
        },
      }),
    [theme]
  );

  if (!visible) return null;

  return (
    <Dialog
      visible={visible}
      onDismiss={onClose}
      style={styles.dialog}
    >
      <Dialog.Title>{t("vegetationClassification.selectClassification")}</Dialog.Title>

      <Dialog.ScrollArea style={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator animating size="large" />
          </View>
        ) : customClassifications.length === 0 ? (
          <Text style={styles.emptyText}>
            {t("vegetationClassification.noCustomClassifications")}
          </Text>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <FlatList
              scrollEnabled={false}
              data={customClassifications}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <Card
                  style={[
                    styles.classificationCard,
                    selectedClassificationId === item.id && styles.classificationCardSelected,
                  ]}
                  onPress={() => setSelectedClassificationId(item.id)}
                >
                  <Card.Content>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyMedium" style={{ fontWeight: "bold" }}>
                          {item.name}
                        </Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {item.classes.length} {t("vegetationClassification.classes")}
                        </Text>
                      </View>
                      <RadioButton
                        value={item.id.toString()}
                        status={selectedClassificationId === item.id ? "checked" : "unchecked"}
                        onPress={() => setSelectedClassificationId(item.id)}
                        color={theme.colors.primary}
                      />
                    </View>
                  </Card.Content>
                </Card>
              )}
            />
          </ScrollView>
        )}
      </Dialog.ScrollArea>

      <Dialog.Actions>
        <Button onPress={onClose}>{t("common.cancel")}</Button>
        <Button onPress={handleSave} loading={saving} disabled={loading || saving || !selectedClassificationId}>
          {t("common.save")}
        </Button>
      </Dialog.Actions>
    </Dialog>
  );
}
