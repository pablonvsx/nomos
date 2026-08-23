import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import {
  Text,
  Button,
  Card,
  IconButton,
  TextInput,
  useTheme,
  Divider,
} from "react-native-paper";
import { useI18n } from "@/contexts/i18n-context";
import { BUTTON_RADIUS } from "@/constants/shape";

interface NotesListInputProps {
  value: string; // JSON array of strings stored in DB
  onChange: (value: string) => void;
}

/**
 * Parses the stored value (JSON string array or legacy plain string) into a string array.
 */
function parseNotes(raw: string): string[] {
  if (!raw || raw === "" || raw === "null") return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((n) => typeof n === "string" && n.trim() !== "");
    // Legacy: plain text stored as a plain string
    if (typeof parsed === "string" && parsed.trim()) return [parsed.trim()];
  } catch {
    // Legacy: raw is a plain non-JSON string
    if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  }
  return [];
}

export default function NotesListInput({ value, onChange }: NotesListInputProps) {
  const theme = useTheme();
  const { t } = useI18n();

  const notes = parseNotes(value);
  const [draftText, setDraftText] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const saveNotes = (newNotes: string[]) => {
    onChange(JSON.stringify(newNotes));
  };

  const handleAddNote = () => {
    const trimmed = draftText.trim();
    if (!trimmed) return;
    saveNotes([...notes, trimmed]);
    setDraftText("");
    setIsAdding(false);
  };

  const handleCancelAdd = () => {
    setDraftText("");
    setIsAdding(false);
  };

  const handleDeleteNote = (index: number) => {
    saveNotes(notes.filter((_, i) => i !== index));
  };

  return (
    <View>
      {/* Empty state */}
      {notes.length === 0 && !isAdding && (
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8, fontStyle: "italic" }}
        >
          {t("survey.noNotes") || "No notes added"}
        </Text>
      )}

      {/* Existing note cards */}
      {notes.map((note, index) => (
        <Card
          key={`note-${index}`}
          mode="outlined"
          style={[styles.noteCard, { borderColor: theme.colors.outlineVariant }]}
        >
          <View style={styles.noteRow}>
            <View
              style={[
                styles.noteIndexBadge,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <Text variant="labelSmall" style={{ color: theme.colors.onPrimary }}>
                {index + 1}
              </Text>
            </View>
            <Text
              variant="bodyMedium"
              style={[styles.noteText, { color: theme.colors.onSurface }]}
            >
              {note}
            </Text>
            <IconButton
              icon="delete-outline"
              size={18}
              onPress={() => handleDeleteNote(index)}
              style={{ margin: 0, marginLeft: 4 }}
              iconColor={theme.colors.error}
            />
          </View>
        </Card>
      ))}

      {/* Inline "add note" form */}
      {isAdding ? (
        <View
          style={[
            styles.addingContainer,
            {
              backgroundColor: theme.colors.surfaceVariant,
              borderColor: theme.colors.outline,
            },
          ]}
        >
          <TextInput
            mode="flat"
            placeholder={t("survey.notePlaceholder") || "Write your note..."}
            value={draftText}
            onChangeText={setDraftText}
            multiline
            numberOfLines={3}
            autoFocus
            style={{ backgroundColor: "transparent" }}
          />
          <Divider style={{ marginTop: 8 }} />
          <View style={styles.addingActions}>
            <Button onPress={handleCancelAdd} compact>
              {t("common.cancel")}
            </Button>
            <Button
              mode="contained"
              onPress={handleAddNote}
              disabled={!draftText.trim()}
              compact
              icon="check"
              style={{ borderRadius: BUTTON_RADIUS }}
            >
              {t("survey.saveNote") || "Save"}
            </Button>
          </View>
        </View>
      ) : (
        <Button
          mode="outlined"
          icon="plus"
          onPress={() => setIsAdding(true)}
          style={styles.addButton}
          textColor={theme.colors.primary}
        >
          {t("survey.addNote") || "Add note"}
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  noteCard: {
    marginBottom: 8,
    borderRadius: 8,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  noteIndexBadge: {
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginRight: 10,
    marginTop: 2,
    flexShrink: 0,
  },
  noteText: {
    flex: 1,
    lineHeight: 22,
  },
  addingContainer: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  addingActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 8,
  },
  addButton: {
    marginTop: 4,
    borderStyle: "dashed",
    borderRadius: BUTTON_RADIUS,
  },
});
