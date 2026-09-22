import React, { useEffect, useState } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import {
  Text,
  Card,
  Button,
  ActivityIndicator,
  Dialog,
  Portal,
  Modal,
  IconButton,
  useTheme,
} from "react-native-paper";
import {
  getUsedDriveFolderIds,
  listOwnNomosProjectFolders,
  getManifest,
} from "@/core/drive-sync/project-drive-service";
import { restoreOwnProjectFromDrive, type RestoreResult } from "@/core/drive-sync/restore-service";
import { describeRestoreError } from "@/core/drive-sync/restore-error-messages";
import type { DriveFile } from "@/core/drive-sync/drive-api-client";
import { useI18n } from "@/contexts/i18n-context";
import { BUTTON_RADIUS } from "@/constants/shape";

interface RestorableProject {
  folder: DriveFile;
  projectName: string;
}

interface RestoreProjectsModalProps {
  visible: boolean;
  onDismiss: () => void;
  onRestored: (result: RestoreResult) => void;
}

export const RestoreProjectsModal: React.FC<RestoreProjectsModalProps> = ({
  visible,
  onDismiss,
  onRestored,
}) => {
  const theme = useTheme();
  const { t } = useI18n();

  const [isLoadingList, setIsLoadingList] = useState(false);
  const [projects, setProjects] = useState<RestorableProject[]>([]);
  const [selected, setSelected] = useState<RestorableProject | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setSelected(null);
    setIsLoadingList(true);

    (async () => {
      try {
        const [folders, usedIds] = await Promise.all([
          listOwnNomosProjectFolders(),
          getUsedDriveFolderIds(),
        ]);
        const remaining = folders.filter((f) => !usedIds.has(f.id));

        const withNames = await Promise.all(
          remaining.map(async (folder) => {
            try {
              const manifest = await getManifest(folder.id);
              return { folder, projectName: manifest.project_name };
            } catch {
              return { folder, projectName: folder.name };
            }
          }),
        );
        setProjects(withNames);
      } catch (err) {
        console.error("Error listing Drive project folders:", err);
        setError(err instanceof Error ? err.message : t("driveRestore.errorRestoring"));
      } finally {
        setIsLoadingList(false);
      }
    })();
  }, [visible]);

  const handleRestore = async (includeMedia: boolean) => {
    if (!selected) return;
    setIsRestoring(true);
    setError(null);
    try {
      const result = await restoreOwnProjectFromDrive(selected.folder.id, { includeMedia });
      onRestored(result);
    } catch (err) {
      console.error("Error restoring project from Drive:", err);
      // Never dismiss the choice dialog on failure - it's the only place
      // this message is shown, and the person needs to actually see it
      // (audit finding CRÍTICO 2). Unmapped errors keep their technical
      // detail instead of being replaced by a generic sentence (audit
      // finding IMPORTANTE 2).
      const { key, technicalDetail } = describeRestoreError(err);
      setError(
        technicalDetail
          ? t("driveRestore.errorRestoringWithDetail", { detail: technicalDetail })
          : t(key),
      );
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.header}>
          <Text variant="titleLarge" style={[styles.headerTitle, { color: theme.colors.onSurface }]}>
            {t("driveRestore.modalTitle")}
          </Text>
          <IconButton icon="close" onPress={onDismiss} />
        </View>

        <View style={styles.content}>
          {isLoadingList ? (
            <ActivityIndicator animating size="large" style={{ marginTop: 24 }} />
          ) : error && projects.length === 0 ? (
            <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
              {error}
            </Text>
          ) : projects.length === 0 ? (
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}
            >
              {t("driveRestore.noProjectsFound")}
            </Text>
          ) : (
            <FlatList
              data={projects}
              keyExtractor={(item) => item.folder.id}
              renderItem={({ item }) => (
                <Card
                  style={styles.projectCard}
                  mode="elevated"
                  onPress={() => setSelected(item)}
                >
                  <Card.Content>
                    <Text variant="titleMedium">{item.projectName}</Text>
                  </Card.Content>
                </Card>
              )}
            />
          )}
        </View>
      </Modal>

      <Dialog visible={selected !== null} onDismiss={() => (isRestoring ? null : setSelected(null))}>
        <Dialog.Title>{selected?.projectName}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">{t("driveRestore.chooseRestoreMode")}</Text>
          {error && (
            <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 8 }}>
              {error}
            </Text>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button
            mode="outlined"
            onPress={() => handleRestore(false)}
            loading={isRestoring}
            disabled={isRestoring}
            style={{ borderRadius: BUTTON_RADIUS }}
          >
            {t("driveRestore.dataOnly")}
          </Button>
          <Button
            mode="contained"
            onPress={() => handleRestore(true)}
            loading={isRestoring}
            disabled={isRestoring}
            style={{ borderRadius: BUTTON_RADIUS }}
          >
            {t("driveRestore.dataAndMedia")}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modal: {
    marginHorizontal: 16,
    marginVertical: 32,
    borderRadius: 16,
    maxHeight: "88%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 4,
  },
  headerTitle: {
    flex: 1,
    fontWeight: "600",
  },
  content: {
    padding: 16,
    paddingTop: 8,
    minHeight: 120,
  },
  projectCard: {
    marginBottom: 8,
  },
});
