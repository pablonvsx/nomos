import React, { useCallback, useState } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import {
  Text,
  Card,
  Button,
  ActivityIndicator,
  useTheme as usePaperTheme,
  Portal,
  Dialog,
  TextInput,
} from "react-native-paper";
import { useLocalSearchParams, useFocusEffect, Stack } from "expo-router";
import { useAlertDialog } from "@/hooks/use-dialog";
import { useI18n } from "@/contexts/i18n-context";
import { useBottomContentPadding } from "@/hooks/use-bottom-content-padding";
import { getPendingPointsByProject, updatePointApprovalStatus } from "@/db/queries/points";
import { BUTTON_RADIUS } from "@/constants/shape";
import type { Point } from "@/types/database";

export default function ProjectPendingApprovalsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const paperTheme = usePaperTheme();
  const { t } = useI18n();
  const { alert } = useAlertDialog();
  const bottomPadding = useBottomContentPadding();

  const [points, setPoints] = useState<Point[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rejectingPoint, setRejectingPoint] = useState<Point | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await getPendingPointsByProject(parseInt(id));
      setPoints(rows);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleApprove = async (point: Point) => {
    setBusyId(point.id);
    try {
      await updatePointApprovalStatus(point.id, "approved");
      setPoints((prev) => prev.filter((p) => p.id !== point.id));
    } catch (error) {
      console.error("Error approving point:", error);
      alert(t("common.error"), t("pointApproval.errorApproving"));
    } finally {
      setBusyId(null);
    }
  };

  const openRejectDialog = (point: Point) => {
    setRejectionReason("");
    setRejectingPoint(point);
  };

  const confirmReject = async () => {
    if (!rejectingPoint || !rejectionReason.trim()) return;
    setBusyId(rejectingPoint.id);
    try {
      await updatePointApprovalStatus(rejectingPoint.id, "rejected", rejectionReason.trim());
      setPoints((prev) => prev.filter((p) => p.id !== rejectingPoint.id));
      setRejectingPoint(null);
    } catch (error) {
      console.error("Error rejecting point:", error);
      alert(t("common.error"), t("pointApproval.errorRejecting"));
    } finally {
      setBusyId(null);
    }
  };

  const renderItem = ({ item }: { item: Point }) => (
    <Card style={[styles.card, { backgroundColor: paperTheme.colors.surface }]} mode="elevated">
      <Card.Content>
        <Text variant="titleMedium" style={{ fontWeight: "bold" }}>
          {item.created_by ?? "?"}-{item.point_number}
        </Text>
        <View style={styles.buttonRow}>
          <Button
            mode="outlined"
            onPress={() => openRejectDialog(item)}
            loading={busyId === item.id}
            disabled={busyId !== null}
            style={[styles.buttonHalf, { borderRadius: BUTTON_RADIUS }]}
          >
            {t("pointApproval.reject")}
          </Button>
          <Button
            mode="contained"
            onPress={() => handleApprove(item)}
            loading={busyId === item.id}
            disabled={busyId !== null}
            style={[styles.buttonHalf, { borderRadius: BUTTON_RADIUS }]}
          >
            {t("pointApproval.approve")}
          </Button>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <View style={[styles.container, { backgroundColor: paperTheme.colors.background, paddingBottom: bottomPadding }]}>
      <Stack.Screen options={{ title: t("pointApproval.pendingApprovalsTitle"), headerBackTitle: "" }} />

      {isLoading ? (
        <ActivityIndicator animating size="large" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={points}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text
              variant="bodyMedium"
              style={{ color: paperTheme.colors.onSurfaceVariant, textAlign: "center", marginTop: 40 }}
            >
              {t("pointApproval.noPending")}
            </Text>
          }
        />
      )}

      <Portal>
        <Dialog visible={rejectingPoint !== null} onDismiss={() => setRejectingPoint(null)}>
          <Dialog.Title>{t("pointApproval.reject")}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              label={t("pointApproval.rejectionReasonLabel")}
              placeholder={t("pointApproval.rejectionReasonPlaceholder")}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline
              numberOfLines={3}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRejectingPoint(null)}>{t("common.cancel")}</Button>
            <Button onPress={confirmReject} disabled={!rejectionReason.trim()}>
              {t("pointApproval.reject")}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16 },
  card: { marginBottom: 8 },
  buttonRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  buttonHalf: { flex: 1 },
});
