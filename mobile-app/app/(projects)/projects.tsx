import React, { useState, useCallback, useEffect } from "react";
import { View, FlatList, ScrollView, StyleSheet } from "react-native";
import {
  FAB,
  Card,
  Text,
  Button,
  Chip,
  ActivityIndicator,
  SegmentedButtons,
  IconButton,
  Dialog,
  Portal,
  useTheme as usePaperTheme,
} from "react-native-paper";
import { useRouter, useFocusEffect, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { useAlertDialog } from "@/hooks/use-dialog";
import { useI18n } from "@/contexts/i18n-context";
import { BUTTON_RADIUS, SEGMENTED_BUTTONS_SHAPE_THEME } from "@/constants/shape";
import { useGoogleAccount } from "@/hooks/use-google-account";
import {
  listAllDriveProjects,
  joinAndCreateLocalProject,
  type SharedProjectOption,
} from "@/core/drive-sync/project-drive-service";
import { syncProjectFromDrive } from "@/core/drive-sync/project-sync-service";
import { importProjectConfigPackage } from "@/core/project-sharing/project-config-package";

// Internal imports: Database queries and Types
import { getAllProjects, getUsedDriveFolderIds } from "@/db/queries/projects";
import { getUnsyncedPointCount } from "@/db/queries/points";
import {
  getAllCustomProtocols,
  getCustomProtocolById,
  deleteCustomProtocol,
  getProtocolUsageCount,
  createCustomProtocol,
} from "@/db/queries/custom-protocols";
import { Project, CustomProtocol } from "@/types/database";
import { useProtocolRegistry, resolveManifestId } from "@/contexts/protocol-registry-context";

export default function ProjectsScreen() {
  const router = useRouter();
  const paperTheme = usePaperTheme();
  const insets = useSafeAreaInsets();
  const { alert, confirm } = useAlertDialog();
  const { t, currentLanguage } = useI18n();
  const registry = useProtocolRegistry();
  const lang = (currentLanguage as string) ?? "pt";
  const { account: googleAccount, connect, isConnecting } = useGoogleAccount();

  // State Management
  const [activeTab, setActiveTab] = useState<"projects" | "protocols">(
    "projects",
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [customProtocols, setCustomProtocols] = useState<CustomProtocol[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [projectFabOpen, setProjectFabOpen] = useState(false);
  const [protocolFabOpen, setProtocolFabOpen] = useState(false);
  const [protocolNames, setProtocolNames] = useState<Record<string, string>>(
    {},
  );
  const [protocolThemes, setProtocolThemes] = useState<Record<string, string>>(
    {},
  );
  const [unsyncedCounts, setUnsyncedCounts] = useState<Record<number, number>>({});
  const [driveDialogVisible, setDriveDialogVisible] = useState(false);
  const [isLoadingDriveProjects, setIsLoadingDriveProjects] = useState(false);
  const [driveAvailableProjects, setDriveAvailableProjects] = useState<SharedProjectOption[]>([]);
  const [downloadingFolderId, setDownloadingFolderId] = useState<string | null>(null);

  // 1. Function to fetch data from SQLite
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [projectsData, protocolsData] = await Promise.all([
        getAllProjects(),
        getAllCustomProtocols(),
      ]);
      setProjects(projectsData);
      setCustomProtocols(protocolsData);

      // Load protocol names and themes for display
      const names: Record<string, string> = {};
      const themes: Record<string, string> = {};
      for (const project of projectsData) {
        if (resolveManifestId(project) === "custom" && project.protocol_id) {
          try {
            const protocol = await getCustomProtocolById(
              Number(project.protocol_id),
            );
            if (protocol) {
              names[project.protocol_id] = protocol.name;
              themes[project.protocol_id] = protocol.theme;
            }
          } catch (e) {
            console.error("Error loading protocol name:", e);
          }
        } else {
          const manifest = registry.getProtocol(project.protocol_id);
          names[project.protocol_id] = manifest?.name[lang] ?? project.protocol_id;
          themes[project.protocol_id] =
            manifest?.theme?.[lang] ?? project.protocol_id;
        }
      }
      setProtocolNames(names);
      setProtocolThemes(themes);

      const collaborativeProjects = projectsData.filter((p) => p.collaboration_role === "owner");
      const countsEntries = await Promise.all(
        collaborativeProjects.map(
          async (p) => [p.id, await getUnsyncedPointCount(p.id)] as const,
        ),
      );
      setUnsyncedCounts(Object.fromEntries(countsEntries));
    } catch (error) {
      console.error("Error loading projects/protocols:", error);
      alert(t("common.error"), t("projectsList.loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [alert, t]);

  // 2. Lifecycle Hook: Refreshes data when screen comes into focus
  // Essential for updating the list after creating a new project and returning here
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // Fetches the "load from Drive" dialog's list on demand - this is now an
  // explicit, user-triggered action (via the FAB), not a silent background
  // check, so failures are surfaced instead of swallowed.
  const refreshDriveAvailableProjects = useCallback(async () => {
    if (!googleAccount) {
      setDriveAvailableProjects([]);
      return;
    }
    setIsLoadingDriveProjects(true);
    try {
      const [allDriveProjects, usedFolderIds] = await Promise.all([
        listAllDriveProjects(),
        getUsedDriveFolderIds(),
      ]);
      const usedSet = new Set(usedFolderIds);
      setDriveAvailableProjects(allDriveProjects.filter((p) => !usedSet.has(p.driveFolderId)));
    } catch (error) {
      console.error("Error loading available Drive projects:", error);
      setDriveAvailableProjects([]);
      alert(t("common.error"), t("projectsList.driveListError"));
    } finally {
      setIsLoadingDriveProjects(false);
    }
  }, [googleAccount, alert, t]);

  // Fetch when the dialog opens, and again if the user connects their
  // Google account while the dialog is already open.
  useEffect(() => {
    if (driveDialogVisible && googleAccount) {
      refreshDriveAvailableProjects();
    }
  }, [googleAccount, driveDialogVisible, refreshDriveAvailableProjects]);

  const handleDownloadDriveProject = async (option: SharedProjectOption) => {
    if (!googleAccount) return;
    setDownloadingFolderId(option.driveFolderId);
    try {
      const { projectId } = await joinAndCreateLocalProject(option.driveFolderId);
      const syncResult = await syncProjectFromDrive(projectId, { includeMedia: false }, registry);
      await loadData();
      await refreshDriveAvailableProjects();
      alert(t("common.success"), t("projectsList.downloadSummary", { imported: syncResult.imported }));
    } catch (error) {
      console.error("Error downloading Drive project:", error);
      alert(t("common.error"), t("projectsList.downloadError"));
    } finally {
      setDownloadingFolderId(null);
    }
  };

  // 2. Protocol actions
  const handleEditProtocol = async (protocolId: number) => {
    const usageCount = await getProtocolUsageCount(protocolId);

    if (usageCount > 0) {
      alert(
        t("protocol.inUse"),
        t("protocol.inUseMessage").replace("{count}", usageCount.toString()),
      );
      return;
    }

    router.push(`/protocol/builder?id=${protocolId}` as any);
  };

  const handleDeleteProtocol = async (protocol: CustomProtocol) => {
    const usageCount = await getProtocolUsageCount(protocol.id);

    if (usageCount > 0) {
      alert(
        t("protocol.inUse"),
        t("protocol.inUseDeleteMessage").replace(
          "{count}",
          usageCount.toString(),
        ),
      );
      return;
    }

    confirm(
      t("protocol.deleteProtocol"),
      t("protocol.deleteProtocolConfirm").replace("{name}", protocol.name),
      async () => {
        try {
          await deleteCustomProtocol(protocol.id);
          loadData();
          alert(t("common.success"), t("protocol.protocolDeleted"));
        } catch (error) {
          console.error("Error deleting protocol:", error);
          alert(t("common.error"), t("protocol.deleteError"));
        }
      },
      () => {},
      t("common.delete"),
      t("common.cancel"),
    );
  };

  const handleExportProtocol = async (protocol: CustomProtocol) => {
    try {
      const exportData = {
        name: protocol.name,
        theme: protocol.theme,
        description: protocol.description,
        collection_instructions: protocol.collection_instructions,
        schema: {
          ...protocol.schema,
          metadata: {
            ...protocol.schema.metadata,
            version: protocol.schema.metadata?.version || "1.0",
            exported_at: new Date().toISOString(),
          },
        },
      };

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, -5);
      const sanitizedName = protocol.name.replace(/[^a-z0-9]/gi, "_");
      const fileName = `${sanitizedName}_protocol_${timestamp}.json`;

      const tempFile = new File(Paths.cache, fileName);
      await tempFile.write(JSON.stringify(exportData, null, 2));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(tempFile.uri, {
          mimeType: "application/json",
          dialogTitle: t("protocol.exportProtocol"),
        });
      }

      alert(t("common.success"), t("protocol.protocolExported"));
    } catch (error) {
      console.error("Error exporting protocol:", error);
      alert(t("common.error"), t("protocol.errorExportingProtocol"));
    }
  };

  const handleImportProject = async () => {
    try {
      const result = await importProjectConfigPackage();
      if (!result) return; // user cancelled the file picker

      loadData();

      const message = result.created
        ? t("projectsList.importProjectSuccessMessage")
        : t("projectsList.importProjectExistingMessage");

      alert(t("projectsList.importProjectSuccessTitle"), message, () =>
        router.push(`/project-details/${result.projectId}` as any),
      );
    } catch (error) {
      console.error("Error importing project package:", error);
      alert(
        t("common.error"),
        error instanceof Error ? error.message : t("projectsList.importProjectError"),
      );
    }
  };

  const handleImportProtocol = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/plain", "*/*"],
        copyToCacheDirectory: true,
      });

      if (result.assets && result.assets.length > 0) {
        const fileAsset = result.assets[0];

        const response = await fetch(fileAsset.uri);
        const content = await response.text();
        const importedData = JSON.parse(content);

        if (
          !importedData.name ||
          !importedData.schema ||
          !importedData.schema.sections
        ) {
          alert(t("common.error"), t("protocol.invalidProtocolFile"));
          return;
        }

        confirm(
          t("protocol.importProtocol"),
          t("protocol.importProtocolConfirm").replace(
            "{{name}}",
            importedData.name,
          ),
          async () => {
            try {
              await createCustomProtocol(
                importedData.name,
                importedData.schema,
                importedData.theme || "",
                importedData.description || "",
                importedData.collection_instructions || "",
              );
              loadData();
              alert(t("common.success"), t("protocol.protocolImported"));
            } catch (error) {
              console.error("Error creating imported protocol:", error);
              alert(t("common.error"), t("protocol.errorImportingProtocol"));
            }
          },
          () => {},
          t("common.import"),
          t("common.cancel"),
        );
      }
    } catch (error) {
      console.error("Error importing protocol:", error);
      alert(t("common.error"), t("protocol.errorImportingProtocol"));
    }
  };

  // 3. Component to render each project item in the list
  const renderProjectCard = ({ item }: { item: Project }) => {
    const handlePress = () => {
      router.push(`/project-details/${item.id}` as any);
    };

    return (
      <Card
        style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}
        onPress={handlePress}
        mode="elevated"
      >
        <Card.Content>
          <View style={styles.cardHeader}>
            <Text
              variant="titleMedium"
              style={styles.projectTitle}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            {item.collaboration_role === "owner" ? (
              <View style={styles.collaborativeBadgeRow}>
                <Chip compact icon="account-group" style={{ alignSelf: "flex-start" }}>
                  {t("projectsList.collaborative")}
                </Chip>
                {(unsyncedCounts[item.id] ?? 0) > 0 && (
                  <Chip compact style={{ alignSelf: "flex-start" }}>
                    {unsyncedCounts[item.id]}
                  </Chip>
                )}
              </View>
            ) : null}
          </View>

          {/* Metadata Section */}
          <View style={styles.metaContainer}>
            <Text
              variant="bodyMedium"
              style={{ color: paperTheme.colors.secondary, textAlign: "justify" }}
            >
              {t("projectsList.protocol")}{" "}
              <Text style={{ fontWeight: "bold" }}>
                {protocolNames[item.protocol_id] || item.protocol_id}
              </Text>
            </Text>

            <Text
              variant="bodyMedium"
              style={{
                color: paperTheme.colors.secondary,
                marginTop: 2,
                textAlign: "justify",
              }}
            >
              {t("projectsList.theme")}{" "}
              <Text style={{ fontWeight: "bold" }}>
                {protocolThemes[item.protocol_id] || item.protocol_id}
              </Text>
            </Text>

            {/* Updated-at + origin badge share one compact row so the badge
                no longer competes with the title for header space. */}
            <View style={styles.footerRow}>
              <Text
                variant="labelSmall"
                style={styles.dateText}
                numberOfLines={1}
              >
                {t("projectsList.updatedAt")}{" "}
                {new Date(item.last_updated).toLocaleDateString()}
              </Text>

              {/* Origin label indicating the protocol's origin, not its
                  specific name (already shown above): "Nomos" for any
                  native/built-in protocol (Paisageo today, more may be added
                  later), "Personalizado" for protocols the user created
                  themselves. Plain colored text (no Chip/pill) so it reads
                  at the same size as the updated-at text next to it. */}
              <Text
                variant="labelSmall"
                style={[
                  styles.originLabel,
                  {
                    color:
                      resolveManifestId(item) !== "custom"
                        ? paperTheme.colors.primary
                        : paperTheme.colors.secondary,
                  },
                ]}
              >
                {resolveManifestId(item) !== "custom"
                  ? t("projectsList.native")
                  : t("projectsList.custom")}
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>
    );
  };

  // 4. Component to render each protocol item in the list
  const renderProtocolCard = ({ item }: { item: CustomProtocol }) => {
    const sectionCount = item.schema.sections.length;
    const fieldCount = item.schema.sections.reduce(
      (acc, section) => acc + section.fields.length,
      0,
    );

    return (
      <Card
        style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}
        mode="elevated"
      >
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium" style={styles.projectTitle}>
                {item.name}
              </Text>

              {item.theme && (
                <Text
                  variant="bodyMedium"
                  style={{
                    color: paperTheme.colors.secondary,
                    marginTop: 2,
                    textAlign: "justify",
                  }}
                >
                  {item.theme}
                </Text>
              )}

              {item.description && (
                <Text
                  variant="bodyMedium"
                  style={{
                    color: paperTheme.colors.secondary,
                    marginTop: 4,
                    textAlign: "justify",
                  }}
                >
                  {item.description}
                </Text>
              )}

              <View style={styles.metaContainer}>
                <Text
                  variant="bodySmall"
                  style={{ color: paperTheme.colors.secondary }}
                >
                  {sectionCount}{" "}
                  {sectionCount === 1
                    ? t("protocol.sectionSingular")
                    : t("protocol.sectionPlural")}{" "}
                  • {fieldCount}{" "}
                  {fieldCount === 1
                    ? t("protocol.fieldSingular")
                    : t("protocol.fieldPlural")}
                </Text>
              </View>
            </View>
          </View>
        </Card.Content>

        <Card.Actions>
          <IconButton
            icon="export"
            size={20}
            onPress={() => handleExportProtocol(item)}
          />
          <IconButton
            icon="pencil"
            size={20}
            onPress={() => handleEditProtocol(item.id)}
          />
          <IconButton
            icon="delete"
            size={20}
            onPress={() => handleDeleteProtocol(item)}
          />
        </Card.Actions>
      </Card>
    );
  };

  const isProjectsTab = activeTab === "projects";

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: paperTheme.colors.background },
      ]}
    >
      {/* Stack Header Configuration */}
      <Stack.Screen
        options={{ title: t("projectsList.title"), headerBackTitle: "" }}
      />

      <View style={styles.tabsContainer}>
        <SegmentedButtons
          theme={SEGMENTED_BUTTONS_SHAPE_THEME}
          value={activeTab}
          onValueChange={(value) =>
            setActiveTab(value as "projects" | "protocols")
          }
          buttons={[
            {
              value: "projects",
              label: t("projectsList.tabProjects"),
            },
            {
              value: "protocols",
              label: t("projectsList.tabProtocols"),
            },
          ]}
        />
      </View>

      {/* Main Content List */}
      <View style={styles.content}>
        {isLoading ? (
          <ActivityIndicator
            animating={true}
            size="large"
            style={styles.loader}
            color={paperTheme.colors.primary}
          />
        ) : isProjectsTab ? (
          <FlatList
            data={projects}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderProjectCard}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text
                  variant="titleMedium"
                  style={[
                    styles.emptyText,
                    { color: paperTheme.colors.onSurface },
                  ]}
                >
                  {t("projectsList.noProjects")}
                </Text>
                <Text
                  variant="bodyMedium"
                  style={[
                    styles.emptySubText,
                    { color: paperTheme.colors.secondary },
                  ]}
                >
                  {t("projectsList.emptyTip")}
                </Text>
              </View>
            }
          />
        ) : (
          <FlatList
            data={customProtocols}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderProtocolCard}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View>
                <Button
                  mode="outlined"
                  icon="compass-outline"
                  onPress={() => router.push("/protocol/native-catalog" as any)}
                  style={[styles.nativeProtocolsButton, { borderRadius: BUTTON_RADIUS }]}
                >
                  {t("projectsList.nativeProtocolsShowcase")}
                </Button>
                <Button
                  mode="outlined"
                  icon="school-outline"
                  onPress={() => router.push("/protocol/tutorials" as any)}
                  style={[styles.nativeProtocolsButton, { borderRadius: BUTTON_RADIUS }]}
                >
                  {t("tutorials.buttonLabel")}
                </Button>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text
                  variant="titleMedium"
                  style={[
                    styles.emptyText,
                    { color: paperTheme.colors.onSurface },
                  ]}
                >
                  {t("protocol.noProtocolsYet")}
                </Text>
                <Text
                  variant="bodyMedium"
                  style={[
                    styles.emptySubText,
                    { color: paperTheme.colors.secondary },
                  ]}
                >
                  {t("protocol.createFirstProtocol")}
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* Same FAB.Group in both tabs (only the actions change) so the button
          never jumps position when switching tabs - FAB.Group already
          positions itself correctly using the safe-area inset plus its own
          internal margin, so no custom `style`/`bottom` override is needed
          or should be added here. */}
      <FAB.Group
        open={isProjectsTab ? projectFabOpen : protocolFabOpen}
        visible
        icon={(isProjectsTab ? projectFabOpen : protocolFabOpen) ? "close" : "plus"}
        color={paperTheme.colors.onPrimary}
        fabStyle={{ backgroundColor: paperTheme.colors.primary }}
        actions={
          isProjectsTab
            ? [
                {
                  icon: "folder-plus",
                  label: t("projectsList.newProject"),
                  onPress: () => router.push("/project/new"),
                  color: paperTheme.dark
                    ? paperTheme.colors.onSurface
                    : paperTheme.colors.primary,
                },
                {
                  icon: "import",
                  label: t("projectsList.importProject"),
                  onPress: handleImportProject,
                  color: paperTheme.dark
                    ? paperTheme.colors.onSurface
                    : paperTheme.colors.primary,
                },
                {
                  icon: "folder-download-outline",
                  label: t("projectsList.loadFromDrive"),
                  onPress: () => setDriveDialogVisible(true),
                  color: paperTheme.dark
                    ? paperTheme.colors.onSurface
                    : paperTheme.colors.primary,
                },
              ]
            : [
                {
                  icon: "file-document-plus",
                  label: t("protocol.createProtocol"),
                  onPress: () => router.push("/protocol/builder"),
                  color: paperTheme.dark
                    ? paperTheme.colors.onSurface
                    : paperTheme.colors.primary,
                },
                {
                  icon: "import",
                  label: t("protocol.importProtocol"),
                  onPress: handleImportProtocol,
                  color: paperTheme.dark
                    ? paperTheme.colors.onSurface
                    : paperTheme.colors.primary,
                },
              ]
        }
        onStateChange={({ open }) =>
          isProjectsTab ? setProjectFabOpen(open) : setProtocolFabOpen(open)
        }
        theme={{
          colors: {
            primary: paperTheme.colors.primary,
            onPrimary: paperTheme.colors.onPrimary,
          },
        }}
      />

      <Portal>
        <Dialog
          visible={driveDialogVisible}
          onDismiss={() => setDriveDialogVisible(false)}
          style={{ maxHeight: "70%" }}
        >
          <Dialog.Title>{t("projectsList.availableOnDrive")}</Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 8 }}>
              {isLoadingDriveProjects ? (
                <ActivityIndicator animating size="large" style={{ marginVertical: 24 }} color={paperTheme.colors.primary} />
              ) : !googleAccount ? (
                <View style={{ alignItems: "center", paddingVertical: 16 }}>
                  <Text variant="bodyMedium" style={{ textAlign: "center", marginBottom: 16 }}>
                    {t("projectsList.driveConnectRequired")}
                  </Text>
                  <Button mode="contained" onPress={connect} loading={isConnecting} disabled={isConnecting} icon="google">
                    {t("settings.googleAccountConnect")}
                  </Button>
                </View>
              ) : driveAvailableProjects.length === 0 ? (
                <Text variant="bodyMedium" style={{ textAlign: "center", paddingVertical: 16 }}>
                  {t("projectsList.noNewDriveProjects")}
                </Text>
              ) : (
                driveAvailableProjects.map((option) => (
                  <Card key={option.driveFolderId} style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}>
                    <Card.Content style={styles.driveAvailableRow}>
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyMedium" style={{ fontWeight: "bold" }} numberOfLines={1}>
                          {option.manifest.project_name}
                        </Text>
                        <Chip compact icon="account-group" style={{ alignSelf: "flex-start", marginTop: 4 }}>
                          {t("projectsList.collaborative")}
                        </Chip>
                      </View>
                      <Button
                        mode="contained"
                        loading={downloadingFolderId === option.driveFolderId}
                        disabled={downloadingFolderId !== null}
                        onPress={() => handleDownloadDriveProject(option)}
                      >
                        {t("projectsList.download")}
                      </Button>
                    </Card.Content>
                  </Card>
                ))
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setDriveDialogVisible(false)}>{t("common.close")}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <View
        pointerEvents="none"
        style={{
          height: insets.bottom,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabsContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  content: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 96,
  },
  card: {
    marginBottom: 12,
  },
  cardHeader: {
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  collaborativeBadgeRow: {
    flexDirection: "row",
    gap: 4,
  },
  driveAvailableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  projectTitle: {
    fontWeight: "bold",
  },
  metaContainer: {
    marginTop: 4,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  dateText: {
    flex: 1,
    marginRight: 8,
    opacity: 0.6,
    fontStyle: "italic",
    fontSize: 11,
  },
  originLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  loader: {
    marginTop: 50,
  },
  emptyState: {
    marginTop: 100,
    alignItems: "center",
    opacity: 0.7,
  },
  emptyText: {
    marginBottom: 8,
    fontWeight: "bold",
    textAlign: "center",
  },
  emptySubText: {
    textAlign: "center",
  },
  nativeProtocolsButton: {
    marginBottom: 12,
  },
});
