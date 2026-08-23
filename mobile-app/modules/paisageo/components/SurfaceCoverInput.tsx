// src/components/survey/SurfaceCoverInput.tsx
import React, { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Text, Chip, Divider, useTheme } from "react-native-paper";
import { useProtocolTranslations } from "@/hooks/use-protocol-translations";

interface Props {
  field: any; // O objeto do JSON (classes, items)
  value?: string; // JSON string salvo no banco
  onChange: (value: string) => void;
}

export default function SurfaceCoverInput({ field, value, onChange }: Props) {
  const theme = useTheme();
  const { translateField } = useProtocolTranslations();
  
  // Estado: { "litter_layer": "5-25%", "rockiness": "absent" }
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (value) {
      try {
        setAnswers(JSON.parse(value));
      } catch {
        /* ignore */
      }
    }
  }, [value]);

  const handleSelect = (itemKey: string, percentClass: string) => {
    const newAnswers = { ...answers, [itemKey]: percentClass };
    setAnswers(newAnswers);
    onChange(JSON.stringify(newAnswers));
  };

  return (
    <View>
      {field.items.map((item: any) => (
        <View key={item.key} style={styles.row}>
          {/* Header with label and description */}
          <View style={styles.header}>
            <Text variant="bodyMedium" style={styles.label}>
              {translateField(item.label)}
            </Text>
            
            {/* Renders the field description if present in the protocol */}
            {item.desc && (
              <Text 
                variant="bodySmall" 
                style={[styles.description, { color: theme.colors.onSurfaceVariant }]}
              >
                {translateField(item.desc)}
              </Text>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.scroll}
          >
            {field.classes.map((cls: { value: string; label: unknown }) => {
              const isSelected = answers[item.key] === cls.value;
              return (
                <Chip
                  key={cls.value}
                  selected={isSelected}
                  mode={isSelected ? "flat" : "outlined"}
                  onPress={() => handleSelect(item.key, cls.value)}
                  style={[
                    styles.chip,
                    isSelected
                      ? {
                          backgroundColor: theme.colors.primaryContainer,
                          borderColor: theme.colors.primary,
                        }
                      : { borderColor: theme.colors.outline },
                  ]}
                  textStyle={{
                    fontSize: 12,
                    color: isSelected
                      ? theme.colors.onPrimaryContainer
                      : theme.colors.onSurface,
                    fontWeight: isSelected ? "600" : "500",
                  }}
                  showSelectedOverlay
                >
                  {translateField(cls.label)}
                </Chip>
              );
            })}
          </ScrollView>
          <Divider style={{ marginTop: 8 }} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 12 },
  header: { marginBottom: 8 },
  label: { fontWeight: "bold" },
  description: { marginTop: 2, fontStyle: "italic", textAlign: 'justify' },
  scroll: { flexDirection: "row" },
  chip: { marginRight: 8, height: 32 },
});