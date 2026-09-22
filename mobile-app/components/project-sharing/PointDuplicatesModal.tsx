import React, { useState } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { Button, Text, Divider, useTheme, IconButton, Portal, Modal } from "react-native-paper";
import {
  resolvePointDuplicate,
  type ImportPointsResult,
  type PendingDuplicate,
} from "@/core/project-sharing/import-points";
import { useI18n } from "@/contexts/i18n-context";
import { BUTTON_RADIUS } from "@/constants/shape";

interface PointDuplicatesModalProps {
  visible: boolean;
  result: ImportPointsResult;
  onDismiss: () => void;
}

export const PointDuplicatesModal: React.FC<PointDuplicatesModalProps> = ({
  visible,
  result,
  onDismiss,
}) => {
  const theme = useTheme();
  const { t } = useI18n();

  const [pending, setPending] = useState<PendingDuplicate[]>(result.duplicates);
  const [replaced, setReplaced] = useState(0);
  const [discarded, setDiscarded] = useState(0);
  const [busyUuid, setBusyUuid] = useState<string | null>(null);

  const resolve = async (duplicate: PendingDuplicate, action: "replace" | "discard") => {
    setBusyUuid(duplicate.incoming.point_uuid);
    try {
      await resolvePointDuplicate(duplicate, action);
      setPending((prev) => prev.filter((d) => d.incoming.point_uuid !== duplicate.incoming.point_uuid));
      if (action === "replace") setReplaced((n) => n + 1);
      else setDiscarded((n) => n + 1);
    } finally {
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
          {pending.length === 0 ? (
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant, textAlign: "justify" }}
            >
              {t("pointDuplicates.summary", {
                imported: result.imported.toString(),
                replaced: replaced.toString(),
                discarded: discarded.toString(),
              })}
            </Text>
          ) : (
            pending.map((duplicate) => (
              <View key={duplicate.incoming.point_uuid} style={styles.row}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                  {t("surveyView.point")} {duplicate.incoming.point_number}
                </Text>
                <View style={styles.buttonRow}>
                  <Button
                    mode="outlined"
                    onPress={() => resolve(duplicate, "discard")}
                    loading={busyUuid === duplicate.incoming.point_uuid}
                    disabled={busyUuid !== null}
                    style={[styles.buttonHalf, { borderRadius: BUTTON_RADIUS }]}
                  >
                    {t("pointDuplicates.discard")}
                  </Button>
                  <Button
                    mode="contained"
                    onPress={() => resolve(duplicate, "replace")}
                    loading={busyUuid === duplicate.incoming.point_uuid}
                    disabled={busyUuid !== null}
                    style={[styles.buttonHalf, { borderRadius: BUTTON_RADIUS }]}
                  >
                    {t("pointDuplicates.replace")}
                  </Button>
                </View>
                <Divider style={styles.rowDivider} />
              </View>
            ))
          )}
        </ScrollView>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modal: {
    marginHorizontal: 16,
    marginVertical: 32,
    borderRadius: 16,
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
    fontWeight: "600",
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
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  buttonHalf: {
    flex: 1,
  },
  rowDivider: {
    marginTop: 12,
  },
});
