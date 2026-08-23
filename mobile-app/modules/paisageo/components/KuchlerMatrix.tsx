// src/components/inputs/KuchlerMatrix.tsx

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { View, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { 
  Text, 
  Card, 
  Chip, 
  useTheme, 
  Modal, 
  Portal, 
  ProgressBar, 
  TextInput, 
  Button,
  IconButton,
} from "react-native-paper";
import { useI18n } from "@/contexts/i18n-context";
import { useProtocolTranslations } from "@/hooks/use-protocol-translations";
import { processKuchlerMatrix, LangCode, KuchlerResult } from "@/modules/paisageo/services/kuchler-formula";
import type { ContextFlag } from "@/modules/paisageo/services/vegetation_classifier";
import { VegetationClass } from "@/types/database";
import VegetationPhysiognomyCard from "./VegetationPhysiognomyCard";

// --- CONSTANTS & UTILS ---

// Define the "weight" of each cover class for validation (must not exceed 100%)
const COVER_WEIGHTS: Record<string, number> = {
  c: 76, // > 75%
  i: 51, // 50-75%
  p: 26, // 25-50%
  r: 6,  // 5-25%
  b: 1,  // 1-5%
};

// --- INTERFACES ---

export interface StrataDescription {
  height_id: string;
  height_range: string;
  life_forms: {
    id: string;
    name: string;
    cover_id: string;
    cover_range: string;
    leaf_adaptation?: string;
  }[];
}

export interface KuchlerData {
  raw_formula: string;
  kuchler_formula: string;
  total_strata: number;
  physiognomy_name: string;
  description_text: string;
  strata_descriptions: StrataDescription[];
  matrix: Record<string, Record<string, string>>;
  leaf_matrix: Record<string, string>;
}

interface Props {
  config: any; // The JSON config object
  value?: string; // The saved JSON string from database
  onChange: (value: string) => void;
  // Optional callback to save extra classification columns (group/type) to the DB
  onClassificationChange?: (group: string, type: string) => void;
  onInfoPress?: (text: string) => void;
  // Vegetation classification (Nomos standard or custom), rendered as part of
  // this component via VegetationPhysiognomyCard - see form.tsx for how these
  // are threaded from the project's active vegetation classification.
  classificationType?: "standard" | "custom";
  customClasses?: VegetationClass[];
  selectedClassId?: string;
  onClassIdChange?: (classId: string) => void;
  physiognomyComplement?: string;
  onPhysiognomyComplementChange?: (complement: string) => void;
  // Context flags (mangrove/spiny/semi-lignified) that aren't derivable from
  // the matrix alone - edited outside this component (see form.tsx, a plain
  // generic field like conservation_status/land_use), but must feed back
  // into classification here since they change classifyVegetation's result.
  contextFlags?: ContextFlag[];
}

// One data cell of the matrix (a height class x life form combination). The
// grid is 8 height classes x 15 life forms = 120 of these + 8 leaf cells, all
// previously inlined directly in KuchlerMatrix's JSX with no memo boundary,
// so a single tap (even just opening the selection modal) reconciled all of
// them. Memoized here so a tap only re-renders the ONE cell whose own props
// actually changed. Relocated as-is from KuchlerMatrix's render loop, just
// parametrized - visual output unchanged.
interface MatrixCellProps {
  heightId: string;
  lifeFormId: string;
  cellData: string | null;
  getCoverLabel: (coverId: string) => any;
  translateField: (field: any) => string;
  onPress: (heightId: string, lifeFormId: string) => void;
  onLongPress: (heightId: string, lifeFormId: string) => void;
}

const MatrixCell = React.memo(function MatrixCell({
  heightId,
  lifeFormId,
  cellData,
  getCoverLabel,
  translateField,
  onPress,
  onLongPress,
}: MatrixCellProps) {
  const theme = useTheme();
  const hasValue = cellData !== null;
  return (
    <TouchableOpacity
      style={[
        styles.dataCell,
        { backgroundColor: theme.colors.surface, borderRightColor: theme.colors.outlineVariant },
        hasValue && { backgroundColor: theme.colors.primaryContainer },
      ]}
      onPress={() => onPress(heightId, lifeFormId)}
      onLongPress={() => hasValue && onLongPress(heightId, lifeFormId)}
    >
      {hasValue ? (
        <View style={styles.cellContent}>
          <Text style={[styles.cellValue, { color: theme.colors.onPrimaryContainer }]}>{cellData}</Text>
          <Text style={[styles.cellLabel, { color: theme.colors.onPrimaryContainer }]}>
            {translateField(getCoverLabel(cellData as string))}
          </Text>
        </View>
      ) : (
        <Text style={[styles.emptyCellText, { color: theme.colors.onSurfaceDisabled }]}>–</Text>
      )}
    </TouchableOpacity>
  );
});

// The leaf-adaptation cell at the end of each height row. Same memoization
// reasoning as MatrixCell above; the "clear if present" guard that used to
// live in the inline onLongPress now lives in handleLeafClear itself (see
// KuchlerMatrix), so this always calls onLongPress unconditionally.
interface LeafCellProps {
  heightId: string;
  leafData: string | null;
  disabled: boolean;
  leafAdaptations: any[];
  translateField: (field: any) => string;
  onPress: (heightId: string) => void;
  onLongPress: (heightId: string) => void;
}

const LeafCell = React.memo(function LeafCell({
  heightId,
  leafData,
  disabled,
  leafAdaptations,
  translateField,
  onPress,
  onLongPress,
}: LeafCellProps) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.dataCell,
        { backgroundColor: theme.colors.surfaceVariant, borderRightColor: theme.colors.outlineVariant },
        leafData && { backgroundColor: theme.colors.secondaryContainer },
      ]}
      onPress={() => onPress(heightId)}
      onLongPress={() => onLongPress(heightId)}
      disabled={disabled}
    >
      {leafData ? (
        <View style={styles.cellContent}>
          <Text style={[styles.cellValue, { color: theme.colors.onSecondaryContainer }]}>{leafData}</Text>
          <Text style={[styles.cellLabel, { color: theme.colors.onSecondaryContainer }]}>
            {translateField(leafAdaptations.find((l: any) => l.id === leafData)?.name)}
          </Text>
        </View>
      ) : (
        <Text style={[styles.emptyCellText, { color: theme.colors.onSurfaceDisabled }]}>–</Text>
      )}
    </TouchableOpacity>
  );
});

function KuchlerMatrix({
  config,
  value,
  onChange,
  onClassificationChange,
  onInfoPress,
  classificationType,
  customClasses,
  selectedClassId,
  onClassIdChange,
  physiognomyComplement,
  onPhysiognomyComplementChange,
  contextFlags,
}: Props) {
  const theme = useTheme();
  const { t, currentLanguage } = useI18n();
  const { translateField } = useProtocolTranslations();
  const hasHydratedInitialValue = useRef(false);

  const currentLang = (currentLanguage || "pt") as LangCode;

  // --- MATRIX STATE ---
  const [matrix, setMatrix] = useState<Record<string, Record<string, string>>>({});
  const [leafMatrix, setLeafMatrix] = useState<Record<string, string>>({});

  // Mirror the latest matrix/leafMatrix into refs so cell-tap handlers below
  // can be defined once (useRef(fn).current, stable identity forever) instead
  // of via useCallback with [matrix]/[leafMatrix] deps - which would give
  // every cell a NEW handler on every single tap (since tapping a cell is
  // exactly what changes matrix/leafMatrix), defeating the MatrixCell/LeafCell
  // memoization below for every cell, not just the one that changed.
  const matrixRef = useRef(matrix);
  matrixRef.current = matrix;
  const leafMatrixRef = useRef(leafMatrix);
  leafMatrixRef.current = leafMatrix;

  // Mirrors the contextFlags prop into a ref for the same reason as above -
  // updateParent/handleAutoClassify below always read the latest value
  // without needing to be redefined (and re-passed to every cell) whenever
  // the prop changes.
  const contextFlagsRef = useRef<ContextFlag[]>(contextFlags ?? []);
  contextFlagsRef.current = contextFlags ?? [];

  // --- CLASSIFICATION STATE ---
  const [userPhysiognomyName, setUserPhysiognomyName] = useState("");
  const [classificationGroup, setClassificationGroup] = useState("");

  // --- UI STATE (Modals) ---
  const [modalVisible, setModalVisible] = useState(false);
  const [leafModalVisible, setLeafModalVisible] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    height: string;
    lifeForm?: string;
  } | null>(null);

  // Load initial data
  useEffect(() => {
    if (hasHydratedInitialValue.current) return;
    hasHydratedInitialValue.current = true;

    if (value) {
      try {
        const parsed: KuchlerResult = JSON.parse(value);
        if (parsed.matrix) setMatrix(parsed.matrix);
        if (parsed.leaf_matrix) setLeafMatrix(parsed.leaf_matrix);
        
        // Load the saved final name
        if (parsed.physiognomy_name) setUserPhysiognomyName(parsed.physiognomy_name);
        
        // Load group info if available
        if (parsed.classification_group) setClassificationGroup(parsed.classification_group);

      } catch (e) {
        console.error("Error parsing Kuchler data", e);
      }
    }
  }, [value]);

  // --- HELPER FUNCTIONS (Memoized) ---

  // Memoized: getAllLifeForms is only recalculated when config changes
  const allLifeForms = useMemo(() => {
    const { woody = [], herbaceous = [], special = [] } = config.life_forms;
    return [...woody, ...herbaceous, ...special];
  }, [config.life_forms]);

  const getCellData = useCallback((heightId: string, lifeFormId: string): string | null => {
    return matrix[heightId]?.[lifeFormId] || null;
  }, [matrix]);

  const getLeafData = useCallback((heightId: string): string | null => {
    return leafMatrix[heightId] || null;
  }, [leafMatrix]);

  const getCoverLabel = useCallback((coverId: string) => {
    const coverClass = config.cover_classes.find((c: any) => c.id === coverId);
    return coverClass ? coverClass.label : coverId;
  }, [config.cover_classes]);

  // Height range labels carry the "m" unit for use elsewhere (e.g. the generated
  // Kuchler formula text); the matrix column header already reads "Altura (m)",
  // so the unit is stripped here for a more compact sticky-column display.
  const stripHeightUnit = useCallback((label: string) => label.replace(/m$/i, "").trim(), []);

  // Memoized: calculateStratumUsage is optimized to avoid unnecessary recalculation
  const calculateStratumUsage = useCallback((heightId: string, excludeLifeFormId?: string): number => {
    const row = matrix[heightId] || {};
    let total = 0;
    
    Object.entries(row).forEach(([lifeForm, coverId]) => {
      if (lifeForm !== excludeLifeFormId) {
        total += COVER_WEIGHTS[coverId] || 0;
      }
    });
    
    return total;
  }, [matrix]);

  // --- CORE UPDATE LOGIC ---

  const updateParent = (
    newMatrix: typeof matrix,
    newLeafMatrix: typeof leafMatrix,
    forcedName?: string // If provided, we force this name (used by text edit or classify button)
  ) => {
    const tempInput = JSON.stringify({
      matrix: newMatrix,
      leaf_matrix: newLeafMatrix,
    });

    // Only an explicitly forced name (manual title edit) overrides the
    // classification - falling back to the previous userPhysiognomyName
    // state here would "lock" the name to whatever it was after the first
    // edit, since that state is itself set from the previous result below.
    const result = processKuchlerMatrix(
      tempInput,
      config.height_classes,
      config.cover_classes,
      config.life_forms,
      translateField,
      currentLang,
      forcedName === "" ? undefined : forcedName,
      contextFlagsRef.current
    );

    // Always reflect the freshly computed classification, not just when a
    // name is explicitly forced - the physiognomy name/group must update
    // live as the user fills in each cell, not only at specific triggers.
    setUserPhysiognomyName(result.physiognomy_name);
    setClassificationGroup(result.classification_group);

    if (onClassificationChange) {
      onClassificationChange(result.classification_group, result.classification_type);
    }

    onChange(JSON.stringify(result));
  };

  // updateParent itself is redefined every render (it closes over config/
  // translateField/currentLang/onChange, cheap to recreate) - mirrored into a
  // ref so the stable cell handlers below always call the latest version.
  const updateParentRef = useRef(updateParent);
  updateParentRef.current = updateParent;

  // Re-run classification when contextFlags changes on its own (e.g. the
  // user marks "mangrove" without touching the matrix afterward) - skips
  // its own first invocation (mount), so it never fires before the matrix
  // has been hydrated from `value` and never clobbers a freshly loaded
  // point with a premature reclassification.
  const isFirstFlagsEffect = useRef(true);
  useEffect(() => {
    if (isFirstFlagsEffect.current) {
      isFirstFlagsEffect.current = false;
      return;
    }
    updateParentRef.current(matrixRef.current, leafMatrixRef.current);
  }, [contextFlags]);

  // --- HANDLERS (Memoized) ---

  const handleAutoClassify = useCallback(() => {
    const tempInput = JSON.stringify({ matrix, leaf_matrix: leafMatrix });
    const result = processKuchlerMatrix(
        tempInput,
        config.height_classes,
        config.cover_classes,
        config.life_forms,
        translateField,
        currentLang,
        undefined,
        contextFlagsRef.current
    );

    setUserPhysiognomyName(result.auto_physiognomy_name);
    setClassificationGroup(result.classification_group);
    
    if (onClassificationChange) {
        onClassificationChange(result.classification_group, result.classification_type);
    }
    
    onChange(JSON.stringify(result));
  }, [matrix, leafMatrix, config, translateField, currentLang, onChange, onClassificationChange]);

  const handleTextChange = useCallback((text: string) => {
    setUserPhysiognomyName(text);
    updateParent(matrix, leafMatrix, text);
  }, [matrix, leafMatrix]);

  const handleCellPress = useCallback((heightId: string, lifeFormId: string) => {
    setSelectedCell({ height: heightId, lifeForm: lifeFormId });
    setModalVisible(true);
  }, []);

  const handleCoverSelect = useCallback((coverId: string) => {
    if (!selectedCell || !selectedCell.height || !selectedCell.lifeForm) return;

    const newMatrix = { ...matrix };
    const heightId = selectedCell.height;
    const lifeFormId = selectedCell.lifeForm;

    if (!newMatrix[heightId]) {
      newMatrix[heightId] = {};
    }

    newMatrix[heightId][lifeFormId] = coverId;

    setMatrix(newMatrix);
    updateParent(newMatrix, leafMatrix);
    setModalVisible(false);
    setSelectedCell(null);
  }, [selectedCell, matrix, leafMatrix]);

  const handleLeafSelect = useCallback((heightId: string, leafId: string | null) => {
    const newLeafMatrix = { ...leafMatrix };
    if (leafId) {
      newLeafMatrix[heightId] = leafId;
    } else {
      delete newLeafMatrix[heightId];
    }
    setLeafMatrix(newLeafMatrix);
    updateParent(matrix, newLeafMatrix);
    setLeafModalVisible(false);
    setSelectedCell(null);
  }, [matrix, leafMatrix]);

  const handleOpenLeafModal = useRef((heightId: string) => {
    if (matrixRef.current[heightId] && Object.keys(matrixRef.current[heightId]).length > 0) {
      setSelectedCell({ height: heightId, lifeForm: "" });
      setLeafModalVisible(true);
    }
  }).current;

  const handleCellClear = useRef((heightId: string, lifeFormId: string) => {
    const newMatrix = { ...matrixRef.current };
    if (newMatrix[heightId]) {
      delete newMatrix[heightId][lifeFormId];
      if (Object.keys(newMatrix[heightId]).length === 0) {
        delete newMatrix[heightId];
        const newLeafMatrix = { ...leafMatrixRef.current };
        delete newLeafMatrix[heightId];
        setLeafMatrix(newLeafMatrix);
        setMatrix(newMatrix);
        updateParentRef.current(newMatrix, newLeafMatrix);
        return;
      }
    }
    setMatrix(newMatrix);
    updateParentRef.current(newMatrix, leafMatrixRef.current);
  }).current;

  // Extracted from what used to be an inline onLongPress on the leaf cell -
  // same stabilization reason as handleCellClear above.
  const handleLeafClear = useRef((heightId: string) => {
    if (leafMatrixRef.current[heightId]) {
      const newLeafMatrix = { ...leafMatrixRef.current };
      delete newLeafMatrix[heightId];
      setLeafMatrix(newLeafMatrix);
      updateParentRef.current(matrixRef.current, newLeafMatrix);
    }
  }).current;

  const currentUsage = selectedCell && selectedCell.lifeForm 
    ? calculateStratumUsage(selectedCell.height, selectedCell.lifeForm) 
    : 0;
  
  const usagePercent = useMemo(() => currentUsage / 100, [currentUsage]);
  const usageColor = useMemo(() => 
    usagePercent > 0.9 ? theme.colors.error : 
    usagePercent > 0.7 ? theme.colors.tertiary : theme.colors.primary
  , [usagePercent, theme.colors.error, theme.colors.tertiary, theme.colors.primary]);

  return (
    <View style={styles.container}>
      
      {/* 1. TOP: MATRIX STATUS CARD (Raw Formula) */}
      <Card
        mode="outlined"
        style={[
          styles.formulaCard,
          { backgroundColor: theme.colors.elevation.level1 },
        ]}
      >
        <Card.Content style={{ paddingVertical: 8, paddingHorizontal: 12 }}>
          <Text
            variant="labelSmall"
            style={{ color: theme.colors.secondary, fontSize: 10 }}
          >
            {t("survey.matrixFilling") || "Preenchimento da Matriz (Fórmula Bruta)"}:
          </Text>
          <Text
            variant="bodyLarge"
            style={{
              fontWeight: "bold",
              color: theme.colors.primary,
              marginTop: 2,
            }}
          >
            {(() => {
              if (!value) return `(${t("survey.empty")})`;
              try {
                const parsed = JSON.parse(value);
                return parsed.raw_formula || `(${t("survey.empty")})`;
              } catch {
                return `(${t("survey.empty")})`;
              }
            })()}
          </Text>
        </Card.Content>
      </Card>

      <Text
        variant="bodySmall"
        style={[styles.helperText, { color: theme.colors.onSurfaceVariant }]}
      >
        {translateField(config.helper_text) || t("survey.tapToDefine")}
      </Text>

      {/* 2. MIDDLE: SCROLLABLE MATRIX TABLE */}
      <View style={styles.tableWrapper}>
        {/* Sticky columns: height class code (#) + height range, stay visible while the rest scrolls */}
        <View
          style={[
            styles.stickyColumns,
            { backgroundColor: theme.colors.elevation.level2, shadowColor: theme.colors.shadow },
          ]}
        >
          <View style={[styles.tableRow, { borderBottomColor: theme.colors.outlineVariant }]}>
            <View style={[styles.heightNumberCell, styles.headerRowCell, { backgroundColor: theme.colors.elevation.level2, borderRightColor: theme.colors.outlineVariant }]}>
              <Text style={[styles.headerText, { color: theme.colors.onSurface, fontSize: 10 }]}>#</Text>
            </View>
            <View style={[styles.heightCell, styles.headerRowCell, { backgroundColor: theme.colors.elevation.level2, borderRightColor: theme.colors.outlineVariant }]}>
              <Text style={[styles.headerText, { color: theme.colors.onSurface, fontSize: 10 }]}>{t("survey.heightColumn")}</Text>
            </View>
          </View>

          {config.height_classes.map((height: any) => (
            <View key={height.id} style={[styles.tableRow, { borderBottomColor: theme.colors.outlineVariant }]}>
              <View style={[styles.heightNumberCell, { backgroundColor: theme.colors.elevation.level2, borderRightColor: theme.colors.outlineVariant }]}>
                <Text style={[styles.heightLabel, { color: theme.colors.onSurface }]}>{height.id}</Text>
              </View>
              <View style={[styles.heightCell, { backgroundColor: theme.colors.elevation.level2, borderRightColor: theme.colors.outlineVariant }]}>
                <Text style={[styles.heightLabel, { color: theme.colors.onSurface }]}>{stripHeightUnit(translateField(height.label))}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Scrollable columns: life forms + leaf adaptation */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          style={styles.tableScroll}
        >
          <View>
            {/* Header Row */}
            <View style={[styles.tableRow, { borderBottomColor: theme.colors.outlineVariant }]}>
              {allLifeForms.map((lifeForm: any) => (
                <View key={lifeForm.id} style={[styles.headerCell, styles.headerRowCell, { backgroundColor: theme.colors.elevation.level2, borderRightColor: theme.colors.outlineVariant }]}>
                  <Text style={[styles.headerText, { color: theme.colors.onSurface }]}>{lifeForm.id}</Text>
                  <Text style={[styles.subHeaderText, { color: theme.colors.onSurfaceVariant }]} numberOfLines={2}>
                    {translateField(lifeForm.name)}
                  </Text>
                  {lifeForm.desc && onInfoPress ? (
                    <IconButton
                      icon="information-outline"
                      size={12}
                      iconColor={theme.colors.secondary}
                      style={{ margin: 0, marginTop: -4 }}
                      onPress={() => onInfoPress(`${lifeForm.id} — ${translateField(lifeForm.name)}: ${translateField(lifeForm.desc)}`)}
                    />
                  ) : null}
                </View>
              ))}
              <View style={[styles.headerCell, styles.headerRowCell, { backgroundColor: theme.colors.elevation.level2, borderRightColor: theme.colors.outlineVariant }]}>
                <Text style={[styles.headerText, { color: theme.colors.onSurface }]}>🍃</Text>
                <Text style={[styles.subHeaderText, { color: theme.colors.onSurfaceVariant }]} numberOfLines={2}>
                  {t("survey.leafAdaptation") || "Folha"}
                </Text>
              </View>
            </View>

            {/* Data Rows */}
            {config.height_classes.map((height: any) => (
              <View key={height.id} style={[styles.tableRow, { borderBottomColor: theme.colors.outlineVariant }]}>
                {allLifeForms.map((lifeForm: any) => (
                  <MatrixCell
                    key={`${height.id}-${lifeForm.id}`}
                    heightId={height.id}
                    lifeFormId={lifeForm.id}
                    cellData={getCellData(height.id, lifeForm.id)}
                    getCoverLabel={getCoverLabel}
                    translateField={translateField}
                    onPress={handleCellPress}
                    onLongPress={handleCellClear}
                  />
                ))}

                <LeafCell
                  heightId={height.id}
                  leafData={getLeafData(height.id)}
                  disabled={!matrix[height.id] || Object.keys(matrix[height.id]).length === 0}
                  leafAdaptations={config.leaf_adaptations}
                  translateField={translateField}
                  onPress={handleOpenLeafModal}
                  onLongPress={handleLeafClear}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <Text variant="bodySmall" style={[styles.footerText, { color: theme.colors.onSurfaceVariant }]}>
        💡 {t("survey.longPressToClear")} | {t("survey.tapLeafColumn") || "Tap the 🍃 column for adaptation"}
      </Text>

      {/* Vegetation classification (Nomos standard or custom) - part of this
          component, not a separate sibling card. */}
      <VegetationPhysiognomyCard
        physiognomyName={userPhysiognomyName}
        classificationGroup={classificationGroup}
        physiognomyComplement={physiognomyComplement}
        onPhysiognomyComplementChange={onPhysiognomyComplementChange}
        onInfoPress={onInfoPress}
        classificationType={classificationType}
        customClasses={customClasses}
        selectedClassId={selectedClassId}
        onClassIdChange={onClassIdChange}
      />

      {/* MODALS */}
      <Portal>
        {/* Cover Selection Modal */}
        <Modal
          visible={modalVisible}
          onDismiss={() => setModalVisible(false)}
          contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleMedium" style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
            {t("survey.selectCoverClass")}
          </Text>

          {/* Validation Feedback */}
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text variant="bodySmall" style={{color: theme.colors.onSurfaceVariant}}>
                {t("survey.stratumOccupancy") || "Stratum occupancy"}:
              </Text>
              <Text variant="bodySmall" style={{fontWeight: 'bold', color: usageColor}}>
                {currentUsage}%
              </Text>
            </View>
            <ProgressBar progress={usagePercent} color={usageColor} style={{height: 6, borderRadius: 4}} />
            {currentUsage >= 100 && (
              <Text variant="labelSmall" style={{color: theme.colors.error, marginTop: 4}}>
                {t("survey.stratumFull") || "Stratum full (100%)"}
              </Text>
            )}
          </View>

          <View style={styles.coverGrid}>
            {config.cover_classes.map((cover: any) => {
              const labelText = translateField(cover.label);
              const percentMatch = labelText.match(/\(([^)]+)\)/);
              const percent = percentMatch ? percentMatch[1] : "";
              
              // Validation Check
              const coverWeight = COVER_WEIGHTS[cover.id] || 0;
              const isOverLimit = (currentUsage + coverWeight) > 100;
              const isDisabled = isOverLimit;

              return (
                <Chip
                  key={cover.id}
                  mode="outlined"
                  onPress={() => handleCoverSelect(cover.id)}
                  disabled={isDisabled}
                  style={[
                    styles.coverChip, 
                    isDisabled && { opacity: 0.4, backgroundColor: theme.colors.surfaceDisabled }
                  ]}
                  textStyle={{ 
                    color: isDisabled ? theme.colors.onSurfaceDisabled : theme.colors.onSurface 
                  }}
                >
                  {cover.id} - {translateField(cover.name)} ({percent})
                </Chip>
              );
            })}
          </View>
        </Modal>

        {/* Leaf Adaptation Modal */}
        <Modal
          visible={leafModalVisible}
          onDismiss={() => setLeafModalVisible(false)}
          contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleMedium" style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
            {t("survey.leafAdaptationTitle") || "Leaf adaptations (optional)"}
          </Text>
          <Text variant="bodySmall" style={[styles.modalSubtitle, { color: theme.colors.onSurfaceVariant }]}>
            {t("survey.leafAdaptationSubtitle") || "Registre apenas tipos que recobrem >25%"}
          </Text>

          <View style={styles.coverGrid}>
            {config.leaf_adaptations.map((leaf: any) => (
              <Chip
                key={leaf.id}
                mode="outlined"
                onPress={() => selectedCell && handleLeafSelect(selectedCell.height, leaf.id)}
                style={styles.coverChip}
                textStyle={{ color: theme.colors.onSurface }}
              >
                {leaf.label} - {translateField(leaf.name)} | {translateField(leaf.desc)}
              </Chip>
            ))}
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

// Memoized: same treatment GeoecologicalConstraintsModuleRenderer/ImpactsModuleRenderer
// already get. Every prop this component receives is already either a
// primitive, a JSON string with a fixed key order (so byte-identical when
// the underlying data is unchanged, which compares equal by value), or a
// stable useRef-based callback (see VegetationModuleRenderer.tsx), so the
// default shallow comparator is correct here - no custom comparator needed.
// Note this alone does not fix in-grid tap latency: a component always
// re-renders on its own state change regardless of React.memo. See
// MatrixCell/LeafCell below for the part that actually limits per-tap
// reconciliation to the one cell that changed.
export default React.memo(KuchlerMatrix);

const styles = StyleSheet.create({
  container: { marginVertical: 8 },
  resultCard: { marginTop: 16, marginBottom: 16, borderColor: '#ddd' },
  // Changed to center for the button
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  formulaCard: { marginBottom: 12 },
  helperText: { fontStyle: "italic", marginBottom: 8, paddingHorizontal: 4, textAlign: 'justify' },
  tableWrapper: { flexDirection: "row", marginVertical: 8, marginHorizontal: -16 },
  stickyColumns: {
    zIndex: 10,
    elevation: 4,
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  tableScroll: {},
  tableRow: { flexDirection: "row", borderBottomWidth: 1 },
  cornerCell: { justifyContent: "center", alignItems: "center" },
  headerCell: { width: 70, minHeight: 50, padding: 6, borderRightWidth: 1, justifyContent: "center", alignItems: "center" },
  headerRowCell: { height: 72 },
  headerText: { fontWeight: "bold", textAlign: "center", fontSize: 14 },
  subHeaderText: { fontSize: 9, textAlign: "center", marginTop: 2 },
  heightNumberCell: { width: 26, minHeight: 50, padding: 3, borderRightWidth: 1, justifyContent: "center", alignItems: "center" },
  heightCell: { width: 52, minHeight: 50, padding: 3, borderRightWidth: 1, justifyContent: "center", alignItems: "center" },
  heightLabel: { fontWeight: "bold", textAlign: "center", fontSize: 9 },
  dataCell: { width: 70, minHeight: 50, padding: 6, borderRightWidth: 1, justifyContent: "center", alignItems: "center" },
  cellContent: { alignItems: "center", width: "100%" },
  cellValue: { fontWeight: "bold", fontSize: 16 },
  cellLabel: { fontSize: 8, marginTop: 2, textAlign: "center" },
  emptyCellText: { fontSize: 18 },
  footerText: { fontStyle: "italic", marginTop: 8, textAlign: "center" },
  modalContent: { padding: 20, margin: 16, borderRadius: 12, maxHeight: "80%" },
  modalTitle: { marginBottom: 16, fontWeight: "bold", textAlign: "center" },
  modalSubtitle: { marginBottom: 12, textAlign: "center", fontStyle: "italic" },
  coverGrid: { flexDirection: "column", gap: 8 },
  coverChip: { marginVertical: 4, paddingVertical: 8 },
});