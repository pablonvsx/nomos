/**
 * Advanced Species Input Component with Autocomplete
 * Manages species records with scientific names, common names, and abundance
 * Provides autocomplete suggestions from project's existing species database
 */

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  FlatList,
  Pressable,
  Modal,
} from "react-native";
import {
  TextInput,
  Chip,
  useTheme,
  List,
  Divider,
  Paragraph,
  Caption,
  IconButton,
  Surface,
  Button,
  Dialog,
  Portal,
  Icon,
  Snackbar,
  Badge,
} from "react-native-paper";
import { Species, ProjectSpeciesCatalog } from "@/types/database";
import { searchSpeciesAutocomplete } from "@/db/queries/species";
import {
  getProjectSpeciesCatalogByProject,
  createProjectSpecies,
  projectSpeciesExists,
  getProjectSpeciesById,
} from "@/db/queries/project-species";
import { useI18n } from "@/contexts/i18n-context";
import { useAlertDialog } from "@/hooks/use-dialog";
import { BUTTON_RADIUS } from "@/constants/shape";
import { useBottomContentPadding } from "@/hooks/use-bottom-content-padding";

interface Props {
  projectId: number;
  surveyPointId: string;
  value?: Species[]; // Current species list
  onChange: (species: Species[]) => void;
  editable?: boolean;
}

// Scientific name is the star of the species card: slightly larger than the default Caption size.
const SPECIES_NAME_FONT_SIZE = 14;
// Read-only cards show only the most abundant species up front; the rest are behind "view all".
const SPECIES_CARD_LIMIT = 5;

export default function SpeciesInput({
  projectId,
  surveyPointId,
  value = [],
  onChange,
  editable = true,
}: Props) {
  const theme = useTheme();
  const { t } = useI18n();
  const { alert } = useAlertDialog();
  const bottomPadding = useBottomContentPadding();
  const [speciesList, setSpeciesList] = useState<Species[]>(value);
  const [scientificNameInput, setScientificNameInput] = useState("");
  const [commonNameInput, setCommonNameInput] = useState("");
  const [familyInput, setFamilyInput] = useState("");
  const [genusInput, setGenusInput] = useState("");
  const [abundanceInput, setAbundanceInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Species[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const abundanceInputRef = useRef<any>(null);
  // Measured field heights, used to anchor the floating suggestions dropdown
  // right below whichever field is active. Percentage-based `top` isn't
  // reliable here: the wrapper's height is itself derived from this same
  // child, so an absolutely positioned sibling can't resolve "100%" against it.
  const [scientificFieldHeight, setScientificFieldHeight] = useState(56);
  const [commonFieldHeight, setCommonFieldHeight] = useState(56);

  // New states for modals
  const [showRegisteredModal, setShowRegisteredModal] = useState(false);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [catalogSpecies, setCatalogSpecies] = useState<ProjectSpeciesCatalog[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedCatalogSpecies, setSelectedCatalogSpecies] = useState<ProjectSpeciesCatalog | null>(null);
  const [catalogAbundanceInput, setCatalogAbundanceInput] = useState("");
  const [catalogSearchText, setCatalogSearchText] = useState("");
  const [isUpdatingSpecies, setIsUpdatingSpecies] = useState(false);
  // "Species added" confirmation inside the catalog modal: the global
  // alert() can't be used here (Portal/Dialog mounted at the app root) -
  // a native RN Modal always sits on a layer above any Portal rendered
  // in the normal tree, so the alert ended up hidden behind the
  // catalog. Paper's Snackbar doesn't use Portal by default, so rendered
  // here inside the Modal itself it stays in the same native window and overlaps it.
  const [catalogSnackbarMessage, setCatalogSnackbarMessage] = useState<string | null>(null);
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  const [showAllSpeciesModal, setShowAllSpeciesModal] = useState(false);



  // Load initial species
  useEffect(() => {
    setSpeciesList(value);
  }, [value]);

  // Load catalog when modal opens
  useEffect(() => {
    if (showCatalogModal && catalogSpecies.length === 0) {
      loadCatalog();
    }
  }, [showCatalogModal]);

  const toggleFamilyExpanded = (family: string) => {
    const newExpanded = new Set(expandedFamilies);
    if (newExpanded.has(family)) {
      newExpanded.delete(family);
    } else {
      newExpanded.add(family);
    }
    setExpandedFamilies(newExpanded);
  };

  const groupCatalogByFamily = () => {
    const grouped: { [key: string]: ProjectSpeciesCatalog[] } = {};

    catalogSpecies.forEach(species => {
      const family = species.family || t("species.noFamily");

      if (!grouped[family]) {
        grouped[family] = [];
      }
      grouped[family].push(species);
    });

    return Object.keys(grouped)
      .sort()
      .map(family => ({
        family,
        species: grouped[family].sort((a, b) =>
          (a.scientific_name || "").localeCompare(b.scientific_name || "")
        ),
      }));
  };

  const loadCatalog = async () => {
    try {
      setCatalogLoading(true);
      const catalog = await getProjectSpeciesCatalogByProject(projectId);
      setCatalogSpecies(catalog);
    } catch (error) {
      console.error("Error loading catalog:", error);
      setCatalogSpecies([]);
    } finally {
      setCatalogLoading(false);
    }
  };



  const performSearch = async (searchText: string) => {
    try {
      setLoading(true);
      const results = await searchSpeciesAutocomplete(projectId, searchText, 10);
      setSuggestions(results);
      setShowSuggestions(true);
    } catch (error) {
      console.error("Error searching species:", error);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  // Search is triggered directly from onChangeText (real typing only), never
  // from an effect watching the input state — otherwise programmatically
  // filling the fields after picking a suggestion would re-trigger a search
  // against the value we just selected and pop the dropdown back open.
  const triggerSearch = (searchTerm: string) => {
    if (searchTerm.trim().length > 1) {
      performSearch(searchTerm);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleScientificNameChange = (text: string) => {
    setScientificNameInput(text);
    triggerSearch(text || commonNameInput);
  };

  const handleCommonNameChange = (text: string) => {
    setCommonNameInput(text);
    triggerSearch(scientificNameInput || text);
  };

  const handleSelectSuggestion = (species: Species) => {
    setScientificNameInput(species.scientific_name || "");
    setCommonNameInput(joinCommonNames(species.common_names));
    setFamilyInput(species.family || "");
    setGenusInput(species.genus || "");
    setShowSuggestions(false);
    setSuggestions([]);

    // Advance straight to abundance instead of leaving focus on the name
    // field, speeding up entry and avoiding an extra tap.
    abundanceInputRef.current?.focus();
  };

  // Which field the floating suggestions dropdown should anchor to, mirroring
  // the same precedence used to pick the search term below.
  const activeSuggestionField: "scientific" | "common" = scientificNameInput.trim()
    ? "scientific"
    : "common";

  // Abundance is optional: display a "not recorded" indicator instead of a number when absent.
  const formatAbundance = (value?: number | null): string =>
    value != null ? value.toString() : t("species.notRecorded");

  // Common names are entered/displayed as a single semicolon-separated text field.
  const splitCommonNames = (text: string): string[] =>
    text.split(";").map((name) => name.trim()).filter(Boolean);
  const joinCommonNames = (names?: string[]): string => (names ?? []).join("; ");

  // Check if a species is already in the list by scientific name. excludeId
  // lets an edit-in-progress ignore its own entry when checking for collisions.
  const findExistingSpecies = (scientificName: string, excludeId?: number): Species | undefined => {
    return speciesList.find(
      (s) => s.id !== excludeId && s.scientific_name?.toLowerCase() === scientificName.toLowerCase()
    );
  };

  // Filter catalog species based on search text
  const filteredCatalogSpecies = catalogSpecies.filter((species) => {
    const searchLower = catalogSearchText.toLowerCase();
    const matchesScientific = species.scientific_name.toLowerCase().includes(searchLower);
    const matchesFamily = species.family?.toLowerCase().includes(searchLower);
    const matchesGenus = species.genus?.toLowerCase().includes(searchLower);
    const matchesCommon = species.common_names?.some((cn) =>
      cn.common_name.toLowerCase().includes(searchLower)
    );
    return matchesScientific || matchesFamily || matchesGenus || matchesCommon;
  });

  const handleAddSpecies = async () => {
    const commonNames = splitCommonNames(commonNameInput);

    // Validate that at least one name is provided
    if (!scientificNameInput.trim() && commonNames.length === 0) {
      alert(t("common.error"), t("species.enterSpeciesName"));
      return;
    }

    // Abundance is optional: an empty field means "not recorded" (null),
    // anything typed is treated as a count of at least 1 individual.
    const trimmedAbundance = abundanceInput.trim();
    const abundance = trimmedAbundance ? Math.max(parseInt(trimmedAbundance) || 1, 1) : null;
    const scientificName = scientificNameInput.trim();
    const family = familyInput.trim();
    const genus = genusInput.trim();
    const isNewEntry = !editingId;

    if (scientificName && findExistingSpecies(scientificName, editingId ?? undefined)) {
      alert(t("common.error"), t("species.duplicateSpecies"));
      return;
    }

    // Create new species object (without ID for now, will be assigned by database)
    const newSpecies: Species = {
      id: editingId ?? Date.now(), // Temporary ID
      project_id: projectId,
      point_id: surveyPointId,
      scientific_name: scientificName || undefined,
      common_names: commonNames,
      family: family || undefined,
      genus: genus || undefined,
      abundance,
      created_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
    };

    let updatedList: Species[];

    if (editingId) {
      // Update existing species
      updatedList = speciesList.map((s) => (s.id === editingId ? newSpecies : s));
      setEditingId(null);
    } else {
      // Add new species
      updatedList = [...speciesList, newSpecies];
    }

    setSpeciesList(updatedList);
    onChange(updatedList);

    // Reset input fields
    setScientificNameInput("");
    setCommonNameInput("");
    setFamilyInput("");
    setGenusInput("");
    setAbundanceInput("");
    setShowSuggestions(false);
    setSuggestions([]);

    // A manually typed new species also joins the project catalog, the same
    // way species imported from GBIF/SpeciesLink do, so it becomes reusable
    // for future points (and for users who never do online lookups at all).
    if (isNewEntry && scientificName) {
      const alreadyInCatalog = await projectSpeciesExists(projectId, scientificName);
      if (!alreadyInCatalog) {
        const catalogSpeciesId = await createProjectSpecies({
          project_id: projectId,
          scientific_name: scientificName,
          family: family || undefined,
          genus: genus || undefined,
          source: "manual",
          common_names: commonNames.map((name) => ({
            common_name: name,
            language: "pt",
            source: "manual" as const,
          })),
        });

        if (catalogSpeciesId && catalogSpecies.length > 0) {
          const created = await getProjectSpeciesById(catalogSpeciesId);
          if (created) {
            setCatalogSpecies((prev) => [...prev, created]);
          }
        }
      }
    }
  };

  const handleAddFromCatalog = () => {
    if (!selectedCatalogSpecies) {
      alert(t("common.error"), t("species.selectSpecies"));
      return;
    }

    const trimmedCatalogAbundance = catalogAbundanceInput.trim();
    const abundance = trimmedCatalogAbundance
      ? Math.max(parseInt(trimmedCatalogAbundance) || 1, 1)
      : null;
    const abundanceSuffix =
      abundance != null
        ? ` ${t("species.speciesWithAbundance")} ${abundance}`
        : ` (${t("species.notRecorded")})`;
    const existingSpecies = findExistingSpecies(selectedCatalogSpecies.scientific_name);

    let updatedList: Species[];
    let actionMessage: string;

    if (existingSpecies) {
      // Species is already in the list (regardless of how the UI got here) -
      // always update it in place instead of creating a duplicate entry.
      updatedList = speciesList.map((s) =>
        s.id === existingSpecies.id
          ? { ...s, abundance, last_updated: new Date().toISOString() }
          : s
      );
      actionMessage = `${selectedCatalogSpecies.scientific_name}${abundanceSuffix}`;
      setIsUpdatingSpecies(false);
    } else {
      // Add new species
      const newSpecies: Species = {
        id: Date.now(),
        project_id: projectId,
        point_id: surveyPointId,
        scientific_name: selectedCatalogSpecies.scientific_name,
        common_names: selectedCatalogSpecies.common_names?.map((cn) => cn.common_name) ?? [],
        abundance,
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      };
      updatedList = [...speciesList, newSpecies];
      actionMessage = `${selectedCatalogSpecies.scientific_name}${abundanceSuffix}`;
    }

    setSpeciesList(updatedList);
    onChange(updatedList);

    // Show confirmation message (Snackbar inside the catalog Modal itself -
    // see comment on catalogSnackbarMessage)
    setCatalogSnackbarMessage(actionMessage);

    // Reset selection but keep modal open
    setSelectedCatalogSpecies(null);
    setCatalogAbundanceInput("");
  };

  const handleEditSpecies = (species: Species) => {
    setScientificNameInput(species.scientific_name || "");
    setCommonNameInput(joinCommonNames(species.common_names));
    setFamilyInput(species.family || "");
    setGenusInput(species.genus || "");
    setAbundanceInput(species.abundance != null ? species.abundance.toString() : "");
    setEditingId(species.id);
    setShowRegisteredModal(false);
  };

  const handleRemoveSpecies = (id: number) => {
    const updatedList = speciesList.filter((s) => s.id !== id);
    setSpeciesList(updatedList);
    onChange(updatedList);
  };

  const handleClearInputs = () => {
    setScientificNameInput("");
    setCommonNameInput("");
    setFamilyInput("");
    setGenusInput("");
    setAbundanceInput("");
    setEditingId(null);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const renderSuggestionItem = ({ item }: { item: Species }) => (
    <Pressable
      onPress={() => handleSelectSuggestion(item)}
      style={({ pressed }) => [
        styles.suggestionItem,
        { backgroundColor: pressed ? theme.colors.surfaceVariant : theme.colors.surface },
      ]}
    >
      <View>
        {item.scientific_name && (
          <Caption style={{ fontStyle: "italic", color: theme.colors.primary, fontWeight: "500" }}>
            {item.scientific_name}
          </Caption>
        )}
        {item.common_names && item.common_names.length > 0 && (
          <Caption style={{ color: theme.colors.onSurface }}>
            {joinCommonNames(item.common_names)}
          </Caption>
        )}
      </View>
    </Pressable>
  );

  // Shared visual identity for a species record: scientific name (larger, italic, primary
  // color - the highlight of the card) on top, leading with the abundance badge on the same
  // line; popular name(s), when present, in a plain line below. A scientific name too long to
  // fit used to wrap into an ugly second line; instead it now stays on a single line inside a
  // horizontal ScrollView, which only becomes scrollable when the name actually overflows.
  const renderSpeciesCardBody = (species: Species) => (
    <>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {species.abundance != null && (
          <Badge style={{ marginRight: 8 }}>{species.abundance}</Badge>
        )}
        {species.scientific_name && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexShrink: 1 }}>
            <Caption
              numberOfLines={1}
              style={{
                fontStyle: "italic",
                color: theme.colors.primary,
                fontSize: SPECIES_NAME_FONT_SIZE,
              }}
            >
              {species.scientific_name}
            </Caption>
          </ScrollView>
        )}
      </View>
      {species.common_names && species.common_names.length > 0 && (
        <Caption style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
          {joinCommonNames(species.common_names)}
        </Caption>
      )}
    </>
  );

  const renderRegisteredSpeciesItem = ({ item }: { item: Species }) => (
    <View
      style={[
        styles.speciesItem,
        {
          backgroundColor: theme.colors.surfaceVariant,
          borderLeftColor: theme.colors.primary,
          borderLeftWidth: 3,
        },
      ]}
    >
      <View style={styles.speciesContent}>
        {renderSpeciesCardBody(item)}
        {(item.family || item.genus) && (
          <Caption style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
            {item.family && `${t("species.family")}: ${item.family}`}
            {item.family && item.genus && " • "}
            {item.genus && `${t("species.genus")}: ${item.genus}`}
          </Caption>
        )}
      </View>

      <View style={styles.actionButtons}>
        <IconButton
          icon="pencil"
          size={18}
          onPress={() => handleEditSpecies(item)}
        />
        <IconButton
          icon="delete"
          size={18}
          iconColor={theme.colors.error}
          onPress={() => {
            handleRemoveSpecies(item.id);
          }}
        />
      </View>
    </View>
  );

  const renderCatalogSpeciesItem = ({ item }: { item: ProjectSpeciesCatalog }) => {
    const existingSpecies = findExistingSpecies(item.scientific_name);
    const isSelected = selectedCatalogSpecies?.id === item.id;
    const isAlreadyAdded = !!existingSpecies;

    return (
      <Pressable
        key={item.id}
        onPress={() => {
          setSelectedCatalogSpecies(item);
          if (existingSpecies) {
            setCatalogAbundanceInput(
              existingSpecies.abundance != null ? existingSpecies.abundance.toString() : "",
            );
            setIsUpdatingSpecies(true);
          } else {
            setCatalogAbundanceInput("");
            setIsUpdatingSpecies(false);
          }
        }}
        style={[
          styles.catalogItem,
          {
            backgroundColor: isSelected
              ? theme.colors.primaryContainer
              : isAlreadyAdded
              ? theme.colors.tertiaryContainer
              : theme.colors.surface,
            borderColor: isSelected
              ? theme.colors.primary
              : isAlreadyAdded
              ? theme.colors.tertiary
              : theme.colors.outline,
            borderWidth: 2,
          },
        ]}
      >
        <View style={styles.catalogItemContent}>
          <Caption style={{ fontStyle: "italic", color: theme.colors.primary, fontSize: SPECIES_NAME_FONT_SIZE }}>
            {item.scientific_name}
          </Caption>
          {isAlreadyAdded && (
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
              <Icon source="check-circle" size={14} color={theme.colors.tertiary} />
              <Caption
                style={{
                  color: theme.colors.tertiary,
                  fontWeight: "600",
                  marginLeft: 4,
                }}
              >
                {t("species.alreadyAdded")} (Abund: {formatAbundance(existingSpecies.abundance)})
              </Caption>
            </View>
          )}
          {item.common_names && item.common_names.length > 0 && (
            <View style={{ marginTop: 6 }}>
              {item.common_names.slice(0, 2).map((cn, idx) => (
                <Chip
                  key={idx}
                  compact
                  mode="flat"
                  style={{ marginRight: 4, marginBottom: 2 }}
                >
                  {cn.common_name}
                </Chip>
              ))}
            </View>
          )}
        </View>
        <IconButton
          icon="plus"
          size={24}
          iconColor={theme.colors.primary}
          onPress={() => {
            setSelectedCatalogSpecies(item);
            if (existingSpecies) {
              setCatalogAbundanceInput(
                existingSpecies.abundance != null ? existingSpecies.abundance.toString() : "",
              );
              setIsUpdatingSpecies(true);
            } else {
              setCatalogAbundanceInput("");
              setIsUpdatingSpecies(false);
            }
          }}
        />
      </Pressable>
    );
  };

  if (!editable) {
    // Highest abundance first (species without a recorded abundance sort last); ties keep
    // their original order.
    const sortedSpecies = speciesList
      .map((species, index) => ({ species, index }))
      .sort((a, b) => (b.species.abundance ?? -1) - (a.species.abundance ?? -1) || a.index - b.index)
      .map(({ species }) => species);
    const topSpecies = sortedSpecies.slice(0, SPECIES_CARD_LIMIT);
    const hasMoreSpecies = speciesList.length > SPECIES_CARD_LIMIT;

    return (
      <ScrollView style={styles.container}>
        {speciesList.length > 0 ? (
          <>
            {topSpecies.map((species) => (
              <View
                key={species.id}
                style={[
                  styles.speciesItem,
                  {
                    backgroundColor: theme.colors.surfaceVariant,
                    borderLeftColor: theme.colors.primary,
                    borderLeftWidth: 3,
                  },
                ]}
              >
                <View style={styles.speciesContent}>{renderSpeciesCardBody(species)}</View>
              </View>
            ))}
            {hasMoreSpecies && (
              <Button mode="text" compact onPress={() => setShowAllSpeciesModal(true)}>
                {t("common.viewAllCount", { count: speciesList.length })}
              </Button>
            )}
          </>
        ) : (
          <Caption style={{ textAlign: "center", marginVertical: 16 }}>
            {t("species.noRegisteredSpecies")}
          </Caption>
        )}

        <Modal
          visible={showAllSpeciesModal}
          onRequestClose={() => setShowAllSpeciesModal(false)}
          animationType="slide"
          presentationStyle="pageSheet"
        >
          <View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
            <View style={styles.modalHeader}>
              <Paragraph style={{ fontSize: 18, fontWeight: "600", flex: 1 }}>
                {`${t("species.registeredSpecies")} (${speciesList.length})`}
              </Paragraph>
              <IconButton icon="close" onPress={() => setShowAllSpeciesModal(false)} />
            </View>

            <Divider />

            <FlatList
              data={sortedSpecies}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.speciesItem,
                    {
                      backgroundColor: theme.colors.surfaceVariant,
                      borderLeftColor: theme.colors.primary,
                      borderLeftWidth: 3,
                    },
                  ]}
                >
                  <View style={styles.speciesContent}>{renderSpeciesCardBody(item)}</View>
                </View>
              )}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={styles.listContent}
            />
          </View>
        </Modal>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header Buttons */}
      <View style={styles.headerButtonsRow}>
        <Button
          mode={speciesList.length > 0 ? "outlined" : "text"}
          onPress={() => speciesList.length > 0 && setShowRegisteredModal(true)}
          disabled={speciesList.length === 0}
          style={[styles.headerButton, { borderRadius: BUTTON_RADIUS }]}
          labelStyle={{ color: speciesList.length > 0 ? theme.colors.primary : theme.colors.outline }}
        >
          Espécies ({speciesList.length})
        </Button>

        <Button
          mode="outlined"
          onPress={() => setShowCatalogModal(true)}
          style={[styles.headerButton, { borderRadius: BUTTON_RADIUS }]}
        >
          Catálogo
        </Button>
      </View>

      {/* Input Fields */}
      <View style={styles.inputSection}>
        {/* Scientific Name with Floating Suggestions */}
        <View style={styles.scientificNameWrapper}>
          <TextInput
            mode="outlined"
            label={t("species.scientificName")}
            value={scientificNameInput}
            onChangeText={handleScientificNameChange}
            placeholder={t("species.placeholderScientificName")}
            style={styles.input}
            outlineColor={theme.colors.outline}
            activeOutlineColor={theme.colors.primary}
            onLayout={(e) => setScientificFieldHeight(e.nativeEvent.layout.height)}
          />

          {activeSuggestionField === "scientific" && showSuggestions && suggestions.length > 0 && (
            <Surface style={[
              styles.suggestionsDropdown,
              {
                top: scientificFieldHeight + 4,
                borderColor: theme.colors.outline,
                backgroundColor: theme.colors.surface,
              }
            ]} elevation={4}>
              <FlatList
                data={suggestions}
                renderItem={renderSuggestionItem}
                keyExtractor={(item) => item.id.toString()}
                scrollEnabled={false}
                nestedScrollEnabled={false}
                ItemSeparatorComponent={() => <Divider />}
              />
            </Surface>
          )}

          {activeSuggestionField === "scientific" && loading && suggestions.length === 0 && (
            <View style={[styles.suggestionsDropdown, { top: scientificFieldHeight + 4, justifyContent: "center" }]}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          )}
        </View>

        {/* Common Name with Floating Suggestions */}
        <View style={[styles.commonNameWrapper, { marginTop: 12 }]}>
          <TextInput
            mode="outlined"
            label={t("species.commonNames")}
            value={commonNameInput}
            onChangeText={handleCommonNameChange}
            placeholder={t("species.placeholderCommonName")}
            style={styles.input}
            outlineColor={theme.colors.outline}
            activeOutlineColor={theme.colors.primary}
            onLayout={(e) => setCommonFieldHeight(e.nativeEvent.layout.height)}
          />

          {activeSuggestionField === "common" && showSuggestions && suggestions.length > 0 && (
            <Surface style={[
              styles.suggestionsDropdown,
              {
                top: commonFieldHeight + 4,
                borderColor: theme.colors.outline,
                backgroundColor: theme.colors.surface,
              }
            ]} elevation={4}>
              <FlatList
                data={suggestions}
                renderItem={renderSuggestionItem}
                keyExtractor={(item) => item.id.toString()}
                scrollEnabled={false}
                nestedScrollEnabled={false}
                ItemSeparatorComponent={() => <Divider />}
              />
            </Surface>
          )}

          {activeSuggestionField === "common" && loading && suggestions.length === 0 && (
            <View style={[styles.suggestionsDropdown, { top: commonFieldHeight + 4, justifyContent: "center" }]}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          )}
        </View>

        <View style={styles.familyGenusRow}>
          <TextInput
            mode="outlined"
            label={t("species.family")}
            value={familyInput}
            onChangeText={setFamilyInput}
            style={[styles.input, { flex: 1, marginRight: 6 }]}
            outlineColor={theme.colors.outline}
            activeOutlineColor={theme.colors.primary}
          />
          <TextInput
            mode="outlined"
            label={t("species.genus")}
            value={genusInput}
            onChangeText={setGenusInput}
            style={[styles.input, { flex: 1, marginLeft: 6 }]}
            outlineColor={theme.colors.outline}
            activeOutlineColor={theme.colors.primary}
          />
        </View>

        <TextInput
          ref={abundanceInputRef}
          mode="outlined"
          label={t("species.abundance")}
          value={abundanceInput}
          onChangeText={setAbundanceInput}
          placeholder={t("common.optional")}
          keyboardType="number-pad"
          style={styles.input}
          outlineColor={theme.colors.outline}
          activeOutlineColor={theme.colors.primary}
          right={<TextInput.Affix text={t("surveyView.individuals")} />}
        />

        {/* Action Buttons */}
        <View style={styles.buttonRow}>
          <IconButton
            icon={editingId ? "pencil" : "plus"}
            mode="contained"
            onPress={handleAddSpecies}
            style={{ flex: 1, borderRadius: BUTTON_RADIUS }}
          />
          <IconButton
            icon="close"
            mode="outlined"
            onPress={handleClearInputs}
            style={{ marginLeft: 8, flex: 1, borderRadius: BUTTON_RADIUS }}
          />
        </View>
      </View>

      {/* Modal - Registered Species */}
      <Modal
        visible={showRegisteredModal}
        onRequestClose={() => setShowRegisteredModal(false)}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
          <View style={styles.modalHeader}>
            <Paragraph style={{ fontSize: 18, fontWeight: "600", flex: 1 }}>
              Espécies Registradas ({speciesList.length})
            </Paragraph>
            <IconButton
              icon="close"
              onPress={() => setShowRegisteredModal(false)}
            />
          </View>

          <Divider />

          <FlatList
            data={speciesList}
            renderItem={renderRegisteredSpeciesItem}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Caption style={{ textAlign: "center", marginVertical: 16, color: theme.colors.outline }}>
                {t("species.noSpeciesAdded")}
              </Caption>
            }
          />
        </View>
      </Modal>

      {/* Modal - Catalog */}
      <Modal
        visible={showCatalogModal}
        onRequestClose={() => {
          setShowCatalogModal(false);
          setSelectedCatalogSpecies(null);
          setCatalogAbundanceInput("");
          setCatalogSnackbarMessage(null);
        }}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
          <View style={styles.modalHeader}>
            <Paragraph style={{ fontSize: 18, fontWeight: "600", flex: 1 }}>
              Catálogo de Espécies
            </Paragraph>
            <IconButton
              icon="close"
              onPress={() => {
                setShowCatalogModal(false);
                setSelectedCatalogSpecies(null);
                setCatalogAbundanceInput("");
                setCatalogSnackbarMessage(null);
              }}
            />
          </View>

          <Divider />

          {catalogLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : catalogSpecies.length > 0 ? (
            <>
              <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                <TextInput
                  mode="outlined"
                  label={t("species.searchSpecies")}
                  value={catalogSearchText}
                  onChangeText={setCatalogSearchText}
                  placeholder={t("species.searchSpecies")}
                  style={{ marginBottom: 8 }}
                  outlineColor={theme.colors.outline}
                  activeOutlineColor={theme.colors.primary}
                  left={<TextInput.Icon icon="magnify" />}
                />
                <Caption style={{ color: theme.colors.onSurfaceVariant }}>
                  {filteredCatalogSpecies.length} de {catalogSpecies.length} espécies
                </Caption>
              </View>

              <ScrollView style={{ flex: 1, paddingHorizontal: 12 }}>
                {(() => {
                  const matchesSearch = (s: ProjectSpeciesCatalog) =>
                    s.scientific_name.toLowerCase().includes(catalogSearchText.toLowerCase()) ||
                    !!s.common_names?.some(cn => cn.common_name.toLowerCase().includes(catalogSearchText.toLowerCase()));

                  const filteredFamilyGroups = groupCatalogByFamily()
                    .map(familyGroup => ({
                      family: familyGroup.family,
                      species: familyGroup.species.filter(matchesSearch),
                    }))
                    .filter(familyGroup => familyGroup.species.length > 0);

                  return filteredFamilyGroups.length > 0 ? (
                    filteredFamilyGroups.map((familyGroup) => (
                      <View key={familyGroup.family} style={{ marginBottom: 12 }}>
                        {/* Family Header */}
                        <Pressable
                          onPress={() => toggleFamilyExpanded(familyGroup.family)}
                          style={[
                            styles.catalogFamilyHeader,
                            { backgroundColor: theme.colors.surfaceVariant },
                          ]}
                        >
                          <IconButton
                            icon={expandedFamilies.has(familyGroup.family) ? "chevron-down" : "chevron-right"}
                            size={20}
                            iconColor={theme.colors.primary}
                          />
                          <View style={{ flex: 1 }}>
                            <Caption
                              style={{
                                color: theme.colors.primary,
                                fontWeight: "600",
                              }}
                            >
                              {familyGroup.family}
                            </Caption>
                            <Caption style={{ color: theme.colors.onSurfaceVariant }}>
                              {familyGroup.species.length} espécie{familyGroup.species.length !== 1 ? "s" : ""}
                            </Caption>
                          </View>
                        </Pressable>

                        {/* Species */}
                        {expandedFamilies.has(familyGroup.family) && (
                          <View style={{ paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: "rgba(0, 0, 0, 0.1)" }}>
                            {familyGroup.species.map((item) => renderCatalogSpeciesItem({ item }))}
                          </View>
                        )}
                      </View>
                    ))
                  ) : (
                    <Caption style={{ textAlign: "center", marginVertical: 16, color: theme.colors.outline }}>
                      {t("species.noSpeciesFound")}
                    </Caption>
                  );
                })()}
              </ScrollView>

              {selectedCatalogSpecies && (
                <View style={[styles.modalFooter, { borderTopColor: theme.colors.outline, paddingBottom: bottomPadding }]}>
                  <TextInput
                    mode="outlined"
                    label={t("species.abundance")}
                    value={catalogAbundanceInput}
                    onChangeText={setCatalogAbundanceInput}
                    placeholder={t("common.optional")}
                    keyboardType="number-pad"
                    style={{ marginBottom: 12 }}
                    outlineColor={theme.colors.outline}
                    activeOutlineColor={theme.colors.primary}
                    right={<TextInput.Affix text={t("surveyView.individuals")} />}
                  />

                  <Button
                    mode="contained"
                    onPress={handleAddFromCatalog}
                    style={{ marginBottom: 8, borderRadius: BUTTON_RADIUS }}
                  >
                    {isUpdatingSpecies ? t("species.modifyRecord") : t("species.addToCollection")}
                  </Button>

                  <Button
                    mode="outlined"
                    onPress={() => {
                      setSelectedCatalogSpecies(null);
                      setCatalogAbundanceInput("");
                      setIsUpdatingSpecies(false);
                    }}
                    style={{ borderRadius: BUTTON_RADIUS }}
                  >
                    {t("common.cancel")}
                  </Button>
                </View>
              )}
            </>
          ) : (
            <Caption style={{ textAlign: "center", marginVertical: 16, color: theme.colors.outline }}>
              {t("species.noCatalogSpecies")}
            </Caption>
          )}

          <Snackbar
            visible={!!catalogSnackbarMessage}
            onDismiss={() => setCatalogSnackbarMessage(null)}
            duration={3000}
            action={{ label: "OK", onPress: () => setCatalogSnackbarMessage(null) }}
          >
            {catalogSnackbarMessage}
          </Snackbar>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  headerButtonsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  headerButton: {
    flex: 1,
  },
  inputSection: {
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  scientificNameWrapper: {
    position: "relative",
    zIndex: 1000,
  },
  commonNameWrapper: {
    position: "relative",
    zIndex: 900,
  },
  input: {
    marginBottom: 12,
  },
  familyGenusRow: {
    flexDirection: "row",
  },
  suggestionsDropdown: {
    position: "absolute",
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: 8,
    maxHeight: 200,
  },
  suggestionsContainer: {
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 12,
    maxHeight: 150,
    backgroundColor: "#f5f5f5",
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  listSection: {
    marginBottom: 8,
  },
  speciesItem: {
    flexDirection: "row",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    justifyContent: "space-between",
    alignItems: "center",
  },
  speciesContent: {
    flex: 1,
  },
  speciesName: {
    fontWeight: "500",
    marginVertical: 2,
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: "space-between",
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  catalogItem: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    justifyContent: "space-between",
    alignItems: "center",
  },
  catalogItemContent: {
    flex: 1,
  },
  catalogFamilyHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 0,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  modalFooter: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
