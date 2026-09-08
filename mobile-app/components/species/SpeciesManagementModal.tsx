/**
 * Species Management Modal/Screen
 * Manages project species catalog with GBIF integration
 * Allows searching, adding, editing, and removing species
 */

import React, { useState, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  ActivityIndicator,
} from "react-native";
import {
  Modal,
  Portal,
  Text,
  Button,
  TextInput,
  Card,
  useTheme,
  IconButton,
  Divider,
  Dialog,
  Icon,
  SegmentedButtons,
} from "react-native-paper";
import SpeciesSearchProgressDialog, { SearchDialogPhase } from "./SpeciesSearchProgressDialog";
import FamilyGenusCollapsibleTree from "./FamilyGenusCollapsibleTree";
import SpeciesResultCard from "./SpeciesResultCard";
import { groupByFamilyAndGenus } from "@/core/species-catalog/group-by-taxonomy";
import { useI18n } from "@/contexts/i18n-context";
import { useAlertDialog } from "@/hooks/use-dialog";
import {
  searchPlantsNearby,
  getGBIFOccurrenceCount,
} from "@/core/species-catalog/gbif";
import {
  searchPlantsNearbySpeciesLink,
  getSpeciesLinkOccurrenceCount,
} from "@/core/species-catalog/specieslink";
import { SpeciesSearchProgress, SearchCancelledError } from "@/core/species-catalog/search-progress";
import {
  getProjectSpeciesCatalogByProject,
  createProjectSpecies,
  deleteProjectSpecies,
  updateProjectSpecies,
  updateProjectSpeciesWithCommonNames,
  importSpeciesFromGBIF,
  deleteAllProjectSpeciesByProject,
  importSpeciesFromSpeciesLink,
  getProjectSpeciesById,
} from "@/db/queries/project-species";
import { pushSpeciesEntryIfCollaborative } from "@/core/drive-sync/reference-data-sync-service";
import { ProjectSpeciesCatalog } from "@/types/database";
import type { SpeciesLinkSearchResult } from "@/core/species-catalog/specieslink";
import { LocationPickerModal } from "@/components/survey/InsertLocationModal";
import { APIKeyManager } from "@/core/species-catalog/api-key-manager";
import { BUTTON_RADIUS, SEGMENTED_BUTTONS_SHAPE_THEME } from "@/constants/shape";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system/next";
import * as Sharing from "expo-sharing";
import {
  exportCatalogToJson,
  parseCatalogJson,
  CatalogParseError,
} from "@/core/species-catalog/species-catalog-sharing";
import { importSpeciesFromCatalog } from "@/db/queries/project-species";

interface SpeciesManagementModalProps {
  visible: boolean;
  projectId: number;
  latitude?: number;
  longitude?: number;
  onDismiss: () => void;
  onSpeciesImported?: (count: number) => void;
  mode?: "modal" | "screen";
}

const RADIUS_OPTIONS = [1, 5, 10, 20, 50] as const;

interface ManualSpeciesInput {
  scientificName: string;
  family?: string;
  genus?: string;
  commonNames: Array<{
    name: string;
    language: string;
  }>;
}

export default function SpeciesManagementModal({
  visible,
  projectId,
  latitude,
  longitude,
  onDismiss,
  onSpeciesImported,
  mode = "modal",
}: SpeciesManagementModalProps) {
  const theme = useTheme();
  const { t, currentLanguage } = useI18n();
  const { alert } = useAlertDialog();

  // States
  const [activeTab, setActiveTab] = useState<"search" | "manage">("search");
  const [searchSource, setSearchSource] = useState<"gbif" | "specieslink">("gbif");
  
  // Search by location
  const [radiusKm, setRadiusKm] = useState(5);
  const [selectedLocation, setSelectedLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(latitude && longitude ? { latitude, longitude } : null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // SpeciesLink search
  const [speciesLinkResults, setSpeciesLinkResults] = useState<SpeciesLinkSearchResult[]>([]);
  const [isSpeciesLinkSearching, setIsSpeciesLinkSearching] = useState(false);
  const [speciesLinkSearchText, setSpeciesLinkSearchText] = useState("");
  const [isSpeciesLinkConfigured, setIsSpeciesLinkConfigured] = useState(false);
  const [speciesLinkApiKey, setSpeciesLinkApiKey] = useState<string | null>(null);

  // Manual entry
  const [manualSpecies, setManualSpecies] = useState<ManualSpeciesInput>({
    scientificName: "",
    family: "",
    genus: "",
    commonNames: [{ name: "", language: currentLanguage }],
  });

  // Project species list
  const [projectSpecies, setProjectSpecies] = useState<ProjectSpeciesCatalog[]>([]);
  const [isLoadingSpecies, setIsLoadingSpecies] = useState(true);
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  const [expandedGenera, setExpandedGenera] = useState<Set<string>>(new Set());
  const [catalogSearchText, setCatalogSearchText] = useState("");
  const [gbifSearchText, setGbifSearchText] = useState("");

  // Dialog states
  const [selectedSpecies, setSelectedSpecies] = useState<any>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [speciesToDelete, setSpeciestoDelete] = useState<number | null>(null);
  const [resetCatalogConfirmVisible, setResetCatalogConfirmVisible] = useState(false);
  
  // Search progress states
  const [searchProgress, setSearchProgress] = useState<SpeciesSearchProgress | null>(null);
  const [gbifSearchPhase, setGbifSearchPhase] = useState<SearchDialogPhase>("idle");
  const [gbifOccurrenceCount, setGbifOccurrenceCount] = useState<number | null>(null);
  const gbifAbortRef = useRef<AbortController | null>(null);

  // SpeciesLink search progress states
  const [speciesLinkSearchProgress, setSpeciesLinkSearchProgress] = useState<SpeciesSearchProgress | null>(null);
  const [speciesLinkSearchPhase, setSpeciesLinkSearchPhase] = useState<SearchDialogPhase>("idle");
  const [speciesLinkOccurrenceCount, setSpeciesLinkOccurrenceCount] = useState<number | null>(null);
  const speciesLinkAbortRef = useRef<AbortController | null>(null);

  // Results view mode ("records" = flat list sorted by occurrence count, "taxonomy" = grouped by family/genus)
  const [resultSortMode, setResultSortMode] = useState<"records" | "taxonomy">("records");
  const [expandedResultFamilies, setExpandedResultFamilies] = useState<Set<string>>(new Set());
  const [expandedResultGenera, setExpandedResultGenera] = useState<Set<string>>(new Set());

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingSpecies, setEditingSpecies] = useState<ProjectSpeciesCatalog | null>(null);
  const [editedSpeciesData, setEditedSpeciesData] = useState<ManualSpeciesInput>({
    scientificName: "",
    family: "",
    genus: "",
    commonNames: [{ name: "", language: currentLanguage }],
  });

  // Catalog share states
  const [isExportingCatalog, setIsExportingCatalog] = useState(false);
  const [isImportingCatalog, setIsImportingCatalog] = useState(false);

  const handleExportCatalog = async () => {
    if (isExportingCatalog || projectSpecies.length === 0) return;
    setIsExportingCatalog(true);
    try {
      const { json, filename } = exportCatalogToJson(projectSpecies);
      const tmpFile = new File(Paths.cache, filename);
      await tmpFile.create();
      await tmpFile.write(json);

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        alert(t("common.error"), t("species.sharingNotAvailable"));
        return;
      }
      await Sharing.shareAsync(tmpFile.uri, {
        mimeType: "application/json",
        dialogTitle: t("species.shareCatalogTitle"),
      });
    } catch (error) {
      console.error("Error exporting catalog:", error);
      alert(t("common.error"), t("species.exportCatalogFailed"));
    } finally {
      setIsExportingCatalog(false);
    }
  };

  const handleImportCatalog = async () => {
    if (isImportingCatalog) return;
    setIsImportingCatalog(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/plain", "*/*"],
        copyToCacheDirectory: true,
      });

      if (!result.assets || result.assets.length === 0) return;

      const fileAsset = result.assets[0];
      const response = await fetch(fileAsset.uri);
      const json = await response.text();

      const { entries, meta } = parseCatalogJson(json);
      const importResult = await importSpeciesFromCatalog(projectId, entries);

      await loadProjectSpecies();

      const lines = [
        t("species.catalogImportInserted", { count: importResult.inserted }),
      ];
      if (importResult.merged > 0)
        lines.push(t("species.catalogImportMerged", { count: importResult.merged }));
      if (importResult.skipped > 0)
        lines.push(t("species.catalogImportSkipped", { count: importResult.skipped }));
      if (meta.exported_at)
        lines.push(t("species.catalogImportDate", { date: new Date(meta.exported_at).toLocaleDateString() }));

      alert(t("species.catalogImported"), lines.join("\n"));
      onSpeciesImported?.(importResult.inserted);
    } catch (error: unknown) {
      const msg =
        error instanceof CatalogParseError
          ? t(`species.catalogParseError.${error.code}`)
          : error instanceof Error
            ? error.message
            : t("species.exportCatalogFailed");
      alert(t("species.catalogImportError"), msg);
    } finally {
      setIsImportingCatalog(false);
    }
  };

  // Load project species on mount
  React.useEffect(() => {
    if (visible || mode === "screen") {
      loadProjectSpecies();
      checkSpeciesLinkConfiguration();
    }
  }, [visible, projectId, mode]);

  const checkSpeciesLinkConfiguration = async () => {
    const hasKey = await APIKeyManager.hasSpeciesLinkApiKey();
    const key = hasKey ? await APIKeyManager.getSpeciesLinkApiKey() : null;
    setIsSpeciesLinkConfigured(hasKey);
    setSpeciesLinkApiKey(key);
  };

  const loadProjectSpecies = async () => {
    setIsLoadingSpecies(true);
    try {
      const species = await getProjectSpeciesCatalogByProject(projectId);
      setProjectSpecies(species);
      // Families start collapsed by default
      setExpandedFamilies(new Set());
    } catch (error) {
      console.error("Error loading species:", error);
    } finally {
      setIsLoadingSpecies(false);
    }
  };

  const toggleFamilyExpanded = (family: string) => {
    const newExpanded = new Set(expandedFamilies);
    if (newExpanded.has(family)) {
      newExpanded.delete(family);
    } else {
      newExpanded.add(family);
    }
    setExpandedFamilies(newExpanded);
  };

  const toggleGenusExpanded = (genusFamilyKey: string) => {
    const newExpanded = new Set(expandedGenera);
    if (newExpanded.has(genusFamilyKey)) {
      newExpanded.delete(genusFamilyKey);
    } else {
      newExpanded.add(genusFamilyKey);
    }
    setExpandedGenera(newExpanded);
  };

  const handleOpenLocationPicker = () => {
    setLocationPickerVisible(true);
  };

  const handleConfirmLocation = (coords: { latitude: number; longitude: number }) => {
    setSelectedLocation(coords);
    setLocationPickerVisible(false);
  };

  const isSearchCancelled = (error: unknown): boolean =>
    error instanceof SearchCancelledError || (error instanceof Error && error.name === "AbortError");

  // Step 1: count how many occurrences exist in the area before committing to the
  // (potentially slow) full species count. Stops in the "counted" phase and waits
  // for the user to confirm via the progress dialog's "Count species" button.
  const handleSearchByLocation = async () => {
    if (!selectedLocation) {
      alert(t("common.error"), t("species.selectLocation"));
      return;
    }

    const controller = new AbortController();
    gbifAbortRef.current = controller;
    setGbifSearchPhase("counting");
    setGbifOccurrenceCount(null);
    setSearchProgress(null);
    setIsSearching(true);

    try {
      const { totalCount } = await getGBIFOccurrenceCount({
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        radiusKm,
        signal: controller.signal,
      });

      if (totalCount === 0) {
        setIsSearching(false);
        setGbifSearchPhase("idle");
        alert(t("common.warning"), t("species.noSpeciesFound"));
        return;
      }

      setGbifOccurrenceCount(totalCount);
      setGbifSearchPhase("counted");
    } catch (error) {
      setIsSearching(false);
      setGbifSearchPhase("idle");
      if (isSearchCancelled(error)) return;
      console.error("Error counting GBIF occurrences:", error);
      alert(
        t("common.error"),
        `${t("species.searchError")}: ${error instanceof Error ? error.message : t("common.error")}`
      );
    }
  };

  // Step 2: user confirmed the occurrence count, now run the full paginated search + species dedup.
  const handleConfirmGbifSearch = async () => {
    if (!selectedLocation) return;
    setGbifSearchPhase("searching");

    try {
      const results = await searchPlantsNearby({
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        radiusKm,
        language: currentLanguage,
        signal: gbifAbortRef.current?.signal,
        onProgress: (progress) => {
          setSearchProgress(progress);
        },
      });

      setSearchResults(results);

      if (results.length === 0) {
        alert(t("common.warning"), t("species.noSpeciesFound"));
      }
    } catch (error) {
      if (isSearchCancelled(error)) return;
      console.error("Error searching plants:", error);
      alert(
        t("common.error"),
        `${t("species.searchError")}: ${error instanceof Error ? error.message : t("common.error")}`
      );
    } finally {
      setIsSearching(false);
      setSearchProgress(null);
      setGbifOccurrenceCount(null);
      setGbifSearchPhase("idle");
    }
  };

  const handleCancelGbifSearch = () => {
    gbifAbortRef.current?.abort();
    setIsSearching(false);
    setSearchProgress(null);
    setGbifOccurrenceCount(null);
    setGbifSearchPhase("idle");
  };

  const handleSearchSpeciesLink = async () => {
    if (!selectedLocation) {
      alert(t("common.error"), t("species.selectLocation"));
      return;
    }

    if (!isSpeciesLinkConfigured) {
      alert(t("species.speciesLinkNotConfigured"), t("species.configureSpeciesLink"));
      return;
    }

    const controller = new AbortController();
    speciesLinkAbortRef.current = controller;
    setSpeciesLinkSearchPhase("counting");
    setSpeciesLinkOccurrenceCount(null);
    setSpeciesLinkSearchProgress(null);
    setIsSpeciesLinkSearching(true);

    try {
      const { totalCount } = await getSpeciesLinkOccurrenceCount({
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        radiusKm,
        apiKey: speciesLinkApiKey || "",
        signal: controller.signal,
      });

      if (totalCount === 0) {
        setIsSpeciesLinkSearching(false);
        setSpeciesLinkSearchPhase("idle");
        alert(t("common.warning"), t("species.noSpeciesFound"));
        return;
      }

      setSpeciesLinkOccurrenceCount(totalCount);
      setSpeciesLinkSearchPhase("counted");
    } catch (error) {
      setIsSpeciesLinkSearching(false);
      setSpeciesLinkSearchPhase("idle");
      if (isSearchCancelled(error)) return;
      console.error("Error counting SpeciesLink occurrences:", error);
      alert(
        t("common.error"),
        `${t("species.searchError")}: ${error instanceof Error ? error.message : t("common.error")}`
      );
    }
  };

  const handleConfirmSpeciesLinkSearch = async () => {
    if (!selectedLocation) return;
    setSpeciesLinkSearchPhase("searching");

    try {
      const results = await searchPlantsNearbySpeciesLink({
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        radiusKm,
        language: currentLanguage,
        apiKey: speciesLinkApiKey || "",
        limit: undefined,
        signal: speciesLinkAbortRef.current?.signal,
        onProgress: (progress) => {
          setSpeciesLinkSearchProgress(progress);
        },
      });

      setSpeciesLinkResults(results);

      if (results.length === 0) {
        alert(t("common.warning"), t("species.noSpeciesFound"));
      }
    } catch (error) {
      if (isSearchCancelled(error)) return;
      console.error("Error searching SpeciesLink:", error);
      alert(
        t("common.error"),
        `${t("species.searchError")}: ${error instanceof Error ? error.message : t("common.error")}`
      );
    } finally {
      setIsSpeciesLinkSearching(false);
      setSpeciesLinkSearchProgress(null);
      setSpeciesLinkOccurrenceCount(null);
      setSpeciesLinkSearchPhase("idle");
    }
  };

  const handleCancelSpeciesLinkSearch = () => {
    speciesLinkAbortRef.current?.abort();
    setIsSpeciesLinkSearching(false);
    setSpeciesLinkSearchProgress(null);
    setSpeciesLinkOccurrenceCount(null);
    setSpeciesLinkSearchPhase("idle");
  };

  // Pushes each newly imported catalog row to Drive right away (best-effort,
  // same as the manual "add one species" flow) instead of leaving it to wait
  // for the next full project sync - see pushSpeciesEntryIfCollaborative.
  const pushImportedSpecies = async (insertedIds: number[]) => {
    for (const id of insertedIds) {
      const created = await getProjectSpeciesById(id);
      if (created) pushSpeciesEntryIfCollaborative(projectId, created);
    }
  };

  const handleImportSpeciesLink = async (speciesData: SpeciesLinkSearchResult) => {
    try {
      const { inserted, insertedIds } = await importSpeciesFromSpeciesLink(projectId, [speciesData]);
      if (inserted > 0) {
        alert(t("common.success"), t("species.imported"));
        await loadProjectSpecies();
        onSpeciesImported?.(inserted);
        pushImportedSpecies(insertedIds);
      } else {
        alert(t("common.warning"), t("species.alreadyExists"));
      }
    } catch (error) {
      console.error("Error importing species:", error);
    }
  };

  const buildImportSummaryMessage = (inserted: number, skipped: number) => {
    if (inserted > 0 && skipped > 0) {
      return `${inserted} ${t("species.results")} ${t("species.speciesAdded")}\n${skipped} ${t("species.alreadyExists")}`;
    }
    if (inserted > 0) {
      return `${inserted} ${t("species.results")} ${t("species.speciesAdded")}`;
    }
    return t("species.allSpeciesExist");
  };

  const handleImportAllSpeciesLink = async () => {
    if (speciesLinkResults.length === 0) {
      alert(t("common.warning"), t("species.noSpeciesToImport"));
      return;
    }

    setIsSpeciesLinkSearching(true);
    try {
      const { inserted, skipped, insertedIds } = await importSpeciesFromSpeciesLink(projectId, speciesLinkResults);
      await loadProjectSpecies();
      onSpeciesImported?.(inserted);
      pushImportedSpecies(insertedIds);
      const isWarning = inserted === 0;
      if (isWarning) {
        alert(t("common.warning"), buildImportSummaryMessage(inserted, skipped));
      } else {
        alert(t("common.success"), buildImportSummaryMessage(inserted, skipped));
      }
      setSpeciesLinkResults([]);
    } catch (error) {
      console.error("Error importing all species:", error);
      alert(
        t("common.error"),
        `${t("species.searchError")}: ${error instanceof Error ? error.message : t("common.error")}`
      );
    } finally {
      setIsSpeciesLinkSearching(false);
    }
  };

  const handleImportSpecies = async (speciesData: any) => {
    try {
      const { inserted, insertedIds } = await importSpeciesFromGBIF(projectId, [speciesData]);
      if (inserted > 0) {
        alert(t("common.success"), t("species.imported"));
        await loadProjectSpecies();
        onSpeciesImported?.(inserted);
        pushImportedSpecies(insertedIds);
      } else {
        alert(t("common.warning"), t("species.alreadyExists"));
      }
    } catch (error) {
      console.error("Error importing species:", error);
    }
  };

  const handleImportAllSpecies = async () => {
    if (searchResults.length === 0) {
      alert(t("common.warning"), t("species.noSpeciesToImport"));
      return;
    }

    setIsSearching(true);
    try {
      const { inserted, skipped, insertedIds } = await importSpeciesFromGBIF(projectId, searchResults);
      await loadProjectSpecies();
      onSpeciesImported?.(inserted);
      pushImportedSpecies(insertedIds);
      const isWarning = inserted === 0;
      if (isWarning) {
        alert(t("common.warning"), buildImportSummaryMessage(inserted, skipped));
      } else {
        alert(t("common.success"), buildImportSummaryMessage(inserted, skipped));
      }
      setSearchResults([]);
    } catch (error) {
      console.error("Error importing all species:", error);
      alert(
        t("common.error"),
        `${t("species.searchError")}: ${error instanceof Error ? error.message : t("common.error")}`
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddManualSpecies = async () => {
    if (!manualSpecies.scientificName.trim()) {
      alert(t("common.error"), t("species.scientificNameRequired"));
      return;
    }

    try {
      const speciesId = await createProjectSpecies({
        project_id: projectId,
        scientific_name: manualSpecies.scientificName,
        family: manualSpecies.family,
        genus: manualSpecies.genus,
        source: "manual",
        common_names: manualSpecies.commonNames
          .filter(cn => cn.name.trim())
          .map(cn => ({
            common_name: cn.name,
            language: cn.language,
            source: "manual" as const,
          })),
      });

      if (speciesId) {
        const created = await getProjectSpeciesById(speciesId);
        if (created) pushSpeciesEntryIfCollaborative(projectId, created);
      }

      alert(t("common.success"), t("species.speciesAdded"));
      setManualSpecies({
        scientificName: "",
        family: "",
        genus: "",
        commonNames: [{ name: "", language: currentLanguage }],
      });
      await loadProjectSpecies();
    } catch (error) {
      console.error("Error adding species:", error);
    }
  };

  const handleDeleteSpecies = async (speciesId: number) => {
    try {
      await deleteProjectSpecies(speciesId);
      await loadProjectSpecies();
      setDeleteConfirmVisible(false);
      setSpeciestoDelete(null);
    } catch (error) {
      console.error("Error deleting species:", error);
    }
  };

  const handleResetCatalog = async () => {
    try {
      await deleteAllProjectSpeciesByProject(projectId);
      await loadProjectSpecies();
      setResetCatalogConfirmVisible(false);
    } catch (error) {
      console.error("Error resetting catalog:", error);
    }
  };

  const handleOpenEditModal = (species: ProjectSpeciesCatalog) => {
    setEditingSpecies(species);
    setEditedSpeciesData({
      scientificName: species.scientific_name,
      family: species.family || "",
      genus: species.genus || "",
      commonNames: species.common_names && species.common_names.length > 0
        ? species.common_names.map(cn => ({
            name: cn.common_name,
            language: cn.language,
          }))
        : [{ name: "", language: currentLanguage }],
    });
    setEditModalVisible(true);
  };

  const handleCloseEditModal = () => {
    setEditModalVisible(false);
    setEditingSpecies(null);
    setEditedSpeciesData({
      scientificName: "",
      family: "",
      genus: "",
      commonNames: [{ name: "", language: currentLanguage }],
    });
  };

  const handleSaveEdit = async () => {
    if (!editingSpecies || !editedSpeciesData.scientificName.trim()) {
      alert(t("common.error"), t("species.scientificNameRequired"));
      return;
    }

    try {
      const success = await updateProjectSpeciesWithCommonNames(editingSpecies.id, {
        scientific_name: editedSpeciesData.scientificName,
        family: editedSpeciesData.family || undefined,
        genus: editedSpeciesData.genus || undefined,
        common_names: editedSpeciesData.commonNames
          .filter(cn => cn.name.trim())
          .map(cn => ({
            common_name: cn.name,
            language: cn.language,
            source: "manual" as const,
          })),
      });

      if (success) {
        alert(t("common.success"), t("species.speciesUpdated"));
        await loadProjectSpecies();
        handleCloseEditModal();
      } else {
        alert(t("common.error"), t("species.updateFailed"));
      }
    } catch (error) {
      console.error("Error updating species:", error);
      alert(
        t("common.error"),
        `${t("species.updateFailed")}: ${error instanceof Error ? error.message : t("common.error")}`
      );
    }
  };

  const renderSearchResult = ({ item }: { item: any }) => (
    <SpeciesResultCard item={item} onImport={() => handleImportSpecies(item)} />
  );

  const renderSpeciesLinkResult = ({ item }: { item: SpeciesLinkSearchResult }) => (
    <SpeciesResultCard item={item} onImport={() => handleImportSpeciesLink(item)} />
  );

  const toggleResultFamilyExpanded = (family: string) => {
    const next = new Set(expandedResultFamilies);
    next.has(family) ? next.delete(family) : next.add(family);
    setExpandedResultFamilies(next);
  };

  const toggleResultGenusExpanded = (genusFamilyKey: string) => {
    const next = new Set(expandedResultGenera);
    next.has(genusFamilyKey) ? next.delete(genusFamilyKey) : next.add(genusFamilyKey);
    setExpandedResultGenera(next);
  };

  const renderGroupedResults = <T extends { scientificName: string; family?: string; genus?: string; occurrenceCount: number }>(
    items: T[],
    onImport: (item: T) => void,
  ) => {
    const groups = groupByFamilyAndGenus(items, {
      noFamilyLabel: t("species.noFamily"),
      noGenusLabel: t("species.noGenus"),
      weightOf: (item) => item.occurrenceCount,
    });

    return (
      <FamilyGenusCollapsibleTree
        groups={groups}
        expandedFamilies={expandedResultFamilies}
        expandedGenera={expandedResultGenera}
        onToggleFamily={toggleResultFamilyExpanded}
        onToggleGenus={toggleResultGenusExpanded}
        keyOf={(item) => item.scientificName}
        renderItem={(item) => <SpeciesResultCard item={item} onImport={() => onImport(item)} />}
        familyMeta={(group) => t("species.speciesRecordsMeta", { count: group.genera.reduce((n, g) => n + g.items.length, 0), records: group.weight })}
        genusMeta={(group) => t("species.speciesRecordsMeta", { count: group.items.length, records: group.weight })}
      />
    );
  };

  const isScreen = mode === "screen";
  const contentStyle = isScreen
    ? { flex: 1, paddingHorizontal: 16, paddingBottom: 16 }
    : styles.content;

  const inner = (
    <>
      {!isScreen && (
        <View style={styles.header}>
          <Text variant="headlineSmall">{t("species.manageSpecies")}</Text>
          <IconButton icon="close" onPress={onDismiss} />
        </View>
      )}

        <View style={[styles.tabBar, { borderBottomColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface }]}>
          {(
            [
              { value: "search", label: t("species.search"), icon: "magnify" },
              { value: "manage", label: t("species.mySpecies"), icon: "folder-open" },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.value;
            return (
              <Pressable
                key={tab.value}
                style={[
                  styles.tabItem,
                  active && { borderBottomColor: theme.colors.primary },
                ]}
                onPress={() => setActiveTab(tab.value)}
              >
                <Icon
                  source={tab.icon}
                  size={18}
                  color={active ? theme.colors.primary : theme.colors.onSurfaceVariant}
                />
                <Text
                  variant="labelSmall"
                  style={{
                    color: active ? theme.colors.primary : theme.colors.onSurfaceVariant,
                    fontWeight: active ? "700" : "400",
                  }}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {activeTab === "search" ? (
          <ScrollView style={contentStyle}>
            <SegmentedButtons
              theme={SEGMENTED_BUTTONS_SHAPE_THEME}
              value={searchSource}
              onValueChange={(v) => setSearchSource(v as "gbif" | "specieslink")}
              buttons={[
                { value: "gbif", label: "GBIF" },
                { value: "specieslink", label: "SpeciesLink" },
              ]}
              style={{ marginTop: 12, marginBottom: 8 }}
            />
            {searchSource === "gbif" ? (
              <>
            {/* Location picker */}
            <Button
              mode="outlined"
              icon="map-marker"
              onPress={handleOpenLocationPicker}
              style={[styles.locationButton, { borderRadius: BUTTON_RADIUS }]}
            >
              {selectedLocation
                ? `${selectedLocation.latitude.toFixed(4)}, ${selectedLocation.longitude.toFixed(4)}`
                : t("species.selectLocationButton")}
            </Button>

            {/* Radius selector */}
            <Text variant="labelMedium" style={{ marginTop: 12, marginBottom: 4, color: theme.colors.onSurfaceVariant }}>
              {t("species.searchRadius")}
            </Text>
            <View style={styles.radiusRow}>
              {RADIUS_OPTIONS.map((km) => {
                const selected = radiusKm === km;
                return (
                  <Pressable
                    key={km}
                    onPress={() => setRadiusKm(km)}
                    style={[
                      styles.radiusChip,
                      {
                        backgroundColor: selected
                          ? theme.colors.primaryContainer
                          : theme.colors.surfaceVariant,
                        borderColor: selected
                          ? theme.colors.primary
                          : "transparent",
                      },
                    ]}
                  >
                    <Text
                      variant="labelMedium"
                      style={{
                        color: selected
                          ? theme.colors.onPrimaryContainer
                          : theme.colors.onSurfaceVariant,
                        fontWeight: selected ? "700" : "400",
                      }}
                    >
                      {km} km
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Search button and GBIF search bar */}
            <View style={{ gap: 12, marginTop: 12 }}>
              <Button
                mode="contained"
                icon="magnify"
                onPress={handleSearchByLocation}
                loading={isSearching}
                disabled={isSearching || !selectedLocation}
                style={[styles.button, { borderRadius: BUTTON_RADIUS }]}
              >
                {t("species.searchNearby")}
              </Button>

              {searchResults.length > 0 && (
                <TextInput
                  placeholder={t("species.filterResults")}
                  value={gbifSearchText}
                  onChangeText={setGbifSearchText}
                  mode="outlined"
                  left={<TextInput.Icon icon="magnify" />}
                  right={gbifSearchText ? <TextInput.Icon icon="close" onPress={() => setGbifSearchText("")} /> : undefined}
                  style={styles.input}
                />
              )}
            </View>

            {searchResults.length > 0 && (
              <>
                <View style={styles.resultsHeader}>
                  <Text variant="titleSmall" style={styles.sectionTitle}>
                    {t("species.resultsCount", { count: searchResults.filter(s =>
                      s.scientificName.toLowerCase().includes(gbifSearchText.toLowerCase()) ||
                      s.family?.toLowerCase().includes(gbifSearchText.toLowerCase()) ||
                      s.commonNames?.some((cn: { name: string; language: string }) => cn.name.toLowerCase().includes(gbifSearchText.toLowerCase()))
                    ).length })}
                  </Text>
                  <Button
                    mode="contained"
                    icon="check-all"
                    onPress={handleImportAllSpecies}
                    loading={isSearching}
                    disabled={isSearching}
                    compact
                    style={{ borderRadius: BUTTON_RADIUS }}
                  >
                    {t("species.addAll")}
                  </Button>
                </View>
                <SegmentedButtons
                  theme={SEGMENTED_BUTTONS_SHAPE_THEME}
                  value={resultSortMode}
                  onValueChange={(v) => setResultSortMode(v as "records" | "taxonomy")}
                  buttons={[
                    { value: "records", label: t("species.sortByRecords"), icon: "sort-numeric-descending" },
                    { value: "taxonomy", label: t("species.sortByTaxonomy"), icon: "file-tree" },
                  ]}
                  style={{ marginBottom: 12 }}
                />
                {(() => {
                  const filteredGbifResults = searchResults.filter(s =>
                    s.scientificName.toLowerCase().includes(gbifSearchText.toLowerCase()) ||
                    s.family?.toLowerCase().includes(gbifSearchText.toLowerCase()) ||
                    s.commonNames?.some((cn: { name: string; language: string }) => cn.name.toLowerCase().includes(gbifSearchText.toLowerCase()))
                  );
                  return resultSortMode === "records" ? (
                    <FlatList
                      data={filteredGbifResults}
                      renderItem={renderSearchResult}
                      keyExtractor={(item) => item.scientificName}
                      scrollEnabled={false}
                    />
                  ) : (
                    renderGroupedResults(filteredGbifResults, handleImportSpecies)
                  );
                })()}
              </>
            )}
              </>
            ) : (
              <>
            {/* SpeciesLink Configuration Check */}
            {!isSpeciesLinkConfigured ? (
              <Card style={{ marginBottom: 16, backgroundColor: theme.colors.surfaceVariant }}>
                <Card.Content>
                  <View style={{ gap: 8 }}>
                    <Text variant="titleSmall">{t("species.speciesLinkNotConfigured")}</Text>
                    <Text variant="bodySmall">
                      {t("species.configureSpeciesLink")}
                    </Text>
                  </View>
                </Card.Content>
              </Card>
            ) : (
              <>
                {/* Location picker */}
                <Button
                  mode="outlined"
                  icon="map-marker"
                  onPress={handleOpenLocationPicker}
                  style={[styles.locationButton, { borderRadius: BUTTON_RADIUS }]}
                >
                  {selectedLocation
                    ? `${selectedLocation.latitude.toFixed(4)}, ${selectedLocation.longitude.toFixed(4)}`
                    : t("species.selectLocation")}
                </Button>

                {/* Radius selector */}
                <Text variant="labelMedium" style={{ marginTop: 12, marginBottom: 4, color: theme.colors.onSurfaceVariant }}>
                  {t("species.searchRadius")}
                </Text>
                <View style={styles.radiusRow}>
                  {RADIUS_OPTIONS.map((km) => {
                    const selected = radiusKm === km;
                    return (
                      <Pressable
                        key={km}
                        onPress={() => setRadiusKm(km)}
                        style={[
                          styles.radiusChip,
                          {
                            backgroundColor: selected
                              ? theme.colors.primaryContainer
                              : theme.colors.surfaceVariant,
                            borderColor: selected
                              ? theme.colors.primary
                              : "transparent",
                          },
                        ]}
                      >
                        <Text
                          variant="labelMedium"
                          style={{
                            color: selected
                              ? theme.colors.onPrimaryContainer
                              : theme.colors.onSurfaceVariant,
                            fontWeight: selected ? "700" : "400",
                          }}
                        >
                          {km} km
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Search button and filter bar */}
                <View style={{ gap: 12, marginTop: 12 }}>
                  <Button
                    mode="contained"
                    icon="magnify"
                    onPress={handleSearchSpeciesLink}
                    loading={isSpeciesLinkSearching}
                    disabled={isSpeciesLinkSearching || !selectedLocation}
                    style={[styles.button, { borderRadius: BUTTON_RADIUS }]}
                  >
                    {t("species.searchNearby")}
                  </Button>

                  {speciesLinkResults.length > 0 && (
                    <TextInput
                      placeholder={t("species.filterResults")}
                      value={speciesLinkSearchText}
                      onChangeText={setSpeciesLinkSearchText}
                      mode="outlined"
                      left={<TextInput.Icon icon="magnify" />}
                      right={speciesLinkSearchText ? <TextInput.Icon icon="close" onPress={() => setSpeciesLinkSearchText("")} /> : undefined}
                      style={styles.input}
                    />
                  )}
                </View>

                {speciesLinkResults.length > 0 && (
                  <>
                    <View style={styles.resultsHeader}>
                      <Text variant="titleSmall" style={styles.sectionTitle}>
                        {t("species.resultsCount", { count: speciesLinkResults.filter(s =>
                          s.scientificName.toLowerCase().includes(speciesLinkSearchText.toLowerCase()) ||
                          s.family?.toLowerCase().includes(speciesLinkSearchText.toLowerCase()) ||
                          s.genus?.toLowerCase().includes(speciesLinkSearchText.toLowerCase())
                        ).length })}
                      </Text>
                      <Button
                        mode="contained"
                        icon="check-all"
                        onPress={handleImportAllSpeciesLink}
                        loading={isSpeciesLinkSearching}
                        disabled={isSpeciesLinkSearching}
                        compact
                        style={{ borderRadius: BUTTON_RADIUS }}
                      >
                        {t("species.addAll")}
                      </Button>
                    </View>
                    <SegmentedButtons
                      theme={SEGMENTED_BUTTONS_SHAPE_THEME}
                      value={resultSortMode}
                      onValueChange={(v) => setResultSortMode(v as "records" | "taxonomy")}
                      buttons={[
                        { value: "records", label: t("species.sortByRecords"), icon: "sort-numeric-descending" },
                        { value: "taxonomy", label: t("species.sortByTaxonomy"), icon: "file-tree" },
                      ]}
                      style={{ marginBottom: 12 }}
                    />
                    {(() => {
                      const filteredSpeciesLinkResults = speciesLinkResults.filter(s =>
                        s.scientificName.toLowerCase().includes(speciesLinkSearchText.toLowerCase()) ||
                        s.family?.toLowerCase().includes(speciesLinkSearchText.toLowerCase()) ||
                        s.genus?.toLowerCase().includes(speciesLinkSearchText.toLowerCase())
                      );
                      return resultSortMode === "records" ? (
                        <FlatList
                          data={filteredSpeciesLinkResults}
                          renderItem={renderSpeciesLinkResult}
                          keyExtractor={(item) => item.scientificName}
                          scrollEnabled={false}
                        />
                      ) : (
                        renderGroupedResults(filteredSpeciesLinkResults, handleImportSpeciesLink)
                      );
                    })()}
                  </>
                )}
              </>
            )}
              </>
            )}
          </ScrollView>
        ) : (
          <ScrollView style={contentStyle}>
            {/* Manual Entry Section */}
            <View>
              <Text variant="titleSmall" style={[styles.sectionTitle, { marginTop: 8 }]}>
                {t("species.addManually")}
              </Text>

              <TextInput
                label={`${t("species.scientificName")} *`}
                value={manualSpecies.scientificName}
                onChangeText={(text) =>
                  setManualSpecies({ ...manualSpecies, scientificName: text })
                }
                mode="outlined"
                style={styles.input}
              />

              <TextInput
                label={t("species.family")}
                value={manualSpecies.family}
                onChangeText={(text) =>
                  setManualSpecies({ ...manualSpecies, family: text })
                }
                mode="outlined"
                style={styles.input}
              />

              <TextInput
                label={t("species.genus")}
                value={manualSpecies.genus}
                onChangeText={(text) =>
                  setManualSpecies({ ...manualSpecies, genus: text })
                }
                mode="outlined"
                style={styles.input}
              />

              {manualSpecies.commonNames.map((cn, idx) => (
                <TextInput
                  key={`manual-cn-${idx}`}
                  label={`${t("species.commonName")} ${idx + 1}`}
                  value={cn.name}
                  onChangeText={(text) => {
                    const updated = [...manualSpecies.commonNames];
                    updated[idx].name = text;
                    setManualSpecies({ ...manualSpecies, commonNames: updated });
                  }}
                  mode="outlined"
                  style={styles.input}
                />
              ))}

              <Button
                mode="contained-tonal"
                onPress={handleAddManualSpecies}
                style={[styles.button, { borderRadius: BUTTON_RADIUS }]}
              >
                {t("species.addSpecies")}
              </Button>
            </View>

            {/* Catalog Section */}
            <Divider style={[styles.divider, { marginTop: 24 }]} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text variant="titleSmall" style={styles.sectionTitle}>
                {t("species.mySpecies")}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <IconButton
                  icon="upload-outline"
                  size={22}
                  iconColor={theme.colors.primary}
                  onPress={handleImportCatalog}
                  disabled={isImportingCatalog}
                />
                {projectSpecies.length > 0 && (
                  <>
                    <IconButton
                      icon="share-variant-outline"
                      size={22}
                      iconColor={theme.colors.primary}
                      onPress={handleExportCatalog}
                      disabled={isExportingCatalog}
                    />
                    <IconButton
                      icon="trash-can"
                      size={22}
                      iconColor={theme.colors.error}
                      onPress={() => setResetCatalogConfirmVisible(true)}
                    />
                  </>
                )}
              </View>
            </View>

            {projectSpecies.length > 0 && (
              <TextInput
                placeholder={t("species.searchCatalogPlaceholder")}
                value={catalogSearchText}
                onChangeText={setCatalogSearchText}
                mode="outlined"
                left={<TextInput.Icon icon="magnify" />}
                right={catalogSearchText ? <TextInput.Icon icon="close" onPress={() => setCatalogSearchText("")} /> : undefined}
                style={[styles.input, { marginBottom: 12 }]}
              />
            )}

            {isLoadingSpecies ? (
              <ActivityIndicator size="large" color={theme.colors.primary} />
            ) : projectSpecies.length > 0 ? (
              (() => {
                const filteredCatalogSpecies = projectSpecies.filter(s =>
                  s.scientific_name.toLowerCase().includes(catalogSearchText.toLowerCase()) ||
                  s.common_names?.some(cn => cn.common_name.toLowerCase().includes(catalogSearchText.toLowerCase()))
                );
                const catalogGroups = groupByFamilyAndGenus(filteredCatalogSpecies, {
                  noFamilyLabel: t("species.noFamily"),
                  noGenusLabel: t("species.noGenus"),
                  labelOf: (s) => s.scientific_name,
                });

                return (
                  <FamilyGenusCollapsibleTree
                    groups={catalogGroups}
                    expandedFamilies={expandedFamilies}
                    expandedGenera={expandedGenera}
                    onToggleFamily={toggleFamilyExpanded}
                    onToggleGenus={toggleGenusExpanded}
                    keyOf={(item) => item.id}
                    familyMeta={(group) => {
                      const count = group.genera.reduce((total, g) => total + g.items.length, 0);
                      return t("species.speciesCountMeta", { count });
                    }}
                    genusMeta={(group) => t("species.speciesCountMeta", { count: group.items.length })}
                    renderItem={(item) => (
                      <Card style={[styles.speciesCard, { backgroundColor: theme.colors.surface }]}>
                        <Card.Content style={{ paddingBottom: 8 }}>
                          {/* First row: Scientific name + edit/delete buttons */}
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                            <Text variant="titleSmall" style={{ color: theme.colors.primary, fontStyle: "italic", flex: 1 }}>
                              {item.scientific_name}
                            </Text>
                            <View style={styles.actionButtons}>
                              <IconButton
                                icon="pencil"
                                size={18}
                                iconColor={theme.colors.primary}
                                onPress={() => handleOpenEditModal(item)}
                              />
                              <IconButton
                                icon="delete"
                                size={18}
                                iconColor={theme.colors.error}
                                onPress={() => {
                                  setSpeciestoDelete(item.id);
                                  setDeleteConfirmVisible(true);
                                }}
                              />
                            </View>
                          </View>

                          {/* Common names - with better visibility */}
                          {item.common_names && item.common_names.length > 0 && (
                            <View style={{ marginBottom: 6 }}>
                              {item.common_names.map((cn, idx) => (
                                <Text key={idx} variant="bodySmall" style={{ color: theme.colors.secondary, lineHeight: 18 }}>
                                  {cn.common_name}
                                  {cn.language && <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant }}> ({cn.language})</Text>}
                                </Text>
                              ))}
                            </View>
                          )}
                        </Card.Content>
                      </Card>
                    )}
                  />
                );
              })()
            ) : (
              <Text variant="bodyMedium" style={{ textAlign: "center", marginTop: 20 }}>
                {t("species.noRegisteredSpecies")}
              </Text>
            )}
          </ScrollView>
        )}

        {/* Edit Species Modal */}
        <Portal>
          <Dialog visible={editModalVisible} onDismiss={handleCloseEditModal}>
            <Dialog.Title>{t("species.editSpecies")}</Dialog.Title>
            <Dialog.Content>
              <TextInput
                label={`${t("species.scientificName")} *`}
                value={editedSpeciesData.scientificName}
                onChangeText={(text) =>
                  setEditedSpeciesData({ ...editedSpeciesData, scientificName: text })
                }
                mode="outlined"
                style={[styles.input, { marginTop: 16 }]}
              />

              <TextInput
                label={t("species.family")}
                value={editedSpeciesData.family}
                onChangeText={(text) =>
                  setEditedSpeciesData({ ...editedSpeciesData, family: text })
                }
                mode="outlined"
                style={styles.input}
              />

              <TextInput
                label={t("species.genus")}
                value={editedSpeciesData.genus}
                onChangeText={(text) =>
                  setEditedSpeciesData({ ...editedSpeciesData, genus: text })
                }
                mode="outlined"
                style={styles.input}
              />

              <Text variant="labelSmall" style={{ marginTop: 16, marginBottom: 8 }}>
                {t("species.commonNames")}
              </Text>

              {editedSpeciesData.commonNames.map((cn, idx) => (
                <View key={`edit-cn-${idx}`} style={styles.commonNameRow}>
                  <TextInput
                    label={`${t("species.commonName")} ${idx + 1}`}
                    value={cn.name}
                    onChangeText={(text) => {
                      const updated = [...editedSpeciesData.commonNames];
                      updated[idx].name = text;
                      setEditedSpeciesData({ ...editedSpeciesData, commonNames: updated });
                    }}
                    mode="outlined"
                    style={{ flex: 1 }}
                  />
                  {editedSpeciesData.commonNames.length > 1 && (
                    <IconButton
                      icon="close"
                      size={20}
                      onPress={() => {
                        const updated = editedSpeciesData.commonNames.filter((_, i) => i !== idx);
                        setEditedSpeciesData({ ...editedSpeciesData, commonNames: updated });
                      }}
                    />
                  )}
                </View>
              ))}

              <Button
                mode="outlined"
                icon="plus"
                onPress={() => {
                  setEditedSpeciesData({
                    ...editedSpeciesData,
                    commonNames: [
                      ...editedSpeciesData.commonNames,
                      { name: "", language: currentLanguage },
                    ],
                  });
                }}
                style={{ marginTop: 8, borderRadius: BUTTON_RADIUS }}
              >
                {t("species.addCommonName")}
              </Button>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={handleCloseEditModal}>{t("species.cancel")}</Button>
              <Button onPress={handleSaveEdit} mode="contained" style={{ borderRadius: BUTTON_RADIUS }}>
                {t("common.save")}
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>

        {/* Delete Confirmation Dialog */}
        <Portal>
          <Dialog visible={deleteConfirmVisible} onDismiss={() => setDeleteConfirmVisible(false)}>
            <Dialog.Title>{t("species.confirmDelete")}</Dialog.Title>
            <Dialog.Content>
              <Text variant="bodyMedium">{t("species.deleteMessage")}</Text>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setDeleteConfirmVisible(false)}>{t("species.cancel")}</Button>
              <Button
                onPress={() => {
                  if (speciesToDelete) {
                    handleDeleteSpecies(speciesToDelete);
                  }
                }}
                textColor={theme.colors.error}
              >
                {t("common.remove")}
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>

        {/* Reset Catalog Confirmation Dialog */}
        <Portal>
          <Dialog visible={resetCatalogConfirmVisible} onDismiss={() => setResetCatalogConfirmVisible(false)}>
            <Dialog.Title>{t("species.resetCatalogTitle")}</Dialog.Title>
            <Dialog.Content>
              <Text variant="bodyMedium">
                {t("species.resetCatalogMessage")}
              </Text>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setResetCatalogConfirmVisible(false)}>{t("species.cancel")}</Button>
              <Button
                onPress={handleResetCatalog}
                textColor={theme.colors.error}
              >
                {t("species.removeAll")}
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>

        {/* Location Picker Modal */}
        <LocationPickerModal
          visible={locationPickerVisible}
          onDismiss={() => setLocationPickerVisible(false)}
          onConfirm={handleConfirmLocation}
          initialCoordinate={selectedLocation || undefined}
          mapData={{
            layerData: null,
            routeData: null,
            surveyPoints: [],
          }}
        />

        <SpeciesSearchProgressDialog
          visible={isSearching && gbifSearchPhase !== "idle"}
          source="gbif"
          phase={gbifSearchPhase}
          progress={searchProgress}
          occurrenceCount={gbifOccurrenceCount}
          onCancel={handleCancelGbifSearch}
          onConfirmCount={handleConfirmGbifSearch}
        />

        <SpeciesSearchProgressDialog
          visible={isSpeciesLinkSearching && speciesLinkSearchPhase !== "idle"}
          source="specieslink"
          phase={speciesLinkSearchPhase}
          progress={speciesLinkSearchProgress}
          occurrenceCount={speciesLinkOccurrenceCount}
          onCancel={handleCancelSpeciesLinkSearch}
          onConfirmCount={handleConfirmSpeciesLinkSearch}
        />
    </>
  );

  if (isScreen) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        {inner}
      </View>
    );
  }

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.background }]}
      >
        {inner}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: 16,
    borderRadius: 12,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 3,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    maxHeight: "80%",
  },
  input: {
    marginBottom: 12,
  },
  button: {
    marginVertical: 12,
  },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 12,
    fontWeight: "600",
  },
  divider: {
    marginVertical: 16,
  },
  speciesCard: {
    marginBottom: 12,
  },
  locationButtonContainer: {
    marginBottom: 12,
  },
  locationButton: {
    marginVertical: 8,
    paddingVertical: 8,
  },
  locationCard: {
    marginBottom: 12,
  },
  resultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 12,
    gap: 8,
  },
  actionButtons: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  commonNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 4,
  },
  radiusRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  radiusChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
  },
});
