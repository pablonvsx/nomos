import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  FlatList,
} from "react-native";
import {
  Dialog,
  Button,
  Text,
  useTheme as usePaperTheme,
  IconButton,
  Card,
  ActivityIndicator,
  Divider,
} from "react-native-paper";
import { VegetationClassification } from "@/types/database";
import { BUTTON_RADIUS } from "@/constants/shape";
import {
  getVegetationClassificationsByProject,
  deleteVegetationClassification,
} from "@/db/queries/vegetation-classifications";
import { useI18n } from "@/contexts/i18n-context";
import { useAlertDialog } from "@/hooks/use-dialog";
import VegetationClassesModal from "./VegetationClassesModal";

interface VegetationClassificationsManagementModalProps {
  projectId: number;
  visible: boolean;
  onClose: () => void;
  onClassificationsChanged?: () => void;
}

export default function VegetationClassificationsManagementModal({
  projectId,
  visible,
  onClose,
  onClassificationsChanged,
}: VegetationClassificationsManagementModalProps) {
  const theme = usePaperTheme();
  const { t } = useI18n();
  const { confirm, alert } = useAlertDialog();

  const [classifications, setClassifications] = useState<VegetationClassification[]>([]);
  const [loading, setLoading] = useState(false);
  const [classesModalVisible, setClassesModalVisible] = useState(false);
  const [editingClassification, setEditingClassification] = useState<VegetationClassification | null>(null);

  // Load classifications when modal opens
  useEffect(() => {
    if (!visible) return;

    const loadClassifications = async () => {
      setLoading(true);
      try {
        const data = await getVegetationClassificationsByProject(projectId);
        setClassifications(data);
      } catch (error) {
        console.error("Error loading vegetation classifications:", error);
        alert(t("common.error"), t("vegetationClassification.errorSavingClassification"));
      } finally {
        setLoading(false);
      }
    };

    loadClassifications();
  }, [visible, projectId, alert, t]);

  const handleCreateNew = useCallback(() => {
    setEditingClassification(null);
    setClassesModalVisible(true);
  }, []);

  const handleEdit = useCallback((classification: VegetationClassification) => {
    setEditingClassification(classification);
    setClassesModalVisible(true);
  }, []);

  const handleDelete = useCallback((classification: VegetationClassification) => {
    confirm(
      t("common.confirm"),
      `${t("common.delete")} "${classification.name}"?`,
      async () => {
        try {
          await deleteVegetationClassification(classification.id);
          // Reload classifications
          const data = await getVegetationClassificationsByProject(projectId);
          setClassifications(data);
          if (onClassificationsChanged) {
            onClassificationsChanged();
          }
        } catch (error) {
          console.error("Error deleting classification:", error);
          alert(t("common.error"), t("vegetationClassification.errorSavingClassification"));
        }
      }
    );
  }, [projectId, confirm, alert, t, onClassificationsChanged]);

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
        emptyText: {
          textAlign: "center",
          marginVertical: 16,
          color: theme.colors.onSurfaceVariant,
        },
        classificationCard: {
          marginVertical: 6,
          backgroundColor: theme.colors.surfaceVariant,
        },
        classificationCardContent: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingVertical: 8,
          paddingHorizontal: 12,
        },
        classificationInfo: {
          flex: 1,
        },
        cardActions: {
          flexDirection: "row",
        },
      }),
    [theme]
  );

  if (!visible) return null;

  return (
    <>
      <Dialog
        visible={visible && !classesModalVisible}
        onDismiss={onClose}
        style={styles.dialog}
      >
        <Dialog.Title style={{ fontSize: 16 }} numberOfLines={1}>
          {t("vegetationClassification.manageClassifications")}
        </Dialog.Title>

        <Dialog.ScrollArea style={styles.content}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator animating size="large" />
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {classifications.length === 0 ? (
                <Text style={styles.emptyText}>
                  {t("vegetationClassification.noCustomClassifications")}
                </Text>
              ) : (
                <FlatList
                  scrollEnabled={false}
                  data={classifications}
                  keyExtractor={(item) => item.id.toString()}
                  renderItem={({ item }) => (
                    <Card style={styles.classificationCard}>
                      <Card.Content style={styles.classificationCardContent}>
                        <View style={styles.classificationInfo}>
                          <Text variant="bodyMedium" style={{ fontWeight: "bold" }}>
                            {item.name}
                          </Text>
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            {item.classes.length} {t("vegetationClassification.classes")}
                          </Text>
                        </View>
                        <View style={styles.cardActions}>
                          <IconButton
                            icon="pencil"
                            size={20}
                            onPress={() => handleEdit(item)}
                            iconColor={theme.colors.primary}
                          />
                          <IconButton
                            icon="delete"
                            size={20}
                            onPress={() => handleDelete(item)}
                            iconColor={theme.colors.error}
                          />
                        </View>
                      </Card.Content>
                    </Card>
                  )}
                />
              )}
            </ScrollView>
          )}
        </Dialog.ScrollArea>

        <Dialog.Actions>
          <Button onPress={onClose}>{t("common.close")}</Button>
          <Button onPress={handleCreateNew} mode="contained" style={{ borderRadius: BUTTON_RADIUS }}>
            {t("common.add")}
          </Button>
        </Dialog.Actions>
      </Dialog>

      {/* Vegetation Classes Editor Modal */}
      <VegetationClassesModal
        projectId={projectId}
        visible={classesModalVisible}
        existingClassification={editingClassification}
        onClose={() => {
          setClassesModalVisible(false);
          setEditingClassification(null);
        }}
        onSave={() => {
          setClassesModalVisible(false);
          setEditingClassification(null);
          // Reload classifications
          getVegetationClassificationsByProject(projectId).then(data => {
            setClassifications(data);
            if (onClassificationsChanged) {
              onClassificationsChanged();
            }
          });
        }}
      />
    </>
  );
}
