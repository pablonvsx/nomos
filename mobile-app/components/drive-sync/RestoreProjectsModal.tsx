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
import { isNetworkTimeoutError } from "@/core/net/network-timeout";
import { runThenCloseAndShow } from "@/core/ui/close-then-show";
import { waitForModalClose } from "@/core/ui/wait-for-modal-close";

interface RestorableProject {
  folder: DriveFile;
  projectName: string;
}

interface RestoreProjectsModalProps {
  visible: boolean;
  onDismiss: () => void;
  /** Called once the restore succeeded, AFTER this modal closed itself and its exit animation finished - so the caller can show its summary dialog without it stacking behind this modal. */
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
        setError(
          isNetworkTimeoutError(err)
            ? t("common.slowConnection")
            : err instanceof Error
              ? err.message
              : t("driveRestore.errorRestoring"),
        );
      } finally {
        setIsLoadingList(false);
      }
    })();
  }, [visible]);

  const handleRestore = async () => {
    if (!selected || isRestoring) return;
    setIsRestoring(true);
    setError(null);
    try {
      await runThenCloseAndShow({
        run: () => restoreOwnProjectFromDrive(selected.folder.id),
        // Success: close both the choice dialog and the modal, wait for them
        // to leave the screen, and only then let the caller show its summary
        // (otherwise it renders behind them - Paper stacks Portals in mount order).
        close: () => {
          setSelected(null);
          onDismiss();
        },
        wait: waitForModalClose,
        showOnSuccess: onRestored,
        // Failure: never close - the message below is the only place the
        // person sees why it failed (audit finding CRÍTICO 2). Unmapped errors
        // keep their technical detail instead of a generic sentence (audit
        // finding IMPORTANTE 2).
        onError: (err) => {
          console.error("Error restoring project from Drive:", err);
          const { key, technicalDetail } = describeRestoreError(err);
          setError(
            technicalDetail
              ? t("driveRestore.errorRestoringWithDetail", { detail: technicalDetail })
              : t(key),
          );
        },
      });
    } catch (err) {
      // The restore itself succeeded; the caller's dialog/navigation failed.
      console.error("Error after restoring project from Drive:", err);
    } finally {
      setIsRestoring(false);
    }
  };

  // Closing mid-restore would leave it running with nobody to show the result to.
  const handleDismiss = () => {
    if (!isRestoring) onDismiss();
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={handleDismiss}
        contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.header}>
          <Text variant="titleLarge" style={[styles.headerTitle, { color: theme.colors.onSurface }]}>
            {t("driveRestore.modalTitle")}
          </Text>
          <IconButton icon="close" onPress={handleDismiss} disabled={isRestoring} />
        </View>

        <View style={styles.content}>
          {isLoadingList ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator animating size="large" />
              <Text variant="bodyMedium" style={{ marginTop: 12, color: theme.colors.onSurfaceVariant }}>
                {t("driveRestore.loadingProjects")}
              </Text>
            </View>
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
          <Text variant="bodyMedium" style={{ textAlign: "justify" }}>
            {t("driveRestore.confirmRestore")}
          </Text>
          {isRestoring && (
            <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>
              {t("driveRestore.restoring")}
            </Text>
          )}
          {error && (
            <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 8 }}>
              {error}
            </Text>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button
            mode="outlined"
            onPress={() => setSelected(null)}
            disabled={isRestoring}
            style={{ borderRadius: BUTTON_RADIUS }}
          >
            {t("common.cancel")}
          </Button>
          <Button
            mode="contained"
            onPress={handleRestore}
            loading={isRestoring}
            disabled={isRestoring}
            style={{ borderRadius: BUTTON_RADIUS }}
          >
            {t("driveRestore.restoreButton")}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  loadingBlock: { alignItems: "center", marginTop: 24 },
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
