import React, { useState } from "react";
import { View, StyleSheet, Pressable, FlatList } from "react-native";
import {
  Text,
  IconButton,
  Modal,
  Portal,
  Divider,
  useTheme,
} from "react-native-paper";
import { useI18n } from "@/contexts/i18n-context";
import { useProtocolTranslations } from "@/hooks/use-protocol-translations";

function getOptValue(opt: any): string {
  if (typeof opt === "string") return opt;
  return opt.value ?? opt["pt"] ?? "";
}

interface Props {
  label: string;
  options: any[];
  value: string | null | undefined;
  onSelect: (value: string | null) => void;
  onInfoPress: (text: string) => void;
}

/**
 * Picker for soil profile select fields (color, texture, structure):
 * selection happens only through the button that opens the full option
 * list as a modal. The main row is a read-only display of the current
 * selection (not a text input — there's no typing/search anymore), with
 * an "i" icon next to it showing that selected option's description (or a
 * default prompt when nothing is selected yet — always rendered so the row
 * doesn't change width as the user selects/clears a value).
 */
export default function SoilOptionPicker({ label, options, value, onSelect, onInfoPress }: Props) {
  const theme = useTheme();
  const { t } = useI18n();
  const { translateField } = useProtocolTranslations();
  const [isListModalVisible, setListModalVisible] = useState(false);

  const selectedOption = options.find((o) => getOptValue(o) === value);
  const selectedLabel = selectedOption ? translateField(selectedOption) : t("survey.selectOption");
  const selectedDesc = selectedOption?.desc ? translateField(selectedOption.desc) : null;
  const infoText = selectedDesc || t("survey.noSelectionInfo");

  return (
    <>
      <Text style={[styles.sectionLabel, { color: theme.colors.onSurface }]}>{label}</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => setListModalVisible(true)}
          style={[styles.valueDisplay, { borderColor: theme.colors.outline }]}
        >
          <Text style={{ color: selectedOption ? theme.colors.onSurface : theme.colors.onSurfaceVariant }}>
            {selectedLabel}
          </Text>
        </Pressable>

        <IconButton
          icon="information-outline"
          size={18}
          iconColor={theme.colors.secondary}
          onPress={() => onInfoPress(infoText)}
        />
      </View>

      <Portal>
        <Modal
          visible={isListModalVisible}
          onDismiss={() => setListModalVisible(false)}
          contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleMedium" style={{ marginBottom: 12, color: theme.colors.primary, fontWeight: "bold" }}>
            {label}
          </Text>
          <Pressable
            onPress={() => {
              onSelect(null);
              setListModalVisible(false);
            }}
            style={styles.optionRow}
          >
            <Text style={{ flex: 1, fontStyle: "italic", color: theme.colors.onSurfaceVariant }}>
              {t("survey.selectOption")}
            </Text>
          </Pressable>
          <Divider />
          <FlatList
            data={options}
            keyExtractor={(opt) => getOptValue(opt)}
            style={{ maxHeight: 400 }}
            renderItem={({ item }) => {
              const desc = item?.desc ? translateField(item.desc) : null;
              return (
                <View style={styles.optionRow}>
                  <Pressable
                    onPress={() => {
                      onSelect(getOptValue(item));
                      setListModalVisible(false);
                    }}
                    style={{ flex: 1 }}
                  >
                    <Text style={{ color: theme.colors.onSurface }}>{translateField(item)}</Text>
                  </Pressable>
                  {desc && (
                    <IconButton
                      icon="information-outline"
                      size={16}
                      iconColor={theme.colors.secondary}
                      style={{ margin: 0 }}
                      onPress={() => onInfoPress(desc)}
                    />
                  )}
                </View>
              );
            }}
            ItemSeparatorComponent={() => <Divider />}
            ListEmptyComponent={
              <Text style={{ textAlign: "center", color: theme.colors.outline, marginVertical: 16 }}>
                {t("survey.noOptionsFound")}
              </Text>
            }
          />
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontWeight: "bold", marginBottom: 8, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  valueDisplay: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  optionRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  modalContent: { padding: 20, margin: 20, borderRadius: 8, maxHeight: "80%" },
});
