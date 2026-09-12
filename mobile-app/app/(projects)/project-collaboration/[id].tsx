// src/app/project-collaboration/[id].tsx
// Consolidated hub for everything collaboration-related on a project: making
// it collaborative, member auto-approval settings (admin only), submitting/
// resubmitting local points, syncing approved points from Drive, and a link
// to the pending-approvals queue (admin only). Replaces the previous
// project-collab-settings screen plus the collaboration actions that used to
// be spread across project-details/[id].tsx's FAB.
import React, { useState, useCallback } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import {
  Text,
  Card,
  Chip,
  List,
  Switch,
  Button,
  TextInput,
  IconButton,
  SegmentedButtons,
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
import { useStableTextInput } from "@/hooks/use-stable-text-input";
import { SEGMENTED_BUTTONS_SHAPE_THEME } from "@/constants/shape";
import { getProjectById, setProjectCollaborative } from "@/db/queries/projects";
import { getPointsByProject } from "@/db/queries/points";
import { upsertProjectMember, removeProjectMember } from "@/db/queries/project-members";
import {
  createCollaborativeProjectStructure,
  getManifest,
  updateManifest,
  updateOwnCollectorCode,
  removeCollaborator,
  promoteToAdmin,
  inviteCollaboratorByEmail,
  type ProjectManifest,
} from "@/core/drive-sync/project-drive-service";
import { syncProjectFromDrive } from "@/core/drive-sync/project-sync-service";
import { submitPointToProject } from "@/core/drive-sync/point-submission-service";
import { getPointDisplayLabel } from "@/core/drive-sync/point-label";
import { exportProjectConfigPackage } from "@/core/project-sharing/project-config-package";
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
  const [manifest, setManifest] = useState<ProjectManifest | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMakingCollaborative, setIsMakingCollaborative] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [submittingPointId, setSubmittingPointId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDialogVisible, setSyncDialogVisible] = useState(false);
  const [collectorCodeDialogVisible, setCollectorCodeDialogVisible] = useState(false);
  const [isSavingCollectorCode, setIsSavingCollectorCode] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteResetKey, setInviteResetKey] = useState(0);
  const inviteEmailInput = useStableTextInput(`invite-${inviteResetKey}`, "");

  const ownMember = manifest?.members.find((m) => m.email === googleAccount?.email);
  const collectorCodeInput = useStableTextInput(
    `collector-code-${collectorCodeDialogVisible}`,
    ownMember?.collector_code ?? "",
  );

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

      if (projectData.is_collaborative && projectData.drive_folder_id && googleAccount) {
        try {
          const currentManifest = await getManifest(projectData.drive_folder_id);
          setManifest(currentManifest);
          setIsAdmin(
            currentManifest.members.some(
              (m) => m.email === googleAccount.email && m.role === "admin",
            ),
          );
        } catch (error) {
          console.error("Error loading manifest:", error);
          setManifest(null);
          setIsAdmin(false);
        }
      } else {
        setManifest(null);
        setIsAdmin(false);
      }
    } catch (error) {
      console.error("Error loading project collaboration data:", error);
      alert(t("common.error"), t("projectCollaboration.loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [id, googleAccount, router, t]);

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
          const { driveFolderId, manifest: newManifest } = await createCollaborativeProjectStructure({
            projectName: project.name,
            protocolId: project.protocol_id,
            protocolSource: project.protocol_source,
            creatorEmail: googleAccount.email,
            autoApproveDefault: Boolean(project.auto_approve_default),
          });
          await setProjectCollaborative(project.id, driveFolderId, Boolean(project.auto_approve_default));
          for (const member of newManifest.members) {
            await upsertProjectMember(project.id, member.email, member.role, member.auto_approve, member.collector_code);
          }
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

  const handleToggleAutoApproveDefault = async (value: boolean) => {
    if (!project?.drive_folder_id || !manifest || !isAdmin) return;
    const updated: ProjectManifest = { ...manifest, auto_approve_default: value };
    setSavingKey("project");
    try {
      await updateManifest(project.drive_folder_id, updated);
      await setProjectCollaborative(project.id, project.drive_folder_id, value);
      setManifest(updated);
    } catch (error) {
      console.error("Error updating auto-approve default:", error);
      alert(t("common.error"), t("projectCollaboration.saveError"));
    } finally {
      setSavingKey(null);
    }
  };

  const handleMemberAutoApproveChange = async (
    memberEmail: string,
    value: "herda_projeto" | "true" | "false",
  ) => {
    if (!project?.drive_folder_id || !manifest || !isAdmin) return;
    const updatedMembers = manifest.members.map((m) =>
      m.email === memberEmail ? { ...m, auto_approve: value } : m,
    );
    const updated: ProjectManifest = { ...manifest, members: updatedMembers };
    setSavingKey(memberEmail);
    try {
      await updateManifest(project.drive_folder_id, updated);
      const updatedMember = updatedMembers.find((m) => m.email === memberEmail)!;
      await upsertProjectMember(project.id, updatedMember.email, updatedMember.role, updatedMember.auto_approve, updatedMember.collector_code);
      setManifest(updated);
    } catch (error) {
      console.error("Error updating member auto-approve:", error);
      alert(t("common.error"), t("projectCollaboration.saveError"));
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveCollectorCode = async (newCode: string) => {
    if (!project?.drive_folder_id || !googleAccount) return;
    const trimmed = newCode.trim();
    if (trimmed.length < 2 || trimmed.length > 4) {
      alert(t("common.error"), t("projectCollaboration.collectorCodeLengthError"));
      return;
    }
    setIsSavingCollectorCode(true);
    try {
      const updated = await updateOwnCollectorCode(project.drive_folder_id, googleAccount.email, googleAccount.email, trimmed);
      setManifest(updated);
      const updatedOwnMember = updated.members.find((m) => m.email === googleAccount.email);
      if (updatedOwnMember) {
        await upsertProjectMember(
          project.id,
          updatedOwnMember.email,
          updatedOwnMember.role,
          updatedOwnMember.auto_approve,
          updatedOwnMember.collector_code,
        );
      }
      setCollectorCodeDialogVisible(false);
    } catch (error) {
      console.error("Error updating collector code:", error);
      alert(t("common.error"), t("projectCollaboration.collectorCodeError"));
    } finally {
      setIsSavingCollectorCode(false);
    }
  };

  const handleRemoveMember = (memberEmail: string) => {
    if (!project?.drive_folder_id || !manifest || !googleAccount) return;
    confirm(
      t("projectCollaboration.removeMemberTitle"),
      t("projectCollaboration.removeMemberConfirm", { email: memberEmail }),
      async () => {
        setSavingKey(memberEmail);
        try {
          await removeCollaborator(project.drive_folder_id!, memberEmail, googleAccount.email);
          await removeProjectMember(project.id, memberEmail);
          setManifest({
            ...manifest,
            members: manifest.members.filter((m) => m.email !== memberEmail),
          });
        } catch (error) {
          console.error("Error removing member:", error);
          alert(
            t("common.error"),
            error instanceof Error ? error.message : t("projectCollaboration.removeMemberError"),
          );
        } finally {
          setSavingKey(null);
        }
      },
      () => {},
      t("projectCollaboration.removeMemberButton"),
      t("common.cancel"),
      true,
    );
  };

  const handlePromoteToAdmin = (memberEmail: string) => {
    if (!project?.drive_folder_id || !manifest || !googleAccount) return;
    confirm(
      t("projectCollaboration.promoteTitle"),
      t("projectCollaboration.promoteConfirm", { email: memberEmail }),
      async () => {
        setSavingKey(memberEmail);
        try {
          const updated = await promoteToAdmin(project.drive_folder_id!, googleAccount.email, memberEmail);
          const promotedMember = updated.members.find((m) => m.email === memberEmail);
          if (promotedMember) {
            await upsertProjectMember(
              project.id,
              promotedMember.email,
              promotedMember.role,
              promotedMember.auto_approve,
              promotedMember.collector_code,
            );
          }
          setManifest(updated);
        } catch (error) {
          console.error("Error promoting member:", error);
          alert(
            t("common.error"),
            error instanceof Error ? error.message : t("projectCollaboration.promoteError"),
          );
        } finally {
          setSavingKey(null);
        }
      },
      () => {},
      t("projectCollaboration.promoteButton"),
      t("common.cancel"),
    );
  };

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const handleInviteCollaborator = async () => {
    const email = inviteEmailInput.value.trim();
    if (!project?.drive_folder_id || !manifest || !googleAccount || !isValidEmail(email)) return;
    setIsInviting(true);
    try {
      const updated = await inviteCollaboratorByEmail(project.drive_folder_id, googleAccount.email, email);
      const newMember = updated.members.find((m) => m.email === email);
      if (newMember) {
        await upsertProjectMember(
          project.id,
          newMember.email,
          newMember.role,
          newMember.auto_approve,
          newMember.collector_code,
        );
      }
      setManifest(updated);
      setInviteResetKey((k) => k + 1);
    } catch (error) {
      console.error("Error inviting collaborator:", error);
      alert(
        t("common.error"),
        error instanceof Error ? error.message : t("projectCollaboration.inviteError"),
      );
    } finally {
      setIsInviting(false);
    }
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
        result.status === "approved"
          ? t("surveyView.submitApprovedMessage")
          : t("surveyView.submitPendingMessage"),
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
              rejected: result.rejected,
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
              rejected: result.rejected,
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

  const autoApproveOptions = [
    { value: "herda_projeto", label: t("projectCollaboration.inherit") },
    { value: "true", label: t("projectCollaboration.alwaysApprove") },
    { value: "false", label: t("projectCollaboration.alwaysReview") },
  ];

  // "Meus pontos": só os do usuário atual (mesma noção de "próprio" usada em
  // submitPointToProject - created_by null cobre pontos locais ainda nunca
  // enviados). Pendências de outros membros já têm seu próprio lugar: a fila
  // de aprovação (admin only).
  const pointsNeedingAttention = points.filter(
    (p) =>
      p.approval_status !== "approved" &&
      (p.created_by === null || p.created_by === googleAccount?.email),
  );

  return (
    <View style={[styles.container, { backgroundColor: paperTheme.colors.background }]}>
      <Stack.Screen options={{ title: t("projectCollaboration.title"), headerBackTitle: "" }} />

      <ScrollView contentContainerStyle={styles.content}>
        {isAdmin && manifest && (
          <>
            <Text variant="titleMedium" style={[styles.sectionTitle, { color: paperTheme.colors.primary }]}>
              {t("projectCollaboration.membersTitle")}
            </Text>

            <Card style={styles.card}>
              <Card.Content>
                <Text variant="labelLarge" style={{ marginBottom: 8 }}>
                  {t("projectCollaboration.inviteMemberLabel")}
                </Text>
                <TextInput
                  key={inviteEmailInput.resetKey}
                  label={t("projectCollaboration.inviteEmailLabel")}
                  mode="outlined"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  {...inviteEmailInput.inputProps}
                />
                <Button
                  mode="contained"
                  style={{ marginTop: 12 }}
                  loading={isInviting}
                  disabled={isInviting || !isValidEmail(inviteEmailInput.value)}
                  onPress={handleInviteCollaborator}
                >
                  {t("projectCollaboration.inviteButton")}
                </Button>
              </Card.Content>
            </Card>

            <Card style={styles.card}>
              <List.Item
                title={t("projectCollaboration.autoApproveDefaultTitle")}
                description={t("projectCollaboration.autoApproveDefaultDescription")}
                descriptionNumberOfLines={4}
                right={() => (
                  <View style={styles.switchRow}>
                    {savingKey === "project" && (
                      <ActivityIndicator size="small" style={{ marginRight: 8 }} />
                    )}
                    <Switch
                      value={manifest.auto_approve_default}
                      onValueChange={handleToggleAutoApproveDefault}
                      disabled={savingKey === "project"}
                    />
                  </View>
                )}
              />
            </Card>

            <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary, marginBottom: 12 }}>
              {t("projectCollaboration.memberAutoApproveLegend")}
            </Text>

            {manifest.members.map((member) => {
              const isSaving = savingKey === member.email;
              return (
                <Card key={member.email} style={styles.card}>
                  <Card.Content>
                    <View style={styles.memberHeaderRow}>
                      <Text variant="bodyMedium" style={{ fontWeight: "bold", flex: 1 }} numberOfLines={1}>
                        {member.email}
                      </Text>
                      {member.collector_code ? (
                        <Chip compact>{member.collector_code}</Chip>
                      ) : null}
                      <Chip compact>
                        {member.role === "admin"
                          ? t("projectCollaboration.roleAdmin")
                          : t("projectCollaboration.roleCollaborator")}
                      </Chip>
                      {member.email === googleAccount?.email && (
                        <IconButton
                          icon="pencil"
                          size={16}
                          style={{ margin: 0 }}
                          onPress={() => setCollectorCodeDialogVisible(true)}
                        />
                      )}
                      {member.email !== googleAccount?.email && member.role === "collaborator" && (
                        <IconButton
                          icon="shield-account"
                          size={16}
                          style={{ margin: 0 }}
                          disabled={isSaving}
                          onPress={() => handlePromoteToAdmin(member.email)}
                        />
                      )}
                      {member.email !== googleAccount?.email && (
                        <IconButton
                          icon="account-remove"
                          size={16}
                          style={{ margin: 0 }}
                          iconColor={paperTheme.colors.error}
                          disabled={isSaving}
                          onPress={() => handleRemoveMember(member.email)}
                        />
                      )}
                    </View>
                    <View style={styles.segmentedRow}>
                      <SegmentedButtons
                        style={{ flex: 1 }}
                        value={member.auto_approve}
                        onValueChange={(value) =>
                          handleMemberAutoApproveChange(member.email, value as "herda_projeto" | "true" | "false")
                        }
                        density="small"
                        theme={SEGMENTED_BUTTONS_SHAPE_THEME}
                        buttons={autoApproveOptions.map((option) => ({
                          ...option,
                          disabled: isSaving,
                        }))}
                      />
                      {isSaving && <ActivityIndicator size="small" style={{ marginLeft: 8 }} />}
                    </View>
                  </Card.Content>
                </Card>
              );
            })}

            <Card style={styles.card}>
              <List.Item
                title={t("projectCollaboration.pendingApprovalsSectionTitle")}
                left={(props) => <List.Icon {...props} icon="clipboard-check-outline" />}
                right={(props) => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => router.push(`/project-approvals/${project.id}` as any)}
              />
            </Card>
          </>
        )}

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
            const pointDisplayLabel = getPointDisplayLabel(
              { pointNumber: point.point_number, createdBy: point.created_by ?? null },
              Boolean(project.is_collaborative),
              manifest?.members ?? [],
            );
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

      <Portal>
        <Dialog visible={collectorCodeDialogVisible} onDismiss={() => setCollectorCodeDialogVisible(false)}>
          <Dialog.Title>{t("projectCollaboration.collectorCodeDialogTitle")}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              key={collectorCodeInput.resetKey}
              label={t("projectCollaboration.collectorCodeLabel")}
              mode="outlined"
              autoCapitalize="characters"
              maxLength={4}
              {...collectorCodeInput.inputProps}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCollectorCodeDialogVisible(false)}>{t("common.cancel")}</Button>
            <Button
              loading={isSavingCollectorCode}
              disabled={isSavingCollectorCode}
              onPress={() => handleSaveCollectorCode(collectorCodeInput.value)}
            >
              {t("common.save")}
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
  content: { padding: 16 },
  card: { marginBottom: 16 },
  sectionTitle: { fontWeight: "bold", marginBottom: 4, marginTop: 8 },
  switchRow: { flexDirection: "row", alignItems: "center" },
  memberHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  segmentedRow: { flexDirection: "row", alignItems: "center" },
});
