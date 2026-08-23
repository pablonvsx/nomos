import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { View, StyleSheet } from "react-native";
import {
  Text,
  Checkbox,
  TextInput,
  SegmentedButtons,
  Card,
  useTheme,
} from "react-native-paper";
import { useI18n } from "@/contexts/i18n-context";
import { useProtocolTranslations } from "@/hooks/use-protocol-translations";
import { SEGMENTED_BUTTONS_SHAPE_THEME } from "@/constants/shape";

// Data Type Definitions
interface ImpactValue {
  magnitude: string;
  details: string;
}

interface Props {
  field: any;
  value?: string;
  onChange: (value: string) => void;
}

interface NormalizedImpactOption {
  key: string;
  label: string;
  desc: string | null;
  raw: any;
}

interface ImpactItemRowProps {
  option: NormalizedImpactOption;
  isSelected: boolean;
  itemData?: ImpactValue;
  magnitudeButtons: { value: string; label: string }[];
  magnitudeList: any[];
  detailsLabel: string;
  magnitudeLabel: string;
  placeholder: string;
  onToggle: (impactKey: string) => void;
  onMagnitudeChange: (impactKey: string, val: string) => void;
  onDetailsChange: (impactKey: string, text: string) => void;
  translateField: (field: any) => string;
}

const ImpactItemRow = React.memo(function ImpactItemRow({
  option,
  isSelected,
  itemData,
  magnitudeButtons,
  magnitudeList,
  detailsLabel,
  magnitudeLabel,
  placeholder,
  onToggle,
  onMagnitudeChange,
  onDetailsChange,
  translateField,
}: ImpactItemRowProps) {
  const theme = useTheme();

  const magnitudeDesc = useMemo(() => {
    if (!itemData) return null;

    const magIndex = magnitudeList.findIndex((m: any) => {
      const v = typeof m === "string" ? m : (m.value ?? m["pt"] ?? m["en"]);
      return v === itemData.magnitude;
    });

    const magDesc = option.raw?.magnitude_desc?.[magIndex];
    return magDesc ? translateField(magDesc) : null;
  }, [itemData, magnitudeList, option.raw, translateField]);

  return (
    <View style={styles.itemContainer}>
      <View style={styles.checkboxRow}>
        <Checkbox.Android
          status={isSelected ? "checked" : "unchecked"}
          onPress={() => onToggle(option.key)}
        />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text
            onPress={() => onToggle(option.key)}
            style={[
              styles.label,
              { color: theme.colors.onSurface },
              isSelected && { fontWeight: "bold" },
            ]}
          >
            {option.label}
          </Text>

          {option.desc && (
            <Text
              onPress={() => onToggle(option.key)}
              style={[
                styles.description,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {option.desc}
            </Text>
          )}
        </View>
      </View>

      {isSelected && itemData && (
        <Card
          style={[
            styles.detailCard,
            {
              backgroundColor: theme.colors.surfaceVariant,
              borderColor: theme.colors.outline,
            },
          ]}
          mode="outlined"
        >
          <Card.Content>
            <Text
              variant="labelSmall"
              style={{ marginBottom: 8, color: theme.colors.onSurface }}
            >
              {magnitudeLabel}:
            </Text>

            <SegmentedButtons
              value={itemData.magnitude}
              onValueChange={(val) => onMagnitudeChange(option.key, val)}
              buttons={magnitudeButtons}
              density="small"
              style={{ marginBottom: 8 }}
              theme={{
                ...SEGMENTED_BUTTONS_SHAPE_THEME,
                colors: {
                  secondaryContainer: theme.colors.primaryContainer,
                  onSecondaryContainer: theme.colors.onPrimaryContainer,
                },
              }}
            />

            {magnitudeDesc && (
              <Text
                variant="bodySmall"
                style={{
                  marginBottom: 12,
                  marginTop: 2,
                  color: theme.colors.onSurfaceVariant,
                  fontStyle: "italic",
                  lineHeight: 18,
                  textAlign: "justify",
                }}
              >
                {magnitudeDesc}
              </Text>
            )}

            <TextInput
              label={detailsLabel}
              placeholder={placeholder}
              value={itemData.details}
              onChangeText={(text) => onDetailsChange(option.key, text)}
              mode="outlined"
              multiline
              numberOfLines={3}
              outlineColor={theme.colors.outline}
              activeOutlineColor={theme.colors.primary}
              style={{ backgroundColor: theme.colors.surface }}
            />
          </Card.Content>
        </Card>
      )}
    </View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.option === nextProps.option &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.itemData === nextProps.itemData &&
    prevProps.magnitudeButtons === nextProps.magnitudeButtons &&
    prevProps.magnitudeList === nextProps.magnitudeList &&
    prevProps.detailsLabel === nextProps.detailsLabel &&
    prevProps.magnitudeLabel === nextProps.magnitudeLabel &&
    prevProps.placeholder === nextProps.placeholder &&
    prevProps.onToggle === nextProps.onToggle &&
    prevProps.onMagnitudeChange === nextProps.onMagnitudeChange &&
    prevProps.onDetailsChange === nextProps.onDetailsChange &&
    prevProps.translateField === nextProps.translateField
  );
});

export default function ImpactList({ field, value, onChange }: Props) {
  const { t } = useI18n();
  const { translateField } = useProtocolTranslations();
  const lastEmittedValue = useRef<string | null>(null);
  const isHydratingFromValue = useRef(false);

  // 1. EXTRACT MAGNITUDE OPTIONS FROM JSON (Memoized)
  const { magnitudeList, magnitudeButtons, defaultMagnitude } = useMemo(() => {
    const list = field.config?.magnitude_options || [
      "occasional",
      "common",
      "critical",
    ];

    const buttons = list.map((m: any) => {
      const value = typeof m === "string" ? m : (m.value ?? m["pt"] ?? m["en"]);
      const label = translateField(m);
      return { value, label };
    });

    const defaultMag =
      typeof list[0] === "string"
        ? list[0]
        : (list[0].value ?? list[0]["pt"] ?? list[0]["en"]);

    return { magnitudeList: list, magnitudeButtons: buttons, defaultMagnitude: defaultMag };
  }, [field.config?.magnitude_options, translateField]);

  // State: Map of "ImpactKey" -> { magnitude, details }
  const [impacts, setImpacts] = useState<Record<string, ImpactValue>>({});

  useEffect(() => {
    if (value) {
      if (value === lastEmittedValue.current) {
        return;
      }
      try {
        isHydratingFromValue.current = true;
        lastEmittedValue.current = value;
        setImpacts(JSON.parse(value));
      } catch (e) {
        console.error("Error parsing impact data:", e);
      }
    } else {
      setImpacts({});
    }
  }, [value]);

  useEffect(() => {
    if (isHydratingFromValue.current) {
      isHydratingFromValue.current = false;
      return;
    }

    const serialized = JSON.stringify(impacts);
    if (serialized === lastEmittedValue.current) {
      return;
    }
    lastEmittedValue.current = serialized;
    onChange(serialized);
  }, [impacts, onChange]);

  const toggleImpact = useCallback((impactKey: string) => {
    setImpacts((prev) => {
      const next = { ...prev };

      if (next[impactKey]) {
        delete next[impactKey];
      } else {
        next[impactKey] = { magnitude: defaultMagnitude, details: "" };
      }

      return next;
    });
  }, [defaultMagnitude]);

  const updateImpact = useCallback((impactKey: string, key: "magnitude" | "details", val: string) => {
    setImpacts((prev) => {
      if (!prev[impactKey]) {
        return prev;
      }

      return {
        ...prev,
        [impactKey]: { ...prev[impactKey], [key]: val },
      };
    });
  }, []);

  const handleMagnitudeChange = useCallback((impactKey: string, val: string) => {
    updateImpact(impactKey, "magnitude", val);
  }, [updateImpact]);

  const handleDetailsChange = useCallback((impactKey: string, text: string) => {
    updateImpact(impactKey, "details", text);
  }, [updateImpact]);

  // Get context-specific placeholder for each impact type (Memoized)
  const placeholders = useMemo(() => ({
    "fire": {
      pt: "Há quanto tempo? Frequência? Origem?",
      en: "How long ago? Frequency? Origin?",
      es: "¿Hace cuánto tiempo? ¿Frecuencia? ¿Origen?"
    },
    "invasive_species": {
      pt: "Quais espécies?",
      en: "Which species?",
      es: "¿Qué especies?"
    },
    "frost": {
      pt: "Duração (meses)? Frequência?",
      en: "Duration (months)? Frequency?",
      es: "¿Duración (meses)? ¿Frecuencia?"
    },
    "drought": {
      pt: "Duração (meses)? Sinais observados?",
      en: "Duration (months)? Observed signs?",
      es: "¿Duración (meses)? ¿Signos observados?"
    },
    "mining": {
      pt: "Tipo de lavra? Extensão da área?",
      en: "Type of mining? Area extent?",
      es: "¿Tipo de explotación? ¿Extensión del área?"
    },
    "pollution": {
      pt: "Tipo (plástico, químico, etc)? Fonte?",
      en: "Type (plastic, chemical, etc)? Source?",
      es: "¿Tipo (plástico, químico, etc)? ¿Fuente?"
    },
    "erosion": {
      pt: "Profundidade dos sulcos? Área afetada?",
      en: "Gully depth? Affected area?",
      es: "¿Profundidad de surcos? ¿Área afectada?"
    },
    "overgrazing": {
      pt: "Tipo de gado? Densidade de animais?",
      en: "Type of livestock? Animal density?",
      es: "¿Tipo de ganado? ¿Densidad de animales?"
    },
    "burial": {
      pt: "Espessura do sedimento? Origem?",
      en: "Sediment thickness? Origin?",
      es: "¿Espesor del sedimento? ¿Origen?"
    },
    "vegetation_removal": {
      pt: "Tipo de remoção? Quando ocorreu?",
      en: "Type of removal? When did it occur?",
      es: "¿Tipo de remoción? ¿Cuándo ocurrió?"
    }
  }), []);

  const getPlaceholder = useCallback((optionKey: string) => {
    return placeholders[optionKey as keyof typeof placeholders] || {
      pt: "Detalhes adicionais...",
      en: "Additional details...",
      es: "Detalles adicionales..."
    };
  }, [placeholders]);

  const normalizedOptions = useMemo<NormalizedImpactOption[]>(() => {
    return (field.options || []).map((option: any) => {
      const optionKey = option.key
        ? option.key
        : (typeof option === "string" ? option : (option.pt || option.en || "Unknown"));

      const optionLabel = option.label
        ? translateField(option.label)
        : translateField(option);

      const optionDesc = option.desc
        ? translateField(option.desc)
        : null;

      return {
        key: optionKey,
        label: optionLabel,
        desc: optionDesc,
        raw: option,
      };
    });
  }, [field.options, translateField]);

  const detailsLabel = t("survey.detailsOptional");
  const magnitudeLabel = t("survey.magnitude");

  return (
    <View>
      {normalizedOptions.map((option) => {
        const isSelected = !!impacts[option.key];
        const itemData = impacts[option.key];
        const placeholder = translateField(getPlaceholder(option.key));

        return (
          <ImpactItemRow
            key={option.key}
            option={option}
            isSelected={isSelected}
            itemData={itemData}
            magnitudeButtons={magnitudeButtons}
            magnitudeList={magnitudeList}
            detailsLabel={detailsLabel}
            magnitudeLabel={magnitudeLabel}
            placeholder={placeholder}
            onToggle={toggleImpact}
            onMagnitudeChange={handleMagnitudeChange}
            onDetailsChange={handleDetailsChange}
            translateField={translateField}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  itemContainer: { marginBottom: 12 },
  checkboxRow: { flexDirection: "row", alignItems: "center" },
  label: { fontSize: 16 },
  description: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
    fontStyle: 'italic',
    textAlign: 'justify'
  },
  detailCard: {
    marginLeft: 0,
    marginTop: 8,
    marginRight: 0,
    marginBottom: 4,
  },
});