import { MODAL_TITLE_STYLE } from "@/constants/modal-title";
import { MODAL_RADIUS } from "@/constants/shape";
import React, { useRef, useState } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { Text, Divider, useTheme, IconButton, Portal, Modal } from "react-native-paper";
import {
  resolvePointDuplicate,
  type PendingDuplicate,
} from "@/core/project-sharing/import-points";
import {
  beginDecision,
  endDecision,
  type DuplicateAction,
} from "@/core/project-sharing/duplicates-session";
import { useI18n } from "@/contexts/i18n-context";
import { ModalActions } from "@/components/ui/ModalActions";

interface PointDuplicatesModalProps {
  visible: boolean;
  /** Duplicates still waiting for a decision. Owned by the caller: this modal never keeps its own copy. */
  duplicates: PendingDuplicate[];
  onDismiss: () => void;
  /**
   * Called after a duplicate is resolved. The caller removes it from `duplicates`,
   * refreshes what it shows and, when the list is empty, closes the modal and
   * shows the consolidated summary.
   */
  onResolved: (pointId: string, action: DuplicateAction) => void;
}

export const PointDuplicatesModal: React.FC<PointDuplicatesModalProps> = ({
  visible,
  duplicates,
  onDismiss,
  onResolved,
}) => {
  const theme = useTheme();
  const { t } = useI18n();

  const [busyUuid, setBusyUuid] = useState<string | null>(null);
  // Checked synchronously: a disabled button only takes effect after the
  // next render, so a quick second tap would otherwise resolve the point twice.
  const inFlight = useRef<Set<string>>(new Set());

  const resolve = async (duplicate: PendingDuplicate, action: DuplicateAction) => {
    const pointId = duplicate.incoming.point_uuid;
    if (!beginDecision(inFlight.current, pointId)) return;
    setBusyUuid(pointId);
    try {
      await resolvePointDuplicate(duplicate, action);
      onResolved(pointId, action);
    } catch (error) {
      // The item stays in the list so the person can try again.
      console.error("Error resolving duplicate point:", error);
    } finally {
      endDecision(inFlight.current, pointId);
      setBusyUuid(null);
    }
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.header}>
          <Text variant="titleLarge" style={[styles.headerTitle, { color: theme.colors.onSurface }]}>
            {t("pointDuplicates.title")}
          </Text>
          <IconButton icon="close" onPress={onDismiss} />
        </View>

        <Divider />

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {duplicates.map((duplicate) => (
            <View key={duplicate.incoming.point_uuid} style={styles.row}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                {t("surveyView.point")} {duplicate.incoming.point_number}
              </Text>
              <ModalActions
                cancelLabel={t("pointDuplicates.discard")}
                onCancel={() => resolve(duplicate, "discard")}
                cancelDisabled={busyUuid !== null}
                confirmLabel={t("pointDuplicates.replace")}
                onConfirm={() => resolve(duplicate, "replace")}
                confirmDisabled={busyUuid !== null}
                loading={busyUuid === duplicate.incoming.point_uuid}
                style={styles.buttonRow}
              />
              <Divider style={styles.rowDivider} />
            </View>
          ))}
        </ScrollView>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modal: {
    marginHorizontal: 16,
    marginVertical: 32,
    borderRadius: MODAL_RADIUS,
    maxHeight: "88%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 4,
  },
  headerTitle: {
    flex: 1,
    ...MODAL_TITLE_STYLE,
  },
  content: {
    maxHeight: "80%",
  },
  contentContainer: {
    padding: 16,
    paddingTop: 20,
  },
  row: {
    marginBottom: 12,
  },
  buttonRow: {
    marginTop: 8,
  },
  rowDivider: {
    marginTop: 12,
  },
});
