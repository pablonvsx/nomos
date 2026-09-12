// src/app/project-collaboration/[id].tsx
// Hub for a project's Drive-backed backup (single-owner model): making it
// collaborative (creating the Drive structure), submitting/resubmitting
// local points to the owner's own Drive, backing up every approved point
// that hasn't been synced yet (COLLAB_MODEL_V2_REFERENCE.md section 8 -
// replaces the old pull-based "Sincronizar Projeto"), exporting the project
// config package (Fase 0) and importing points received from a collector
// (Fase 2), plus links to the pending-approvals and rejected-points queues.
// See docs/12_COLLABORATION.md.
import React, { useState, useCallback, useEffect } from "react";
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
import { submitPointToProject } from "@/core/drive-sync/point-submission-service";
import { backupAllPendingPoints } from "@/core/drive-sync/backup-service";
import { getPointDisplayLabel } from "@/core/drive-sync/point-label";
import { exportProjectConfigPackage } from "@/core/project-sharing/project-config-package";
import { importPointsPackage, type PendingDuplicate } from "@/core/project-sharing/import-points";
import { resolvePointDuplicate } from "@/core/project-sharing/resolve-duplicates";
import type { Project, Point } from "@/types/database";

// State for the multi-step "resolve each duplicate, then show one
// consolidated summary" flow (COLLAB_MODEL_V2_REFERENCE.md section 5) -
// `base` holds the imported/rejected counts already known right after
// importPointsPackage returns, `pending` shrinks as the owner resolves each
// duplicate, and `replaced`/`discarded` accumulate for the final summary.
interface DuplicateResolutionState {
  base: { imported: number; rejected: Array<{ pointLabel: string; reason: string }> };
  pending: PendingDuplicate[];
  replaced: number;
  discarded: number;
}

export default function ProjectCollaborationScreen() {
  const router = useRouter();
  const paperTheme = usePaperTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { alert, confirm } = useAlertDialog();
  const { t } = useI18n();
  const { account: googleAccount, connect: connectGoogleAccount } = useGoogleAccount();
  const registry = useProtocolRegistry();

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [points, setPoints] = useState<Point[]>([]);
  const [isMakingCollaborative, setIsMakingCollaborative] = useState(false);
  const [submittingPointId, setSubmittingPointId] = useState<string | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [duplicateResolution, setDuplicateResolution] = useState<DuplicateResolutionState | null>(null);
  const [resolvingDuplicateId, setResolvingDuplicateId] = useState<string | null>(null);

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
    if (!project) return;

    // Google account required only for this owner-specific action (section
    // 10) - never gate the screen itself. If not connected, the button stays
    // tappable and prompts to connect instead of silently doing nothing or
    // being disabled. "Fazer backup" (section 8) and "Restaurar meus
    // projetos do Drive" (section 9), once implemented (Fase F), must follow
    // this same tap-to-prompt pattern rather than a whole-screen gate.
    if (!googleAccount) {
      confirm(
        t("projectView.makeCollaborative"),
        t("projectCollaboration.connectAccountHint"),
        () => connectGoogleAccount(),
        () => {},
        t("settings.googleAccountConnect"),
      );
      return;
    }

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

  const handleBackup = () => {
    if (!project) return;

    // Same tap-to-prompt pattern as "Tornar Projeto Colaborativo" (section
    // 10): the button stays visible and tappable without a Google account,
    // prompting to connect instead of being hidden/disabled.
    if (!googleAccount) {
      confirm(
        t("projectCollaboration.backupButton"),
        t("projectCollaboration.connectAccountHint"),
        () => connectGoogleAccount(),
        () => {},
        t("settings.googleAccountConnect"),
      );
      return;
    }

    runBackup();
  };

  const runBackup = async () => {
    if (!project) return;
    setIsBackingUp(true);
    try {
      const result = await backupAllPendingPoints(project.id, registry);
      const refreshedPoints = await getPointsByProject(project.id);
      setPoints(refreshedPoints);
      const summary = result.failed.length > 0
        ? t("projectCollaboration.backupSummaryWithFailed", {
            backedUp: result.backedUp,
            failed: result.failed.map((f) => `${f.pointLabel}: ${f.reason}`).join("\n"),
          })
        : t("projectCollaboration.backupSummary", { backedUp: result.backedUp });
      alert(t("projectCollaboration.backupButton"), summary);
    } catch (error) {
      console.error("Error backing up project points:", error);
      alert(t("common.error"), t("projectCollaboration.backupError"));
    } finally {
      setIsBackingUp(false);
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
      if (result.imported === 0 && result.rejected.length === 0 && result.duplicates.length === 0) {
        return; // cancelado
      }
      await loadData();

      if (result.duplicates.length > 0) {
        // Defer the summary alert until every duplicate has been resolved -
        // see the useEffect below.
        setDuplicateResolution({
          base: { imported: result.imported, rejected: result.rejected },
          pending: result.duplicates,
          replaced: 0,
          discarded: 0,
        });
        return;
      }

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

  const handleResolveDuplicate = async (duplicate: PendingDuplicate, action: "replace" | "discard") => {
    if (!project || !duplicateResolution) return;
    setResolvingDuplicateId(duplicate.pointId);
    try {
      await resolvePointDuplicate(duplicate, action, project, registry);
      setDuplicateResolution((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pending: prev.pending.filter((d) => d.pointId !== duplicate.pointId),
          replaced: prev.replaced + (action === "replace" ? 1 : 0),
          discarded: prev.discarded + (action === "discard" ? 1 : 0),
        };
      });
    } catch (error) {
      console.error("Error resolving duplicate point:", error);
      alert(t("common.error"), t("projectCollaboration.resolveDuplicateError"));
    } finally {
      setResolvingDuplicateId(null);
    }
  };

  // Fires the consolidated summary (and reloads the point list) once every
  // duplicate from the last import has been resolved.
  useEffect(() => {
    if (!duplicateResolution || duplicateResolution.pending.length > 0) return;

    const { base, replaced, discarded } = duplicateResolution;
    setDuplicateResolution(null);
    loadData();

    const parts = [
      t("projectCollaboration.duplicatesResolvedSummary", {
        imported: base.imported,
        replaced,
        discarded,
      }),
    ];
    if (base.rejected.length > 0) {
      parts.push(
        `${t("projectCollaboration.rejectedListLabel")}\n${base.rejected
          .map((r) => `${r.pointLabel}: ${r.reason}`)
          .join("\n")}`,
      );
    }
    alert(t("projectCollaboration.importPointsTitle"), parts.join("\n\n"));
    // alert/loadData/t are stable enough for this one-shot "just finished
    // resolving" effect; only duplicateResolution's pending-list transition
    // to empty should re-trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duplicateResolution]);

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

  if (project.collaboration_role !== "owner") {
    const isCollaboratorCopy = project.collaboration_role === "collaborator";
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
              {isCollaboratorCopy ? (
                <Text variant="bodySmall" style={{ marginTop: 8 }}>
                  {t("projectCollaboration.collaboratorCopyNotice")}
                </Text>
              ) : (
                <>
                  <Button
                    mode="contained"
                    style={{ marginTop: 16 }}
                    loading={isMakingCollaborative}
                    disabled={isMakingCollaborative}
                    onPress={handleMakeCollaborative}
                  >
                    {t("projectView.makeCollaborative")}
                  </Button>
                </>
              )}
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
          <List.Item
            title={t("projectCollaboration.rejectedPointsSectionTitle")}
            left={(props) => <List.Icon {...props} icon="close-circle-outline" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => router.push(`/project-rejected/${project.id}` as any)}
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
          {t("projectCollaboration.backupSectionTitle")}
        </Text>
        <Card style={styles.card}>
          <Card.Content>
            <Button mode="contained" loading={isBackingUp} disabled={isBackingUp} onPress={handleBackup}>
              {t("projectCollaboration.backupButton")}
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
        <Dialog visible={isBackingUp} dismissable={false}>
          <Dialog.Content style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator size="large" />
            <Text style={{ marginTop: 16 }}>{t("projectCollaboration.backingUp")}</Text>
          </Dialog.Content>
        </Dialog>
      </Portal>

      <Portal>
        <Dialog visible={!!duplicateResolution} dismissable={false}>
          <Dialog.Title>{t("projectCollaboration.duplicatesFoundTitle")}</Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 320 }}>
            <ScrollView>
              <Dialog.Content>
                <Text variant="bodyMedium" style={{ marginBottom: 12 }}>
                  {t("projectCollaboration.duplicatesFoundDescription")}
                </Text>
                {duplicateResolution?.pending.map((duplicate) => {
                  const isResolving = resolvingDuplicateId === duplicate.pointId;
                  return (
                    <View
                      key={duplicate.pointId}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingVertical: 8,
                      }}
                    >
                      <Text variant="bodyMedium" style={{ flex: 1 }}>
                        {duplicate.pointLabel}
                      </Text>
                      <Button
                        mode="outlined"
                        compact
                        loading={isResolving}
                        disabled={resolvingDuplicateId !== null}
                        onPress={() => handleResolveDuplicate(duplicate, "discard")}
                      >
                        {t("projectCollaboration.duplicateDiscard")}
                      </Button>
                      <Button
                        mode="contained"
                        compact
                        style={{ marginLeft: 8 }}
                        loading={isResolving}
                        disabled={resolvingDuplicateId !== null}
                        onPress={() => handleResolveDuplicate(duplicate, "replace")}
                      >
                        {t("projectCollaboration.duplicateReplace")}
                      </Button>
                    </View>
                  );
                })}
              </Dialog.Content>
            </ScrollView>
          </Dialog.ScrollArea>
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
