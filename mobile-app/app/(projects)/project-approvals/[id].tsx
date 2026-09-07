// src/app/project-approvals/[id].tsx
// Pending-submission approval queue for a collaborative project's admin.
// Operates only on Google Drive - the admin's local SQLite is not touched
// here (that only happens in the sync phase).
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
import { useGoogleAccount } from "@/hooks/use-google-account";
import { useStableTextInput } from "@/hooks/use-stable-text-input";
import { getProjectById } from "@/db/queries/projects";
import { isProjectAdmin } from "@/core/drive-sync/project-drive-service";
import {
  listPendingSubmissions,
  approveSubmission,
  rejectSubmission,
  type PendingSubmission,
} from "@/core/drive-sync/approval-service";
import type { Project } from "@/types/database";

export default function ProjectApprovalsScreen() {
  const router = useRouter();
  const paperTheme = usePaperTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { alert } = useAlertDialog();
  const { t } = useI18n();
  const { account: googleAccount } = useGoogleAccount();

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submissions, setSubmissions] = useState<PendingSubmission[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectDialogVisible, setRejectDialogVisible] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<PendingSubmission | null>(null);

  const reasonInput = useStableTextInput(`reject-${rejectDialogVisible}`, "");

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const projectData = await getProjectById(parseInt(id));
      if (!projectData || !projectData.is_collaborative || !projectData.drive_folder_id) {
        alert(t("common.error"), t("projectApprovals.notAuthorized"));
        router.back();
        return;
      }

      if (!googleAccount) {
        alert(t("common.error"), t("projectApprovals.notAuthorized"));
        router.back();
        return;
      }

      const admin = await isProjectAdmin(projectData.drive_folder_id, googleAccount.email);
      if (!admin) {
        alert(t("common.error"), t("projectApprovals.notAuthorized"));
        router.back();
        return;
      }

      setProject(projectData);
      const pending = await listPendingSubmissions(projectData.drive_folder_id);
      setSubmissions(pending);
    } catch (error) {
      console.error("Error loading pending approvals:", error);
      alert(t("common.error"), t("projectApprovals.loadError"));
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [id, googleAccount, router, t]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleApprove = async (submission: PendingSubmission) => {
    if (!project?.drive_folder_id) return;
    setProcessingId(submission.pointUuid);
    try {
      await approveSubmission(project.drive_folder_id, submission);
      setSubmissions((prev) => prev.filter((s) => s.pointUuid !== submission.pointUuid));
    } catch (error) {
      console.error("Error approving submission:", error);
      alert(t("common.error"), t("projectApprovals.approveError"));
    } finally {
      setProcessingId(null);
    }
  };

  const handleOpenReject = (submission: PendingSubmission) => {
    setRejectTarget(submission);
    setRejectDialogVisible(true);
  };

  const handleConfirmReject = async (reason: string) => {
    if (!rejectTarget) return;
    if (!reason.trim()) {
      alert(t("common.error"), t("projectApprovals.rejectReasonRequired"));
      return;
    }
    setProcessingId(rejectTarget.pointUuid);
    try {
      await rejectSubmission(rejectTarget, reason.trim());
      setSubmissions((prev) => prev.filter((s) => s.pointUuid !== rejectTarget.pointUuid));
      setRejectDialogVisible(false);
      setRejectTarget(null);
    } catch (error) {
      console.error("Error rejecting submission:", error);
      alert(t("common.error"), t("projectApprovals.rejectError"));
    } finally {
      setProcessingId(null);
    }
  };

  const renderItem = ({ item }: { item: PendingSubmission }) => {
    const generatedName = item.content.generatedName as string | undefined;
    const pointNumber = item.content.pointNumber as number | undefined;
    const lat = item.content.lat as number | undefined;
    const lon = item.content.lon as number | undefined;
    const photos = item.content.photos as string[] | undefined;
    const isProcessing = processingId === item.pointUuid;

    return (
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={{ fontWeight: "bold" }}>
            {generatedName || t("projectApprovals.pointLabel", { number: pointNumber ?? "?" })}
          </Text>
          <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
            {lat?.toFixed(6)}, {lon?.toFixed(6)}
          </Text>
          <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
            {t("projectApprovals.photoCount", { count: photos?.length ?? 0 })}
          </Text>
          <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
            {t("projectApprovals.submittedBy", { email: item.submitterEmail })}
          </Text>
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
        data={submissions}
        keyExtractor={(item) => item.pointUuid}
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
