import React, { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import {
  Text,
  Button,
  Card,
  IconButton,
  useTheme,
  Divider,
  SegmentedButtons,
  Modal,
  Portal,
  TextInput,
  Checkbox,
  RadioButton,
} from "react-native-paper";
import { useI18n } from "@/contexts/i18n-context";
import { useProtocolTranslations } from "@/hooks/use-protocol-translations";
import InfoBubble from "@/components/ui/InfoBubble";
import { BUTTON_RADIUS, SEGMENTED_BUTTONS_SHAPE_THEME } from "@/constants/shape";
import SoilOptionPicker from "./SoilOptionPicker";
import {
  SoilLayer,
  SoilProfileData,
  SoilColorPattern,
  SoilColorTerm,
  SoilTexture,
  SoilStructure,
  SoilCrackWidth,
} from "../types/soil";

// --- DEFAULT FALLBACK OPTIONS ---

const DEFAULT_COLOR_PATTERN_OPTIONS = [
  { value: "homogeneous", pt: "Homogênea", en: "Homogeneous", es: "Homogénea", fr: "Homogène" },
  { value: "variegated",  pt: "Variegada",  en: "Variegated",  es: "Variegada",  fr: "Variégée" },
];

const DEFAULT_COLOR_TERM_OPTIONS = [
  { value: "red",             pt: "Vermelho",         en: "Red",             es: "Rojo",            fr: "Rouge" },
  { value: "reddish_brown",   pt: "Bruno-avermelhado", en: "Reddish brown",  es: "Pardo rojizo",    fr: "Brun rougeâtre" },
  { value: "yellowish_red",   pt: "Vermelho-amarelado", en: "Yellowish red", es: "Rojo amarillento", fr: "Rouge jaunâtre" },
  { value: "strong_brown",    pt: "Bruno-forte",       en: "Strong brown",   es: "Pardo fuerte",    fr: "Brun fort" },
  { value: "yellowish_brown", pt: "Bruno-amarelado",   en: "Yellowish brown", es: "Pardo amarillento", fr: "Brun jaunâtre" },
  { value: "brownish_yellow", pt: "Amarelo-brunado",   en: "Brownish yellow", es: "Amarillo parduzco", fr: "Jaune brunâtre" },
  { value: "yellow",          pt: "Amarelo",           en: "Yellow",          es: "Amarillo",        fr: "Jaune" },
  { value: "brown",           pt: "Bruno",             en: "Brown",           es: "Pardo",           fr: "Brun" },
  { value: "dark_brown",      pt: "Bruno-escuro",      en: "Dark brown",      es: "Pardo oscuro",    fr: "Brun foncé" },
  { value: "grayish_brown",   pt: "Bruno-acinzentado", en: "Grayish brown",  es: "Pardo grisáceo",  fr: "Brun grisâtre" },
  { value: "gray",            pt: "Cinzento",          en: "Gray",            es: "Gris",            fr: "Gris" },
  { value: "dark_gray",       pt: "Cinzento-escuro",   en: "Dark gray",       es: "Gris oscuro",     fr: "Gris foncé" },
  { value: "black",           pt: "Preto",             en: "Black",           es: "Negro",           fr: "Noir" },
];

const DEFAULT_TEXTURE_OPTIONS = [
  { value: "sand",            pt: "Areia",               en: "Sand" },
  { value: "loamy_sand",      pt: "Areia franca",        en: "Loamy sand" },
  { value: "sandy_loam",      pt: "Franco-arenoso",      en: "Sandy loam" },
  { value: "loam",            pt: "Franco",              en: "Loam" },
  { value: "silt_loam",       pt: "Franco-siltoso",      en: "Silt loam" },
  { value: "silt",            pt: "Silte",               en: "Silt" },
  { value: "clay_loam",       pt: "Franco-argiloso",     en: "Clay loam" },
  { value: "sandy_clay_loam", pt: "Franco-argilo-arenoso", en: "Sandy clay loam" },
  { value: "silty_clay_loam", pt: "Franco-argilo-siltoso", en: "Silty clay loam" },
  { value: "sandy_clay",      pt: "Argilo-arenoso",      en: "Sandy clay" },
  { value: "silty_clay",      pt: "Argilo-siltoso",      en: "Silty clay" },
  { value: "clay",            pt: "Argila",              en: "Clay" },
];

const DEFAULT_STRUCTURE_OPTIONS = [
  { value: "single_grain",      pt: "Grãos simples",     en: "Single grain" },
  { value: "massive",           pt: "Maciça",            en: "Massive" },
  { value: "granular",          pt: "Granular",          en: "Granular" },
  { value: "angular_blocky",    pt: "Blocos angulares",  en: "Angular blocky" },
  { value: "subangular_blocky", pt: "Blocos subangulares", en: "Subangular blocky" },
  { value: "prismatic",         pt: "Prismática",        en: "Prismatic" },
  { value: "columnar",          pt: "Colunar",           en: "Columnar" },
];

const DEFAULT_CRACK_OPTIONS = [
  { value: "absent", pt: "Ausente",        en: "Absent",         es: "Ausente",        fr: "Absent" },
  { value: "narrow", pt: "Estreita (< 1 cm)", en: "Narrow (< 1 cm)", es: "Estrecha (< 1 cm)", fr: "Étroite (< 1 cm)" },
  { value: "wide",   pt: "Larga (> 1 cm)", en: "Wide (> 1 cm)",  es: "Ancha (> 1 cm)", fr: "Large (> 1 cm)" },
];

// ---

interface Props {
  field?: any;
  value?: string;
  onChange: (value: string) => void;
}

function getOptValue(opt: any): string {
  if (typeof opt === "string") return opt;
  return opt.value ?? opt["pt"] ?? "";
}

const DEFAULT_COLOR_PATTERN: SoilColorPattern = "homogeneous";
const DEFAULT_CRACK = "absent";

export default function SoilProfileInput({ field, value, onChange }: Props) {
  const theme = useTheme();
  const { t } = useI18n();
  const { translateField } = useProtocolTranslations();

  const colorPatternOptions: any[] = field?.config?.color_pattern_options || DEFAULT_COLOR_PATTERN_OPTIONS;
  const colorTermOptions: any[]    = field?.config?.color_term_options    || DEFAULT_COLOR_TERM_OPTIONS;
  const textureOptions: any[]      = field?.config?.texture_options       || DEFAULT_TEXTURE_OPTIONS;
  const structureOptions: any[]    = field?.config?.structure_options     || DEFAULT_STRUCTURE_OPTIONS;
  const crackOptions: any[]        = field?.config?.crack_options         || DEFAULT_CRACK_OPTIONS;
  const characteristicsOptions: any[] = field?.config?.characteristics_options || [
    { key: "has_gravel",      value: "gravel",      pt: "Cascalhos/Pedregosidade", en: "Gravel/Stoniness" },
    { key: "has_roots",       value: "roots",       pt: "Raízes",                  en: "Roots" },
    { key: "has_nodules",     value: "nodules",     pt: "Nódulos/Concreções",      en: "Nodules/Concretions" },
    { key: "has_dispersive",  value: "dispersive",  pt: "Dispersivo",              en: "Dispersive" },
    { key: "has_hardened",    value: "hardened",    pt: "Endurecido/Coeso",        en: "Hardened/Cohesive" },
    { key: "has_water_table", value: "water_table", pt: "Lençol Freático",           en: "Water Table" },
  ];

  const [infoText, setInfoText] = useState<string | null>(null);

  const initialData: SoilProfileData = {
    mode: "simple",
    simple_color_pattern: DEFAULT_COLOR_PATTERN,
    simple_color_secondary: null,
    simple_has_gravel: false,
    simple_has_roots: false,
    simple_has_nodules: false,
    simple_has_dispersive: false,
    simple_has_hardened: false,
    simple_has_water_table: false,
    simple_cracks: DEFAULT_CRACK as SoilCrackWidth,
    layers: [],
  };

  const [data, setData] = useState<SoilProfileData>(initialData);

  // Modal state
  const [isModalVisible, setModalVisible] = useState(false);
  const [currentLayer, setCurrentLayer] = useState<SoilLayer | null>(null);
  // "layer": editing/adding a detailed-mode layer (with depth). "simple": editing
  // the single simple-mode description (no depth). Both share the same modal.
  const [modalMode, setModalMode] = useState<"layer" | "simple">("layer");

  // Local modal state for depth (needs its own buffer since the TextInput
  // only commits into currentLayer on blur, not on every keystroke).
  const [localDepthStart, setLocalDepthStart] = useState("");
  const [localDepthEnd, setLocalDepthEnd] = useState("");
  const [depthError, setDepthError] = useState<string | null>(null);

  // Color, texture, structure, characteristics and cracks all write directly
  // into currentLayer on selection (no local draft state) — color used to
  // have its own local state synced from currentLayer here, but since ANY
  // field change re-triggers this effect, it kept clobbering the color the
  // user had just picked whenever another field changed afterwards.
  useEffect(() => {
    if (currentLayer) {
      setLocalDepthStart(currentLayer.depth_start);
      setLocalDepthEnd(currentLayer.depth_end);
    }
  }, [currentLayer]);

  // Parse incoming value
  useEffect(() => {
    if (value) {
      try {
        const parsed = JSON.parse(value);
        setData({ ...initialData, ...parsed });
      } catch (e) {
        console.error("Error parsing soil data", e);
      }
    }
  }, [value]);

  const updateParent = (newData: SoilProfileData) => {
    setData(newData);
    onChange(JSON.stringify(newData));
  };

  // --- HELPERS ---

  const renderInfoBtn = (opt: any) => {
    const desc = opt?.desc ? translateField(opt.desc) : null;
    if (!desc) return null;
    return (
      <IconButton
        icon="information-outline"
        size={14}
        iconColor={theme.colors.secondary}
        style={{ margin: 0, marginLeft: -6 }}
        onPress={() => setInfoText(desc)}
      />
    );
  };

  const getDisplayColor = (layer: SoilLayer) => {
    const primaryOpt = colorTermOptions.find((o: any) => getOptValue(o) === layer.color_primary);
    const primary = primaryOpt ? translateField(primaryOpt) : (layer.color_primary || t("survey.selectOption"));
    if (layer.color_pattern === "variegated" && layer.color_secondary) {
      const secondaryOpt = colorTermOptions.find((o: any) => getOptValue(o) === layer.color_secondary);
      const secondary = secondaryOpt ? translateField(secondaryOpt) : layer.color_secondary;
      return `${primary} / ${secondary}`;
    }
    return primary;
  };

  // Compact single-line summary of everything registered for this layer
  // (or the simple-mode description), shown in the layer/description cards
  // without needing to open the edit modal. Every value is resolved through
  // its own options list (like getDisplayColor already did for color) rather
  // than shown raw - texture/structure/cracks are stored as option VALUES
  // (e.g. "sandy_loam"), not translated labels, so displaying them directly
  // leaked the untranslated raw value regardless of the app's language.
  const renderLayerSummary = (layer: SoilLayer) => {
    const colorPatternOpt = colorPatternOptions.find((o: any) => getOptValue(o) === layer.color_pattern);
    const colorTypeLabel = colorPatternOpt ? translateField(colorPatternOpt) : t("survey.selectOption");

    const textureOpt = textureOptions.find((o: any) => getOptValue(o) === layer.texture);
    const textureLabel = textureOpt ? translateField(textureOpt) : t("survey.selectOption");

    const structureOpt = structureOptions.find((o: any) => getOptValue(o) === layer.structure);
    const structureLabel = structureOpt ? translateField(structureOpt) : t("survey.selectOption");

    const cracksOpt = crackOptions.find((o: any) => getOptValue(o) === layer.cracks);
    const cracksLabel = cracksOpt ? translateField(cracksOpt) : t("survey.selectOption");

    const activeCharacteristics = characteristicsOptions
      .filter((char: any) => !!(layer as any)[char.key])
      .map((char: any) => translateField(char))
      .join(", ");

    const parts = [
      `${t("survey.colorType")}: ${colorTypeLabel}`,
      `${t("survey.colorPrimary")}: ${getDisplayColor(layer)}`,
      `${t("survey.texture")}: ${textureLabel}`,
      `${t("survey.structure")}: ${structureLabel}`,
      `${t("survey.cracks")}: ${cracksLabel}`,
      activeCharacteristics ? `${t("survey.otherCharacteristics")}: ${activeCharacteristics}` : null,
    ].filter(Boolean);

    return (
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        {parts.join("; ")}
      </Text>
    );
  };

  // --- LAYER MODAL HANDLERS ---

  const addNewLayer = () => {
    const newLayer: SoilLayer = {
      id: Date.now().toString(),
      depth_start: "",
      depth_end: "",
      color_pattern: DEFAULT_COLOR_PATTERN,
      color_primary: undefined,
      color_secondary: null,
      texture: undefined,
      structure: undefined,
      has_gravel: false,
      has_roots: false,
      has_nodules: false,
      has_dispersive: false,
      has_hardened: false,
      has_water_table: false,
      cracks: DEFAULT_CRACK as SoilCrackWidth,
    };
    setDepthError(null);
    setModalMode("layer");
    setCurrentLayer(newLayer);
    setModalVisible(true);
  };

  const editLayer = (layer: SoilLayer) => {
    setDepthError(null);
    setModalMode("layer");
    setCurrentLayer({ ...layer });
    setModalVisible(true);
  };

  const openSimpleDescription = () => {
    const draft: SoilLayer = {
      id: "simple",
      depth_start: "",
      depth_end: "",
      color_pattern: data.simple_color_pattern || DEFAULT_COLOR_PATTERN,
      color_primary: data.simple_color_primary,
      color_secondary: data.simple_color_secondary || null,
      texture: data.simple_texture,
      structure: data.simple_structure,
      has_gravel: !!data.simple_has_gravel,
      has_roots: !!data.simple_has_roots,
      has_nodules: !!data.simple_has_nodules,
      has_dispersive: !!data.simple_has_dispersive,
      has_hardened: !!data.simple_has_hardened,
      has_water_table: !!data.simple_has_water_table,
      cracks: data.simple_cracks || (DEFAULT_CRACK as SoilCrackWidth),
    };
    setDepthError(null);
    setModalMode("simple");
    setCurrentLayer(draft);
    setModalVisible(true);
  };

  const deleteSimpleDescription = () => {
    updateParent({ ...data, simple_registered: false });
  };

  const saveLayer = () => {
    if (!currentLayer) return;

    if (modalMode === "simple") {
      updateParent({
        ...data,
        simple_color_pattern: currentLayer.color_pattern,
        simple_color_primary: currentLayer.color_primary,
        simple_color_secondary: currentLayer.color_pattern === "variegated" ? currentLayer.color_secondary : null,
        simple_texture: currentLayer.texture,
        simple_structure: currentLayer.structure,
        simple_has_gravel: currentLayer.has_gravel,
        simple_has_roots: currentLayer.has_roots,
        simple_has_nodules: currentLayer.has_nodules,
        simple_has_dispersive: currentLayer.has_dispersive,
        simple_has_hardened: currentLayer.has_hardened,
        simple_has_water_table: currentLayer.has_water_table,
        simple_cracks: currentLayer.cracks,
        simple_registered: true,
      });
      setModalVisible(false);
      setCurrentLayer(null);
      return;
    }

    const normalizedDepthStart = localDepthStart.trim().replace(",", ".");
    const normalizedDepthEnd = localDepthEnd.trim().replace(",", ".");

    if (!normalizedDepthStart || !normalizedDepthEnd) {
      setDepthError(t("survey.depthValidationRequired"));
      return;
    }

    const depthStart = Number(normalizedDepthStart);
    const depthEnd = Number(normalizedDepthEnd);

    if (!Number.isFinite(depthStart) || !Number.isFinite(depthEnd)) {
      setDepthError(t("survey.depthValidationNumeric"));
      return;
    }

    if (depthStart < 0 || depthEnd < 0) {
      setDepthError(t("survey.depthValidationNonNegative"));
      return;
    }

    if (depthEnd <= depthStart) {
      setDepthError(t("survey.depthValidationEndGreater"));
      return;
    }

    const existingLayers = (data.layers || []).filter((l) => l.id !== currentLayer.id);
    const deepestLayerEnd = existingLayers.reduce((max, l) => {
      const end = Number(l.depth_end);
      return Number.isFinite(end) && end > max ? end : max;
    }, 0);

    const isNewLayer = !(data.layers || []).some((l) => l.id === currentLayer.id);
    if (isNewLayer && existingLayers.length > 0 && depthStart < deepestLayerEnd) {
      setDepthError(`${t("survey.depthValidationStartAtOrAfterDeepest")} (${deepestLayerEnd} cm).`);
      return;
    }

    const hasOverlap = existingLayers.some((l) => {
      const s = Number(l.depth_start);
      const e = Number(l.depth_end);
      if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
      return depthStart < e && depthEnd > s;
    });

    if (hasOverlap) {
      setDepthError(t("survey.depthValidationOverlap"));
      return;
    }

    setDepthError(null);

    const updatedLayer: SoilLayer = {
      ...currentLayer,
      depth_start: normalizedDepthStart,
      depth_end: normalizedDepthEnd,
      color_secondary: currentLayer.color_pattern === "variegated" ? currentLayer.color_secondary : null,
    };

    const newLayers = [...(data.layers || [])];
    const index = newLayers.findIndex((l) => l.id === updatedLayer.id);
    if (index >= 0) {
      newLayers[index] = updatedLayer;
    } else {
      newLayers.push(updatedLayer);
    }
    newLayers.sort((a, b) => Number(a.depth_start) - Number(b.depth_start));

    updateParent({ ...data, layers: newLayers });
    setModalVisible(false);
    setCurrentLayer(null);
    setDepthError(null);
  };

  const deleteLayer = (id: string) => {
    updateParent({ ...data, layers: (data.layers || []).filter((l) => l.id !== id) });
  };

  // --- RENDER HELPERS ---

  const renderColorPatternButtons = (
    currentPattern: SoilColorPattern,
    onChange: (v: SoilColorPattern) => void,
  ) => (
    <>
      <Text style={[styles.sectionLabel, { color: theme.colors.onSurface }]}>
        {t("survey.colorPattern")}
      </Text>
      <View style={styles.colorTypeContainer}>
        {colorPatternOptions.map((opt: any) => {
          const optValue = getOptValue(opt) as SoilColorPattern;
          const isSelected = currentPattern === optValue;
          return (
            <View key={optValue} style={{ flex: 1, alignItems: "center" }}>
              <Button
                mode={isSelected ? "contained" : "outlined"}
                onPress={() => onChange(optValue)}
                style={{ width: "100%", marginHorizontal: 4, borderRadius: BUTTON_RADIUS }}
                compact
              >
                {translateField(opt)}
              </Button>
              {renderInfoBtn(opt)}
            </View>
          );
        })}
      </View>
    </>
  );

  const renderColorTermSelector = (
    label: string,
    currentValue: SoilColorTerm | null | undefined,
    onSelect: (v: SoilColorTerm | null) => void,
  ) => (
    <SoilOptionPicker
      label={label}
      options={colorTermOptions}
      value={currentValue}
      onSelect={(v) => onSelect(v as SoilColorTerm | null)}
      onInfoPress={setInfoText}
    />
  );

  const renderColorFields = (
    colorPattern: SoilColorPattern,
    onPatternChange: (v: SoilColorPattern) => void,
    colorPrimary: SoilColorTerm | null | undefined,
    onPrimaryChange: (v: SoilColorTerm | null) => void,
    colorSecondary: SoilColorTerm | null,
    onSecondaryChange: (v: SoilColorTerm | null) => void,
  ) => (
    <>
      {renderColorPatternButtons(colorPattern, onPatternChange)}
      {renderColorTermSelector(t("survey.colorPrimary"), colorPrimary, onPrimaryChange)}
      {colorPattern === "variegated" &&
        renderColorTermSelector(t("survey.colorSecondary"), colorSecondary, onSecondaryChange)}
    </>
  );

  const renderTextureSelector = (
    currentValue: string | undefined,
    onSelect: (v: SoilTexture | null) => void,
  ) => (
    <SoilOptionPicker
      label={t("survey.texture")}
      options={textureOptions}
      value={currentValue}
      onSelect={(v) => onSelect(v as SoilTexture | null)}
      onInfoPress={setInfoText}
    />
  );

  const renderStructureSelector = (
    currentValue: string | undefined,
    onSelect: (v: SoilStructure | null) => void,
  ) => (
    <SoilOptionPicker
      label={t("survey.structure")}
      options={structureOptions}
      value={currentValue}
      onSelect={(v) => onSelect(v as SoilStructure | null)}
      onInfoPress={setInfoText}
    />
  );

  const renderCharacteristics = (
    getValue: (key: string) => boolean,
    onToggle: (key: string, current: boolean) => void,
  ) => (
    <>
      <Divider style={{ marginVertical: 8 }} />
      <Text style={[styles.sectionLabel, { color: theme.colors.onSurface }]}>
        {t("survey.otherCharacteristics")}
      </Text>
      {characteristicsOptions.map((char: any) => {
        const isChecked = getValue(char.key);
        const label = translateField(char);
        const desc = char.desc ? translateField(char.desc) : null;
        return (
          <View key={char.key} style={styles.checkRow}>
            <Checkbox
              status={isChecked ? "checked" : "unchecked"}
              onPress={() => onToggle(char.key, isChecked)}
            />
            <Text style={{ flex: 1, fontWeight: "normal", color: theme.colors.onSurface }}>
              {label}
            </Text>
            {desc ? (
              <IconButton
                icon="information-outline"
                size={14}
                iconColor={theme.colors.secondary}
                style={{ margin: 0 }}
                onPress={() => setInfoText(desc)}
              />
            ) : null}
          </View>
        );
      })}
    </>
  );

  // Only 3 options, so a simple single-select list (full text visible, one
  // option per row) is clearer than the picker used for the longer
  // color/texture/structure lists.
  const renderCracksSelector = (
    currentValue: SoilCrackWidth,
    onSelect: (v: SoilCrackWidth) => void,
  ) => (
    <>
      <Text style={[styles.sectionLabel, { color: theme.colors.onSurface }]}>
        {t("survey.cracks")}
      </Text>
      <RadioButton.Group onValueChange={(v) => onSelect(v as SoilCrackWidth)} value={currentValue}>
        {crackOptions.map((opt: any) => {
          const optValue = getOptValue(opt) as SoilCrackWidth;
          const desc = opt?.desc ? translateField(opt.desc) : null;
          return (
            <Pressable
              key={optValue}
              onPress={() => onSelect(optValue)}
              style={styles.checkRow}
            >
              <RadioButton value={optValue} />
              <Text style={{ flex: 1, color: theme.colors.onSurface }}>{translateField(opt)}</Text>
              {desc && (
                <IconButton
                  icon="information-outline"
                  size={14}
                  iconColor={theme.colors.secondary}
                  style={{ margin: 0 }}
                  onPress={() => setInfoText(desc)}
                />
              )}
            </Pressable>
          );
        })}
      </RadioButton.Group>
    </>
  );

  // --- MAIN RENDER ---

  return (
    <View style={styles.container}>
      {/* 1. Mode Selection */}
      <SegmentedButtons
        theme={SEGMENTED_BUTTONS_SHAPE_THEME}
        value={data.mode}
        onValueChange={(v) => updateParent({ ...data, mode: v as "simple" | "detailed" })}
        buttons={[
          { value: "simple", label: t("survey.simplified") },
          { value: "detailed", label: t("survey.detailed") },
        ]}
        style={{ marginBottom: 16 }}
      />

      {/* 2. Simple Mode */}
      {data.mode === "simple" && (
        <View>
          {!data.simple_registered ? (
            <Button
              mode="outlined"
              icon="plus"
              onPress={openSimpleDescription}
              style={{ marginTop: 8, borderStyle: "dashed", borderRadius: BUTTON_RADIUS }}
              textColor={theme.colors.primary}
            >
              {t("survey.registerDescription")}
            </Button>
          ) : (
            <Card style={styles.layerCard} mode="outlined">
              <Card.Content>
                <View style={styles.layerHeader}>
                  <Text variant="titleSmall" style={{ flex: 1, fontWeight: "bold", color: theme.colors.onSurface }}>
                    {t("survey.generalSoilDescription")}
                  </Text>
                  <IconButton icon="pencil" onPress={openSimpleDescription} />
                  <IconButton icon="delete" iconColor={theme.colors.error} onPress={deleteSimpleDescription} />
                </View>
                <View style={[styles.layerSummary, { borderTopColor: theme.colors.outlineVariant }]}>
                  {renderLayerSummary({
                    color_pattern: data.simple_color_pattern,
                    color_primary: data.simple_color_primary,
                    color_secondary: data.simple_color_secondary,
                    texture: data.simple_texture,
                    structure: data.simple_structure,
                  } as SoilLayer)}
                </View>
              </Card.Content>
            </Card>
          )}
        </View>
      )}

      {/* 3. Detailed Mode */}
      {data.mode === "detailed" && (
        <View>
          {(data.layers || []).map((layer, index) => (
            <Card key={layer.id} style={styles.layerCard} mode="outlined">
              <Card.Content>
                <View style={styles.layerHeader}>
                  <Text variant="titleSmall" style={{ flex: 1, fontWeight: "bold", color: theme.colors.onSurface }}>
                    {t("survey.layer")} {index + 1}: {layer.depth_start}-{layer.depth_end} cm
                  </Text>
                  <IconButton icon="pencil" onPress={() => editLayer(layer)} />
                  <IconButton icon="delete" iconColor={theme.colors.error} onPress={() => deleteLayer(layer.id)} />
                </View>
                <View style={[styles.layerSummary, { borderTopColor: theme.colors.outlineVariant }]}>
                  {renderLayerSummary(layer)}
                </View>
              </Card.Content>
            </Card>
          ))}

          <Button
            mode="outlined"
            icon="plus"
            onPress={addNewLayer}
            style={{ marginTop: 8, borderStyle: "dashed", borderRadius: BUTTON_RADIUS }}
            textColor={theme.colors.primary}
          >
            {t("survey.addLayer")}
          </Button>
        </View>
      )}

      {/* Info Bubble */}
      <InfoBubble text={infoText} onDismiss={() => setInfoText(null)} />

      {/* 4. Layer Modal (Detailed Mode) */}
      <Portal>
        <Modal
          visible={isModalVisible}
          onDismiss={() => setModalVisible(false)}
          contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
        >
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            <Text variant="headlineSmall" style={{ marginBottom: 16, fontWeight: "bold", color: theme.colors.primary }}>
              {modalMode === "simple" ? t("survey.generalSoilDescription") : t("survey.editLayer")}
            </Text>

            {/* Depth (detailed mode only — the simple description has no depth range) */}
            {modalMode === "layer" && (
              <>
                <View style={styles.row}>
                  <TextInput
                    label={t("survey.depthStart")}
                    value={localDepthStart}
                    onChangeText={(text) => { setLocalDepthStart(text); if (depthError) setDepthError(null); }}
                    onBlur={() => setCurrentLayer((prev) => prev ? { ...prev, depth_start: localDepthStart } : null)}
                    keyboardType="numeric"
                    mode="outlined"
                    error={Boolean(depthError)}
                    style={[styles.inputHalf, { marginRight: 8 }]}
                  />
                  <TextInput
                    label={t("survey.depthEnd")}
                    value={localDepthEnd}
                    onChangeText={(text) => { setLocalDepthEnd(text); if (depthError) setDepthError(null); }}
                    onBlur={() => setCurrentLayer((prev) => prev ? { ...prev, depth_end: localDepthEnd } : null)}
                    keyboardType="numeric"
                    mode="outlined"
                    error={Boolean(depthError)}
                    style={styles.inputHalf}
                  />
                </View>
                {depthError ? (
                  <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: -4, marginBottom: 12 }}>
                    {depthError}
                  </Text>
                ) : null}
              </>
            )}

            {/* Color */}
            {renderColorFields(
              currentLayer?.color_pattern || DEFAULT_COLOR_PATTERN,
              (v) => setCurrentLayer((prev) => prev
                ? { ...prev, color_pattern: v, color_secondary: v === "homogeneous" ? null : prev.color_secondary }
                : null),
              currentLayer?.color_primary,
              (v) => setCurrentLayer((prev) => prev ? { ...prev, color_primary: v ?? undefined } : null),
              currentLayer?.color_secondary || null,
              (v) => setCurrentLayer((prev) => prev ? { ...prev, color_secondary: v } : null),
            )}

            {/* Texture */}
            {renderTextureSelector(
              currentLayer?.texture,
              (v) => setCurrentLayer((prev) => prev ? { ...prev, texture: v ?? undefined } : null),
            )}

            {/* Structure */}
            {renderStructureSelector(
              currentLayer?.structure,
              (v) => setCurrentLayer((prev) => prev ? { ...prev, structure: v ?? undefined } : null),
            )}

            {/* Characteristics */}
            {renderCharacteristics(
              (key) => !!(currentLayer as any)?.[key],
              (key, current) => setCurrentLayer((prev) => prev ? { ...prev, [key]: !current } : null),
            )}

            {/* Cracks */}
            {renderCracksSelector(
              currentLayer?.cracks || DEFAULT_CRACK,
              (v) => setCurrentLayer((prev) => prev ? { ...prev, cracks: v } : null),
            )}

            <Button mode="contained" onPress={saveLayer} style={{ marginTop: 24, borderRadius: BUTTON_RADIUS }}>
              {modalMode === "simple" ? t("common.save") : t("survey.saveLayer")}
            </Button>
            <Button
              onPress={() => { setDepthError(null); setModalVisible(false); }}
              style={{ marginTop: 8 }}
            >
              {t("common.cancel")}
            </Button>
          </ScrollView>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 4 },
  layerCard: { marginBottom: 8 },
  layerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  layerSummary: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  modalContent: { padding: 20, margin: 20, borderRadius: 8, maxHeight: "90%" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  inputHalf: { flex: 1 },
  sectionLabel: { fontWeight: "bold", marginBottom: 8, marginTop: 4 },
  checkRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  colorTypeContainer: {
    flexDirection: "row",
    marginBottom: 16,
  },
});
