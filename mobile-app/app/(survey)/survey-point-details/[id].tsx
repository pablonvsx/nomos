// src/app/survey-point-details/[id].tsx
// Tela unificada de detalhes de ponto (oficial e personalizado)
import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import {
  Text,
  Card,
  Button,
  useTheme as usePaperTheme,
  ActivityIndicator,
  IconButton,
  FAB,
  Portal,
  Dialog,
  Divider,
  Modal,
  Chip,
} from "react-native-paper";
import {
  useRouter,
  Stack,
  useLocalSearchParams,
  useFocusEffect,
} from "expo-router";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { AudioPlayer } from "expo-audio";
import { useAlertDialog } from "@/hooks/use-dialog";
import { useBottomContentPadding } from "@/hooks/use-bottom-content-padding";
import { useI18n } from "@/contexts/i18n-context";
import { useMapData } from "@/contexts/map-data-context";
import {
  resolveManifestId,
  useProtocolRegistry,
  useReadOnlyRendererRegistry,
} from "@/contexts/protocol-registry-context";

// DB imports
import { getPoint, deletePoint } from "@/db/queries/points";
import { getProjectById } from "@/db/queries/projects";
import { submitPointToProject } from "@/core/drive-sync/point-submission-service";
import { exportPointsPackage } from "@/core/project-sharing/export-points";
import { getCustomProtocolById } from "@/db/queries/custom-protocols";
import { getSpeciesByPoint } from "@/db/queries/species";
import { getPointDisplayLabel } from "@/core/drive-sync/point-label";
import { Point, PointModule, Project, CustomProtocol, Species } from "@/types/database";
import { parseJsonText, parsePhotoUris } from "@/db/mappers/json-utils";
import { formatAzimuthDisplay } from "@/utils/azimuth";
import SpeciesInput from "@/components/survey/SpeciesInput";

import { buildCustomModuleDescriptor } from "@/modules/custom/manifest";
import type { ModuleDescriptor, FieldSchema, LanguageCode } from "@/protocol-kernel/types";

const screenWidth = Dimensions.get("window").width;
// Photo cards show at most 2 rows of 3 thumbnails; the rest sit behind a "view all" gallery.
const PHOTO_GRID_LIMIT = 6;

// --- Helper Functions ---

const safeJsonParse = (jsonString: string | null | undefined) => {
  return parseJsonText<unknown | null>(jsonString, null);
};

const parseNoteList = (rawNotes: string | undefined | null) => {
  const parsed = parseJsonText<string[] | string | null>(rawNotes, null);
  if (Array.isArray(parsed)) return parsed.filter(Boolean);
  if (typeof parsed === "string" && parsed.trim()) return [parsed.trim()];
  if (typeof rawNotes === "string" && rawNotes.trim()) return [rawNotes.trim()];
  return [] as string[];
};

const parseAudioNoteList = (rawAudioNotes: string | undefined | null) => {
  return parseJsonText<{ uri: string; duration: number; timestamp: number }[]>(
    rawAudioNotes,
    [],
    (value): value is { uri: string; duration: number; timestamp: number }[] =>
      Array.isArray(value) &&
      value.every(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { uri?: unknown }).uri === "string",
      ),
  );
};

const formatDuration = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

type AudioNote = { uri: string; duration: number; timestamp: number };

// List of audio notes with playback, with its own playback state
// (not shared with the screen): allows multiple lists on the same screen
// (e.g. several audio_notes_input fields from a custom protocol) without
// one "stealing" the play icon from another.
function AudioNoteList({ audioNotes }: { audioNotes: AudioNote[] }) {
  const paperTheme = usePaperTheme();
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.remove();
        playerRef.current = null;
      }
    };
  }, []);

  const handlePlayPause = async (index: number, uri: string) => {
    if (playingIndex === index) {
      if (playerRef.current) {
        playerRef.current.remove();
        playerRef.current = null;
      }
      setPlayingIndex(null);
      setCurrentTime(0);
      setDuration(0);
      return;
    }
    if (playerRef.current) {
      playerRef.current.remove();
      playerRef.current = null;
    }
    setPlayingIndex(null);
    setCurrentTime(0);
    setDuration(0);
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const player = createAudioPlayer({ uri });
      player.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) {
          player.remove();
          if (playerRef.current === player) playerRef.current = null;
          setPlayingIndex(null);
          setCurrentTime(0);
          setDuration(0);
        } else {
          setCurrentTime(status.currentTime ?? 0);
          setDuration(status.duration ?? 0);
        }
      });
      playerRef.current = player;
      player.play();
      setPlayingIndex(index);
    } catch {
      setPlayingIndex(null);
    }
  };

  return (
    <>
      {audioNotes.map((note, index) => (
        <View
          key={`audio-${note.timestamp ?? index}`}
          style={[
            styles.noteViewCard,
            { borderColor: paperTheme.colors.outlineVariant, backgroundColor: paperTheme.colors.surfaceVariant },
            index < audioNotes.length - 1 && { marginBottom: 8 },
          ]}
        >
          <View style={styles.noteViewRow}>
            <IconButton
              icon={playingIndex === index ? "pause" : "play"}
              size={22}
              iconColor={paperTheme.colors.primary}
              style={{ margin: 0, marginRight: 4 }}
              onPress={() => handlePlayPause(index, note.uri)}
            />
            <View style={{ flex: 1, justifyContent: "center" }}>
              <Text variant="bodyMedium" style={{ color: paperTheme.colors.onSurface, fontWeight: "600" }}>
                {`audio_note_${index + 1}`}
              </Text>
              <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant, fontVariant: ["tabular-nums"] }}>
                {note.duration > 0 ? `${formatDuration(note.duration)} · ` : ""}
                {note.timestamp > 0
                  ? `${new Date(note.timestamp).toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "2-digit" })} ${new Date(note.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </Text>
            </View>
          </View>
          {playingIndex === index && (
            <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text variant="labelSmall" style={{ color: paperTheme.colors.primary, fontVariant: ["tabular-nums"], minWidth: 32 }}>
                  {formatDuration(currentTime)}
                </Text>
                <View style={{ flex: 1, height: 3, backgroundColor: paperTheme.colors.outlineVariant, borderRadius: 2, overflow: "hidden" }}>
                  <View
                    style={{
                      height: 3,
                      backgroundColor: paperTheme.colors.primary,
                      borderRadius: 2,
                      width: `${duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0}%`,
                    }}
                  />
                </View>
                <Text variant="labelSmall" style={{ color: paperTheme.colors.onSurfaceVariant, fontVariant: ["tabular-nums"], minWidth: 32, textAlign: "right" }}>
                  {formatDuration(note.duration > 0 ? note.duration : duration)}
                </Text>
              </View>
            </View>
          )}
        </View>
      ))}
    </>
  );
}

export default function UnifiedSurveyPointViewScreen() {
  const router = useRouter();
  const paperTheme = usePaperTheme();
  const { id, projectId } = useLocalSearchParams<{ id: string; projectId?: string }>();
  const { confirm, alert } = useAlertDialog();
  const { t, currentLanguage } = useI18n();
  const { clearMapData } = useMapData();
  const registry = useProtocolRegistry();
  const readOnlyRendererRegistry = useReadOnlyRendererRegistry();
  const bottomPadding = useBottomContentPadding(36); // extra clearance for the floating FAB.Group below the scroll
  const [point, setPoint] = useState<Point | null>(null);
  const [pointModules, setPointModules] = useState<PointModule[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [customProtocol, setCustomProtocol] = useState<CustomProtocol | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [galleryPhotos, setGalleryPhotos] = useState<string[] | null>(null);
  const [speciesList, setSpeciesList] = useState<Species[]>([]);

  const resolvedId = project ? resolveManifestId(project) : null;
  const isCustom = resolvedId === "custom";
  const isOfficial = resolvedId !== null && !isCustom;

  // Load species for official protocols
  useEffect(() => {
    const loadSpecies = async () => {
      if (isOfficial && point) {
        try {
          const species = await getSpeciesByPoint(point.id);
          setSpeciesList(species || []);
        } catch (error) {
          console.error("Error loading species:", error);
          setSpeciesList([]);
        }
      }
    };
    loadSpecies();
  }, [point, isOfficial]);

  // Official-protocol (paisageo) modules, resolved the same way custom
  // modules already were below: through the manifest registered in the
  // kernel, not hardcoded per-module imports. Each module's own
  // `.deserialize()` is the single source of truth for its "no data yet"
  // shape (e.g. soil's `{ mode: "simple" }`), same fallback the collection
  // screen's loadData (form.tsx) already relies on for a missing point_module.
  const officialManifest = useMemo(() => {
    if (!isOfficial || !resolvedId) return null;
    return registry.getProtocol(resolvedId) ?? null;
  }, [isOfficial, resolvedId, registry]);

  const officialModuleData = useMemo<Record<string, unknown>>(() => {
    if (!officialManifest) return {};
    const result: Record<string, unknown> = {};
    for (const module of officialManifest.modules) {
      const mod = pointModules.find((m) => m.module_id === module.id);
      try {
        result[module.id] = mod ? module.deserialize(mod.data_json) : module.deserialize(JSON.stringify(null));
      } catch {
        result[module.id] = module.deserialize(JSON.stringify(null));
      }
    }
    return result;
  }, [officialManifest, pointModules]);

  // Renders one official module's read-only card via the registry-dispatched
  // component - mirrors renderModuleCard in form.tsx, but against the
  // separate read-only registry (Fase 5 of the plugin-architecture
  // migration), so the interactive collection renderers stay untouched.
  const renderOfficialModuleCard = (moduleId: string) => {
    const Renderer = readOnlyRendererRegistry.get(moduleId);
    if (!Renderer) return null;
    return <Renderer key={moduleId} value={officialModuleData[moduleId]} language={(currentLanguage as LanguageCode) ?? "pt"} />;
  };

  // Custom-protocol modules, resolved through the same kernel mechanism the
  // collection screen (form.tsx) uses - buildCustomModuleDescriptor turns
  // each section into a real ModuleDescriptor, so field iteration below reads
  // FieldSchema/DynamicGroupRule instead of raw CustomFieldConfig, and this
  // screen no longer needs its own bespoke JSON-merging logic.
  const customModules = useMemo<ModuleDescriptor[]>(() => {
    if (!isCustom || !customProtocol) return [];
    return customProtocol.schema.sections.map(buildCustomModuleDescriptor);
  }, [isCustom, customProtocol]);

  // Deserialized data per module id (kept separate per section, unlike the
  // old flat merge, since field ids are only guaranteed unique within their
  // own section).
  const customModuleData = useMemo<Record<string, Record<string, unknown>>>(() => {
    const result: Record<string, Record<string, unknown>> = {};
    for (const module of customModules) {
      const mod = pointModules.find((m) => m.module_id === module.id);
      if (!mod) {
        result[module.id] = {};
        continue;
      }
      try {
        result[module.id] = module.deserialize(mod.data_json) as Record<string, unknown>;
      } catch {
        result[module.id] = {};
      }
    }
    return result;
  }, [customModules, pointModules]);

  // Load point data
  const loadData = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const result = await getPoint(id);

      if (!result) {
        console.error(`Point not found. ID: ${id}`);
        alert(t("common.error"), t("surveyView.pointNotFound"));
        router.back();
        return;
      }

      const { point: p, modules } = result;

      // Verify project match if projectId is provided
      if (projectId && Number(p.project_id) !== Number(projectId)) {
        console.error(`Point project mismatch. Expected ${projectId}, got ${p.project_id}`);
        alert(t("common.error"), t("surveyView.pointNotFound"));
        router.back();
        return;
      }

      setPoint(p);
      setPointModules(modules);

      const proj = await getProjectById(p.project_id);
      if (!proj) {
        alert(t("common.error"), t("surveyView.pointNotFound"));
        router.back();
        return;
      }
      setProject(proj);

      if (resolveManifestId(proj) === "custom") {
        try {
          const prot = await getCustomProtocolById(Number(proj.protocol_id));
          setCustomProtocol(prot);
        } catch (e) {
          console.error("Error loading custom protocol def:", e);
        }
      }
    } catch (error) {
      console.error("Error loading survey point:", error);
      alert(t("common.error"), t("surveyView.loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [id, projectId, alert, router, t]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleDelete = () => {
    if (!point) return;

    const isApprovedCollaborativePoint =
      project?.collaboration_role === "owner" && point.approval_status === "approved";
    const deleteMessage = isApprovedCollaborativePoint
      ? t("surveyView.deletePointConfirmApprovedCollaborative")
      : t("surveyView.deletePointConfirm");

    confirm(
      t("surveyView.deletePoint"),
      deleteMessage,
      async () => {
        try {
          await deletePoint(point.id);
          clearMapData(point.project_id);
          router.back();
        } catch (error) {
          console.error("Error deleting point:", error);
          alert(t("common.error"), t("surveyView.deleteError"));
        }
      },
      () => {},
      t("common.delete"),
      t("common.cancel"),
      true,
    );
  };

  const handleSubmitPoint = async () => {
    if (!point || !project) return;
    setIsSubmitting(true);
    try {
      const result = await submitPointToProject(point.id, project.id, registry);
      await loadData();
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
      setIsSubmitting(false);
    }
  };

  const handleExportToOwner = async () => {
    if (!point) return;
    try {
      await exportPointsPackage([point.id], registry);
    } catch (error) {
      console.error("Error exporting point package:", error);
      alert(t("common.error"), error instanceof Error ? error.message : t("surveyView.exportToOwnerError"));
    }
  };

  const handleEdit = () => {
    if (!point || !project || isNavigating) return;
    setIsNavigating(true);

    if (isOfficial) {
      router.push(
        `/survey/form?surveyPointId=${point.id}&projectId=${project.id}&protocolId=${point.protocol_id}` as any,
      );
    } else {
      router.push(
        `/survey/form?surveyPointId=${point.id}&projectId=${project.id}&protocolId=custom&customProtocolDbId=${project.protocol_id}` as any,
      );
    }

    setTimeout(() => setIsNavigating(false), 1000);
  };

  const handleEditLocation = () => {
    if (!point || !project || isNavigating) return;
    setIsNavigating(true);

    router.push(
      `/insert-location?projectId=${project.id}&surveyPointId=${point.id}&latitude=${point.lat}&longitude=${point.lon}&altitude=${point.altitude ?? ""}` as any,
    );

    setTimeout(() => setIsNavigating(false), 1000);
  };

  const handleViewMap = () => {
    if (!project || !point || isNavigating) return;
    setIsNavigating(true);
    router.push(
      `/view-map?projectId=${project.id}&highlightSurveyPointId=${point.id}` as any,
    );
    setTimeout(() => setIsNavigating(false), 1000);
  };

  // Deserializes field values whose editor writes a JSON string inside the
  // field's own value (the whole section is already a JSON blob; these types
  // re-serialize their own list/array within it). Switches on field.renderAs
  // (the original CustomFieldType, preserved by fieldToSchema in
  // modules/custom/manifest.ts), not field.type (the abstracted kernel type).
  const normalizeCustomFieldValue = (field: FieldSchema, rawValue: unknown): unknown => {
    switch (field.renderAs) {
      case "photo_input":
        return parsePhotoUris(rawValue);
      case "tags_input":
        return parseJsonText<any[]>(rawValue as any, [], Array.isArray);
      case "notes_list":
        return parseNoteList(rawValue as string | undefined | null);
      case "audio_notes_input":
        return parseAudioNoteList(rawValue as string | undefined | null);
      case "species_list":
        return parseJsonText<Species[]>(rawValue as any, [], Array.isArray);
      default:
        return rawValue;
    }
  };

  // Renders a custom-protocol field's value as plain text.
  const renderFieldValue = (field: FieldSchema, value: any): string => {
    if (value === null || value === undefined || value === "") return "-";
    switch (field.renderAs) {
      case "checkbox":
      case "tags_input":
        return Array.isArray(value) && value.length > 0 ? value.join(", ") : "-";
      case "yes_no":
        return value === true ? t("common.yes") : value === false ? t("common.no") : "-";
      case "number":
        return field.unit ? `${value} ${field.unit}` : `${value}`;
      case "percentage":
        return `${value}%`;
      case "azimuth": {
        const numValue = typeof value === "number" ? value : Number(value);
        return Number.isFinite(numValue) ? formatAzimuthDisplay(numValue, t) : "-";
      }
      case "rating":
        return value !== null && value !== undefined ? `${value}/${field.max}` : "-";
      default:
        return value?.toString() || "-";
    }
  };

  // Resolves how a field (fixed or a repeatable-group sub-field) should be
  // displayed, including the types that need a dedicated widget instead of
  // plain text (photo, notes, audio, species). Reused both by the top-level
  // field map and by each item of a repeatable group. Takes the
  // ALREADY-NORMALIZED value (normalizeCustomFieldValue is not idempotent for
  // some types - e.g. re-parsing an already-parsed array with parseJsonText
  // would wipe it to the fallback - so callers normalize exactly once).
  const renderCustomFieldDisplay = (field: FieldSchema, value: any) => {
    if (field.renderAs === "photo_input") {
      return value.length > 0 ? renderPhotoGrid(value) : (
        <Text variant="bodyMedium" style={{ color: paperTheme.colors.onSurface }}>-</Text>
      );
    }
    if (field.renderAs === "notes_list") {
      return value.length > 0 ? renderNoteRows(value) : (
        <Text variant="bodyMedium" style={{ color: paperTheme.colors.onSurface }}>-</Text>
      );
    }
    if (field.renderAs === "audio_notes_input") {
      return value.length > 0 ? <AudioNoteList audioNotes={value} /> : (
        <Text variant="bodyMedium" style={{ color: paperTheme.colors.onSurface }}>-</Text>
      );
    }
    if (field.renderAs === "species_list") {
      return (
        <SpeciesInput
          projectId={project!.id}
          surveyPointId={point!.id}
          value={value}
          onChange={() => {}}
          editable={false}
        />
      );
    }
    return (
      <Text variant="bodyMedium" style={{ color: paperTheme.colors.onSurface }}>
        {renderFieldValue(field, value)}
      </Text>
    );
  };

  const renderNoteRows = (notes: string[]) => (
    <>
      {notes.map((note, index) => (
        <View
          key={`note-${index}`}
          style={[
            styles.noteViewCard,
            { borderColor: paperTheme.colors.outlineVariant, backgroundColor: paperTheme.colors.surfaceVariant },
            index < notes.length - 1 && { marginBottom: 8 },
          ]}
        >
          <View style={styles.noteViewRow}>
            <View style={[styles.noteViewBadge, { backgroundColor: paperTheme.colors.primary }]}>
              <Text variant="labelSmall" style={{ color: paperTheme.colors.onPrimary }}>{index + 1}</Text>
            </View>
            <Text variant="bodyMedium" style={{ flex: 1, color: paperTheme.colors.onSurface, lineHeight: 22 }}>
              {note}
            </Text>
          </View>
        </View>
      ))}
    </>
  );

  // Photo thumbnail grid, shared between PAISAGEO (point.photos,
  // already normalized in parsedPhotos) and Custom (photo_input field,
  // already normalized by normalizeCustomFieldValue) - both go through
  // parsePhotoUris before reaching here, so they always receive a plain string[].
  const renderPhotoGrid = (uris: string[]) => {
    if (uris.length === 0) return null;
    const visibleUris = uris.slice(0, PHOTO_GRID_LIMIT);
    const hasMorePhotos = uris.length > PHOTO_GRID_LIMIT;
    return (
      <View>
        <View style={styles.photoContainer}>
          {visibleUris.map((uri, index) => (
            <TouchableOpacity
              key={`photo-preview-${index}`}
              onPress={() => setSelectedPhoto(uri)}
              style={styles.photoWrapper}
            >
              <Image source={{ uri }} style={styles.thumbnail} resizeMode="cover" />
            </TouchableOpacity>
          ))}
        </View>
        {hasMorePhotos && (
          <Button mode="text" compact onPress={() => setGalleryPhotos(uris)} style={{ alignSelf: "flex-start" }}>
            {t("surveyView.viewAllPhotos", { count: uris.length })}
          </Button>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: paperTheme.colors.background }]}>
        <Stack.Screen options={{ title: t("common.loading"), headerBackTitle: "" }} />
        <ActivityIndicator size="large" color={paperTheme.colors.primary} />
        <Text style={{ marginTop: 16 }}>{t("common.loading")}</Text>
      </View>
    );
  }

  if (!point || !project) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: paperTheme.colors.background }]}>
        <Stack.Screen options={{ title: t("common.error"), headerBackTitle: "" }} />
        <Text>{t("surveyView.pointNotFound")}</Text>
      </View>
    );
  }

  // Single-owner model: whoever has this project locally is its owner, so
  // there is no other party who could hold a conflicting edit permission.
  const canModify = true;

  const pointLabel = isOfficial ? t("surveyView.point") : t("surveyView.parcela");
  const pointDisplayLabel = getPointDisplayLabel({
    pointNumber: point.point_number,
    createdBy: point.created_by ?? null,
  });

  // Derived data for the PAISAGEO session
  const conservationStatus = (officialModuleData["vegetation"] as any)?.conservation_status as string | undefined;
  const isSubstituted = conservationStatus === "substituida";
  const parsedPhotos: string[] = parsePhotoUris(point.photos);

  return (
    <>
      <Stack.Screen
        options={{
          title: `${pointLabel} ${pointDisplayLabel}`,
          headerBackTitle: "",
        }}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: paperTheme.colors.background }]}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
      >
        <View style={styles.content}>

          {/* 1. PROJECT INFO CARD */}
          <Card style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}>
            <Card.Content>
              <Text variant="titleMedium" style={{ color: paperTheme.colors.primary }}>
                {project.name}
              </Text>
              {project.collaboration_role === "owner" ? (
                <Chip compact style={{ alignSelf: "flex-start", marginTop: 8 }}>
                  {t(`surveyView.status_${point.approval_status ?? "local"}`)}
                </Chip>
              ) : null}
              {project.collaboration_role === "owner" && point.approval_status === "rejected" && point.rejection_reason ? (
                <Text variant="bodySmall" style={{ color: paperTheme.colors.error, marginTop: 4 }}>
                  {t("surveyView.rejectionReasonLabel")}: {point.rejection_reason}
                </Text>
              ) : null}
              <Divider style={{ marginVertical: 12 }} />
              <View style={styles.twoColumnRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
                    {t("surveyView.createdAt")}
                  </Text>
                  <Text variant="bodySmall">
                    {new Date(point.created_at).toLocaleString()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
                    {t("surveyView.lastUpdated")}
                  </Text>
                  <Text variant="bodySmall">
                    {new Date(point.updated_at).toLocaleString()}
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>

          {/* LANDSCAPE NAME CARD */}
          {isOfficial && point.generated_name ? (
            <Card style={[styles.card, { backgroundColor: paperTheme.colors.primaryContainer }]}>
              <Card.Content>
                <Text
                  variant="labelSmall"
                  style={{ color: paperTheme.colors.onPrimaryContainer, opacity: 0.8, marginBottom: 6 }}
                >
                  {t("surveyView.landscapeName")}
                </Text>
                <Text
                  variant="titleMedium"
                  style={{
                    color: paperTheme.colors.onPrimaryContainer,
                    fontWeight: "bold",
                    textAlign: "justify",
                    lineHeight: 24,
                  }}
                >
                  {point.generated_name}
                </Text>
              </Card.Content>
            </Card>
          ) : null}

          {/* 2. LOCATION CARD */}
          <Card style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}>
            <Card.Content>
              <View style={styles.titleRow}>
                <Text variant="titleMedium" style={{ color: paperTheme.colors.primary, flex: 1 }}>
                  {t("location.title")}
                </Text>
                <IconButton icon="map" size={20} onPress={handleViewMap} style={{ margin: 0 }} />
              </View>
              <View style={styles.coordRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
                    {t("location.latitude")}
                  </Text>
                  <Text variant="bodyMedium">{point.lat.toFixed(6)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
                    {t("location.longitude")}
                  </Text>
                  <Text variant="bodyMedium">{point.lon.toFixed(6)}</Text>
                </View>
              </View>
              <View style={[styles.coordRow, { marginTop: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
                    {t("location.altitude")}
                  </Text>
                  <Text variant="bodyMedium">
                    {point.altitude ? `${point.altitude.toFixed(1)} m` : "-"}
                  </Text>
                </View>
                {isOfficial && (
                  <View style={{ flex: 1 }}>
                    <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
                      {t("surveyView.pointSize")}
                    </Text>
                    <Text variant="bodyMedium">
                      {point.point_size ? `${point.point_size} m²` : "-"}
                    </Text>
                  </View>
                )}
              </View>
            </Card.Content>
          </Card>

          {/* ======================================================= */}
          {/* OFFICIAL PROTOCOL CONTENT SECTION                       */}
          {/* ======================================================= */}
          {isOfficial && (
            <>
              {/* 3. VEGETATION CARD */}
              {renderOfficialModuleCard("vegetation")}

              {/* FLORISTIC RECORD CARD */}
              {!isSubstituted && (
                <Card style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}>
                  <Card.Content>
                    <Text variant="titleMedium" style={{ color: paperTheme.colors.primary, marginBottom: 12 }}>
                      {t("surveyView.vegSpecies")}
                    </Text>
                    <SpeciesInput
                      projectId={project.id}
                      surveyPointId={point.id}
                      value={speciesList}
                      onChange={() => {}}
                      editable={false}
                    />
                  </Card.Content>
                </Card>
              )}

              {/* 4. GEOECOLOGICAL CONSTRAINTS (Geomorphology + Surface Cover +
                  Soil Profile merged into one registry-dispatched card - see
                  GeoecologicalConstraintsModuleReadOnlyRenderer). */}
              {renderOfficialModuleCard("geoecological_constraints")}

              {/* 5. IMPACTS */}
              {renderOfficialModuleCard("impacts")}

              {/* 6. PHOTOS */}
              {parsedPhotos.length > 0 && (
                <Card style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}>
                  <Card.Content>
                    <Text variant="titleMedium" style={{ color: paperTheme.colors.primary, marginBottom: 12 }}>{t("surveyView.photos")}</Text>
                    {renderPhotoGrid(parsedPhotos)}
                  </Card.Content>
                </Card>
              )}

              {/* 7. NOTES */}
              {(() => {
                const notesList = parseNoteList(point.additional_notes);
                if (notesList.length === 0) return null;
                return (
                  <Card style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}>
                    <Card.Content>
                      <Text variant="titleMedium" style={{ color: paperTheme.colors.primary, marginBottom: 12 }}>
                        {t("survey.noteCardTitle")}
                      </Text>
                      {renderNoteRows(notesList)}
                    </Card.Content>
                  </Card>
                );
              })()}

              {/* 8. AUDIO NOTES */}
              {(() => {
                const audioNotes = parseAudioNoteList(point.audio_notes);
                if (audioNotes.length === 0) return null;
                return (
                  <Card style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}>
                    <Card.Content>
                      <Text variant="titleMedium" style={{ color: paperTheme.colors.primary, marginBottom: 12 }}>
                        {t("audio.sectionTitle")}
                      </Text>
                      <AudioNoteList audioNotes={audioNotes} />
                    </Card.Content>
                  </Card>
                );
              })()}
            </>
          )}

          {/* ======================================================= */}
          {/* CUSTOM PROTOCOL CONTENT SECTION                         */}
          {/* ======================================================= */}
          {isCustom && customModules.map((module, sectionIndex) => {
            const data = customModuleData[module.id] ?? {};

            // Prefab scientific modules attached via moduleRef (e.g.
            // "vegetation") have their own specialized read-only renderer,
            // registered the same way PAISAGEO's is - reuse it instead of
            // the generic per-field display below (which has nothing to
            // iterate anyway, since moduleRef sections have empty `fields`).
            const SharedReadOnlyRenderer = readOnlyRendererRegistry.get(module.id);
            if (SharedReadOnlyRenderer) {
              return (
                <SharedReadOnlyRenderer
                  key={module.id}
                  value={data}
                  language={(currentLanguage as LanguageCode) ?? "pt"}
                />
              );
            }

            const section = customProtocol!.schema.sections[sectionIndex];
            const dynamicGroups = module.schema.dynamic ?? [];
            const totalEntries = module.schema.fields.length + dynamicGroups.length;
            let entryIndex = 0;
            return (
              <Card key={module.id} style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}>
                <Card.Content>
                  <Text variant="titleMedium" style={[styles.sectionTitle, { color: paperTheme.colors.primary }]}>
                    {section.title}
                  </Text>
                  {section.description && (
                    <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary, marginBottom: 12 }}>
                      {section.description}
                    </Text>
                  )}
                  {module.schema.fields.map((field) => {
                    const value = normalizeCustomFieldValue(field, data[field.id]) as any;
                    entryIndex += 1;
                    const isLast = entryIndex >= totalEntries;
                    return (
                      <View key={field.id} style={styles.fieldContainer}>
                        <Text variant="labelLarge" style={{ marginBottom: 4 }}>
                          {field.label[currentLanguage] ?? field.label.pt}
                        </Text>
                        {renderCustomFieldDisplay(field, value)}
                        {!isLast && <Divider style={{ marginTop: 12 }} />}
                      </View>
                    );
                  })}
                  {dynamicGroups.map((group) => {
                    const items = (data[group.groupId] as Record<string, unknown>[] | undefined) ?? [];
                    const groupLabel = group.label?.[currentLanguage] ?? group.label?.pt ?? group.groupId;
                    entryIndex += 1;
                    const isLast = entryIndex >= totalEntries;
                    return (
                      <View key={group.groupId} style={styles.fieldContainer}>
                        <Text variant="labelLarge" style={{ marginBottom: 4 }}>{groupLabel}</Text>
                        {items.length === 0 ? (
                          <Text variant="bodyMedium" style={{ color: paperTheme.colors.onSurface }}>-</Text>
                        ) : (
                          <View>
                            {items.map((item, itemIndex) => (
                              <View
                                key={itemIndex}
                                style={{
                                  marginBottom: itemIndex < items.length - 1 ? 12 : 0,
                                  backgroundColor: paperTheme.colors.elevation.level2,
                                  padding: 12,
                                  borderRadius: 8,
                                }}
                              >
                                <Text variant="titleSmall" style={{ color: paperTheme.colors.primary, marginBottom: 8 }}>
                                  {groupLabel} {itemIndex + 1}
                                </Text>
                                {group.itemFields.map((subField, subIndex) => (
                                  <View
                                    key={subField.id}
                                    style={{ marginBottom: subIndex < group.itemFields.length - 1 ? 8 : 0 }}
                                  >
                                    <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
                                      {subField.label[currentLanguage] ?? subField.label.pt}
                                    </Text>
                                    {renderCustomFieldDisplay(
                                      subField,
                                      normalizeCustomFieldValue(subField, item[subField.id]),
                                    )}
                                  </View>
                                ))}
                              </View>
                            ))}
                          </View>
                        )}
                        {!isLast && <Divider style={{ marginTop: 12 }} />}
                      </View>
                    );
                  })}
                </Card.Content>
              </Card>
            );
          })}
        </View>
      </ScrollView>

      <FAB.Group
        open={fabOpen}
        visible
        icon={fabOpen ? "close" : "dots-vertical"}
        color={paperTheme.colors.onPrimary}
        fabStyle={{ backgroundColor: paperTheme.colors.primary }}
        actions={[
          ...(canModify
            ? [
                {
                  icon: "pencil",
                  label: t("common.edit"),
                  onPress: () => { if (!isNavigating) handleEdit(); },
                  color: paperTheme.dark ? paperTheme.colors.onSurface : paperTheme.colors.primary,
                },
                {
                  icon: "map-marker-radius",
                  label: t("surveyView.editLocation"),
                  onPress: () => { if (!isNavigating) handleEditLocation(); },
                  color: paperTheme.dark ? paperTheme.colors.onSurface : paperTheme.colors.primary,
                },
              ]
            : []),
          ...(project.collaboration_role === "owner" && canModify
            ? [
                {
                  icon: "cloud-upload",
                  label: point.approval_status === "approved"
                    ? t("surveyView.resendCorrection")
                    : t("surveyView.submitToProject"),
                  onPress: isSubmitting ? () => {} : handleSubmitPoint,
                  color: paperTheme.dark ? paperTheme.colors.onSurface : paperTheme.colors.primary,
                },
              ]
            : []),
          ...(canModify
            ? [
                {
                  icon: "export-variant",
                  label: t("surveyView.exportToOwner"),
                  onPress: handleExportToOwner,
                  color: paperTheme.dark ? paperTheme.colors.onSurface : paperTheme.colors.primary,
                },
              ]
            : []),
          ...(canModify
            ? [
                {
                  icon: "delete",
                  label: t("common.delete"),
                  onPress: handleDelete,
                  color: paperTheme.dark ? paperTheme.colors.onSurface : paperTheme.colors.primary,
                },
              ]
            : []),
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
        <Dialog visible={isSubmitting} dismissable={false}>
          <Dialog.Content style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator size="large" />
            <Text style={{ marginTop: 16 }}>{t("surveyView.submitting")}</Text>
          </Dialog.Content>
        </Dialog>
        <Modal
          visible={!!galleryPhotos}
          onDismiss={() => setGalleryPhotos(null)}
          contentContainerStyle={[styles.galleryModalContainer, { backgroundColor: paperTheme.colors.background }]}
        >
          <View style={styles.galleryHeader}>
            <Text variant="titleMedium" style={{ flex: 1 }}>
              {t("surveyView.photos")} ({galleryPhotos?.length ?? 0})
            </Text>
            <IconButton icon="close" onPress={() => setGalleryPhotos(null)} />
          </View>
          <ScrollView contentContainerStyle={[styles.photoContainer, { padding: 16 }]}>
            {(galleryPhotos ?? []).map((uri, index) => (
              <TouchableOpacity
                key={`gallery-photo-${index}`}
                onPress={() => setSelectedPhoto(uri)}
                style={styles.photoWrapper}
              >
                <Image source={{ uri }} style={styles.thumbnail} resizeMode="cover" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Modal>

        <Dialog
          visible={!!selectedPhoto}
          onDismiss={() => setSelectedPhoto(null)}
          style={isCustom ? undefined : { backgroundColor: "black" }}
        >
          <Dialog.Content>
            {selectedPhoto && <Image source={{ uri: selectedPhoto }} style={styles.fullPhoto} resizeMode="contain" />}
          </Dialog.Content>
          {isCustom && <Dialog.Actions><Button onPress={() => setSelectedPhoto(null)}>{t("common.close")}</Button></Dialog.Actions>}
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContent: { justifyContent: "center", alignItems: "center" },
  content: { padding: 16 },
  card: { marginBottom: 16, elevation: 2 },
  sectionTitle: { marginBottom: 12, fontWeight: "600" },
  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  coordRow: { flexDirection: "row", gap: 16 },
  twoColumnRow: { flexDirection: "row", gap: 16, marginBottom: 8 },
  fieldContainer: { marginBottom: 12 },
  photoContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  // -16 subtracts the two 8px gaps of photoContainer between the 3 columns; without this the
  // third photo in the row wouldn't fit and would wrap to the next row (2 columns x 3 rows).
  photoWrapper: { width: (screenWidth - 64 - 16) / 3, height: (screenWidth - 64 - 16) / 3, borderRadius: 8, overflow: "hidden" },
  thumbnail: { width: "100%", height: "100%" },
  fullPhoto: { width: "100%", height: 400 },
  galleryModalContainer: { flex: 1, margin: 0 },
  galleryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  noteViewCard: { borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  noteViewRow: { flexDirection: "row", alignItems: "flex-start", padding: 12 },
  noteViewBadge: { borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center", marginRight: 10, marginTop: 2, flexShrink: 0 },
});
