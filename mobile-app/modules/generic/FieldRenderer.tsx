import React, { useState, useMemo } from "react";
import { View, Pressable, ScrollView } from "react-native";
import Slider from "@react-native-community/slider";
import {
  TextInput,
  Text,
  useTheme,
  SegmentedButtons,
  Chip,
  Checkbox,
  IconButton,
  Portal,
  Dialog,
  Button,
} from "react-native-paper";
import { StyleSheet } from "react-native";
import { useI18n } from "@/contexts/i18n-context";
import { Species } from "@/types/database";
import {
  CARDINAL_POINTS,
  CardinalPoint,
  cardinalToDegrees,
  degreesToCardinal,
  formatAzimuthDisplay,
} from "@/utils/azimuth";
import { formatDateDigits, formatTimeDigits, isValidDateInput } from "@/utils/date-time-input";

import SpeciesInput from "@/components/survey/SpeciesInput";
import SurveySelect from "@/components/survey/SurveySelect";
import PhotoInput from "@/components/media/PhotoInput";
import NotesListInput from "./NotesListInput";
import AudioNotesInput from "@/components/media/AudioNotesInput";
import { SEGMENTED_BUTTONS_SHAPE_THEME } from "@/constants/shape";

interface FieldRendererProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  onInfoPress?: (text: string) => void;
  projectId?: number;
  surveyPointId?: number;
}

function TagsInput({
  value,
  onChange,
  placeholder,
}: {
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const theme = useTheme();
  const [items, setItems] = useState<string[]>(() => {
    if (!value) return [];
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");

  const add = () => {
    if (!input.trim()) return;
    const next = [...items, input.trim()];
    setItems(next);
    onChange(JSON.stringify(next));
    setInput("");
  };

  const remove = (i: number) => {
    const next = items.filter((_, idx) => idx !== i);
    setItems(next);
    onChange(JSON.stringify(next));
  };

  return (
    <View>
      <TextInput
        mode="outlined"
        value={input}
        onChangeText={setInput}
        placeholder={placeholder}
        onSubmitEditing={add}
        blurOnSubmit={false}
        outlineColor={theme.colors.outline}
        activeOutlineColor={theme.colors.primary}
        style={styles.input}
        right={
          <TextInput.Icon
            icon="plus"
            onPress={add}
            forceTextInputFocus={false}
          />
        }
      />
      {items.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
          {items.map((item, i) => (
            <Chip
              key={i}
              onClose={() => remove(i)}
              style={{
                marginRight: 8,
                marginBottom: 8,
                backgroundColor: theme.colors.secondaryContainer,
              }}
              textStyle={{ color: theme.colors.onSecondaryContainer }}
            >
              {item}
            </Chip>
          ))}
        </View>
      )}
    </View>
  );
}

// Cardinal-point selection dialog, mounted only while visible (same pattern
// as TypeSelectionDialog in app/(projects)/protocol/builder.tsx: its own
// Portal + Dialog, to avoid nesting modals and reproducing the lost-touches
// bug already documented there).
function CardinalPointDialog({
  visible,
  onDismiss,
  selectedCardinal,
  onSelect,
  theme,
  t,
}: {
  visible: boolean;
  onDismiss: () => void;
  selectedCardinal?: CardinalPoint;
  onSelect: (cardinal: CardinalPoint) => void;
  theme: any;
  t: (key: string) => string;
}) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={{ maxHeight: "70%" }}>
        <Dialog.Title style={{ fontSize: 16 }} numberOfLines={1}>
          {t("survey.selectCardinalPoint")}
        </Dialog.Title>
        <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
          <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
            {CARDINAL_POINTS.map((cardinal) => {
              const isSelected = cardinal === selectedCardinal;
              return (
                <Pressable
                  key={cardinal}
                  onPress={() => onSelect(cardinal)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 10,
                    paddingHorizontal: 20,
                    backgroundColor: isSelected
                      ? theme.colors.primaryContainer
                      : "transparent",
                  }}
                >
                  <Text
                    variant="bodyMedium"
                    style={{
                      flex: 1,
                      color: isSelected ? theme.colors.primary : theme.colors.onSurface,
                      fontWeight: isSelected ? "600" : "400",
                    }}
                  >
                    {`${cardinal} — ${t(`survey.azimuthCardinalPoints.${cardinal}`)}`}
                  </Text>
                  {isSelected && (
                    <IconButton icon="check" size={18} iconColor={theme.colors.primary} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>{t("common.close")}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

// Azimuth field (0-360 degrees typed by hand, or picked via the cardinal
// point dialog alongside it). The button only records multiples of 45°.
function AzimuthInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: unknown;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const [pickerVisible, setPickerVisible] = useState(false);

  const handleAzimuthChange = (text: string) => {
    if (text === "") {
      onChange(undefined);
      return;
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 360) return;
    onChange(parsed);
  };

  const handleSelectCardinal = (cardinal: CardinalPoint) => {
    onChange(cardinalToDegrees(cardinal));
    setPickerVisible(false);
  };

  const azimuthValue = typeof value === "number" ? value : undefined;

  return (
    <View>
      <Text variant="bodyMedium" style={{ marginBottom: 8, color: theme.colors.primary }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <TextInput
          mode="outlined"
          placeholder={placeholder}
          keyboardType="numbers-and-punctuation"
          value={azimuthValue !== undefined ? String(azimuthValue) : ""}
          onChangeText={handleAzimuthChange}
          right={<TextInput.Affix text="°" />}
          outlineColor={theme.colors.outline}
          activeOutlineColor={theme.colors.primary}
          style={[styles.input, { flex: 1 }]}
        />
        <IconButton
          icon="compass-outline"
          mode="outlined"
          onPress={() => setPickerVisible(true)}
          style={{ marginLeft: 4 }}
        />
      </View>
      {azimuthValue !== undefined && (
        <Text variant="bodySmall" style={{ marginTop: 4, color: theme.colors.onSurfaceVariant }}>
          {formatAzimuthDisplay(azimuthValue, t)}
        </Text>
      )}
      {pickerVisible && (
        <CardinalPointDialog
          visible={pickerVisible}
          onDismiss={() => setPickerVisible(false)}
          selectedCardinal={azimuthValue !== undefined ? degreesToCardinal(azimuthValue) : undefined}
          onSelect={handleSelectCardinal}
          theme={theme}
          t={t}
        />
      )}
    </View>
  );
}

function FieldRenderer({
  field,
  value,
  onChange,
  onInfoPress,
  projectId,
  surveyPointId,
}: FieldRendererProps) {
  const theme = useTheme();
  const { t } = useI18n();

  const parsedSpecies = useMemo<Species[]>(() => {
    if (!value) return [];
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      if (Array.isArray(parsed) && parsed.length > 0 && "abundance" in parsed[0]) {
        return parsed as Species[];
      }
      return [];
    } catch {
      return [];
    }
  }, [value]);

  switch (field.type) {
    case "species_list":
      if (projectId && surveyPointId) {
        return (
          <SpeciesInput
            projectId={projectId}
            surveyPointId={surveyPointId}
            value={parsedSpecies}
            onChange={(species: Species[]) => onChange(JSON.stringify(species))}
            editable={true}
          />
        );
      }
      return (
        <View
          style={{
            padding: 12,
            borderRadius: 4,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: theme.colors.outline,
          }}
        >
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {t("survey.speciesRequiresSavedPoint")}
          </Text>
        </View>
      );

    // --- GEOMORPHOLOGY & GENERAL SELECTS ---
    case "select":
      return (
        <SurveySelect
          label={field.label}
          options={field.options}
          value={value}
          onChange={onChange}
          singleColumn={field.layout === "single_column"}
          hideLabel={field.hideLabel === true}
          desc={field.desc}
          onInfoPress={onInfoPress}
        />
      );

    case "checkbox":
      return (
        <SurveySelect
          label={field.label}
          options={field.options}
          value={value}
          onChange={onChange}
          multiple={true}
          singleColumn={field.layout === "single_column"}
          hideLabel={field.hideLabel === true}
          desc={field.desc}
          onInfoPress={onInfoPress}
          inlineDesc={field.optionDescMode === "inline"}
        />
      );

    // --- BASIC INPUTS ---
    case "number": {
      // Enforce min/max (when configured) at typing time, not just on save.
      // field.min undefined => negatives are allowed (no lower bound).
      const handleNumberChange = (text: string) => {
        if (text === "" || text === "-") {
          onChange(text);
          return;
        }
        const parsed = Number(text);
        if (!Number.isFinite(parsed)) return;
        if (field.min !== undefined && parsed < field.min) return;
        if (field.max !== undefined && parsed > field.max) return;
        onChange(text);
      };
      const rangeParts = [
        field.min !== undefined ? `${t("protocol.minimum")}: ${field.min}` : null,
        field.max !== undefined ? `${t("protocol.maximum")}: ${field.max}` : null,
      ].filter(Boolean);
      return (
        <View>
          <Text
            variant="bodyMedium"
            style={{ marginBottom: 8, color: theme.colors.primary }}
          >
            {field.label}
          </Text>
          <TextInput
            mode="outlined"
            placeholder={field.placeholder}
            // A non-negative min (e.g. an area, which can't be negative)
            // means the minus sign is never needed - default to the plain
            // numeric keypad instead of the punctuation-capable one. Fields
            // with no min set (or a negative one) keep the wider keyboard,
            // since they may still need a minus sign.
            keyboardType={field.min !== undefined && field.min >= 0 ? "numeric" : "numbers-and-punctuation"}
            value={value ? String(value) : ""}
            onChangeText={handleNumberChange}
            right={field.unit ? <TextInput.Affix text={field.unit} /> : undefined}
            outlineColor={theme.colors.outline}
            activeOutlineColor={theme.colors.primary}
            style={styles.input}
          />
          {rangeParts.length > 0 && !field.hideRangeHint && (
            <Text
              variant="bodySmall"
              style={{ marginTop: 4, color: theme.colors.onSurfaceVariant }}
            >
              {rangeParts.join("  •  ")}
            </Text>
          )}
        </View>
      );
    }

    // --- PERCENTAGE (fixed 0-100, slider) ---
    case "percentage": {
      const percentValue = typeof value === "number" ? value : 0;
      return (
        <View>
          <Text
            variant="bodyMedium"
            style={{ marginBottom: 8, color: theme.colors.primary }}
          >
            {field.label}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Slider
              style={{ flex: 1, height: 40 }}
              minimumValue={0}
              maximumValue={100}
              step={1}
              value={percentValue}
              onValueChange={onChange}
              minimumTrackTintColor={theme.colors.primary}
              maximumTrackTintColor={theme.colors.outline}
              thumbTintColor={theme.colors.primary}
            />
            <Text
              variant="bodyMedium"
              style={{ marginLeft: 12, minWidth: 48, textAlign: "right", color: theme.colors.onSurface }}
            >
              {`${percentValue}%`}
            </Text>
          </View>
        </View>
      );
    }

    // --- AZIMUTH (simple, fixed 0-360, cardinal point label + picker button) ---
    case "azimuth":
      return (
        <AzimuthInput
          label={field.label}
          value={value}
          onChange={onChange}
          placeholder={field.placeholder}
        />
      );

    case "textarea":
    case "text":
      return (
        <View>
          <Text
            variant="bodyMedium"
            style={{ marginBottom: 8, color: theme.colors.primary }}
          >
            {field.label}
          </Text>
          <TextInput
            mode="outlined"
            placeholder={field.placeholder}
            multiline={field.type === "textarea"}
            numberOfLines={field.type === "textarea" ? 3 : 1}
            value={value || ""}
            onChangeText={onChange}
            outlineColor={theme.colors.outline}
            activeOutlineColor={theme.colors.primary}
            style={styles.input}
          />
        </View>
      );

    // --- PHOTOS SECTION ---
    case "photo_input":
      return <PhotoInput value={value} onChange={onChange} maxPhotos={10} />;

    // --- NOTES LIST SECTION ---
    case "notes_list":
      return <NotesListInput value={value} onChange={onChange} />;

    // --- AUDIO NOTES SECTION ---
    case "audio_notes_input":
      return <AudioNotesInput value={value} onChange={onChange} />;

    // --- RADIO BUTTONS ---
    case "radio":
      return (
        <SurveySelect
          label={field.label}
          options={field.options}
          value={value}
          onChange={onChange}
          singleColumn={field.layout === "single_column"}
          hideLabel={field.hideLabel === true}
          desc={field.desc}
          onInfoPress={onInfoPress}
          inlineDesc={field.optionDescMode === "inline"}
        />
      );

    // --- YES/NO BOOLEAN ---
    case "yes_no":
      return (
        <View>
          <Text
            variant="bodyMedium"
            style={{ marginBottom: 8, color: theme.colors.primary }}
          >
            {field.label}
          </Text>
          <SegmentedButtons
            theme={SEGMENTED_BUTTONS_SHAPE_THEME}
            value={value === undefined ? "" : value ? "yes" : "no"}
            onValueChange={(v) => onChange(v === "yes")}
            buttons={[
              { value: "yes", label: t("common.yes") },
              { value: "no", label: t("common.no") },
            ]}
          />
        </View>
      );

    // --- REQUIRED CONFIRMATION CHECKBOX (checking it surfaces its `desc` as a dialog) ---
    case "confirm_checkbox": {
      const isChecked = value === true;
      const handleToggle = () => {
        const next = !isChecked;
        onChange(next);
        if (next && field.desc && onInfoPress) {
          onInfoPress(field.desc);
        }
      };
      return (
        <Pressable
          onPress={handleToggle}
          style={{ flexDirection: "row", alignItems: "center" }}
        >
          <Checkbox status={isChecked ? "checked" : "unchecked"} onPress={handleToggle} />
          <Text
            variant="bodyMedium"
            style={{ flex: 1, color: theme.colors.primary }}
          >
            {field.label}
          </Text>
          {field.desc && (
            <IconButton
              icon="information-outline"
              size={18}
              iconColor={theme.colors.secondary}
              onPress={() => onInfoPress?.(field.desc)}
            />
          )}
        </Pressable>
      );
    }

    // --- RATING SCALE ---
    // Fixed range 0..field.max (no configurable minimum, never negative).
    case "rating": {
      const maxRating = field.max ?? 0;
      const handleRatingChange = (text: string) => {
        if (text === "") {
          onChange(undefined);
          return;
        }
        const parsed = Number(text);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > maxRating) return;
        onChange(parsed);
      };
      return (
        <View>
          <Text
            variant="bodyMedium"
            style={{ marginBottom: 8, color: theme.colors.primary }}
          >
            {field.label}
          </Text>
          <TextInput
            mode="outlined"
            keyboardType="numeric"
            value={value !== undefined && value !== null ? String(value) : ""}
            onChangeText={handleRatingChange}
            right={<TextInput.Affix text={`/ ${maxRating}`} />}
            outlineColor={theme.colors.outline}
            activeOutlineColor={theme.colors.primary}
            style={styles.input}
          />
        </View>
      );
    }

    // --- DATE / TIME ---
    // The mask auto-inserts "/" or ":" and clamps each 2-digit group to its
    // valid range (day 1-31, month 1-12, hour 0-23, minute 0-59) as soon as
    // it's complete - same spirit as the clamp already used in
    // "number"/"azimuth" above, just with separators.
    case "date": {
      const dateInvalid = typeof value === "string" && value.length === 10 && !isValidDateInput(value);
      return (
        <View>
          <Text
            variant="bodyMedium"
            style={{ marginBottom: 8, color: theme.colors.primary }}
          >
            {field.label}
          </Text>
          <TextInput
            mode="outlined"
            placeholder={field.placeholder || "DD/MM/YYYY"}
            value={value || ""}
            onChangeText={(text: string) => onChange(formatDateDigits(text))}
            keyboardType="numeric"
            maxLength={10}
            outlineColor={dateInvalid ? theme.colors.error : theme.colors.outline}
            activeOutlineColor={dateInvalid ? theme.colors.error : theme.colors.primary}
            style={styles.input}
          />
          {dateInvalid && (
            <Text variant="bodySmall" style={{ marginTop: 4, color: theme.colors.error }}>
              {t("survey.invalidDate")}
            </Text>
          )}
        </View>
      );
    }

    case "time":
      return (
        <View>
          <Text
            variant="bodyMedium"
            style={{ marginBottom: 8, color: theme.colors.primary }}
          >
            {field.label}
          </Text>
          <TextInput
            mode="outlined"
            placeholder={field.placeholder || "HH:MM"}
            value={value || ""}
            onChangeText={(text: string) => onChange(formatTimeDigits(text))}
            keyboardType="numeric"
            maxLength={5}
            outlineColor={theme.colors.outline}
            activeOutlineColor={theme.colors.primary}
            style={styles.input}
          />
        </View>
      );

    // --- TAGS LIST ---
    case "tags_input":
      return (
        <TagsInput
          value={value}
          onChange={onChange}
          placeholder={field.placeholder}
        />
      );

    // --- FALLBACK ---
    default:
      return (
        <View style={styles.errorContainer}>
          <Text style={{ color: theme.colors.error }}>
            {t("survey.unknownFieldType") || "Tipo desconhecido"}: {field.type}
          </Text>
        </View>
      );
  }
}

export default React.memo(FieldRenderer, (prevProps, nextProps) => {
  return (
    prevProps.field === nextProps.field &&
    prevProps.value === nextProps.value &&
    prevProps.onChange === nextProps.onChange &&
    prevProps.onInfoPress === nextProps.onInfoPress &&
    prevProps.projectId === nextProps.projectId &&
    prevProps.surveyPointId === nextProps.surveyPointId
  );
});

const styles = StyleSheet.create({
  input: {
    backgroundColor: "transparent",
  },
  errorContainer: {
    padding: 8,
    borderWidth: 1,
    borderColor: "red",
    borderStyle: "dashed",
    borderRadius: 4,
  },
});
