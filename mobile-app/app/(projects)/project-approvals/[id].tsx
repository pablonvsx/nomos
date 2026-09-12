// src/app/project-approvals/[id].tsx
// Pending-points approval queue for a project's owner. Reads/writes the
// local SQLite directly - this is a single-owner model, so whoever opens
// this screen locally already is the project's owner (no more admin check
// against a Drive membership manifest). Approving a point that belongs to a
// Drive-collaborative project also pushes it to Drive via
// submitPointToProject, now used only by the owner (see
// core/drive-sync/point-submission-service.ts and docs/12_COLLABORATION.md).
import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, RefreshControl } from "react-native";
import {
  Text,
  Card,
  Button,
  ActivityIndicator,
  useTheme as usePaperTheme,
  Dialog,
  Portal,
  TextInput,
} from "react-native-paper";
import { useRouter, useLocalSearchParams, useFocusEffect, Stack } from "expo-router";
import { useAlertDialog } from "@/hooks/use-dialog";
import { useI18n } from "@/contexts/i18n-context";
import { useStableTextInput } from "@/hooks/use-stable-text-input";
import { useProtocolRegistry } from "@/contexts/protocol-registry-context";
import { getProjectById } from "@/db/queries/projects";
import { getPendingPointsByProject, updatePointApprovalStatus } from "@/db/queries/points";
import { submitPointToProject } from "@/core/drive-sync/point-submission-service";
import { parsePhotoUris } from "@/db/mappers/json-utils";
import type { Project, Point } from "@/types/database";

export default function ProjectApprovalsScreen() {
  const router = useRouter();
  const paperTheme = usePaperTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { alert } = useAlertDialog();
  const { t } = useI18n();
  const registry = useProtocolRegistry();

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingPoints, setPendingPoints] = useState<Point[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectDialogVisible, setRejectDialogVisible] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Point | null>(null);

  const reasonInput = useStableTextInput(`reject-${rejectDialogVisible}`, "");

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const projectData = await getProjectById(parseInt(id));
      if (!projectData) {
        alert(t("common.error"), t("projectView.projectNotFound"));
        router.back();
        return;
      }

      setProject(projectData);
      const pending = await getPendingPointsByProject(projectData.id);
      setPendingPoints(pending);
    } catch (error) {
      console.error("Error loading pending approvals:", error);
      alert(t("common.error"), t("projectApprovals.loadError"));
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [id, router, t]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleApprove = async (point: Point) => {
    if (!project) return;
    setProcessingId(point.id);
    try {
      await updatePointApprovalStatus(point.id, "approved");
      if (project.collaboration_role === "owner" && project.drive_folder_id) {
        await submitPointToProject(point.id, project.id, registry);
      }
      setPendingPoints((prev) => prev.filter((p) => p.id !== point.id));
    } catch (error) {
      console.error("Error approving point:", error);
      alert(t("common.error"), t("projectApprovals.approveError"));
    } finally {
      setProcessingId(null);
    }
  };

  const handleOpenReject = (point: Point) => {
    setRejectTarget(point);
    setRejectDialogVisible(true);
  };

  const handleConfirmReject = async (reason: string) => {
    if (!rejectTarget) return;
    if (!reason.trim()) {
      alert(t("common.error"), t("projectApprovals.rejectReasonRequired"));
      return;
    }
    setProcessingId(rejectTarget.id);
    try {
      await updatePointApprovalStatus(rejectTarget.id, "rejected", reason.trim());
      setPendingPoints((prev) => prev.filter((p) => p.id !== rejectTarget.id));
      setRejectDialogVisible(false);
      setRejectTarget(null);
    } catch (error) {
      console.error("Error rejecting point:", error);
      alert(t("common.error"), t("projectApprovals.rejectError"));
    } finally {
      setProcessingId(null);
    }
  };

  const renderItem = ({ item }: { item: Point }) => {
    const photos = parsePhotoUris(item.photos);
    const isProcessing = processingId === item.id;

    return (
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={{ fontWeight: "bold" }}>
            {item.generated_name || t("projectApprovals.pointLabel", { number: item.point_number })}
          </Text>
          <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
            {item.lat.toFixed(6)}, {item.lon.toFixed(6)}
          </Text>
          <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
            {t("projectApprovals.photoCount", { count: photos.length })}
          </Text>
          {item.created_by && (
            <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
              {t("projectApprovals.submittedBy", { collectorCode: item.created_by })}
            </Text>
          )}
        </Card.Content>
        <Card.Actions>
          <Button
            mode="contained"
            loading={isProcessing}
            disabled={processingId !== null}
            onPress={() => handleApprove(item)}
          >
            {t("projectApprovals.approve")}
          </Button>
          <Button
            mode="outlined"
            textColor={paperTheme.colors.error}
            disabled={processingId !== null}
            onPress={() => handleOpenReject(item)}
          >
            {t("projectApprovals.reject")}
          </Button>
        </Card.Actions>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: paperTheme.colors.background }]}>
        <Stack.Screen options={{ title: t("projectApprovals.title"), headerBackTitle: "" }} />
        <ActivityIndicator animating size="large" />
      </View>
    );
  }

  if (!project) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: paperTheme.colors.background }]}>
        <Stack.Screen options={{ title: t("projectApprovals.title"), headerBackTitle: "" }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: paperTheme.colors.background }]}>
      <Stack.Screen options={{ title: t("projectApprovals.title"), headerBackTitle: "" }} />

      <FlatList
        data={pendingPoints}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={{ color: paperTheme.colors.secondary }}>
              {t("projectApprovals.empty")}
            </Text>
          </View>
        }
      />

      <Portal>
        <Dialog
          visible={rejectDialogVisible}
          onDismiss={() => setRejectDialogVisible(false)}
        >
          <Dialog.Title>{t("projectApprovals.rejectDialogTitle")}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              key={reasonInput.resetKey}
              label={t("projectApprovals.rejectReasonLabel")}
              mode="outlined"
              multiline
              numberOfLines={3}
              {...reasonInput.inputProps}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRejectDialogVisible(false)}>{t("common.cancel")}</Button>
            <Button
              onPress={() => handleConfirmReject(reasonInput.value)}
              disabled={!reasonInput.value.trim() || processingId !== null}
            >
              {t("common.confirm")}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContent: { justifyContent: "center", alignItems: "center" },
  content: { flexGrow: 1, padding: 16 },
  card: { marginBottom: 16 },
  emptyState: { padding: 40, alignItems: "center" },
});
