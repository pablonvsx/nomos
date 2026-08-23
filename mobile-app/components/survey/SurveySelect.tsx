// src/components/survey/SurveySelect.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { RadioButton, Checkbox, Text, useTheme, IconButton } from "react-native-paper";

type SelectOption = string | { label: string; value?: string; desc?: string };

interface Props {
  options: SelectOption[];
  value?: string | string[];
  onChange: (val: string | string[]) => void;
  label: string;
  multiple?: boolean;
  singleColumn?: boolean;
  hideLabel?: boolean;
  desc?: string;
  onInfoPress?: (text: string) => void;
  /** When true, each option's description appears as always-visible text
   *  below the label, instead of the "i" icon + modal (used by the custom
   *  protocol; PAISAGEO never sets this, keeping the icon+modal). */
  inlineDesc?: boolean;
}

// Normalize option to { label, value, desc }
function resolveOption(opt: SelectOption): { label: string; value: string; desc?: string } {
  if (typeof opt === "string") return { label: opt, value: opt };
  return { label: opt.label, value: opt.value ?? opt.label, desc: opt.desc };
}

function SurveySelect({
  options,
  value,
  onChange,
  label,
  multiple = false,
  singleColumn = false,
  hideLabel = false,
  desc,
  onInfoPress,
  inlineDesc = false,
}: Props) {
  const theme = useTheme();

  const [localMultipleValue, setLocalMultipleValue] = useState<string[]>(
    Array.isArray(value) ? value : []
  );
  const [localSingleValue, setLocalSingleValue] = useState<string>(
    typeof value === "string" ? value : ""
  );

  useEffect(() => {
    if (multiple) {
      setLocalMultipleValue(Array.isArray(value) ? value : []);
      return;
    }
    setLocalSingleValue(typeof value === "string" ? value : "");
  }, [multiple, value]);

  const handleMultipleToggle = useCallback((optValue: string) => {
    const currentValues = localMultipleValue;
    const newValues = currentValues.includes(optValue)
      ? currentValues.filter((v) => v !== optValue)
      : [...currentValues, optValue];

    setLocalMultipleValue(newValues);
    onChange(newValues);
  }, [localMultipleValue, onChange]);

  const handleSingleChange = useCallback((optValue: string) => {
    setLocalSingleValue(optValue);
    onChange(optValue);
  }, [onChange]);

  const midPoint = useMemo(() => Math.ceil(options.length / 2), [options.length]);
  const leftColumn = useMemo(() => options.slice(0, midPoint), [options, midPoint]);
  const rightColumn = useMemo(() => options.slice(midPoint), [options, midPoint]);

  const renderOptionRow = useCallback((opt: SelectOption, mode: "radio" | "checkbox") => {
    const { label: optLabel, value: optValue, desc: optDesc } = resolveOption(opt);
    const isSelected =
      mode === "checkbox"
        ? localMultipleValue.includes(optValue)
        : localSingleValue === optValue;

    const handlePress = () =>
      mode === "checkbox" ? handleMultipleToggle(optValue) : handleSingleChange(optValue);

    if (inlineDesc) {
      return (
        <View key={optValue} style={styles.optionBlock}>
          <View style={styles.optionRow}>
            {mode === "checkbox" ? (
              <Checkbox status={isSelected ? "checked" : "unchecked"} onPress={handlePress} />
            ) : (
              <RadioButton value={optValue} />
            )}
            <Text
              onPress={handlePress}
              style={[styles.optionText, { color: theme.colors.onSurface }]}
            >
              {optLabel}
            </Text>
          </View>
          {optDesc && (
            <Text
              variant="bodySmall"
              style={[styles.optionDescText, { color: theme.colors.onSurfaceVariant }]}
            >
              {optDesc}
            </Text>
          )}
        </View>
      );
    }

    return (
      <View key={optValue} style={styles.optionRow}>
        {mode === "checkbox" ? (
          <Checkbox status={isSelected ? "checked" : "unchecked"} onPress={handlePress} />
        ) : (
          <RadioButton value={optValue} />
        )}
        <Text
          onPress={handlePress}
          style={[styles.optionText, { color: theme.colors.onSurface }]}
        >
          {optLabel}
        </Text>
        {optDesc && onInfoPress ? (
          <IconButton
            icon="information-outline"
            size={14}
            iconColor={theme.colors.secondary}
            style={styles.inlineInfoBtn}
            onPress={() => onInfoPress(optDesc)}
          />
        ) : null}
      </View>
    );
  }, [localMultipleValue, localSingleValue, handleMultipleToggle, handleSingleChange, theme.colors.onSurface, theme.colors.secondary, theme.colors.onSurfaceVariant, inlineDesc, onInfoPress]);

  return (
    <View style={styles.container}>
      {/* Label row with optional section-level info */}
      {!hideLabel && (
        <View style={styles.labelRow}>
          <Text variant="titleSmall" style={[styles.label, { color: theme.colors.primary }]}>
            {label}
          </Text>
          {desc && onInfoPress && !inlineDesc ? (
            <IconButton
              icon="information-outline"
              size={16}
              iconColor={theme.colors.secondary}
              style={styles.inlineInfoBtn}
              onPress={() => onInfoPress(desc)}
            />
          ) : null}
        </View>
      )}
      {inlineDesc && desc && (
        <Text variant="bodySmall" style={[styles.fieldDescText, { color: theme.colors.onSurfaceVariant }]}>
          {desc}
        </Text>
      )}

      <View style={styles.optionsContainer}>
        {multiple ? (
          // Checkboxes: no RadioButton.Group wrapper here, to avoid unnecessary re-renders
          singleColumn ? (
            <View>
              {options.map((opt) => renderOptionRow(opt, "checkbox"))}
            </View>
          ) : (
            <View style={styles.twoColumnGrid}>
              <View style={styles.column}>
                {leftColumn.map((opt) => renderOptionRow(opt, "checkbox"))}
              </View>
              <View style={styles.column}>
                {rightColumn.map((opt) => renderOptionRow(opt, "checkbox"))}
              </View>
            </View>
          )
        ) : (
          // Radio buttons: keep RadioButton.Group for native functionality
          <RadioButton.Group
            onValueChange={(val) => handleSingleChange(val)}
            value={localSingleValue}
          >
            {singleColumn ? (
              <View>
                {options.map((opt) => renderOptionRow(opt, "radio"))}
              </View>
            ) : (
              <View style={styles.twoColumnGrid}>
                <View style={styles.column}>
                  {leftColumn.map((opt) => renderOptionRow(opt, "radio"))}
                </View>
                <View style={styles.column}>
                  {rightColumn.map((opt) => renderOptionRow(opt, "radio"))}
                </View>
              </View>
            )}
          </RadioButton.Group>
        )}
      </View>
    </View>
  );
}

export default React.memo(SurveySelect, (prevProps, nextProps) => {
  return (
    prevProps.options === nextProps.options &&
    prevProps.value === nextProps.value &&
    prevProps.onChange === nextProps.onChange &&
    prevProps.label === nextProps.label &&
    prevProps.multiple === nextProps.multiple &&
    prevProps.singleColumn === nextProps.singleColumn &&
    prevProps.hideLabel === nextProps.hideLabel &&
    prevProps.desc === nextProps.desc &&
    prevProps.onInfoPress === nextProps.onInfoPress &&
    prevProps.inlineDesc === nextProps.inlineDesc
  );
});

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  labelRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  label: { flex: 1 },
  fieldDescText: { marginTop: -2, marginBottom: 8 },
  optionsContainer: { paddingLeft: 4 },
  twoColumnGrid: { flexDirection: "row", gap: 8 },
  column: { flex: 1 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  optionBlock: { marginBottom: 4 },
  optionText: { flex: 1, flexShrink: 1 },
  optionDescText: { marginLeft: 40, marginTop: -2, marginBottom: 4 },
  inlineInfoBtn: { margin: 0, padding: 0 },
});
