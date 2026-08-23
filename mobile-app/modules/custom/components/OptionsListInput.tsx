import React, { useState, useEffect, memo } from "react";
import { View, StyleSheet } from "react-native";
import { TextInput, IconButton, useTheme, Text } from "react-native-paper";
import { useStableTextInput } from "@/hooks/use-stable-text-input";
import { useI18n } from "@/contexts/i18n-context";
import { CustomFieldOption } from "@/types/database";

interface Props {
  value?: CustomFieldOption[];
  onChange: (value: CustomFieldOption[]) => void;
  onFocus?: (event: any) => void;
  placeholder?: string;
  label?: string;
}

function OptionsListInput({
  value,
  onChange,
  onFocus,
  placeholder,
  label,
}: Props) {
  const { t } = useI18n();
  const theme = useTheme();
  const [options, setOptions] = useState<CustomFieldOption[]>([]);
  const [errorText, setErrorText] = useState("");
  // Always represents "the next option being typed" - never reset from
  // outside, so a constant resetKey is fine; clear() below handles resetting
  // it after each add, imperatively, regardless of focus.
  const { value: inputText, clear: clearInput, resetKey, inputProps } = useStableTextInput("option-input", "");

  // Load initial data
  useEffect(() => {
    if (value && Array.isArray(value)) {
      setOptions(value);
    } else {
      setOptions([]);
    }
  }, [value]);

  const handleAdd = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    const isDuplicate = options.some(
      (o) => o.value.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      setErrorText(t("protocol.duplicateOption"));
      return;
    }

    const newOptions = [...options, { value: trimmed }];
    setOptions(newOptions);
    onChange(newOptions);
    setErrorText("");
    clearInput();
  };

  const handleRemove = (indexToRemove: number) => {
    const newOptions = options.filter((_, idx) => idx !== indexToRemove);
    setOptions(newOptions);
    onChange(newOptions);
  };

  const handleDescriptionChange = (indexToChange: number, description: string) => {
    const newOptions = options.map((o, idx) =>
      idx === indexToChange ? { ...o, description: description || undefined } : o,
    );
    setOptions(newOptions);
    onChange(newOptions);
  };

  return (
    <View style={styles.container}>
      {label && (
        <Text
          variant="bodyMedium"
          style={{ marginBottom: 8, color: theme.colors.onSurface }}
        >
          {label}
        </Text>
      )}

      <View style={styles.inputRow}>
        <TextInput
          key={resetKey}
          mode="outlined"
          {...inputProps}
          onFocus={(e: any) => {
            inputProps.onFocus();
            onFocus?.(e);
          }}
          onChangeText={(text: string) => {
            inputProps.onChangeText(text);
            if (errorText) setErrorText("");
          }}
          placeholder={placeholder || "Digite uma opção..."}
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          importantForAutofill="no"
          style={styles.input}
          right={
            <TextInput.Icon
              icon="plus"
              onPress={handleAdd}
              forceTextInputFocus={false}
            />
          }
          onSubmitEditing={handleAdd}
        />
      </View>

      {errorText && (
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.error, marginTop: 4 }}
        >
          {errorText}
        </Text>
      )}

      {options.length > 0 && (
        <View style={styles.optionsList}>
          {options.map((option, index) => (
            <View key={index} style={styles.optionRow}>
              <View style={styles.optionHeader}>
                <Text
                  variant="bodyMedium"
                  style={[styles.optionValueText, { color: theme.colors.onSurface }]}
                >
                  {option.value}
                </Text>
                <IconButton
                  icon="close"
                  size={16}
                  onPress={() => handleRemove(index)}
                  style={styles.removeButton}
                />
              </View>
              <TextInput
                mode="outlined"
                dense
                value={option.description || ""}
                onChangeText={(text) => handleDescriptionChange(index, text)}
                placeholder={t("protocol.optionDescriptionPlaceholder")}
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                importantForAutofill="no"
                style={styles.optionDescriptionInput}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default memo(OptionsListInput);

const styles = StyleSheet.create({
  container: { marginVertical: 8 },
  inputRow: { flexDirection: "row", alignItems: "center" },
  input: { flex: 1 },
  optionsList: { marginTop: 12 },
  optionRow: { marginBottom: 12 },
  optionHeader: { flexDirection: "row", alignItems: "center" },
  optionValueText: { flex: 1 },
  removeButton: { margin: 0 },
  optionDescriptionInput: { backgroundColor: "transparent" },
});
