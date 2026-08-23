import React, { useState } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { Card, Text, Button, IconButton, Portal, Modal, useTheme } from "react-native-paper";
import type { DynamicGroupRule, LanguageCode } from "@/protocol-kernel/types";
import { useI18n } from "@/contexts/i18n-context";
import { GenericFieldRow } from "./GenericFieldRow";

interface Props {
  group: DynamicGroupRule;
  label: string;
  items: Record<string, unknown>[];
  onChange: (nextItems: Record<string, unknown>[]) => void;
  language: LanguageCode;
  projectId?: number;
  surveyPointId?: number;
}

/**
 * Generic, protocol-agnostic renderer for a ModuleSchema dynamic group
 * (variable-cardinality collection, e.g. custom-protocol "repeatable_group"
 * fields). Mirrors the add/edit/remove card+modal interaction pattern of
 * PAISAGEO's SoilProfileInput, but driven entirely by group.itemFields
 * instead of hardcoded soil fields.
 */
export function RepeatableGroupField({
  group,
  label,
  items,
  onChange,
  language,
  projectId,
  surveyPointId,
}: Props) {
  const theme = useTheme();
  const { t } = useI18n();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftItem, setDraftItem] = useState<Record<string, unknown>>({});

  const openAdd = () => {
    setEditingIndex(null);
    setDraftItem({});
    setModalVisible(true);
  };

  const openEdit = (index: number) => {
    setEditingIndex(index);
    setDraftItem(items[index] ?? {});
    setModalVisible(true);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const saveItem = () => {
    if (editingIndex === null) {
      onChange([...items, draftItem]);
    } else {
      onChange(items.map((item, i) => (i === editingIndex ? draftItem : item)));
    }
    setModalVisible(false);
  };

  return (
    <View style={styles.container}>
      <Text variant="bodyMedium" style={{ marginBottom: 8, color: theme.colors.primary }}>
        {label}
      </Text>

      {items.map((item, index) => (
        <Card key={index} style={styles.itemCard} mode="outlined">
          <Card.Content style={styles.itemHeader}>
            <Text variant="titleSmall" style={{ flex: 1, fontWeight: "bold", color: theme.colors.onSurface }}>
              {label} {index + 1}
            </Text>
            <IconButton icon="pencil" onPress={() => openEdit(index)} />
            <IconButton icon="delete" iconColor={theme.colors.error} onPress={() => removeItem(index)} />
          </Card.Content>
        </Card>
      ))}

      <Button
        mode="outlined"
        icon="plus"
        onPress={openAdd}
        style={{ marginTop: 8, borderStyle: "dashed" }}
        textColor={theme.colors.primary}
      >
        {t("survey.addGroupItem", { label })}
      </Button>

      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={() => setModalVisible(false)}
          contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
        >
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            <Text variant="titleMedium" style={{ marginBottom: 16, fontWeight: "bold", color: theme.colors.primary }}>
              {editingIndex === null
                ? t("survey.addGroupItem", { label })
                : `${label} ${editingIndex + 1}`}
            </Text>

            {group.itemFields.map((field) => (
              <GenericFieldRow
                key={field.id}
                field={field}
                value={draftItem[field.id]}
                onChange={(val) => setDraftItem((prev) => ({ ...prev, [field.id]: val }))}
                language={language}
                projectId={projectId}
                surveyPointId={surveyPointId}
              />
            ))}

            <Button mode="contained" onPress={saveItem} style={{ marginTop: 8 }}>
              {t("common.save")}
            </Button>
            <Button onPress={() => setModalVisible(false)} style={{ marginTop: 8 }}>
              {t("common.cancel")}
            </Button>
          </ScrollView>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  itemCard: { marginBottom: 8 },
  itemHeader: { flexDirection: "row", alignItems: "center" },
  modalContent: { margin: 20, padding: 20, borderRadius: 12, maxHeight: "85%" },
});
