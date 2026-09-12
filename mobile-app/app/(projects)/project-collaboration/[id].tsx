// src/app/project-collaboration/[id].tsx
// Hub for a project's Drive-backed backup/sync (single-owner model): making
// it collaborative (creating the Drive structure), submitting/resubmitting
// local points to the owner's own Drive, syncing approved points back down,
// exporting the project config package (Fase 0) and importing points
// received from a collector (Fase 2), plus a link to the pending-approvals
// queue. See docs/12_COLLABORATION.md.
import React, { useState, useCallback } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import {
  Text,
  Card,
  Chip,
  List,
  Button,
  ActivityIndicator,
  Dialog,
  Portal,
  useTheme as usePaperTheme,
} from "react-native-paper";
import { useRouter, useLocalSearchParams, useFocusEffect, Stack } from "expo-router";
import { useAlertDialog } from "@/hooks/use-dialog";
import { useI18n } from "@/contexts/i18n-context";
import { useGoogleAccount } from "@/hooks/use-google-account";
import { useProtocolRegistry } from "@/contexts/protocol-registry-context";
import { getProjectById, setProjectCollaborative } from "@/db/queries/projects";
import { getPointsByProject } from "@/db/queries/points";
import { createCollaborativeProjectStructure } from "@/core/drive-sync/project-drive-service";
import { syncProjectFromDrive } from "@/core/drive-sync/project-sync-service";
import { submitPointToProject } from "@/core/drive-sync/point-submission-service";
import { getPointDisplayLabel } from "@/core/drive-sync/point-label";
import { exportProjectConfigPackage } from "@/core/project-sharing/project-config-package";
import { importPointsPackage } from "@/core/project-sharing/import-points";
import type { Project, Point } from "@/types/database";

export default function ProjectCollaborationScreen() {
  const router = useRouter();
  const paperTheme = usePaperTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { alert, confirm } = useAlertDialog();
  const { t } = useI18n();
  const { account: googleAccount } = useGoogleAccount();
  const registry = useProtocolRegistry();

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [points, setPoints] = useState<Point[]>([]);
  const [isMakingCollaborative, setIsMakingCollaborative] = useState(false);
  const [submittingPointId, setSubmittingPointId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDialogVisible, setSyncDialogVisible] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const projectData = await getProjectById(parseInt(id));
      if (!projectData) {
        alert(t("common.error"), t("projectCollaboration.notFound"));
        router.back();
        return;
      }
      setProject(projectData);

      const projectPoints = await getPointsByProject(projectData.id);
      setPoints(projectPoints);
    } catch (error) {
      console.error("Error loading project collaboration data:", error);
      alert(t("common.error"), t("projectCollaboration.loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [id, router, t]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleMakeCollaborative = () => {
    if (!project || !googleAccount) return;

    confirm(
      t("projectView.makeCollaborative"),
      t("projectView.makeCollaborativeConfirm"),
      async () => {
        setIsMakingCollaborative(true);
        try {
          const { driveFolderId } = await createCollaborativeProjectStructure({
            projectName: project.name,
            protocolId: project.protocol_id,
            protocolSource: project.protocol_source,
          });
          await setProjectCollaborative(project.id, driveFolderId);
          await loadData();
          alert(t("common.success"), t("projectView.makeCollaborativeSuccess"));
        } catch (error) {
          console.error("Error making project collaborative:", error);
          alert(t("common.error"), t("projectView.makeCollaborativeError"));
        } finally {
          setIsMakingCollaborative(false);
        }
      },
      () => {},
    );
  };

  const handleSubmitPoint = async (point: Point) => {
    if (!project) return;
    setSubmittingPointId(point.id);
    try {
      const result = await submitPointToProject(point.id, project.id, registry);
      const refreshedPoints = await getPointsByProject(project.id);
      setPoints(refreshedPoints);
      alert(
        t("common.success"),
        result.status === "updated"
          ? t("surveyView.submitUpdatedMessage")
          : t("surveyView.submitApprovedMessage"),
      );
    } catch (error) {
      console.error("Error submitting point:", error);
      alert(t("common.error"), t("surveyView.submitError"));
    } finally {
      setSubmittingPointId(null);
    }
  };

  const handleConfirmSync = async (includeMedia: boolean) => {
    setSyncDialogVisible(false);
    if (!project) return;
    setIsSyncing(true);
    try {
      const result = await syncProjectFromDrive(project.id, { includeMedia }, registry);
      const refreshedPoints = await getPointsByProject(project.id);
      setPoints(refreshedPoints);
      alert(
        t("common.success"),
        includeMedia
          ? t("projectCollaboration.syncSummaryWithMedia", {
              imported: result.imported,
              updated: result.updated,
              skipped: result.skipped,
              media: result.mediaDownloaded,
              speciesPushed: result.speciesPushed,
              speciesPulled: result.speciesPulled,
              vegetationClassesPushed: result.vegetationClassesPushed,
              vegetationClassesPulled: result.vegetationClassesPulled,
            })
          : t("projectCollaboration.syncSummary", {
              imported: result.imported,
              updated: result.updated,
              skipped: result.skipped,
              speciesPushed: result.speciesPushed,
              speciesPulled: result.speciesPulled,
              vegetationClassesPushed: result.vegetationClassesPushed,
              vegetationClassesPulled: result.vegetationClassesPulled,
            }),
      );
    } catch (error) {
      console.error("Error syncing project:", error);
      alert(t("common.error"), t("projectCollaboration.syncError"));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportConfigPackage = async () => {
    if (!project) return;
    try {
      await exportProjectConfigPackage(project.id);
    } catch (error) {
      console.error("Error exporting project config package:", error);
      alert(t("common.error"), t("projectCollaboration.exportPackageError"));
    }
  };

  const handleImportPoints = async () => {
    if (!project) return;
    try {
      const result = await importPointsPackage(project.id, registry);
      if (result.imported === 0 && result.rejected.length === 0) return; // cancelado
      await loadData();
      const summary = result.rejected.length > 0
        ? t("projectCollaboration.importPointsSummaryWithRejected", {
            imported: result.imported,
            rejected: result.rejected.map((r) => `${r.pointLabel}: ${r.reason}`).join("\n"),
          })
        : t("projectCollaboration.importPointsSummary", { imported: result.imported });
      alert(t("projectCollaboration.importPointsTitle"), summary);
    } catch (error) {
      console.error("Error importing points package:", error);
      alert(
        t("common.error"),
        error instanceof Error ? error.message : t("projectCollaboration.importPointsError"),
      );
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: paperTheme.colors.background }]}>
        <Stack.Screen options={{ title: t("projectCollaboration.title"), headerBackTitle: "" }} />
        <ActivityIndicator animating size="large" />
      </View>
    );
  }

  if (!project) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: paperTheme.colors.background }]}>
        <Stack.Screen options={{ title: t("projectCollaboration.title"), headerBackTitle: "" }} />
      </View>
    );
  }

  if (!project.is_collaborative) {
    return (
      <View style={[styles.container, { backgroundColor: paperTheme.colors.background }]}>
        <Stack.Screen options={{ title: t("projectCollaboration.title"), headerBackTitle: "" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium">{t("projectCollaboration.notCollaborativeTitle")}</Text>
              <Text variant="bodyMedium" style={{ marginTop: 8 }}>
                {t("projectCollaboration.notCollaborativeDescription")}
              </Text>
              {!googleAccount && (
                <Text variant="bodySmall" style={{ color: paperTheme.colors.error, marginTop: 8 }}>
                  {t("projectCollaboration.connectAccountHint")}
                </Text>
              )}
              <Button
                mode="contained"
                style={{ marginTop: 16 }}
                loading={isMakingCollaborative}
                disabled={isMakingCollaborative || !googleAccount}
                onPress={handleMakeCollaborative}
              >
                {t("projectView.makeCollaborative")}
              </Button>
            </Card.Content>
          </Card>
        </ScrollView>
      </View>
    );
  }

  // "Meus pontos": só os do usuário atual (created_by null cobre pontos
  // locais ainda nunca enviados).
  const pointsNeedingAttention = points.filter(
    (p) => p.approval_status !== "approved" && p.created_by === null,
  );

  return (
    <View style={[styles.container, { backgroundColor: paperTheme.colors.background }]}>
      <Stack.Screen options={{ title: t("projectCollaboration.title"), headerBackTitle: "" }} />

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <List.Item
            title={t("projectCollaboration.pendingApprovalsSectionTitle")}
            left={(props) => <List.Icon {...props} icon="clipboard-check-outline" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => router.push(`/project-approvals/${project.id}` as any)}
          />
        </Card>

        <Text variant="titleMedium" style={[styles.sectionTitle, { color: paperTheme.colors.primary }]}>
          {t("projectCollaboration.myPointsTitle")}
        </Text>
        {pointsNeedingAttention.length === 0 ? (
          <Text variant="bodyMedium" style={{ color: paperTheme.colors.secondary, marginBottom: 16 }}>
            {t("projectCollaboration.myPointsEmpty")}
          </Text>
        ) : (
          pointsNeedingAttention.map((point) => {
            const isSubmitting = submittingPointId === point.id;
            const pointDisplayLabel = getPointDisplayLabel({
              pointNumber: point.point_number,
              createdBy: point.created_by ?? null,
            });
            return (
              <Card key={point.id} style={styles.card}>
                <Card.Content>
                  <Text variant="bodyMedium" style={{ fontWeight: "bold" }}>
                    {point.generated_name || t("surveyView.point") + " " + pointDisplayLabel}
                  </Text>
                  <Chip compact style={{ alignSelf: "flex-start", marginTop: 4 }}>
                    {t(`surveyView.status_${point.approval_status ?? "local"}`)}
                  </Chip>
                  {point.approval_status === "rejected" && point.rejection_reason && (
                    <Text variant="bodySmall" style={{ color: paperTheme.colors.error, marginTop: 4 }}>
                      {t("surveyView.rejectionReasonLabel")}: {point.rejection_reason}
                    </Text>
                  )}
                </Card.Content>
                <Card.Actions>
                  <Button
                    mode="contained"
                    loading={isSubmitting}
                    disabled={submittingPointId !== null}
                    onPress={() => handleSubmitPoint(point)}
                  >
                    {point.approval_status === "local" ? t("projectCollaboration.send") : t("projectCollaboration.resend")}
                  </Button>
                </Card.Actions>
              </Card>
            );
          })
        )}

        <Text variant="titleMedium" style={[styles.sectionTitle, { color: paperTheme.colors.primary }]}>
          {t("projectCollaboration.importPointsTitle")}
        </Text>
        <Card style={styles.card}>
          <Card.Content>
            <Button mode="contained" onPress={handleImportPoints}>
              {t("projectCollaboration.importPointsButton")}
            </Button>
          </Card.Content>
        </Card>

        <Text variant="titleMedium" style={[styles.sectionTitle, { color: paperTheme.colors.primary }]}>
          {t("projectCollaboration.syncSectionTitle")}
        </Text>
        <Card style={styles.card}>
          <Card.Content>
            <Button mode="contained" onPress={() => setSyncDialogVisible(true)}>
              {t("projectCollaboration.syncButton")}
            </Button>
          </Card.Content>
        </Card>

        <Text variant="titleMedium" style={[styles.sectionTitle, { color: paperTheme.colors.primary }]}>
          {t("projectCollaboration.exportPackageSectionTitle")}
        </Text>
        <Card style={styles.card}>
          <Card.Content>
            <Button mode="contained" onPress={handleExportConfigPackage}>
              {t("projectCollaboration.exportPackageButton")}
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>

      <Portal>
        <Dialog visible={syncDialogVisible} onDismiss={() => setSyncDialogVisible(false)}>
          <Dialog.Title>{t("projectCollaboration.syncSectionTitle")}</Dialog.Title>
          <Dialog.Content>
            <Text>{t("projectCollaboration.syncChooseOption")}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => handleConfirmSync(false)}>{t("projectCollaboration.syncDataOnly")}</Button>
            <Button onPress={() => handleConfirmSync(true)}>{t("projectCollaboration.syncDataAndMedia")}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Portal>
        <Dialog visible={isSyncing} dismissable={false}>
          <Dialog.Content style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator size="large" />
            <Text style={{ marginTop: 16 }}>{t("projectCollaboration.syncing")}</Text>
          </Dialog.Content>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContent: { justifyContent: "center", alignItems: "center" },
  content: { padding: 16 },
  card: { marginBottom: 16 },
  sectionTitle: { fontWeight: "bold", marginBottom: 4, marginTop: 8 },
});
