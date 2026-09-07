// src/app/project-collab-settings/[id].tsx
// Collaboration settings (auto-approval configuration) for a collaborative
// project's admin. Invite-by-email and role promotion are out of scope here
// (feature/project-invites).
import React, { useState, useCallback } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import {
  Text,
  Card,
  Chip,
  List,
  Switch,
  SegmentedButtons,
  ActivityIndicator,
  useTheme as usePaperTheme,
} from "react-native-paper";
import { useRouter, useLocalSearchParams, useFocusEffect, Stack } from "expo-router";
import { useAlertDialog } from "@/hooks/use-dialog";
import { useI18n } from "@/contexts/i18n-context";
import { useGoogleAccount } from "@/hooks/use-google-account";
import { SEGMENTED_BUTTONS_SHAPE_THEME } from "@/constants/shape";
import { getProjectById, setProjectCollaborative } from "@/db/queries/projects";
import { upsertProjectMember } from "@/db/queries/project-members";
import {
  getManifest,
  updateManifest,
  isProjectAdmin,
  type ProjectManifest,
} from "@/core/drive-sync/project-drive-service";
import type { Project } from "@/types/database";

export default function ProjectCollabSettingsScreen() {
  const router = useRouter();
  const paperTheme = usePaperTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { alert } = useAlertDialog();
  const { t } = useI18n();
  const { account: googleAccount } = useGoogleAccount();

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [manifest, setManifest] = useState<ProjectManifest | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const projectData = await getProjectById(parseInt(id));
      if (!projectData || !projectData.is_collaborative || !projectData.drive_folder_id) {
        alert(t("common.error"), t("projectCollabSettings.notAuthorized"));
        router.back();
        return;
      }

      if (!googleAccount) {
        alert(t("common.error"), t("projectCollabSettings.notAuthorized"));
        router.back();
        return;
      }

      const admin = await isProjectAdmin(projectData.drive_folder_id, googleAccount.email);
      if (!admin) {
        alert(t("common.error"), t("projectCollabSettings.notAuthorized"));
        router.back();
        return;
      }

      setProject(projectData);
      const currentManifest = await getManifest(projectData.drive_folder_id);
      setManifest(currentManifest);
    } catch (error) {
      console.error("Error loading collaboration settings:", error);
      alert(t("common.error"), t("projectCollabSettings.loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [id, googleAccount, router, t]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleToggleAutoApproveDefault = async (value: boolean) => {
    if (!project?.drive_folder_id || !manifest) return;
    const updated: ProjectManifest = { ...manifest, auto_approve_default: value };
    setSavingKey("project");
    try {
      await updateManifest(project.drive_folder_id, updated);
      await setProjectCollaborative(project.id, project.drive_folder_id, value);
      setManifest(updated);
    } catch (error) {
      console.error("Error updating auto-approve default:", error);
      alert(t("common.error"), t("projectCollabSettings.saveError"));
    } finally {
      setSavingKey(null);
    }
  };

  const handleMemberAutoApproveChange = async (
    memberEmail: string,
    value: "herda_projeto" | "true" | "false",
  ) => {
    if (!project?.drive_folder_id || !manifest) return;
    const updatedMembers = manifest.members.map((m) =>
      m.email === memberEmail ? { ...m, auto_approve: value } : m,
    );
    const updated: ProjectManifest = { ...manifest, members: updatedMembers };
    setSavingKey(memberEmail);
    try {
      await updateManifest(project.drive_folder_id, updated);
      const updatedMember = updatedMembers.find((m) => m.email === memberEmail)!;
      await upsertProjectMember(project.id, updatedMember.email, updatedMember.role, updatedMember.auto_approve);
      setManifest(updated);
    } catch (error) {
      console.error("Error updating member auto-approve:", error);
      alert(t("common.error"), t("projectCollabSettings.saveError"));
    } finally {
      setSavingKey(null);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: paperTheme.colors.background }]}>
        <Stack.Screen options={{ title: t("projectCollabSettings.title"), headerBackTitle: "" }} />
        <ActivityIndicator animating size="large" />
      </View>
    );
  }

  if (!project || !manifest) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: paperTheme.colors.background }]}>
        <Stack.Screen options={{ title: t("projectCollabSettings.title"), headerBackTitle: "" }} />
      </View>
    );
  }

  const autoApproveOptions = [
    { value: "herda_projeto", label: t("projectCollabSettings.inherit") },
    { value: "true", label: t("projectCollabSettings.alwaysApprove") },
    { value: "false", label: t("projectCollabSettings.alwaysReview") },
  ];

  return (
    <View style={[styles.container, { backgroundColor: paperTheme.colors.background }]}>
      <Stack.Screen options={{ title: t("projectCollabSettings.title"), headerBackTitle: "" }} />

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <List.Item
            title={t("projectCollabSettings.autoApproveDefaultTitle")}
            description={t("projectCollabSettings.autoApproveDefaultDescription")}
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

        <Text variant="titleMedium" style={[styles.sectionTitle, { color: paperTheme.colors.primary }]}>
          {t("projectCollabSettings.membersTitle")}
        </Text>
        <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary, marginBottom: 12 }}>
          {t("projectCollabSettings.memberAutoApproveLegend")}
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
                  <Chip compact>
                    {member.role === "admin"
                      ? t("projectCollabSettings.roleAdmin")
                      : t("projectCollabSettings.roleCollaborator")}
                  </Chip>
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContent: { justifyContent: "center", alignItems: "center" },
  content: { padding: 16 },
  card: { marginBottom: 16 },
  sectionTitle: { fontWeight: "bold", marginBottom: 4 },
  switchRow: { flexDirection: "row", alignItems: "center" },
  memberHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  segmentedRow: { flexDirection: "row", alignItems: "center" },
});
