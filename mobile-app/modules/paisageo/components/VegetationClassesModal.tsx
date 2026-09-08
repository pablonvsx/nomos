import React, { useState, useCallback, useMemo } from "react";
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
  TextInput,
  Card,
  ActivityIndicator,
} from "react-native-paper";
import { VegetationClass, VegetationClassification } from "@/types/database";
import { BUTTON_RADIUS } from "@/constants/shape";
import {
  createVegetationClassification,
  updateVegetationClassification,
  getVegetationClassificationById,
} from "@/db/queries/vegetation-classifications";
import { pushVegetationClassificationIfCollaborative } from "@/core/drive-sync/reference-data-sync-service";
import { useI18n } from "@/contexts/i18n-context";
import { useAlertDialog } from "@/hooks/use-dialog";

interface VegetationClassesModalProps {
  projectId: number;
  visible: boolean;
  existingClassification?: VegetationClassification | null;
  onClose: () => void;
  onSave?: (classification: VegetationClassification) => void;
}

interface EditingClass extends VegetationClass {
  isNew?: boolean;
}

const generateClassId = () => `class_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export default function VegetationClassesModal({
  projectId,
  visible,
  existingClassification,
  onClose,
  onSave,
}: VegetationClassesModalProps) {
  const theme = usePaperTheme();
  const { t } = useI18n();
  const { confirm, alert } = useAlertDialog();

  const [classificationName, setClassificationName] = useState("");
  const [classes, setClasses] = useState<EditingClass[]>([]);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editingClassName, setEditingClassName] = useState("");
  const [editingClassDescription, setEditingClassDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Initialize with existing data when modal opens
  React.useEffect(() => {
    if (visible) {
      if (existingClassification) {
        setClassificationName(existingClassification.name);
        setClasses(
          existingClassification.classes.map(c => ({
            ...c,
            isNew: false,
          }))
        );
      } else {
        setClassificationName("");
        setClasses([]);
      }
      setEditingClassId(null);
    }
  }, [visible, existingClassification]);

  const handleAddClass = useCallback(() => {
    const newClass: EditingClass = {
      id: generateClassId(),
      name: "",
      description: "",
      isNew: true,
    };
    setClasses([...classes, newClass]);
    setEditingClassId(newClass.id);
    setEditingClassName("");
    setEditingClassDescription("");
  }, [classes]);

  const handleEditClass = useCallback((classItem: EditingClass) => {
    setEditingClassId(classItem.id);
    setEditingClassName(classItem.name);
    setEditingClassDescription(classItem.description || "");
  }, []);

  const handleSaveClassEdit = useCallback(() => {
    if (!editingClassName.trim()) {
      alert(t("common.alert"), t("vegetationClassification.classNameRequired"));
      return;
    }

    setClasses(
      classes.map(c =>
        c.id === editingClassId
          ? {
              ...c,
              name: editingClassName.trim(),
              description: editingClassDescription.trim(),
              isNew: false,
            }
          : c
      )
    );
    setEditingClassId(null);
  }, [classes, editingClassId, editingClassName, editingClassDescription, alert, t]);

  const handleDeleteClass = useCallback((classId: string) => {
    confirm(
      t("common.confirm"),
      t("vegetationClassification.deleteClassConfirmation"),
      () => {
        setClasses(classes.filter(c => c.id !== classId));
        if (editingClassId === classId) {
          setEditingClassId(null);
        }
      }
    );
  }, [classes, editingClassId, confirm, t]);

  const handleSaveClassification = useCallback(async () => {
    if (!classificationName.trim()) {
      alert(t("common.alert"), t("vegetationClassification.classificationNameRequired"));
      return;
    }

    if (classes.length === 0) {
      alert(t("common.alert"), t("vegetationClassification.mustHaveAtLeastOneClass"));
      return;
    }

    // Save any pending edit
    if (editingClassId !== null) {
      handleSaveClassEdit();
      return;
    }

    setSaving(true);
    try {
      const classesData = classes.map(({ isNew, ...rest }) => rest);

      let result;
      if (existingClassification) {
        const success = await updateVegetationClassification(
          existingClassification.id,
          classificationName.trim(),
          classesData
        );
        result = success ? existingClassification : null;
      } else {
        const classificationId = await createVegetationClassification(
          projectId,
          classificationName.trim(),
          classesData
        );
        result = classificationId ? { id: classificationId } : null;

        if (classificationId) {
          const created = await getVegetationClassificationById(classificationId);
          if (created) pushVegetationClassificationIfCollaborative(projectId, created);
        }
      }

      if (result && onSave) {
        onSave({
          id: result.id || existingClassification?.id || 0,
          project_id: projectId,
          name: classificationName.trim(),
          classes: classesData,
          created_at: existingClassification?.created_at || new Date().toISOString(),
          last_updated: new Date().toISOString(),
        });
      }

      onClose();
    } catch (error) {
      console.error("Error saving vegetation classification:", error);
      alert(t("common.error"), t("vegetationClassification.errorSavingClassification"));
    } finally {
      setSaving(false);
    }
  }, [
    projectId,
    classificationName,
    classes,
    existingClassification,
    editingClassId,
    handleSaveClassEdit,
    onSave,
    onClose,
    alert,
    t,
  ]);

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
        input: {
          marginBottom: 12,
        },
        sectionTitle: {
          marginTop: 16,
          marginBottom: 8,
          fontWeight: "bold",
        },
        classCard: {
          marginVertical: 6,
          backgroundColor: theme.colors.surfaceVariant,
        },
        classCardContent: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        },
        classInfo: {
          flex: 1,
        },
        editForm: {
          marginVertical: 12,
          padding: 12,
          backgroundColor: theme.colors.background,
          borderRadius: 8,
          borderColor: theme.colors.primary,
          borderWidth: 1,
        },
        editFormButton: {
          flexDirection: "row",
          justifyContent: "flex-end",
          marginTop: 8,
          gap: 8,
        },
        addButton: {
          marginVertical: 12,
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
      <Dialog.Title style={{ fontSize: 16 }} numberOfLines={1}>
        {t("vegetationClassification.manageClasses")}
      </Dialog.Title>

      <Dialog.ScrollArea style={styles.content}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Classification Name */}
          {!editingClassId && (
            <TextInput
              label={t("vegetationClassification.classificationName")}
              value={classificationName}
              onChangeText={setClassificationName}
              mode="outlined"
              style={styles.input}
              editable={!saving}
            />
          )}

          {/* Classes List */}
          <Text style={styles.sectionTitle}>{t("vegetationClassification.vegetationClasses")}</Text>

          {editingClassId ? (
            // Edit Form
            <View style={styles.editForm}>
              <TextInput
                label={t("vegetationClassification.className")}
                value={editingClassName}
                onChangeText={setEditingClassName}
                mode="outlined"
                style={styles.input}
                editable={!saving}
              />
              <TextInput
                label={t("vegetationClassification.classDescription")}
                value={editingClassDescription}
                onChangeText={setEditingClassDescription}
                mode="outlined"
                multiline
                numberOfLines={2}
                style={styles.input}
                editable={!saving}
              />
              <View style={styles.editFormButton}>
                <Button
                  onPress={() => setEditingClassId(null)}
                  disabled={saving}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onPress={handleSaveClassEdit}
                  disabled={saving}
                  mode="contained"
                  style={{ borderRadius: BUTTON_RADIUS }}
                >
                  {t("common.save")}
                </Button>
              </View>
            </View>
          ) : (
            <>
              {classes.length === 0 ? (
                <Text style={styles.emptyText}>{t("vegetationClassification.noClassesAdded")}</Text>
              ) : (
                <FlatList
                  scrollEnabled={false}
                  data={classes}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <Card style={styles.classCard}>
                      <Card.Content style={styles.classCardContent}>
                        <View style={styles.classInfo}>
                          <Text variant="bodyMedium" style={{ fontWeight: "bold" }}>
                            {item.name}
                          </Text>
                          {item.description && (
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                              {item.description}
                            </Text>
                          )}
                        </View>
                        <View style={{ flexDirection: "row" }}>
                          <IconButton
                            icon="pencil"
                            size={20}
                            onPress={() => handleEditClass(item)}
                            disabled={saving}
                          />
                          <IconButton
                            icon="delete"
                            size={20}
                            iconColor={theme.colors.error}
                            onPress={() => handleDeleteClass(item.id)}
                            disabled={saving}
                          />
                        </View>
                      </Card.Content>
                    </Card>
                  )}
                />
              )}
            </>
          )}

          {!editingClassId && (
            <Button
              mode="outlined"
              onPress={handleAddClass}
              style={[styles.addButton, { borderRadius: BUTTON_RADIUS }]}
              disabled={saving}
              icon="plus"
            >
              {t("vegetationClassification.addClass")}
            </Button>
          )}
        </ScrollView>
      </Dialog.ScrollArea>

      <Dialog.Actions>
        <Button onPress={onClose} disabled={saving}>
          {t("common.cancel")}
        </Button>
        <Button
          onPress={handleSaveClassification}
          loading={saving}
          disabled={saving}
          mode="contained"
          style={{ borderRadius: BUTTON_RADIUS }}
        >
          {t("common.save")}
        </Button>
      </Dialog.Actions>
    </Dialog>
  );
}
