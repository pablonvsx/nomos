import { MODAL_TITLE_STYLE } from "@/constants/modal-title";
import React, { useState } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { Card, Text, Button, IconButton, Portal, Modal, useTheme } from "react-native-paper";
import type { DynamicGroupRule, LanguageCode } from "@/protocol-kernel/types";
import { useI18n } from "@/contexts/i18n-context";
import { DialogProvider } from "@/hooks/use-dialog";
import { MODAL_PADDING_H, MODAL_PADDING_TOP } from "@/constants/modal-layout";
import { BUTTON_RADIUS, MODAL_RADIUS } from "@/constants/shape";
import { ModalActions } from "@/components/ui/ModalActions";
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

  const removeEditedItem = () => {
    if (editingIndex !== null) removeItem(editingIndex);
    setModalVisible(false);
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
            <IconButton accessibilityLabel={t("common.edit")} icon="pencil" onPress={() => openEdit(index)} />
            <IconButton accessibilityLabel={t("common.delete")} icon="delete" iconColor={theme.colors.error} onPress={() => removeItem(index)} />
          </Card.Content>
        </Card>
      ))}

      <Button
        mode="outlined"
        icon="plus"
        onPress={openAdd}
        style={{ marginTop: 8, borderStyle: "dashed", borderRadius: BUTTON_RADIUS }}
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
          {/* Paper renders Portal content as a sibling of the app tree, outside
              the root DialogProvider (app/_layout.tsx), so useAlertDialog() in
              PhotoInput/AudioNotesInput would throw here. A nested provider
              fixes that, and its own Portal mounts after this one, so alerts
              stack on top of the modal instead of behind it. */}
          <DialogProvider>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.modalScroll}>
              <Text variant="titleMedium" style={{ ...MODAL_TITLE_STYLE, marginBottom: 16, color: theme.colors.primary }}>
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

              {editingIndex !== null && (
                <Button
                  mode="outlined"
                  textColor={theme.colors.error}
                  onPress={removeEditedItem}
                  style={{ marginTop: 8, borderRadius: BUTTON_RADIUS }}
                >
                  {t("common.remove")}
                </Button>
              )}
            </ScrollView>
            <ModalActions
              cancelLabel={t("common.cancel")}
              onCancel={() => setModalVisible(false)}
              confirmLabel={t("common.save")}
              onConfirm={saveItem}
            />
          </DialogProvider>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  itemCard: { marginBottom: 8 },
  itemHeader: { flexDirection: "row", alignItems: "center" },
  // No padding on the card: the scroll carries the sides and the top, and the ModalActions
  // footer (full width, outside the scroll) owns the space around the buttons.
  modalContent: { margin: 20, borderRadius: MODAL_RADIUS, maxHeight: "85%", overflow: "hidden" },
  modalScroll: { paddingHorizontal: MODAL_PADDING_H, paddingTop: MODAL_PADDING_TOP },
});
