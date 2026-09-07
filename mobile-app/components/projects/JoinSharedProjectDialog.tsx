import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, StyleSheet, ScrollView, FlatList } from "react-native";
import {
  Dialog,
  Button,
  RadioButton,
  Text,
  useTheme as usePaperTheme,
  Card,
  ActivityIndicator,
} from "react-native-paper";
import {
  listAvailableSharedProjects,
  joinCollaborativeProject,
  type SharedProjectOption,
} from "@/core/drive-sync/project-drive-service";
import { createProject, setProjectCollaborative } from "@/db/queries/projects";
import { upsertProjectMember } from "@/db/queries/project-members";
import { useAlertDialog } from "@/hooks/use-dialog";
import { useI18n } from "@/contexts/i18n-context";

interface JoinSharedProjectDialogProps {
  visible: boolean;
  onClose: () => void;
  userEmail: string;
  onJoined: (projectId: number) => void;
}

export function JoinSharedProjectDialog({
  visible,
  onClose,
  userEmail,
  onJoined,
}: JoinSharedProjectDialogProps) {
  const theme = usePaperTheme();
  const { t } = useI18n();
  const { alert } = useAlertDialog();

  const [options, setOptions] = useState<SharedProjectOption[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!visible) return;

    setSelectedFolderId(null);
    const loadOptions = async () => {
      setLoading(true);
      try {
        const results = await listAvailableSharedProjects();
        setOptions(results);
      } catch (error) {
        console.error("Error listing shared projects:", error);
        alert(t("common.error"), t("projectsList.joinSharedProjectError"));
      } finally {
        setLoading(false);
      }
    };

    loadOptions();
  }, [visible, alert, t]);

  const handleJoin = useCallback(async () => {
    if (!selectedFolderId) return;

    setJoining(true);
    try {
      const manifest = await joinCollaborativeProject(selectedFolderId, userEmail);
      const newId = await createProject(
        manifest.project_name,
        manifest.protocol_id,
        "",
        manifest.protocol_source,
      );
      if (!newId) throw new Error("Local project creation failed");

      await setProjectCollaborative(newId, selectedFolderId, manifest.auto_approve_default);
      for (const member of manifest.members) {
        await upsertProjectMember(newId, member.email, member.role, member.auto_approve);
      }

      onJoined(newId);
    } catch (error) {
      console.error("Error joining shared project:", error);
      alert(t("common.error"), t("projectsList.joinError"));
    } finally {
      setJoining(false);
    }
  }, [selectedFolderId, userEmail, onJoined, alert, t]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        dialog: {
          backgroundColor: theme.colors.surface,
        },
        content: {
          paddingHorizontal: 24,
          paddingVertical: 16,
        },
        loadingContainer: {
          justifyContent: "center",
          alignItems: "center",
          paddingVertical: 20,
        },
        projectCard: {
          marginVertical: 8,
          backgroundColor: theme.colors.surfaceVariant,
        },
        projectCardSelected: {
          borderColor: theme.colors.primary,
          borderWidth: 2,
        },
        emptyText: {
          textAlign: "center",
          marginVertical: 16,
          color: theme.colors.onSurfaceVariant,
        },
      }),
    [theme],
  );

  if (!visible) return null;

  return (
    <Dialog visible={visible} onDismiss={onClose} style={styles.dialog}>
      <Dialog.Title>{t("projectsList.joinSharedProjectTitle")}</Dialog.Title>

      <Dialog.ScrollArea style={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator animating size="large" />
          </View>
        ) : options.length === 0 ? (
          <Text style={styles.emptyText}>
            {t("projectsList.joinSharedProjectEmpty")}
          </Text>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <FlatList
              scrollEnabled={false}
              data={options}
              keyExtractor={(item) => item.driveFolderId}
              renderItem={({ item }) => (
                <Card
                  style={[
                    styles.projectCard,
                    selectedFolderId === item.driveFolderId && styles.projectCardSelected,
                  ]}
                  onPress={() => setSelectedFolderId(item.driveFolderId)}
                >
                  <Card.Content>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyMedium" style={{ fontWeight: "bold" }}>
                          {item.manifest.project_name}
                        </Text>
                      </View>
                      <RadioButton
                        value={item.driveFolderId}
                        status={selectedFolderId === item.driveFolderId ? "checked" : "unchecked"}
                        onPress={() => setSelectedFolderId(item.driveFolderId)}
                        color={theme.colors.primary}
                      />
                    </View>
                  </Card.Content>
                </Card>
              )}
            />
          </ScrollView>
        )}
      </Dialog.ScrollArea>

      <Dialog.Actions>
        <Button onPress={onClose}>{t("common.cancel")}</Button>
        <Button onPress={handleJoin} loading={joining} disabled={loading || joining || !selectedFolderId}>
          {t("common.confirm")}
        </Button>
      </Dialog.Actions>
    </Dialog>
  );
}
