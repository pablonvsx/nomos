import React, { useCallback, useState } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import {
  Text,
  Card,
  Button,
  ActivityIndicator,
  useTheme as usePaperTheme,
} from "react-native-paper";
import { useLocalSearchParams, useFocusEffect, useRouter, Stack } from "expo-router";
import { useAlertDialog } from "@/hooks/use-dialog";
import { useI18n } from "@/contexts/i18n-context";
import { useBottomContentPadding } from "@/hooks/use-bottom-content-padding";
import { getPendingPointsByProject, updatePointApprovalStatus } from "@/db/queries/points";
import { BUTTON_RADIUS } from "@/constants/shape";
import { useMapData } from "@/contexts/map-data-context";
import { getProjectById } from "@/db/queries/projects";
import { getProjectActionVisibility } from "@/core/project-sharing/action-visibility";
import type { Point } from "@/types/database";
import { RejectPointDialog } from "@/components/project-sharing/RejectPointDialog";
import { closeModalThenShow } from "@/core/ui/close-then-show";
import { waitForModalClose } from "@/core/ui/wait-for-modal-close";

export default function ProjectPendingApprovalsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { clearMapData } = useMapData();
  const paperTheme = usePaperTheme();
  const { t } = useI18n();
  const { alert } = useAlertDialog();
  const bottomPadding = useBottomContentPadding();

  const [points, setPoints] = useState<Point[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rejectingPoint, setRejectingPoint] = useState<Point | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Owner-only area (section 10.0): never show it for a collaborator copy,
      // even if the route is reached directly.
      const project = await getProjectById(parseInt(id));
      if (!getProjectActionVisibility(project?.collaboration_role).pendingApprovals) {
        router.back();
        return;
      }
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
      // updatePoint swallows DB errors and returns false: treat that as a failure too.
      if (!(await updatePointApprovalStatus(point.id, "approved"))) throw new Error("Could not save the approval.");
      // Approval changes what the general list/map shows - drop the cached map data.
      clearMapData(parseInt(id));
      setPoints((prev) => prev.filter((p) => p.id !== point.id));
    } catch (error) {
      console.error("Error approving point:", error);
      alert(t("common.error"), t("pointApproval.errorApproving"));
    } finally {
      setBusyId(null);
    }
  };

  const openRejectDialog = (point: Point) => {
    setRejectingPoint(point);
  };

  const confirmReject = async (reason: string) => {
    if (!rejectingPoint) return;
    const point = rejectingPoint;
    setBusyId(point.id);
    try {
      if (!(await updatePointApprovalStatus(point.id, "rejected", reason))) throw new Error("Could not save the rejection.");
      clearMapData(parseInt(id));
      setPoints((prev) => prev.filter((p) => p.id !== point.id));
      setRejectingPoint(null);
    } catch (error) {
      console.error("Error rejecting point:", error);
      // The reject dialog has its own Portal: close it and let it leave the
      // screen first, or this alert would render behind it.
      await closeModalThenShow({
        close: () => setRejectingPoint(null),
        wait: waitForModalClose,
        show: () => alert(t("common.error"), t("pointApproval.errorRejecting")),
      });
    } finally {
      setBusyId(null);
    }
  };

  // Review the full point (read-only) before deciding, instead of approving blind.
  const openPointDetails = (point: Point) => {
    router.push(`/survey-point-details/${point.id}?projectId=${id}` as any);
  };

  const renderItem = ({ item }: { item: Point }) => (
    <Card
      style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}
      mode="elevated"
      onPress={() => openPointDetails(item)}
    >
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

      <RejectPointDialog
        visible={rejectingPoint !== null}
        busy={busyId !== null}
        onCancel={() => setRejectingPoint(null)}
        onConfirm={confirmReject}
      />
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
