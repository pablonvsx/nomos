import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Text,
  Button,
  Card,
  IconButton,
  useTheme as usePaperTheme,
  ActivityIndicator,
} from "react-native-paper";
import { useAlertDialog } from "@/hooks/use-dialog";
import { useScrollToInput } from "@/hooks/use-scroll-to-input";
import { useI18n } from "@/contexts/i18n-context";
import InfoBubble from "@/components/ui/InfoBubble";
import ScrollJumpButtons from "@/components/ui/ScrollJumpButtons";
import { BUTTON_RADIUS } from "@/constants/shape";
import { useBottomContentPadding } from "@/hooks/use-bottom-content-padding";
import { useScrollOverflow } from "@/hooks/use-scroll-overflow";
import {
  useProtocolRegistry,
  useRendererRegistry,
  useCapabilityBus,
} from "@/contexts/protocol-registry-context";

// Database
import {
  createPoint,
  getPoint,
  updatePoint,
} from "@/db/queries/points";
import { getCustomProtocolById } from "@/db/queries/custom-protocols";
import {
  getActiveVegetationClassificationConfig,
  getVegetationClassificationById,
} from "@/db/queries/vegetation-classifications";
import {
  createSpecies,
  getSpeciesByPoint,
  deleteSpecies,
} from "@/db/queries/species";
import { Species, VegetationClass } from "@/types/database";

// PAISAGEO modules (types only + the impacts conversion for the naming capability)
import type { VegetationModuleData } from "@/modules/paisageo/modules/vegetation/serde";
import { vegetationSchema } from "@/modules/paisageo/modules/vegetation/schema";
import type { GeoecologicalConstraintsModuleData } from "@/modules/paisageo/modules/geoecological-constraints/serde";
import type { ImpactsModuleData } from "@/modules/paisageo/modules/impacts/serde";
import { toRecordJson } from "@/modules/paisageo/modules/impacts/serde";
import type { LandscapeGenerateNameInput } from "@/modules/paisageo/capabilities/landscape-naming";
import {
  POINT_SIZE_FIELD,
  PHOTOS_FIELD,
  ADDITIONAL_NOTES_FIELD,
  AUDIO_NOTES_FIELD,
  SPECIES_FIELD,
  PLOT_SIZE_SECTION_TITLE,
  PHOTOS_SECTION_TITLE,
  NOTES_SECTION_TITLE,
  FLORA_SECTION_TITLE,
} from "@/modules/paisageo/point-level-fields";
import {
  HOMOGENEITY_SECTION_TITLE,
  CONSERVATION_SECTION_TITLE,
  CONSERVATION_SECTION_DESC,
} from "@/modules/paisageo/modules/vegetation/section-titles";

// Kernel / manifesto
import { buildCustomModuleDescriptor } from "@/modules/custom/manifest";
import type { ModuleDescriptor, LanguageCode } from "@/protocol-kernel/types";

// Generic renderers
import { GenericFieldRow } from "@/modules/generic/GenericFieldRow";
import { GenericModuleRenderer } from "@/modules/generic/GenericModuleRenderer";

const SUBSTITUTED_STATUS = "substituida";

// These 3 fields are vegetation module data (VegetationModuleData), but
// don't have their own specialized widget - unlike the Kuchler matrix
// (VegetationModuleRenderer), they're generic fields rendered directly by
// this screen, which allows freely controlling the card order (e.g.
// "Parcel Size" between homogeneity and vegetation structure).
// context_flags used to be here too, but it's rendered by
// VegetationModuleRenderer now, as a collapsible section under the matrix
// it complements (see that file).
const homogeneityCheckField = vegetationSchema.fields.find((f) => f.id === "homogeneity_check")!;
const conservationStatusField = vegetationSchema.fields.find((f) => f.id === "conservation_status")!;
const landUseField = vegetationSchema.fields.find((f) => f.id === "land_use")!;

// Every module-driven card (GenericModuleRenderer, GeoecologicalConstraintsModuleRenderer,
// ...) is wrapped in its own React.memo, so
// SurveyFormScreen re-rendering on every keystroke/tap anywhere in this large
// form doesn't force React to reconcile cards unrelated to the change. These
// 3 loose vegetation-adjacent fields (not module data, see the field
// constants above) were still plain inline JSX in SurveyFormScreen's own
// render body - no memo boundary at all - so every unrelated state change
// still recreated and reconciled their Card/RadioButton.Group subtree,
// producing a visible tap delay while the rest of the form (already behind a
// memo boundary) felt instant. Extracted here for the same treatment.
//
// Deliberately NOT generalized into a shared/attachable module (SPEC_FASE_9):
// homogeneity_check is a point-level field (not module data at all - it never
// gets serialized into any ModuleDescriptor), point_size lives on the `points`
// row itself, and conservation_status/land_use are vegetation-schema fields
// but are rendered here, outside VegetationModuleRenderer, purely for the
// PAISAGEO protocol's own field ordering (homogeneity -> plot size ->
// conservation -> vegetation structure). None of the three belong to
// manifest.modules, so there's no module boundary to generalize across
// protocols - they stay PAISAGEO-specific screen composition, same as before.

interface HomogeneityCardProps {
  lang: LanguageCode;
  value: boolean;
  onChange: (value: unknown) => void;
  onInfoPress: (text: string) => void;
}

const HomogeneityCard = React.memo(function HomogeneityCard({ lang, value, onChange, onInfoPress }: HomogeneityCardProps) {
  const theme = usePaperTheme();
  return (
    <Card mode="elevated" style={styles.sectionCard}>
      <Card.Title
        title={HOMOGENEITY_SECTION_TITLE[lang] ?? HOMOGENEITY_SECTION_TITLE["pt"]}
        titleVariant="titleMedium"
        style={{ backgroundColor: theme.colors.surfaceVariant, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
      />
      <Card.Content style={styles.cardContent}>
        <GenericFieldRow
          field={homogeneityCheckField}
          value={value}
          onChange={onChange}
          language={lang}
          onInfoPress={onInfoPress}
        />
      </Card.Content>
    </Card>
  );
});

interface PlotSizeCardProps {
  lang: LanguageCode;
  value: unknown;
  onChange: (value: unknown) => void;
  onInfoPress: (text: string) => void;
}

const PlotSizeCard = React.memo(function PlotSizeCard({ lang, value, onChange, onInfoPress }: PlotSizeCardProps) {
  const theme = usePaperTheme();
  const description = POINT_SIZE_FIELD.description
    ? POINT_SIZE_FIELD.description[lang] ?? POINT_SIZE_FIELD.description["pt"]
    : undefined;
  return (
    <Card mode="elevated" style={styles.sectionCard}>
      <Card.Title
        title={PLOT_SIZE_SECTION_TITLE[lang] ?? PLOT_SIZE_SECTION_TITLE["pt"]}
        titleVariant="titleMedium"
        right={description ? () => (
          <IconButton
            icon="information-outline"
            size={18}
            iconColor={theme.colors.secondary}
            style={{ marginRight: 4 }}
            onPress={() => onInfoPress(description)}
          />
        ) : undefined}
        style={{ backgroundColor: theme.colors.surfaceVariant, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
      />
      <Card.Content style={styles.cardContent}>
        <GenericFieldRow
          field={POINT_SIZE_FIELD}
          value={value}
          onChange={onChange}
          language={lang}
        />
      </Card.Content>
    </Card>
  );
});

interface ConservationCardProps {
  lang: LanguageCode;
  conservationValue: unknown;
  landUseValue: unknown;
  isSubstituted: boolean;
  onConservationChange: (value: unknown) => void;
  onLandUseChange: (value: unknown) => void;
  onInfoPress: (text: string) => void;
}

const ConservationCard = React.memo(function ConservationCard({
  lang,
  conservationValue,
  landUseValue,
  isSubstituted,
  onConservationChange,
  onLandUseChange,
  onInfoPress,
}: ConservationCardProps) {
  const theme = usePaperTheme();
  const description = CONSERVATION_SECTION_DESC[lang] ?? CONSERVATION_SECTION_DESC["pt"];
  return (
    <Card mode="elevated" style={styles.sectionCard}>
      <Card.Title
        title={CONSERVATION_SECTION_TITLE[lang] ?? CONSERVATION_SECTION_TITLE["pt"]}
        titleVariant="titleMedium"
        right={() => (
          <IconButton
            icon="information-outline"
            size={18}
            iconColor={theme.colors.secondary}
            style={{ marginRight: 4 }}
            onPress={() => onInfoPress(description)}
          />
        )}
        style={{ backgroundColor: theme.colors.surfaceVariant, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
      />
      <Card.Content style={styles.cardContent}>
        <GenericFieldRow
          field={conservationStatusField}
          value={conservationValue}
          onChange={onConservationChange}
          language={lang}
          onInfoPress={onInfoPress}
        />
        {isSubstituted && (
          <GenericFieldRow
            field={landUseField}
            value={landUseValue}
            onChange={onLandUseChange}
            language={lang}
            onInfoPress={onInfoPress}
          />
        )}
      </Card.Content>
    </Card>
  );
});

// Extra bottom scroll clearance so the save button never ends up hidden
// behind the floating scroll-to-top/bottom buttons (ScrollJumpButtons).
const JUMP_BUTTONS_CLEARANCE = 120;

export default function SurveyFormScreen() {
  // --- Hooks & Contexts ---
  const router = useRouter();
  const theme = usePaperTheme();
  const { confirm, alert } = useAlertDialog();
  const { t, currentLanguage } = useI18n();
  const registry = useProtocolRegistry();
  const rendererRegistry = useRendererRegistry();
  const bus = useCapabilityBus();
  const { scrollViewRef } = useScrollToInput();
  const { canScroll, onContentSizeChange, onLayout } = useScrollOverflow();
  const bottomPadding = useBottomContentPadding(canScroll ? JUMP_BUTTONS_CLEARANCE : 0);

  // --- Route Params ---
  const params = useLocalSearchParams();
  const {
    projectId,
    latitude,
    longitude,
    altitude,
    surveyPointId,
    protocolId,
    customProtocolDbId,
  } = params;
  const isEditMode = !!surveyPointId;

  // Resolve manifest
  const manifest = registry.getProtocol(protocolId as string);
  const isCustomProtocol = manifest?.kind === "custom";
  const lang = ((currentLanguage as string) ?? "pt") as LanguageCode;

  // --- Shared module-driven state (paisageo modules AND custom modules both
  // live here, keyed by module id - this is the same model the custom path
  // always used; paisageo now uses it too instead of a flat formValues dict). ---
  const [activeModules, setActiveModules] = useState<ModuleDescriptor[]>([]);
  const [moduleValues, setModuleValues] = useState<Record<string, Record<string, unknown>>>({});

  // --- State exclusive to the PAISAGEO path (data that doesn't belong to
  // any module: point-level DB columns, species satellite table, and the
  // project's active vegetation classification config). ---
  const [pointFields, setPointFields] = useState<Record<string, any>>({});
  const [speciesValue, setSpeciesValue] = useState<string>("[]");
  const [vegClassificationType, setVegClassificationType] = useState<"standard" | "custom">("standard");
  const [customVegClasses, setCustomVegClasses] = useState<VegetationClass[]>([]);
  const [tempSurveyPointId] = useState(() => `temp-${Date.now()}`);

  // --- Shared state ---
  const [isSaving, setIsSaving] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [infoText, setInfoText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [originalLocation, setOriginalLocation] = useState<{
    latitude: number;
    longitude: number;
    altitude?: number;
  } | null>(null);

  // --- Load logic ---
  // One shared loader for both protocol kinds. The only real bifurcation is
  // which modules exist (manifest.modules for paisageo, built from the DB
  // schema for custom) - everything after that operates uniformly on the
  // resulting module list. PAISAGEO-only extension points (vegetation
  // classification config, point-level DB columns, species satellite table)
  // stay scoped inside this one function rather than a second parallel one.
  const loadData = useCallback(async () => {
    try {
      let modules: ModuleDescriptor[] = [];
      if (isCustomProtocol) {
        const dbId = customProtocolDbId ? parseInt(customProtocolDbId as string) : null;
        if (dbId) {
          const cp = await getCustomProtocolById(dbId);
          if (cp) {
            modules = cp.schema.sections.map(buildCustomModuleDescriptor);
          }
        }
      } else {
        modules = manifest?.modules ?? [];
      }
      setActiveModules(modules);

      // Vegetation classification config (standard Küchler naming vs. a
      // custom per-project classes list) is part of the vegetation module
      // itself, not a PAISAGEO-only extra - any protocol (native or custom)
      // whose active modules include "vegetation" gets it.
      if (projectId && modules.some((m) => m.id === "vegetation")) {
        try {
          const config = await getActiveVegetationClassificationConfig(parseInt(projectId as string));
          if (config) {
            setVegClassificationType(config.type);
            if (config.type === "custom" && config.classificationId) {
              const classification = await getVegetationClassificationById(config.classificationId);
              if (classification) {
                setCustomVegClasses(classification.classes);
              }
            }
          }
        } catch (error) {
          console.error("Error loading vegetation classification config:", error);
        }
      }

      if (!isEditMode || !surveyPointId) {
        setIsLoading(false);
        return;
      }

      const result = await getPoint(surveyPointId as string);
      if (result) {
        const { point, modules: pointModules } = result;
        setOriginalLocation({
          latitude: point.lat,
          longitude: point.lon,
          altitude: point.altitude ?? undefined,
        });

        const initial: Record<string, Record<string, unknown>> = {};
        for (const m of modules) {
          const pm = pointModules.find((mod) => mod.module_id === m.id);
          const deserialized = pm ? m.deserialize(pm.data_json) : m.deserialize(JSON.stringify(null));
          initial[m.id] = (deserialized as Record<string, unknown>) ?? {};
        }
        setModuleValues(initial);

        if (!isCustomProtocol) {
          setPointFields({
            point_size: point.point_size?.toString() || "",
            photos: point.photos || "[]",
            additional_notes: point.additional_notes || "[]",
            audio_notes: point.audio_notes || "[]",
          });

          try {
            const speciesRecords = await getSpeciesByPoint(point.id);
            setSpeciesValue(speciesRecords && speciesRecords.length > 0 ? JSON.stringify(speciesRecords) : "[]");
          } catch (speciesError) {
            console.error("Error loading species:", speciesError);
          }
        }
      }
    } catch (error) {
      console.error("Error loading survey point:", error);
      alert(t("common.error"), t("survey.errorLoading"));
    } finally {
      setIsLoading(false);
    }
  }, [isCustomProtocol, projectId, customProtocolDbId, manifest, isEditMode, surveyPointId, alert, t]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, surveyPointId, protocolId, customProtocolDbId]);

  // --- Handlers ---
  const handleInfoPress = useCallback((text: string) => {
    setInfoText(text);
  }, []);

  const handleModuleChange = useCallback((moduleId: string, next: unknown) => {
    setModuleValues((prev) => ({ ...prev, [moduleId]: next as Record<string, unknown> }));
  }, []);

  const handlePointFieldChange = useCallback((key: string, value: unknown) => {
    setPointFields((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSpeciesChange = useCallback((v: unknown) => setSpeciesValue(v as string), []);

  // Merges a single key into moduleValues["vegetation"] - used by the loose
  // vegetation fields (homogeneity/conservation/land use) rendered directly
  // by this screen, not by VegetationModuleRenderer. When conservation_status
  // moves away from "substituida", land_use no longer has a UI to edit it
  // (its card disappears) - clear it here too, not just at save time, so a
  // stale value doesn't linger in memory if the user flips back and forth
  // without saving, and doesn't get re-saved for an already-loaded point
  // whose land_use was never cleared before this fix.
  const handleVegFieldChange = useCallback((key: string, val: unknown) => {
    setModuleValues((prev) => {
      const nextVeg: Record<string, unknown> = { ...(prev["vegetation"] ?? {}), [key]: val };
      if (key === "conservation_status" && val !== SUBSTITUTED_STATUS) {
        delete nextVeg.land_use;
      }
      return { ...prev, vegetation: nextVeg };
    });
  }, []);

  // Stable per-key onChange callback caches. GenericFieldRow/SurveySelect
  // memoize on prop identity (React.memo) - a fresh inline arrow function
  // created on every render (e.g. `onChange={(v) => handleX(key, v)}`) would
  // defeat that memoization and force every field to re-render, and every
  // heavy widget (KuchlerMatrix, SoilProfileInput...) to re-mount its work,
  // on every keystroke anywhere in the form. These caches hand out the same
  // function reference for a given key forever.
  const moduleOnChangeCache = useRef<Record<string, (next: unknown) => void>>({});
  const getModuleOnChange = (moduleId: string) => {
    if (!moduleOnChangeCache.current[moduleId]) {
      moduleOnChangeCache.current[moduleId] = (next: unknown) => handleModuleChange(moduleId, next);
    }
    return moduleOnChangeCache.current[moduleId];
  };

  const pointFieldOnChangeCache = useRef<Record<string, (val: unknown) => void>>({});
  const getPointFieldOnChange = (key: string) => {
    if (!pointFieldOnChangeCache.current[key]) {
      pointFieldOnChangeCache.current[key] = (val: unknown) => handlePointFieldChange(key, val);
    }
    return pointFieldOnChangeCache.current[key];
  };

  const vegFieldOnChangeCache = useRef<Record<string, (val: unknown) => void>>({});
  const getVegFieldOnChange = (key: string) => {
    if (!vegFieldOnChangeCache.current[key]) {
      vegFieldOnChangeCache.current[key] = (val: unknown) => handleVegFieldChange(key, val);
    }
    return vegFieldOnChangeCache.current[key];
  };

  // Card-title "i" icon, matching the original section-level info bubble for
  // fields whose type has no built-in icon of its own in FieldRenderer (e.g.
  // "number", "photo_input", "notes_list", "species_list" - unlike
  // select/checkbox/confirm_checkbox, which draw their own via onInfoPress).
  const infoRight = (desc?: string) =>
    desc
      ? () => (
          <IconButton
            icon="information-outline"
            size={18}
            iconColor={theme.colors.secondary}
            style={{ marginRight: 4 }}
            onPress={() => handleInfoPress(desc)}
          />
        )
      : undefined;

  const handleSaveSuccess = () => {
    if (isEditMode) {
      alert(t("common.success"), t("survey.plotUpdated"));
      setIsNavigating(true);
      router.back();
    } else {
      confirm(
        t("common.success"),
        t("survey.newCollectionPrompt"),
        () => {
          setIsNavigating(true);
          router.dismiss();
        },
        () => {
          setIsNavigating(true);
          router.dismissAll();
          router.push(`/project-details/${projectId}` as any);
        },
        t("survey.newCollection"),
        t("survey.finish"),
      );
    }
  };

  const handleSavePaisageo = async () => {
    if (isSaving || isNavigating) return;

    const vegData = (moduleValues["vegetation"] ?? {}) as VegetationModuleData;
    const isVegetationSubstituted = vegData.conservation_status === SUBSTITUTED_STATUS;

    if (!vegData.homogeneity_check) {
      alert(t("common.error"), t("survey.homogeneityRequired"));
      return;
    }

    if (isVegetationSubstituted && !vegData.land_use) {
      alert(t("common.error"), "Selecione o uso do solo antes de salvar.");
      return;
    }

    setIsSaving(true);

    try {
      // Resolve vegetation name (needed for landscape.generateName)
      let currentVegName = "";
      if (isVegetationSubstituted) {
        const landUseOption = landUseField.options?.find((o) => o.value === vegData.land_use);
        currentVegName = landUseOption
          ? (landUseOption.label[lang] ?? landUseOption.label["pt"])
          : String(vegData.land_use || "");
      } else if (vegClassificationType === "custom") {
        const selectedClass = customVegClasses.find((cls) => cls.id === vegData.custom_class_id);
        if (selectedClass) currentVegName = selectedClass.name;
      } else {
        currentVegName = vegData.physiognomy_name || "";
      }

      // When the vegetation was replaced, the fields specific to the Kuchler
      // matrix lose their meaning - we keep only what this section actually
      // controls (conservation and, if present, the custom class).
      // land_use is only meaningful while conservation_status === "substituida"
      // - stripped out here (not just left unset by the UI) so a value picked
      // during an earlier "substituida" selection, then never cleared before
      // this fix, doesn't keep getting re-saved once the status moves away.
      const { land_use: _unusedLandUse, ...vegDataWithoutLandUse } = vegData;
      const finalVegData: VegetationModuleData = isVegetationSubstituted
        ? {
            conservation_status: vegData.conservation_status,
            land_use: vegData.land_use,
            homogeneity_check: vegData.homogeneity_check,
            ...(vegClassificationType === "custom" ? { custom_class_id: vegData.custom_class_id } : {}),
          }
        : vegClassificationType === "custom" && currentVegName
          ? { ...vegDataWithoutLandUse, physiognomy_name: currentVegName }
          : vegDataWithoutLandUse;

      const modulesData: Record<string, Record<string, unknown>> = {
        ...moduleValues,
        vegetation: finalVegData as unknown as Record<string, unknown>,
      };

      const modules: Record<string, string> = Object.fromEntries(
        activeModules.map((m) => [m.id, m.serialize(modulesData[m.id] ?? {})]),
      );

      const geomData = (moduleValues["geoecological_constraints"] ?? {}) as GeoecologicalConstraintsModuleData;
      const impactsData = (moduleValues["impacts"] as unknown as ImpactsModuleData) ?? { impacts: [] };
      const impactsRecordJson = toRecordJson(impactsData);

      // Gerar nome da paisagem via CapabilityBus
      const genNameHandle = bus.get<LandscapeGenerateNameInput, string>("landscape.generateName");
      const finalGeneratedName = genNameHandle
        ? await genNameHandle.invoke({
            data: {
              veg_physiognomy_name: currentVegName,
              veg_physiognomy_complement: finalVegData.physiognomy_complement || "",
              veg_structure: JSON.stringify(finalVegData),
              geomorphology_type: geomData.geomorphology_type,
              environmental_impacts: impactsRecordJson,
            },
            lang,
          })
        : undefined;

      const lat = isEditMode && originalLocation ? originalLocation.latitude : Number(latitude);
      const lon = isEditMode && originalLocation ? originalLocation.longitude : Number(longitude);
      const alt = isEditMode && originalLocation
        ? originalLocation.altitude ?? null
        : altitude ? Number(altitude) : null;

      let savedPointId: string | null = null;
      let success = false;

      if (isEditMode && surveyPointId) {
        success = await updatePoint(surveyPointId as string, {
          lat,
          lon,
          altitude: alt,
          generated_name: finalGeneratedName,
          photos: pointFields["photos"] || "[]",
          audio_notes: pointFields["audio_notes"] || "[]",
          additional_notes: pointFields["additional_notes"] || "[]",
          point_size: Number(pointFields["point_size"]) || 0,
          schema_version: "1.0.0",
          modules,
        });
        savedPointId = surveyPointId as string;
      } else {
        savedPointId = await createPoint({
          project_id: Number(projectId),
          protocol_id: protocolId as string,
          lat,
          lon,
          altitude: alt,
          generated_name: finalGeneratedName,
          photos: pointFields["photos"] || "[]",
          audio_notes: pointFields["audio_notes"] || "[]",
          additional_notes: pointFields["additional_notes"] || "[]",
          point_size: Number(pointFields["point_size"]) || 0,
          schema_version: "1.0.0",
          modules,
        });
        success = !!savedPointId;
      }

      if (success && savedPointId) {
        // Save species to the satellite table
        try {
          let speciesToSave: Species[] = [];
          try {
            const parsed = JSON.parse(speciesValue);
            if (Array.isArray(parsed) && parsed.length > 0 && "abundance" in parsed[0]) {
              speciesToSave = parsed;
            }
          } catch {}

          if (isEditMode) {
            const existingSpecies = await getSpeciesByPoint(savedPointId);
            for (const sp of existingSpecies) {
              await deleteSpecies(sp.id);
            }
          }

          for (const sp of speciesToSave) {
            await createSpecies({
              project_id: Number(projectId),
              point_id: savedPointId,
              scientific_name: sp.scientific_name,
              common_names: sp.common_names,
              genus: sp.genus,
              family: sp.family,
              abundance: sp.abundance,
            });
          }
        } catch (speciesError) {
          console.error("Error saving species:", speciesError);
        }

        handleSaveSuccess();
      } else {
        throw new Error("Database operation failed");
      }
    } catch (error) {
      console.error("Error saving survey point:", error);
      alert(t("common.error"), t("survey.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCustom = async () => {
    if (isSaving || isNavigating) return;
    setIsSaving(true);

    try {
      const modules: Record<string, string> = Object.fromEntries(
        activeModules.map((m) => [m.id, m.serialize(moduleValues[m.id] ?? {})])
      );

      const lat = isEditMode && originalLocation ? originalLocation.latitude : Number(latitude);
      const lon = isEditMode && originalLocation ? originalLocation.longitude : Number(longitude);
      const alt = isEditMode && originalLocation
        ? originalLocation.altitude ?? null
        : altitude ? Number(altitude) : null;

      let success = false;

      if (isEditMode && surveyPointId) {
        success = await updatePoint(surveyPointId as string, {
          lat,
          lon,
          altitude: alt,
          schema_version: "1.0.0",
          modules,
        });
      } else {
        const resultId = await createPoint({
          project_id: Number(projectId),
          protocol_id: (protocolId as string) ?? "custom",
          lat,
          lon,
          altitude: alt,
          schema_version: "1.0.0",
          modules,
        });
        success = !!resultId;
      }

      if (success) {
        handleSaveSuccess();
      } else {
        throw new Error("Database operation failed");
      }
    } catch (error) {
      console.error("Error saving custom survey point:", error);
      alert(t("common.error"), t("survey.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const surveyPointIdForMedia = isEditMode
    ? surveyPointId ? (surveyPointId as string) : undefined
    : tempSurveyPointId;

  // Renders one module's card - the specialized *ModuleRenderer if the kernel
  // registry has one (self-wrapped in its own Card, e.g. KuchlerMatrix,
  // SoilProfileInput+SurfaceCoverInput), else GenericModuleRenderer generic
  // fallback. Same mechanism for PAISAGEO and custom-protocol modules alike.
  const renderModuleCard = (moduleId: string, extraProps?: Record<string, unknown>) => {
    const module = activeModules.find((m) => m.id === moduleId);
    if (!module) return null;
    const Renderer = rendererRegistry.get(moduleId) as React.ComponentType<any> | undefined;
    const value = moduleValues[moduleId] ?? {};
    const onChange = getModuleOnChange(moduleId);

    if (Renderer) {
      return (
        <Renderer
          key={moduleId}
          value={value}
          onChange={onChange}
          language={lang}
          onInfoPress={handleInfoPress}
          {...extraProps}
        />
      );
    }
    return (
      <GenericModuleRenderer
        key={moduleId}
        module={module}
        value={value}
        onChange={onChange}
        language={lang}
        projectId={projectId ? Number(projectId) : undefined}
        surveyPointId={surveyPointIdForMedia}
      />
    );
  };

  // --- Shared Loading screen ---
  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: t("common.loading"), headerBackTitle: "" }} />
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ marginTop: 16 }}>{t("survey.loadingPlot")}</Text>
      </View>
    );
  }

  // Only used by the PAISAGEO branch below, but harmless to compute
  // unconditionally (moduleValues["vegetation"] is just absent for custom
  // protocols).
  const vegDataForRender = (moduleValues["vegetation"] ?? {}) as VegetationModuleData;
  const isVegetationSubstituted = vegDataForRender.conservation_status === SUBSTITUTED_STATUS;
  const cardTitleStyle = {
    backgroundColor: theme.colors.surfaceVariant,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 80}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <Stack.Screen
        options={{
          title: isEditMode ? t("survey.editPlot") : t("survey.fillForm"),
          headerBackTitle: "",
        }}
      />

      <ScrollView
        ref={scrollViewRef}
        onContentSizeChange={onContentSizeChange}
        onLayout={onLayout}
        contentContainerStyle={[styles.content, { backgroundColor: theme.colors.background, paddingBottom: bottomPadding }]}
      >
        {/* Info Header */}
        <View style={styles.headerInfo}>
          <Text variant="labelMedium" style={{ color: theme.colors.secondary }}>
            {t("survey.locationLabel")}:{" "}
            {(isEditMode && originalLocation ? originalLocation.latitude : Number(latitude)).toFixed(5)},{" "}
            {(isEditMode && originalLocation ? originalLocation.longitude : Number(longitude)).toFixed(5)}
          </Text>
        </View>

        {isCustomProtocol ? (
          activeModules.map((module) => (
            <View key={module.id}>
              {renderModuleCard(
                module.id,
                module.id === "vegetation"
                  ? { classificationType: vegClassificationType, customClasses: customVegClasses }
                  : undefined,
              )}
            </View>
          ))
        ) : (
          <>
            {/* Homogeneity confirmation - first card, as in the original protocol. */}
            <HomogeneityCard
              lang={lang}
              value={vegDataForRender.homogeneity_check ?? false}
              onChange={getVegFieldOnChange("homogeneity_check")}
              onInfoPress={handleInfoPress}
            />

            {/* Parcel size - right below homogeneity. */}
            <PlotSizeCard
              lang={lang}
              value={pointFields["point_size"]}
              onChange={getPointFieldOnChange("point_size")}
              onInfoPress={handleInfoPress}
            />

            {/* Vegetation conservation status + land use (conditional). */}
            <ConservationCard
              lang={lang}
              conservationValue={vegDataForRender.conservation_status}
              landUseValue={vegDataForRender.land_use}
              isSubstituted={isVegetationSubstituted}
              onConservationChange={getVegFieldOnChange("conservation_status")}
              onLandUseChange={getVegFieldOnChange("land_use")}
              onInfoPress={handleInfoPress}
            />

            {/* Vegetation structure: Kuchler matrix + classification, inside
                VegetationModuleRenderer itself. Disappears when replaced. */}
            {!isVegetationSubstituted &&
              renderModuleCard("vegetation", {
                classificationType: vegClassificationType,
                customClasses: customVegClasses,
              })}

            {/* Floristic survey: not module data (species live in their own
                satellite table), disappears along with the structure when the
                vegetation was replaced. */}
            {!isVegetationSubstituted && (
              <Card mode="elevated" style={styles.sectionCard}>
                <Card.Title
                  title={FLORA_SECTION_TITLE[lang] ?? FLORA_SECTION_TITLE["pt"]}
                  titleVariant="titleMedium"
                  right={infoRight(
                    SPECIES_FIELD.description
                      ? SPECIES_FIELD.description[lang] ?? SPECIES_FIELD.description["pt"]
                      : undefined,
                  )}
                  style={cardTitleStyle}
                />
                <Card.Content style={styles.cardContent}>
                  <GenericFieldRow
                    field={SPECIES_FIELD}
                    value={speciesValue}
                    onChange={handleSpeciesChange}
                    language={lang}
                    projectId={projectId ? Number(projectId) : undefined}
                    surveyPointId={surveyPointIdForMedia}
                  />
                </Card.Content>
              </Card>
            )}

            {renderModuleCard("geoecological_constraints")}
            {renderModuleCard("impacts")}

            <Card mode="elevated" style={styles.sectionCard}>
              <Card.Title
                title={PHOTOS_SECTION_TITLE[lang] ?? PHOTOS_SECTION_TITLE["pt"]}
                titleVariant="titleMedium"
                right={infoRight(
                  PHOTOS_FIELD.description
                    ? PHOTOS_FIELD.description[lang] ?? PHOTOS_FIELD.description["pt"]
                    : undefined,
                )}
                style={cardTitleStyle}
              />
              <Card.Content style={styles.cardContent}>
                <GenericFieldRow
                  field={PHOTOS_FIELD}
                  value={pointFields["photos"]}
                  onChange={getPointFieldOnChange("photos")}
                  language={lang}
                  projectId={projectId ? Number(projectId) : undefined}
                  surveyPointId={surveyPointIdForMedia}
                />
              </Card.Content>
            </Card>

            <Card mode="elevated" style={styles.sectionCard}>
              <Card.Title
                title={NOTES_SECTION_TITLE[lang] ?? NOTES_SECTION_TITLE["pt"]}
                titleVariant="titleMedium"
                style={cardTitleStyle}
              />
              <Card.Content style={styles.cardContent}>
                <GenericFieldRow
                  field={ADDITIONAL_NOTES_FIELD}
                  value={pointFields["additional_notes"]}
                  onChange={getPointFieldOnChange("additional_notes")}
                  language={lang}
                />
                <GenericFieldRow
                  field={AUDIO_NOTES_FIELD}
                  value={pointFields["audio_notes"]}
                  onChange={getPointFieldOnChange("audio_notes")}
                  language={lang}
                  projectId={projectId ? Number(projectId) : undefined}
                  surveyPointId={surveyPointIdForMedia}
                />
              </Card.Content>
            </Card>
          </>
        )}

        <Button
          mode="contained"
          onPress={isCustomProtocol ? handleSaveCustom : handleSavePaisageo}
          loading={isSaving}
          disabled={isSaving || isNavigating}
          style={[styles.saveButton, { borderRadius: BUTTON_RADIUS }]}
          icon="content-save"
          contentStyle={{ height: 48 }}
        >
          {isEditMode ? t("survey.updatePlot") : t("survey.savePlot")}
        </Button>
      </ScrollView>

      <ScrollJumpButtons
        visible={canScroll}
        onScrollToTop={() => scrollViewRef.current?.scrollTo({ y: 0, animated: true })}
        onScrollToBottom={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      />

      <InfoBubble text={infoText} onDismiss={() => setInfoText(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: "center", alignItems: "center", padding: 16 },
  content: { padding: 16 },
  headerInfo: { marginBottom: 16, alignItems: "center" },
  sectionCard: { marginBottom: 24, borderRadius: 12 },
  cardContent: { paddingTop: 16 },
  saveButton: { marginTop: 8 },
});
