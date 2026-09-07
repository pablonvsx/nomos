// src/app/project-details/[id].tsx
// Paisageo / official protocol project details screen
import React, { useState, useCallback, useEffect } from "react";
import { View, ScrollView, StyleSheet, FlatList } from "react-native";
import {
  Text,
  Card,
  Button,
  ActivityIndicator,
  Divider,
  useTheme as usePaperTheme,
  IconButton,
  FAB,
  Dialog,
  Portal,
  TextInput,
  List,
  Chip,
  Icon,
} from "react-native-paper";
import {
  useRouter,
  useLocalSearchParams,
  useFocusEffect,
  Stack,
} from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { useAlertDialog } from "@/hooks/use-dialog";
import { CardHeaderIconButton } from "@/components/ui/CardHeaderIconButton";
import { useStableTextInput } from "@/hooks/use-stable-text-input";
import { useBottomContentPadding } from "@/hooks/use-bottom-content-padding";
import { useGoogleAccount } from "@/hooks/use-google-account";
import { createCollaborativeProjectStructure, isProjectAdmin } from "@/core/drive-sync/project-drive-service";
import { syncProjectFromDrive } from "@/core/drive-sync/project-sync-service";
import { upsertProjectMember } from "@/db/queries/project-members";

// Internal imports
import {
  getProjectById,
  updateProject,
  deleteProject,
  updateProjectGeoJSON,
  setProjectCollaborative,
} from "@/db/queries/projects";
import { getPointsByProject, classifyProjectPoints, getPointsWithModulesByProject } from "@/db/queries/points";
import { buildPointEnvelope } from "@/db/mappers/point.mapper";
import {
  getActiveVegetationClassificationConfig,
  getVegetationClassificationById,
  setActiveVegetationClassification,
  getVegetationClassificationsByProject,
} from "@/db/queries/vegetation-classifications";
import { Project, Point, VegetationClassification, CustomProtocol } from "@/types/database";
import type { PointEnvelope, ProjectRef, LanguageCode } from "@/protocol-kernel/types";
import { useI18n } from "@/contexts/i18n-context";
import { parseJsonText } from "@/db/mappers/json-utils";
import { exportMedia } from "@/core/export/file-writer";
import { useMapData } from "@/contexts/map-data-context";
import VegetationClassificationPicker from "@/modules/paisageo/components/VegetationClassificationPicker";
import VegetationClassificationsManagementModal from "@/modules/paisageo/components/VegetationClassificationsManagementModal";
import { getProjectSpeciesCatalogByProject } from "@/db/queries/project-species";
import { getCustomProtocolById } from "@/db/queries/custom-protocols";
import {
  useProtocolRegistry,
  useCapabilityBus,
  resolveManifestId,
} from "@/contexts/protocol-registry-context";

// --- Helper Functions ---

const safeJsonParse = (jsonString: string | null | undefined) => {
  return parseJsonText<unknown | null>(jsonString, null);
};


function buildProjectRef(project: Project): ProjectRef {
  return {
    id: project.id.toString(),
    name: project.name,
    protocolId: project.protocol_id,
  };
}

export default function UnifiedProjectDetailsScreen() {
  const router = useRouter();
  const paperTheme = usePaperTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { confirm, alert } = useAlertDialog();
  const { t, currentLanguage } = useI18n();
  const registry = useProtocolRegistry();
  const bus = useCapabilityBus();
  const { clearMapData } = useMapData();
  const { account: googleAccount } = useGoogleAccount();

  // State Management
  const [project, setProject] = useState<Project | null>(null);
  const [protocolLabel, setProtocolLabel] = useState<string>("");
  const [surveyPoints, setSurveyPoints] = useState<Point[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isMakingCollaborative, setIsMakingCollaborative] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDialogVisible, setSyncDialogVisible] = useState(false);

  // Vegetation Classification States
  const [vegClassificationSelectorVisible, setVegClassificationSelectorVisible] = useState(false);
  const [vegClassesModalVisible, setVegClassesModalVisible] = useState(false);
  const [vegClassificationType, setVegClassificationType] = useState<"standard" | "custom">("standard");
  const [activeVegClassification, setActiveVegClassification] = useState<VegetationClassification | null>(null);
  const [customVegClassifications, setCustomVegClassifications] = useState<VegetationClassification[]>([]);
  // Whether the project's active modules include "vegetation" - drives the
  // classification card below. Part of the vegetation module itself (custom
  // per-project classes vs. standard Küchler naming), not a PAISAGEO-only
  // extra, so any protocol (native or custom) with the module attached gets it.
  const [hasVegetationModule, setHasVegetationModule] = useState(false);

  // Species Management States
  const [projectSpeciesCount, setProjectSpeciesCount] = useState(0);
  const [topFamilies, setTopFamilies] = useState<{ family: string; count: number }[]>([]);
  const [hasSpeciesField, setHasSpeciesField] = useState(false);

  // FAB and Edit Dialog states
  const [fabOpen, setFabOpen] = useState(false);
  const [editDialogVisible, setEditDialogVisible] = useState(false);
  const bottomPadding = useBottomContentPadding(64);

  // resetKey includes editDialogVisible: this screen never unmounts while
  // open, so it's the false->true toggle (opening the dialog) that must
  // resync these fields to the current project name/description - see
  // useStableTextInput's own resetKey-driven resync mechanism.
  const nameInput = useStableTextInput(`${id}-name-${editDialogVisible}`, project?.name ?? "");
  const descriptionInput = useStableTextInput(`${id}-description-${editDialogVisible}`, project?.description ?? "");


  // Load project data
  const loadProjectData = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    try {
      const projectData = await getProjectById(parseInt(id));

      if (!projectData) {
        console.error("Project not found:", id);
        alert(t("common.error"), t("projectView.projectNotFound"));
        router.back();
        return;
      }

      setProject(projectData);

      // Resolve manifest from kernel (not from DB)
      const manifestId = resolveManifestId(projectData);
      const manifest = registry.getProtocol(manifestId);
      const lang = (currentLanguage as string) ?? "pt";
      const baseProtocolLabel = manifest?.name[lang] ?? manifest?.name["pt"] ?? manifestId;

      const isCustom = manifest?.kind === "custom";

      // For custom protocols, we load the protocol here (once) to show its
      // own name alongside the generic "Custom" label, and reuse the same
      // result below to detect the floristic record field.
      let customProtocol: CustomProtocol | null = null;
      if (isCustom) {
        try {
          customProtocol = await getCustomProtocolById(parseInt(projectData.protocol_id));
        } catch (customProtocolError) {
          console.error("Error loading custom protocol:", customProtocolError);
        }
      }
      setProtocolLabel(
        isCustom && customProtocol?.name
          ? `${baseProtocolLabel} - ${customProtocol.name}`
          : baseProtocolLabel,
      );

      // Vegetation classification config (standard Küchler naming vs. a
      // custom per-project classes list) is part of the vegetation module
      // itself - load it for any protocol whose active modules include it.
      const vegetationModulePresent = isCustom
        ? (customProtocol?.schema.sections.some((section) => section.moduleRef === "vegetation") ?? false)
        : (manifest?.modules.some((module) => module.id === "vegetation") ?? false);
      setHasVegetationModule(vegetationModulePresent);

      if (vegetationModulePresent) {
        try {
          const vegConfig = await getActiveVegetationClassificationConfig(parseInt(id));
          if (vegConfig) {
            setVegClassificationType(vegConfig.type);
            if (vegConfig.type === "custom" && vegConfig.classificationId) {
              const vegClassification = await getVegetationClassificationById(vegConfig.classificationId);
              if (vegClassification) {
                setActiveVegClassification(vegClassification);
              }
            }
          }
          const customClassifications = await getVegetationClassificationsByProject(parseInt(id));
          setCustomVegClassifications(customClassifications);
        } catch (vegError) {
          console.error("Error loading vegetation classification config:", vegError);
        }
      }

      // Custom protocols may still have a species field (e.g. "Floristic Record")
      const projectHasSpeciesField = isCustom
        ? (customProtocol?.schema.sections.some(section =>
            section.fields.some(field => field.type === "species_list"),
          ) ?? false)
        : true;
      setHasSpeciesField(projectHasSpeciesField);

      // Load species catalog count only for protocols that have species fields
      if (projectHasSpeciesField) {
        try {
          const speciesCatalog = await getProjectSpeciesCatalogByProject(parseInt(id));
          setProjectSpeciesCount(speciesCatalog.length);

          const familyCounts = new Map<string, number>();
          for (const sp of speciesCatalog) {
            if (!sp.family) continue;
            familyCounts.set(sp.family, (familyCounts.get(sp.family) ?? 0) + 1);
          }
          setTopFamilies(
            Array.from(familyCounts.entries())
              .map(([family, count]) => ({ family, count }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 3),
          );
        } catch (speciesError) {
          console.error("Error loading species catalog:", speciesError);
          setProjectSpeciesCount(0);
          setTopFamilies([]);
        }
      } else {
        setProjectSpeciesCount(0);
        setTopFamilies([]);
      }

      try {
        const points = await getPointsByProject(parseInt(id));
        setSurveyPoints(points || []);
      } catch (pointsError) {
        console.error("Error loading survey points:", pointsError);
        setSurveyPoints([]);
      }
    } catch (error) {
      console.error("Error loading project:", error);
      alert(t("common.error"), t("projectView.loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [id, router, t]);

  useFocusEffect(
    useCallback(() => {
      loadProjectData();
    }, [loadProjectData]),
  );

  // Live admin check (against manifest.json on Drive, not the local
  // project_members copy, which can be stale if another admin promoted
  // someone recently) - drives the "Aprovações Pendentes" FAB action below.
  useEffect(() => {
    if (!project || !project.is_collaborative || !project.drive_folder_id || !googleAccount) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    isProjectAdmin(project.drive_folder_id, googleAccount.email)
      .then((result) => { if (!cancelled) setIsAdmin(result); })
      .catch((error) => {
        console.error("Error checking project admin role:", error);
        if (!cancelled) setIsAdmin(false);
      });
    return () => { cancelled = true; };
  }, [project, googleAccount]);

  // Handle edit dialog save. Takes the new name/description as arguments
  // instead of reading them off state: the Save button used to call
  // setEditName(localEditName) and then this function in the same
  // handler, but setState is async, so this function would still see the
  // pre-edit value from its own render's closure - the update silently
  // wrote back the unchanged name/description every time.
  const handleSaveEdit = async (name: string, description: string) => {
    if (!project || !name.trim()) {
      alert(t("common.error"), t("projectView.nameRequired"));
      return;
    }

    try {
      const success = await updateProject(project.id, name, description);
      if (success) {
        setEditDialogVisible(false);
        loadProjectData();
        alert(t("common.success"), t("projectView.updateSuccess"));
      } else {
        alert(t("common.error"), t("projectView.updateError"));
      }
    } catch (error) {
      console.error("Error updating project:", error);
      alert(t("common.error"), t("projectView.updateError"));
    }
  };

  // Handle delete project
  const handleDeleteProject = () => {
    if (!project) return;

    confirm(
      t("projectView.deleteProject"),
      t("projectView.deleteProjectConfirm"),
      async () => {
        try {
          const success = await deleteProject(project.id);
          if (success) {
            router.back();
          } else {
            alert(t("common.error"), t("projectView.deleteError"));
          }
        } catch (error) {
          console.error("Error deleting project:", error);
          alert(t("common.error"), t("projectView.deleteError"));
        }
      },
      () => {},
      t("common.delete"),
      t("common.cancel"),
      true,
    );
  };

  // Handle making the project collaborative (Drive-backed)
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
            creatorEmail: googleAccount.email,
            autoApproveDefault: Boolean(project.auto_approve_default),
          });
          await setProjectCollaborative(project.id, driveFolderId, Boolean(project.auto_approve_default));
          await upsertProjectMember(project.id, googleAccount.email, "admin", "herda_projeto");
          await loadProjectData();
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

  const handleSyncProject = () => setSyncDialogVisible(true);

  const handleConfirmSync = async (includeMedia: boolean) => {
    setSyncDialogVisible(false);
    if (!project) return;
    setIsSyncing(true);
    try {
      const result = await syncProjectFromDrive(project.id, { includeMedia }, registry);
      await loadProjectData();
      alert(
        t("common.success"),
        includeMedia
          ? t("projectView.syncSummaryWithMedia", {
              imported: result.imported,
              skipped: result.skipped,
              media: result.mediaDownloaded,
            })
          : t("projectView.syncSummary", { imported: result.imported, skipped: result.skipped }),
      );
    } catch (error) {
      console.error("Error syncing project:", error);
      alert(t("common.error"), t("projectView.syncError"));
    } finally {
      setIsSyncing(false);
    }
  };

  // [File Upload Handlers - Mapping and Route]
  const handleAddLayer = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "application/geo+json", "text/plain", "*/*"],
        copyToCacheDirectory: true,
      });

      if (result.assets && result.assets.length > 0) {
        const fileAsset = result.assets[0];
        const response = await fetch(fileAsset.uri);
        const content = await response.text();
        const geojson = safeJsonParse(content) as { type?: string } | null;

        if (!geojson?.type || geojson.type !== "FeatureCollection") {
          alert(t("common.error"), t("common.invalidGeoJSON"));
          return;
        }

        const filename = `layer_${Date.now()}.geojson`;
        const destFile = new File(Paths.document, filename);
        await destFile.create();
        await destFile.write(content);

        const success = await updateProjectGeoJSON(
          parseInt(id!),
          destFile.uri,
          undefined,
        );

        if (success) {
          clearMapData(parseInt(id!));
          alert(t("common.success"), t("projectView.mappingAdded"));
          loadProjectData();
        } else {
          alert(t("common.error"), t("projectView.errorSavingMapping"));
        }
      }
    } catch (error) {
      console.error("Error adding layer:", error);
      alert(t("common.error"), t("projectView.errorProcessingFile"));
    }
  };

  const handleAddFieldRoute = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "application/geo+json", "text/plain", "*/*"],
        copyToCacheDirectory: true,
      });

      if (result.assets && result.assets.length > 0) {
        const fileAsset = result.assets[0];
        const response = await fetch(fileAsset.uri);
        const content = await response.text();
        const geojson = safeJsonParse(content) as { type?: string } | null;

        if (!geojson?.type || geojson.type !== "FeatureCollection") {
          alert(t("common.error"), t("projectView.invalidGeoJSON"));
          return;
        }

        const filename = `route_${Date.now()}.geojson`;
        const destFile = new File(Paths.document, filename);
        await destFile.create();
        await destFile.write(content);

        const success = await updateProjectGeoJSON(
          parseInt(id!),
          undefined,
          destFile.uri,
        );

        if (success) {
          clearMapData(parseInt(id!));
          alert(t("common.success"), t("projectView.routeAdded"));
          loadProjectData();
        } else {
          alert(t("common.error"), t("projectView.errorSavingRoute"));
        }
      }
    } catch (error) {
      console.error("Error adding field route:", error);
      alert(t("common.error"), t("projectView.errorProcessingFile"));
    }
  };

  const handleRemoveLayer = async () => {
    confirm(
      t("projectView.removeMapping"),
      t("projectView.removeMappingConfirm"),
      async () => {
        try {
          await updateProjectGeoJSON(parseInt(id!), "", undefined);
          clearMapData(parseInt(id!));
          loadProjectData();
        } catch {
          alert(t("common.error"), t("projectView.errorRemovingFile"));
        }
      },
      () => {},
      t("common.remove"),
      t("common.cancel"),
    );
  };

  const handleRemoveFieldRoute = async () => {
    confirm(
      t("projectView.removeRoute"),
      t("projectView.removeRouteConfirm"),
      async () => {
        try {
          await updateProjectGeoJSON(parseInt(id!), undefined, "");
          clearMapData(parseInt(id!));
          loadProjectData();
        } catch {
          alert(t("common.error"), t("projectView.errorRemovingFile"));
        }
      },
      () => {},
      t("common.remove"),
      t("common.cancel"),
    );
  };

  const handleViewMap = () => {
    const hasMapData =
      project?.geojson_layer ||
      project?.geojson_field_route ||
      surveyPoints.length > 0;

    if (!hasMapData) {
      alert(t("projectView.noMapData"), t("projectView.noMapDataMessage"));
      return;
    }
    
    if (isNavigating) return;
    setIsNavigating(true);
    router.push(`/view-map?projectId=${id}` as any);
    setTimeout(() => setIsNavigating(false), 1000);
  };

  // --- NEW: CLASSIFY PROJECT ---
  const handleClassifyProject = async () => {
    if (!project || !id || surveyPoints.length === 0) return;
    
    confirm(
      t("projectView.classifyDialogTitle") || "Classify Collection Points",
      t("projectView.classifyDialogMessage") || "This will classify collection points in field order based on Landscape Name. Point 1 defines Landscape Type 1. Continue?",
      async () => {
        setIsClassifying(true);
        try {
          const success = await classifyProjectPoints(parseInt(id));
          if (success) {
            await loadProjectData(); // Reload to show new classes if UI displayed them
            alert(t("common.success"), t("projectView.classificationSuccess") || "Points classified successfully.");
          } else {
            alert(t("common.error"), t("common.error"));
          }
        } catch (e) {
          console.error(e);
          alert(t("common.error"), t("common.error"));
        } finally {
          setIsClassifying(false);
        }
      },
      () => {},
      t("survey.classify") || "Classify",
      t("common.cancel")
    );
  };

  // --- EXPORT FUNCTIONS ---

  const handleExportGeoJSON = async () => {
    if (!project || !id || surveyPoints.length === 0) {
      alert(t("projectView.noData"), t("projectView.noDataToExport"));
      return;
    }
    const mf = registry.getProtocol(resolveManifestId(project));
    if (!mf) return;
    try {
      setIsExporting(true);
      const pointsWithMods = await getPointsWithModulesByProject(parseInt(id), registry);
      const envelopes = pointsWithMods.map(buildPointEnvelope);
      await mf.exporter({ bus }).exportGeoJSON(envelopes, buildProjectRef(project), currentLanguage as LanguageCode);
    } catch (error) {
      console.error("Error exporting GeoJSON:", error);
      alert(t("common.error"), t("projectView.errorExporting"));
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = async () => {
    if (!project || !id || surveyPoints.length === 0) {
      alert(t("projectView.noData"), t("projectView.noDataToExport"));
      return;
    }
    const mf = registry.getProtocol(resolveManifestId(project));
    if (!mf) return;
    try {
      setIsExporting(true);
      const pointsWithMods = await getPointsWithModulesByProject(parseInt(id), registry);
      const envelopes = pointsWithMods.map(buildPointEnvelope);
      await mf.exporter({ bus }).exportCSV(envelopes, buildProjectRef(project), currentLanguage as LanguageCode);
    } catch (error) {
      console.error("Error exporting CSV:", error);
      alert(t("common.error"), t("projectView.errorExportingCSV"));
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportMedia = async () => {
    if (!project || !id || surveyPoints.length === 0) return;
    const mf = registry.getProtocol(resolveManifestId(project));
    if (!mf) return;
    try {
      setIsExporting(true);
      const pointsWithMods = await getPointsWithModulesByProject(parseInt(id), registry);
      const envelopes = pointsWithMods.map(buildPointEnvelope);
      const exporter = mf.exporter({ bus });
      const projectRef = buildProjectRef(project);
      const hasMedia = await exportMedia(
        envelopes,
        (p: PointEnvelope) => exporter.extractMedia(p, projectRef),
        project.name,
      );
      if (!hasMedia) {
        alert(t("common.info"), t("projectView.noMediaToExport") || "No media available to export.");
      }
    } catch (e) {
      console.error(e);
      alert(t("common.error"), t("projectView.errorExportingMedia") || "Error exporting media.");
    } finally {
      setIsExporting(false);
    }
  };

  const renderSurveyPoint = ({ item }: { item: Point }) => {
    const surveyRoute = `/survey-point-details/${item.id}?projectId=${project?.id}`;
    const pointLabel = t("surveyView.point");

    const handleNavigateToPoint = () => {
      if (isNavigating) return;
      setIsNavigating(true);
      router.push(surveyRoute as any);
      setTimeout(() => setIsNavigating(false), 1000);
    };

    return (
      <Card
        style={[styles.pointCard, { backgroundColor: paperTheme.colors.surface }]}
        onPress={handleNavigateToPoint}
        mode="elevated"
      >
        <Card.Content>
          <View style={styles.pointHeader}>
            <View style={{ flex: 1, paddingLeft: 40 }}>
              <Text variant="titleMedium" style={{ fontWeight: "bold" }}>
                {pointLabel} {item.point_number}
              </Text>
              
              {item.landscape_class_id && (
                <Text variant="labelSmall" style={{ color: paperTheme.colors.primary, fontWeight: 'bold' }}>
                  {t("survey.class") || "Class"}: {item.landscape_class_id}
                </Text>
              )}

              <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
                {item.lat.toFixed(6)}, {item.lon.toFixed(6)}
              </Text>
            </View>
            <IconButton icon="chevron-right" size={24} style={{ marginRight: -8 }} />
          </View>
        </Card.Content>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: paperTheme.colors.background }]}>
        <Stack.Screen options={{ title: t("projectView.title"), headerBackTitle: "" }} />
        <ActivityIndicator animating={true} size="large" style={{ marginTop: 50 }} />
      </View>
    );
  }

  if (!project) {
    return (
      <View style={[styles.container, { backgroundColor: paperTheme.colors.background }]}>
        <Stack.Screen options={{ title: t("projectView.title"), headerBackTitle: "" }} />
        <Text>{t("projectView.projectNotFound")}</Text>
      </View>
    );
  }

  const manifestId = resolveManifestId(project);
  const manifest = registry.getProtocol(manifestId);

  return (
    <View style={[styles.container, { backgroundColor: paperTheme.colors.background }]}>
      <Stack.Screen
        options={{
          title: project.name,
          headerBackTitle: "",
        }}
      />

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: bottomPadding }}>
        {/* Info Card */}
        <Card style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <Text variant="titleMedium" style={styles.cardTitle}>{t("projectView.projectInfo")}</Text>
              <CardHeaderIconButton
                icon="school-outline"
                onPress={() => router.push(`/protocol/tutorials?protocolId=${manifestId}` as any)}
              />
            </View>
            <Divider style={{ marginVertical: 12 }} />
            <View style={styles.infoGrid}>
              <View style={styles.infoGridItem}>
                <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("projectView.name")}</Text>
                <Text variant="bodyMedium" style={{ fontWeight: "bold" }}>{project.name}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 6 }}>
              <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("projectView.protocol")}:</Text>
              <Text variant="bodyMedium" style={{ flex: 1 }}>
                {protocolLabel}
              </Text>
            </View>
            {project.description && <Text variant="bodyMedium" style={{ marginTop: 8, textAlign: "justify" }}>{project.description}</Text>}
          </Card.Content>
        </Card>

        {/* Map Visualization */}
        <Card style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <Text variant="titleMedium" style={styles.cardTitle}>{t("projectView.visualization")}</Text>
              <CardHeaderIconButton
                icon="map"
                onPress={handleViewMap}
                disabled={!project?.geojson_layer && !project?.geojson_field_route && surveyPoints.length === 0}
              />
            </View>
            <Divider style={{ marginVertical: 12 }} />
            <View style={styles.vizRow}>
              <View style={[styles.vizItem, { backgroundColor: paperTheme.colors.surfaceVariant }]}>
                <View style={styles.vizItemHeader}>
                  <Icon source="map-outline" size={16} color={paperTheme.colors.onSurfaceVariant} />
                  <Text variant="labelMedium" style={styles.vizItemTitle}>{t("projectView.previousMapping")}</Text>
                  <IconButton
                    icon={project.geojson_layer ? "delete" : "plus"}
                    size={16}
                    iconColor={project.geojson_layer ? paperTheme.colors.error : paperTheme.colors.primary}
                    onPress={project.geojson_layer ? handleRemoveLayer : handleAddLayer}
                    style={styles.vizItemButton}
                  />
                </View>
                <Text variant="labelSmall" style={{ color: project.geojson_layer ? paperTheme.colors.primary : paperTheme.colors.outline, marginTop: 2 }}>
                  {project.geojson_layer ? t("projectView.added") : t("projectView.notAdded")}
                </Text>
              </View>
              <View style={[styles.vizItem, { backgroundColor: paperTheme.colors.surfaceVariant }]}>
                <View style={styles.vizItemHeader}>
                  <Icon source="routes" size={16} color={paperTheme.colors.onSurfaceVariant} />
                  <Text variant="labelMedium" style={styles.vizItemTitle}>{t("projectView.fieldRoute")}</Text>
                  <IconButton
                    icon={project.geojson_field_route ? "delete" : "plus"}
                    size={16}
                    iconColor={project.geojson_field_route ? paperTheme.colors.error : paperTheme.colors.primary}
                    onPress={project.geojson_field_route ? handleRemoveFieldRoute : handleAddFieldRoute}
                    style={styles.vizItemButton}
                  />
                </View>
                <Text variant="labelSmall" style={{ color: project.geojson_field_route ? paperTheme.colors.primary : paperTheme.colors.outline, marginTop: 2 }}>
                  {project.geojson_field_route ? t("projectView.added") : t("projectView.notAdded")}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Vegetation Classification — shown whenever the project's active modules include "vegetation" */}
        {hasVegetationModule && <Card style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <Text variant="titleMedium" style={styles.cardTitle}>{t("vegetationClassification.vegetationData")}</Text>
              <CardHeaderIconButton
                icon="pencil"
                onPress={() => setVegClassesModalVisible(true)}
              />
            </View>
            <Divider style={{ marginVertical: 12 }} />

            {/* Vegetation Classification Section */}
            <View>
              <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary, marginBottom: 12, fontWeight: "bold" }}>{t("vegetationClassification.classificationTypes")}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <Chip
                  selected={vegClassificationType === "standard"}
                  onPress={() => {
                    setVegClassificationType("standard");
                    // Save the selection
                    if (project) {
                      setActiveVegetationClassification(project.id, null, "standard").catch(err => {
                        console.error("Error saving vegetation classification type:", err);
                      });
                    }
                  }}
                  icon={vegClassificationType === "standard" ? "check" : undefined}
                  style={{ backgroundColor: vegClassificationType === "standard" ? paperTheme.colors.primaryContainer : paperTheme.colors.surfaceVariant }}
                >
                  {t("vegetationClassification.standardClassification")}
                </Chip>
                <Chip
                  selected={vegClassificationType === "custom"}
                  disabled={customVegClassifications.length === 0}
                  onPress={() => {
                    if (customVegClassifications.length > 0) {
                      setVegClassificationType("custom");
                      setVegClassificationSelectorVisible(true);
                    }
                  }}
                  icon={vegClassificationType === "custom" ? "check" : undefined}
                  style={{ backgroundColor: vegClassificationType === "custom" ? paperTheme.colors.primaryContainer : paperTheme.colors.surfaceVariant, opacity: customVegClassifications.length === 0 ? 0.5 : 1 }}
                >
                  {t("vegetationClassification.customClassification")}
                </Chip>
              </View>

              {/* Show active custom classification if applied */}
              {vegClassificationType === "custom" && activeVegClassification && (
                <View style={{ marginBottom: 16, padding: 12, backgroundColor: paperTheme.colors.surfaceVariant, borderRadius: 8 }}>
                  <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>{t("vegetationClassification.activeClassification")}</Text>
                  <Text variant="bodyMedium" style={{ fontWeight: "bold", marginTop: 4 }}>{activeVegClassification.name}</Text>
                  <Text variant="labelSmall" style={{ color: paperTheme.colors.onSurfaceVariant, marginTop: 4 }}>
                    {activeVegClassification.classes.length} {t("vegetationClassification.classes")}
                  </Text>
                </View>
              )}
            </View>
          </Card.Content>
        </Card>}

        {/* Species Catalog — Paisageo, or any custom protocol with a "Floristic Record" field */}
        {hasSpeciesField && <Card style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <Text variant="titleMedium" style={styles.cardTitle}>{t("species.speciesCatalog")}</Text>
              <CardHeaderIconButton
                icon="pencil"
                onPress={() => {
                  const lat = surveyPoints.length > 0 ? surveyPoints[0].lat || 0 : 0;
                  const lng = surveyPoints.length > 0 ? surveyPoints[0].lon || 0 : 0;
                  router.push(`/species-catalog/${id}?lat=${lat}&lng=${lng}` as any);
                }}
              />
            </View>
            <Divider style={{ marginVertical: 12 }} />

            {projectSpeciesCount > 0 ? (
              <View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Icon source="leaf" size={18} color={paperTheme.colors.primary} />
                  <Text variant="bodyMedium">
                    {projectSpeciesCount}{" "}
                    {t(projectSpeciesCount === 1 ? "species.speciesCountSingular" : "species.speciesCountPlural")}
                  </Text>
                </View>

                {topFamilies.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary, fontWeight: "bold" }}>
                      {t("species.topFamilies")}
                    </Text>
                    <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary, marginTop: 2 }}>
                      {topFamilies.map(({ family, count }) => `${family}: ${count}`).join("; ")}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View>
                <Text variant="bodyMedium" style={{ color: paperTheme.colors.secondary }}>
                  {t("species.noCatalog")}
                </Text>
                <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary, marginTop: 4, textAlign: "justify" }}>
                  {t("species.addSpeciesSuggestion")}
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>}

        {/* Survey Points */}
        <Card style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <Text variant="titleMedium" style={styles.cardTitle}>{t("projectView.surveyPoints")} ({surveyPoints.length})</Text>
              <CardHeaderIconButton
                icon="plus"
                onPress={() => {
                  if (isNavigating) return;
                  setIsNavigating(true);
                  router.push(`/insert-location?projectId=${id}` as any);
                  setTimeout(() => setIsNavigating(false), 1000);
                }}
              />
            </View>
            <Divider style={{ marginVertical: 12 }} />

            <FlatList data={surveyPoints} keyExtractor={item => item.id.toString()} renderItem={renderSurveyPoint} scrollEnabled={false} />
          </Card.Content>
        </Card>
      </ScrollView>

      <FAB.Group
        open={fabOpen}
        visible
        icon={fabOpen ? "close" : "dots-vertical"}
        color={paperTheme.colors.onPrimary}
        fabStyle={{ backgroundColor: paperTheme.colors.primary }}
        actions={[
          {
            icon: "pencil",
            label: t("common.edit"),
            onPress: () => setEditDialogVisible(true),
            color: paperTheme.dark
              ? paperTheme.colors.onSurface
              : paperTheme.colors.primary,
          },
          {
            icon: "delete",
            label: t("common.delete"),
            onPress: handleDeleteProject,
            color: paperTheme.dark
              ? paperTheme.colors.onSurface
              : paperTheme.colors.primary,
          },
          ...(project && !project.is_collaborative && googleAccount
            ? [
                {
                  icon: "google-drive",
                  label: t("projectView.makeCollaborative"),
                  onPress: isMakingCollaborative ? () => {} : handleMakeCollaborative,
                  color: paperTheme.dark
                    ? paperTheme.colors.onSurface
                    : paperTheme.colors.primary,
                },
              ]
            : []),
          ...(project && project.is_collaborative && isAdmin
            ? [
                {
                  icon: "clipboard-check-outline",
                  label: t("projectView.pendingApprovals"),
                  onPress: () => router.push(`/project-approvals/${project.id}` as any),
                  color: paperTheme.dark
                    ? paperTheme.colors.onSurface
                    : paperTheme.colors.primary,
                },
                {
                  icon: "account-cog-outline",
                  label: t("projectView.collabSettings"),
                  onPress: () => router.push(`/project-collab-settings/${project.id}` as any),
                  color: paperTheme.dark
                    ? paperTheme.colors.onSurface
                    : paperTheme.colors.primary,
                },
              ]
            : []),
          ...(project && project.is_collaborative
            ? [
                {
                  icon: "cloud-sync-outline",
                  label: t("projectView.syncProject"),
                  onPress: isSyncing ? () => {} : handleSyncProject,
                  color: paperTheme.dark
                    ? paperTheme.colors.onSurface
                    : paperTheme.colors.primary,
                },
              ]
            : []),
          ...(surveyPoints.length > 0 && manifest?.provides?.some(c => c.id === "kuchler.classifyVegetation")
            ? [
                {
                  icon: "format-list-numbered",
                  label: t("projectView.classifyProject") || "Classify Collection Points",
                  onPress: isClassifying ? () => {} : handleClassifyProject,
                  color: paperTheme.dark
                    ? paperTheme.colors.onSurface
                    : paperTheme.colors.primary,
                },
              ]
            : []),
          {
            icon: "file-delimited",
            label: t("projectView.exportCSV"),
            onPress: (surveyPoints.length === 0 || isExporting) ? () => {} : handleExportCSV,
            color: paperTheme.dark
              ? paperTheme.colors.onSurface
              : paperTheme.colors.primary,
          },
          {
            icon: "map",
            label: t("projectView.exportGeoJSON"),
            onPress: (surveyPoints.length === 0 || isExporting) ? () => {} : handleExportGeoJSON,
            color: paperTheme.dark
              ? paperTheme.colors.onSurface
              : paperTheme.colors.primary,
          },
          {
            icon: "folder-image",
            label: t("projectView.exportMedia"),
            onPress: (surveyPoints.length === 0 || isExporting) ? () => {} : handleExportMedia,
            color: paperTheme.dark
              ? paperTheme.colors.onSurface
              : paperTheme.colors.primary,
          },
        ]}
        onStateChange={({ open }) => setFabOpen(open)}
        theme={{
          colors: {
            primary: paperTheme.colors.primary,
            onPrimary: paperTheme.colors.onPrimary,
          },
        }}
      />

      <Portal>
        <Dialog visible={editDialogVisible} onDismiss={() => setEditDialogVisible(false)}>
          <Dialog.Title>{t("projectView.editProject")}</Dialog.Title>
          <Dialog.Content>
            <TextInput key={nameInput.resetKey} label={t("projectView.name")} mode="outlined" {...nameInput.inputProps} />
            <TextInput key={descriptionInput.resetKey} label={t("projectView.description")} mode="outlined" multiline numberOfLines={3} style={{ marginTop: 12 }} {...descriptionInput.inputProps} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditDialogVisible(false)}>{t("common.cancel")}</Button>
            <Button onPress={() => handleSaveEdit(nameInput.value, descriptionInput.value)}>{t("common.save")}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Portal>
        <Dialog visible={syncDialogVisible} onDismiss={() => setSyncDialogVisible(false)}>
          <Dialog.Title>{t("projectView.syncProject")}</Dialog.Title>
          <Dialog.Content>
            <Text>{t("projectView.syncChooseOption")}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => handleConfirmSync(false)}>{t("projectView.syncDataOnly")}</Button>
            <Button onPress={() => handleConfirmSync(true)}>{t("projectView.syncDataAndMedia")}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Portal>
        <Dialog visible={isSyncing} dismissable={false}>
          <Dialog.Content style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator size="large" />
            <Text style={{ marginTop: 16 }}>{t("projectView.syncing")}</Text>
          </Dialog.Content>
        </Dialog>
      </Portal>

      {/* Vegetation Classifications Management Modal */}
      {project && (
        <VegetationClassificationsManagementModal
          projectId={project.id}
          visible={vegClassesModalVisible}
          onClose={() => {
            setVegClassesModalVisible(false);
            // Reload classifications list after closing
            getVegetationClassificationsByProject(project.id).then(classifications => {
              setCustomVegClassifications(classifications);
            });
          }}
          onClassificationsChanged={() => {
            // Reload classifications list when changed
            getVegetationClassificationsByProject(project.id).then(classifications => {
              setCustomVegClassifications(classifications);
            });
          }}
        />
      )}

      {/* Vegetation Classification Picker Modal - Opens when selecting custom type */}
      {project && customVegClassifications.length > 0 && (
        <VegetationClassificationPicker
          projectId={project.id}
          visible={vegClassificationSelectorVisible}
          onClose={() => {
            setVegClassificationSelectorVisible(false);
            // Reload the configuration after closing
            if (project.id) {
              getActiveVegetationClassificationConfig(project.id).then(config => {
                if (config) {
                  setVegClassificationType(config.type);
                  if (config.type === "custom" && config.classificationId) {
                    getVegetationClassificationById(config.classificationId).then(classification => {
                      if (classification) {
                        setActiveVegClassification(classification);
                      }
                    });
                  } else {
                    setActiveVegClassification(null);
                  }
                }
              });
            }
          }}
          onConfigChange={() => {
            // Reload configuration when it changes
            if (project && project.id) {
              getActiveVegetationClassificationConfig(project.id).then(config => {
                if (config) {
                  setVegClassificationType(config.type);
                  if (config.type === "custom" && config.classificationId) {
                    getVegetationClassificationById(config.classificationId).then(classification => {
                      if (classification) {
                        setActiveVegClassification(classification);
                      }
                    });
                  } else {
                    setActiveVegClassification(null);
                  }
                }
              });
            }
          }}
        />
      )}


    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 16 },
  card: { marginBottom: 16 },
  cardTitle: { fontWeight: "bold" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  infoGrid: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12, gap: 12 },
  infoGridItem: { flex: 1 },
  pointCard: { marginBottom: 8 },
  pointHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  emptyState: { padding: 20, alignItems: "center" },
  vizRow: { flexDirection: "row", gap: 8 },
  vizItem: { flex: 1, borderRadius: 8, padding: 10 },
  vizItemHeader: { flexDirection: "row", alignItems: "center", gap: 4 },
  vizItemTitle: { flex: 1, fontWeight: "600" },
  vizItemButton: { margin: -6 },
});