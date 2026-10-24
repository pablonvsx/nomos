import React, { useCallback, useState } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import { Text, Card, Button, ActivityIndicator, useTheme as usePaperTheme } from "react-native-paper";
import { useLocalSearchParams, useFocusEffect, useRouter, Stack } from "expo-router";
import { useAlertDialog } from "@/hooks/use-dialog";
import { useI18n } from "@/contexts/i18n-context";
import { useBottomContentPadding } from "@/hooks/use-bottom-content-padding";
import { getRejectedPointsByProject, returnPointToPending } from "@/db/queries/points";
import { deletePointPermanently } from "@/core/points/delete-point-media";
import { BUTTON_RADIUS } from "@/constants/shape";
import { useMapData } from "@/contexts/map-data-context";
import { getProjectById } from "@/db/queries/projects";
import { getProjectActionVisibility } from "@/core/project-sharing/action-visibility";
import type { Point } from "@/types/database";
import { getPointDisplayLabel } from "@/core/points/point-label";

export default function ProjectRejectedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { clearMapData } = useMapData();
  const paperTheme = usePaperTheme();
  const { t } = useI18n();
  const { alert, confirm } = useAlertDialog();
  const bottomPadding = useBottomContentPadding();

  const [points, setPoints] = useState<Point[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Owner-only area (section 10.0): never show it for a collaborator copy,
      // even if the route is reached directly.
      const project = await getProjectById(parseInt(id));
      if (!getProjectActionVisibility(project?.collaboration_role).rejectedPoints) {
        router.back();
        return;
      }
      const rows = await getRejectedPointsByProject(parseInt(id));
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

  const handleDelete = (point: Point) => {
    confirm(
      t("pointApproval.deletePermanently"),
      t("pointApproval.deletePermanentlyConfirm"),
      async () => {
        setBusyId(point.id);
        try {
          await deletePointPermanently(point);
          setPoints((prev) => prev.filter((p) => p.id !== point.id));
        } catch (error) {
          console.error("Error deleting rejected point:", error);
          alert(t("common.error"), t("pointApproval.errorDeleting"));
        } finally {
          setBusyId(null);
        }
      },
      () => {},
      t("common.delete"),
      t("common.cancel"),
      true,
    );
  };

  // A point rejected by mistake goes back to the approval queue (no confirmation: it can be rejected again).
  const handleReturnToQueue = async (point: Point) => {
    setBusyId(point.id);
    try {
      const ok = await returnPointToPending(point.id);
      if (!ok) throw new Error("returnPointToPending failed");
      setPoints((prev) => prev.filter((p) => p.id !== point.id));
      alert(t("common.success"), t("pointApproval.returnedToQueue"));
    } catch (error) {
      console.error("Error returning point to the approval queue:", error);
      alert(t("common.error"), t("pointApproval.errorReturning"));
    } finally {
      setBusyId(null);
    }
  };

  // Read-only details (no edit actions): see what was rejected and why.
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
          {getPointDisplayLabel(item)}
        </Text>
        <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant, marginTop: 4 }}>
          {item.rejection_reason}
        </Text>
        <Button
          mode="outlined"
          icon="eye-outline"
          onPress={() => openPointDetails(item)}
          disabled={busyId !== null}
          style={[styles.viewButton, { borderRadius: BUTTON_RADIUS }]}
        >
          {t("pointApproval.viewPointData")}
        </Button>
        <Button
          mode="outlined"
          icon="undo"
          onPress={() => handleReturnToQueue(item)}
          loading={busyId === item.id}
          disabled={busyId !== null}
          style={[styles.returnButton, { borderRadius: BUTTON_RADIUS }]}
        >
          {t("pointApproval.returnToQueue")}
        </Button>
        <Button
          mode="outlined"
          textColor={paperTheme.colors.error}
          onPress={() => handleDelete(item)}
          loading={busyId === item.id}
          disabled={busyId !== null}
          style={[styles.deleteButton, { borderRadius: BUTTON_RADIUS }]}
        >
          {t("pointApproval.deletePermanently")}
        </Button>
      </Card.Content>
    </Card>
  );

  return (
    <View style={[styles.container, { backgroundColor: paperTheme.colors.background, paddingBottom: bottomPadding }]}>
      <Stack.Screen options={{ title: t("pointApproval.rejectedPointsTitle"), headerBackTitle: "" }} />

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
              {t("pointApproval.noRejected")}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16 },
  card: { marginBottom: 8 },
  viewButton: { marginTop: 12 },
  returnButton: { marginTop: 8 },
  deleteButton: { marginTop: 8 },
});
