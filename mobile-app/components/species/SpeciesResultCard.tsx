import React from "react";
import { View } from "react-native";
import { Card, Text, Chip, IconButton, useTheme } from "react-native-paper";
import { useI18n } from "@/contexts/i18n-context";

export interface SpeciesResultCardItem {
  scientificName: string;
  family?: string;
  genus?: string;
  commonNames?: Array<{ name: string; language: string }>;
  occurrenceCount?: number;
}

interface SpeciesResultCardProps {
  item: SpeciesResultCardItem;
  onImport: () => void;
}

export default function SpeciesResultCard({ item, onImport }: SpeciesResultCardProps) {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <Card style={{ marginBottom: 12 }}>
      <Card.Content style={{ paddingBottom: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Text variant="titleSmall" style={{ color: theme.colors.primary, fontStyle: "italic", flex: 1 }}>
            {item.scientificName}
          </Text>
          <IconButton
            icon="plus-circle"
            size={24}
            iconColor={theme.colors.primary}
            onPress={onImport}
            style={{ marginLeft: 8, marginRight: -12, marginTop: -8 }}
          />
        </View>

        {item.commonNames && item.commonNames.length > 0 && (
          <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
            {item.commonNames.map((cn, idx) => (
              <Chip key={idx} compact style={{ height: 24 }}>
                {cn.name}
              </Chip>
            ))}
          </View>
        )}

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <View style={{ flexDirection: "row", gap: 10, flex: 1, flexWrap: "wrap" }}>
            <Text variant="labelSmall" style={{ color: theme.colors.secondary }}>
              {item.family || t("species.noFamily")}
            </Text>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {item.genus || t("species.noGenus")}
            </Text>
          </View>
          {!!item.occurrenceCount && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <IconButton icon="database" size={16} iconColor={theme.colors.secondary} style={{ margin: 0 }} />
              <Text variant="labelSmall" style={{ color: theme.colors.secondary }}>
                {item.occurrenceCount}
              </Text>
            </View>
          )}
        </View>
      </Card.Content>
    </Card>
  );
}
