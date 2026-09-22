import React, { useCallback, useState } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import { Text, Card, Button, ActivityIndicator, useTheme as usePaperTheme } from "react-native-paper";
import { useLocalSearchParams, useFocusEffect, Stack } from "expo-router";
import { useAlertDialog } from "@/hooks/use-dialog";
import { useI18n } from "@/contexts/i18n-context";
import { useBottomContentPadding } from "@/hooks/use-bottom-content-padding";
import { getRejectedPointsByProject } from "@/db/queries/points";
import { deletePointPermanently } from "@/core/points/delete-point-media";
import { BUTTON_RADIUS } from "@/constants/shape";
import type { Point } from "@/types/database";

export default function ProjectRejectedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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

  const renderItem = ({ item }: { item: Point }) => (
    <Card style={[styles.card, { backgroundColor: paperTheme.colors.surface }]} mode="elevated">
      <Card.Content>
        <Text variant="titleMedium" style={{ fontWeight: "bold" }}>
          {item.created_by ?? "?"}-{item.point_number}
        </Text>
        <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant, marginTop: 4 }}>
          {item.rejection_reason}
        </Text>
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
  deleteButton: { marginTop: 12 },
});
